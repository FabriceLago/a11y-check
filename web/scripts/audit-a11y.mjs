// Audits the app itself with axe: every screen, light + dark, desktop + 390 px.
//
//   node scripts/audit-a11y.mjs          CI mode: serves the built app (npm run build) and mocks the API.
//                                        Deterministic, no backend, no external site scanned.
//   node scripts/audit-a11y.mjs --live   Local mode: the running app (npm start in server/ and web/),
//                                        real API, real scan of the site given after --live (default fr.wikipedia.org).
//
// Fails (exit 1) on any axe violation, horizontal scroll, or skip link that is not the first Tab stop.
// Writes a JSON report (RAPPORT env var, default a11y-rapport.json) for the CI artifact.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AxeBuilder } from '@axe-core/playwright';
import { chromium } from 'playwright';
import { simulateurApi } from './fixtures.mjs';

const LIVE = process.argv.includes('--live');
const SITE = LIVE ? (process.argv[process.argv.indexOf('--live') + 1] ?? 'fr.wikipedia.org') : 'boulangerie-dupont.be';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const VARIANTES = [
  { nom: 'ordinateur, clair', viewport: { width: 1280, height: 800 }, colorScheme: 'light' },
  { nom: 'ordinateur, sombre', viewport: { width: 1280, height: 800 }, colorScheme: 'dark' },
  { nom: 'mobile 390 px, clair', viewport: { width: 390, height: 844 }, colorScheme: 'light' },
  { nom: 'mobile 390 px, sombre', viewport: { width: 390, height: 844 }, colorScheme: 'dark' },
];

// ─── CI mode: tiny static server for the built app, with SPA fallback ────────
let BASE = process.env.BASE_URL ?? 'http://localhost:4200';
let serveur;
if (!LIVE) {
  const DIST = fileURLToPath(new URL('../dist/web/browser/', import.meta.url));
  if (!existsSync(join(DIST, 'index.html'))) {
    console.error('Build introuvable : lancez « npm run build » avant l’audit.');
    process.exit(1);
  }
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.png': 'image/png' };
  serveur = http.createServer((req, res) => {
    let fichier = normalize(join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
    if (!fichier.startsWith(DIST) || !existsSync(fichier) || statSync(fichier).isDirectory()) fichier = join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream' });
    createReadStream(fichier).pipe(res);
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${serveur.address().port}`;
}

const resultats = [];
const problemes = [];

async function auditer(page, ecran, variante) {
  // Open every <details> so folded content is audited too.
  await page.$$eval('details', (ds) => ds.forEach((d) => (d.open = true)));
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  for (const v of violations) problemes.push(`${ecran} [${variante.nom}] ${v.id} (${v.nodes.length}) : ${v.help}`);
  if (debordement) problemes.push(`${ecran} [${variante.nom}] défilement horizontal`);
  resultats.push({ ecran, variante: variante.nom, violations: violations.map((v) => ({ id: v.id, impact: v.impact, aide: v.help, elements: v.nodes.map((n) => n.target.join(' ')) })), debordement });
  console.log(`${violations.length || debordement ? '✗' : '✓'} ${ecran} — ${variante.nom}`);
}

async function nouveauContexte(browser, variante) {
  const c = await browser.newContext({ viewport: variante.viewport, colorScheme: variante.colorScheme, locale: 'fr-BE' });
  // The app's theme comes from the header toggle (remembered in localStorage), not from the OS.
  const theme = variante.colorScheme === 'light' ? 'clair' : 'sombre';
  await c.addInitScript((t) => localStorage.setItem('theme', t), theme);
  if (!LIVE) await c.route('**/api/**', simulateurApi());
  return c;
}

const browser = await chromium.launch();
try {
  // 1. One scan to get a report URL; audit the waiting screen on the way.
  const ctx = await nouveauContexte(browser, VARIANTES[0]);
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.keyboard.press('Tab');
  const premier = await page.evaluate(() => document.activeElement?.textContent?.trim());
  if (premier !== 'Aller au contenu') problemes.push(`Accueil : le premier Tab arrive sur « ${premier} »`);
  await page.getByLabel('Adresse de votre site').fill(SITE);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/analyse\//);
  await page.getByRole('heading', { level: 1, name: /en cours/ }).waitFor();
  await auditer(page, 'Attente', VARIANTES[0]);
  await page.getByRole('heading', { level: 1, name: /Résultat pour/ }).waitFor({ timeout: 120_000 });
  const rapportUrl = page.url();
  await ctx.close();

  // 2. Every screen × every variant.
  for (const variante of VARIANTES) {
    const premiere = variante === VARIANTES[0];
    const c = await nouveauContexte(browser, variante);
    const p = await c.newPage();
    await p.goto(BASE);
    await auditer(p, 'Accueil', variante);
    await p.getByRole('button', { name: 'Analyser mon site' }).click();
    await p.locator('#url-erreur').waitFor();
    await auditer(p, 'Accueil (erreur)', variante);

    await p.goto(rapportUrl);
    await p.getByRole('heading', { level: 1, name: /Résultat pour/ }).waitFor();
    await p.waitForTimeout(1000); // let the ring animation finish
    // The paid offer only shows when payment is configured (always in CI mode).
    if (!LIVE) await p.getByRole('heading', { level: 2, name: 'Recevoir le rapport complet' }).waitFor();
    await auditer(p, 'Rapport', variante);

    await p.getByRole('button', { name: 'Voir la réponse' }).click();
    await p.locator('#eaa-erreur-secteur').waitFor();
    await auditer(p, 'Questionnaire EAA (erreurs)', variante);
    await p.getByLabel(/Commerce en ligne/).check();
    await p.getByLabel('À des particuliers', { exact: true }).check();
    await p.getByLabel('Je ne sais pas').check();
    await p.getByRole('button', { name: 'Voir la réponse' }).click();
    await p.locator('.verdict h3').waitFor();
    await auditer(p, 'Questionnaire EAA (réponse)', variante);

    await p.getByRole('button', { name: "M'envoyer ce rapport par e-mail" }).click();
    await p.locator('#email-erreur').waitFor();
    await auditer(p, 'Formulaire e-mail (erreur)', variante);
    if (!LIVE || premiere) {
      // Live mode: only once, the API allows 3 e-mails per hour.
      await p.getByLabel('Votre adresse e-mail').fill('audit@exemple.be');
      await p.getByLabel(/J'accepte de recevoir/).check();
      await p.getByRole('button', { name: "M'envoyer ce rapport par e-mail" }).click();
      await p.getByRole('status').filter({ hasText: "C'est envoyé" }).waitFor();
      await auditer(p, 'Formulaire e-mail (envoyé)', variante);
    }

    await p.goto(`${BASE}/faire-corriger`);
    await auditer(p, 'Faire corriger', variante);
    await p.getByRole('button', { name: 'Envoyer ma demande' }).click();
    await p.locator('.recap-erreurs').waitFor();
    await auditer(p, 'Faire corriger (erreurs)', variante);
    if (!LIVE || premiere) {
      await p.getByLabel('Votre nom').fill('Audit Accessibilité');
      await p.getByLabel('Adresse e-mail').fill('audit@exemple.be');
      await p.getByLabel('Adresse du site').fill(SITE);
      await p.getByLabel('Corriger les problèmes critiques').check();
      await p.getByRole('button', { name: 'Envoyer ma demande' }).click();
      await p.getByRole('heading', { level: 2, name: 'Demande envoyée' }).waitFor();
      await auditer(p, 'Faire corriger (envoyé)', variante);
    }

    await p.goto(`${BASE}/design-system`);
    await p.getByRole('heading', { level: 1, name: 'Design system' }).waitFor();
    await auditer(p, 'Design system', variante);
    await p.goto(`${BASE}/confidentialite`);
    await auditer(p, 'Confidentialité', variante);
    await p.goto(`${BASE}/conditions`);
    await auditer(p, 'Conditions générales', variante);
    // Unknown session = the "waiting for the Stripe confirmation" state.
    await p.goto(`${BASE}/commande/cs_audit_inexistante`);
    await p.getByRole('heading', { level: 1, name: /confirmons votre paiement/ }).waitFor();
    await auditer(p, 'Commande (confirmation)', variante);
    await c.close();
  }
} finally {
  await browser.close();
  serveur?.close();
}

await writeFile(process.env.RAPPORT ?? 'a11y-rapport.json', JSON.stringify({ date: new Date().toISOString(), mode: LIVE ? 'live' : 'ci', resultats, problemes }, null, 2));
if (problemes.length) {
  console.log(`\n${problemes.length} problème(s) :\n- ${problemes.join('\n- ')}`);
  process.exit(1);
}
console.log(`\n${resultats.length} écrans audités : aucune violation axe détectée.`);
