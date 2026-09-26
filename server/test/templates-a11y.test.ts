import { AxeBuilder } from '@axe-core/playwright';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PageAnalysee } from '../src/crawl.js';
import { pdfHtml } from '../src/pdf.js';
import { buildReport } from '../src/report.js';
import { AXE_TAGS } from '../src/rules-fr.js';
import { buildSiteReport } from '../src/site-report.js';
import { alerteAdmin, excusesEmail, livraisonEmail, page, rapportEmail } from '../src/templates.js';

// Every HTML we generate outside Angular (e-mails, link pages, PDF template) is audited with axe too.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const node = (id: string, i: number) => ({ target: [`#${id}-${i}`], html: `<div id="${id}-${i}">élément</div>` });
const pass = {
  title: 'Accueil – Boulangerie Dupont',
  violations: [
    { id: 'image-alt', impact: 'critical', tags: ['wcag2a', 'wcag111'], nodes: [node('img', 0), node('img', 1)], nodeCount: 2 },
    { id: 'color-contrast', impact: 'serious', tags: ['wcag2aa', 'wcag143'], nodes: [node('c', 0)], nodeCount: 1 },
    { id: 'label', impact: 'critical', tags: ['wcag2a', 'wcag412'], nodes: [node('l', 0)], nodeCount: 1 },
  ],
  incomplete: [{ id: 'color-contrast', impact: 'serious', tags: [], nodes: [], nodeCount: 3 }],
  checks: { skipLink: { found: false, text: null }, videos: { native: [], embeds: ['https://www.youtube.com/embed/x'] } },
  captures: [{ regle: 'image-alt', selecteur: '#img-0', image: PIXEL }],
};
const resultat = (url: string) => ({ url, finalUrl: url, scannedAt: '2026-09-27T10:00:00.000Z', desktop: pass, mobile: pass, blockedRequests: [] });
const pages = ['https://boulangerie.be/', 'https://boulangerie.be/contact'].map((url) => ({ url, result: resultat(url) })) as unknown as PageAnalysee[];

const DOCUMENTS: [string, string][] = [
  ['e-mail du rapport (avec double opt-in)', rapportEmail(buildReport(resultat('https://boulangerie.be/') as never), {
    rapport: 'https://outil.example/analyse/1',
    supprimer: 'https://outil.example/api/leads/t/supprimer',
    confirmer: 'https://outil.example/api/leads/t/confirmer',
    desinscrire: 'https://outil.example/api/leads/t/desinscrire',
  }).html],
  ['e-mail de livraison', livraisonEmail({ site: 'boulangerie.be', telechargement: 'https://outil.example/dl', joint: true }).html],
  ['e-mail d\'excuses', excusesEmail({ site: 'boulangerie.be', rembourse: true }).html],
  ['alerte admin', alerteAdmin({ commande: 'o1', site: 'boulangerie.be', erreur: 'timeout', rembourse: false }).html],
  ['page de confirmation (lien e-mail)', page('Confirmer votre inscription', '<p>Confirmez-vous ?</p><form method="post"><button type="submit">Je confirme</button></form>').html],
  ['modèle du PDF', pdfHtml(buildSiteReport(pages), 'https://outil.example/faire-corriger')],
];

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(() => browser.close());

describe('axe on server-generated HTML', { timeout: 60_000 }, () => {
  it.each(DOCUMENTS)('%s', async (_nom, html) => {
    const context = await browser.newContext({ javaScriptEnabled: true });
    await context.route('**/*', (r) => r.abort()); // no network: everything must be inline
    const p = await context.newPage();
    await p.setContent(html);
    const { violations } = await new AxeBuilder({ page: p }).withTags(AXE_TAGS).analyze();
    await context.close();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });
});
