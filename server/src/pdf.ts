import { readFileSync } from 'node:fs';
import { getBrowser } from './scan.js';
import type { SiteReport } from './site-report.js';
import { esc } from './templates.js';

const MAX_CAPTURES_PAR_PROBLEME = 3;
const MAX_CAPTURES = 60;
const MAX_ELEMENTS_ANNEXE = 20;

const police = (poids: 400 | 700) =>
  readFileSync(new URL(`../node_modules/@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-${poids}-normal.woff2`, import.meta.url)).toString('base64');

let fontCss: string | undefined;
const polices = () =>
  (fontCss ??= ([400, 700] as const)
    .map((p) => `@font-face{font-family:'Atkinson Hyperlegible';font-weight:${p};src:url(data:font/woff2;base64,${police(p)}) format('woff2');}`)
    .join(''));

export const CHECKLIST = [
  ['Navigation au clavier', "Parcourez chaque page avec Tab et Maj+Tab : chaque lien, bouton et champ doit être atteignable, dans un ordre logique, avec un contour de focus bien visible."],
  ['Pas de piège au clavier', 'Ouvrez le menu, les fenêtres et le bandeau cookies au clavier, puis refermez-les avec Échap.'],
  ["Lecteur d'écran", "Écoutez la page d'accueil et un formulaire avec NVDA (Windows, gratuit) ou VoiceOver (Mac, iPhone). Tout doit être compréhensible sans voir l'écran."],
  ['Zoom', 'Agrandissez la page à 200 % puis à 400 % : aucun texte ne doit être coupé ni se chevaucher.'],
  ['Textes des liens', 'Chaque lien doit avoir un sens seul : évitez « cliquez ici » ou « en savoir plus ».'],
  ['Descriptions des images', 'Les descriptions doivent être utiles, pas seulement présentes.'],
  ['Vidéos et sons', 'Vérifiez que les sous-titres sont exacts et qu\'une transcription accompagne les contenus audio.'],
  ['Formulaires', 'Provoquez une erreur : le message doit dire clairement ce qui ne va pas et comment corriger.'],
  ['Couleurs', "Aucune information ne doit reposer sur la couleur seule (par exemple « les champs en rouge sont obligatoires »)."],
  ['Mouvement', 'Les carrousels et animations doivent pouvoir être mis en pause.'],
  ['Temps limité', 'Si une action est limitée dans le temps, la personne doit être prévenue et pouvoir prolonger.'],
  ['Parcours complet', 'Réalisez votre parcours principal (commander, réserver, contacter) du début à la fin, au clavier puis au lecteur d\'écran.'],
] as const;

const chemin = (url: string) => {
  const u = new URL(url);
  return decodeURI(u.pathname + u.search) || '/';
};
const date = (iso: string) => new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long' }).format(new Date(iso));
const tronquer = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** HTML built for print only: no script, no network, everything inline. */
export function pdfHtml(r: SiteReport, lienDevis?: string): string {
  const compte = (p: string) => r.problemes.filter((x) => x.priorite === p).length;
  let budget = MAX_CAPTURES;

  const planAction = r.problemes
    .map(
      (p, i) => `<tr><td>${i + 1}</td><th scope="row">${esc(p.titre)}</th><td>${esc(p.priorite)}</td><td>${p.pages.length}</td><td>${esc(p.effort)}</td><td>${esc(p.quiCorrige)}</td></tr>`,
    )
    .join('');

  const corrections = r.problemes
    .map(
      (p, i) => `<article>
  <h3>${i + 1}. ${esc(p.titre)}</h3>
  <p class="meta">Priorité : ${esc(p.priorite)} · Effort : ${esc(p.effort)} · ${esc(p.quiCorrige)} · ${p.occurrences} élément${p.occurrences > 1 ? 's' : ''} sur ${p.pages.length} page${p.pages.length > 1 ? 's' : ''}${p.seulement ? ` (sur ${esc(p.seulement)} uniquement)` : ''}</p>
  <p>${esc(p.pourquoi)}</p>
  <p><strong>Personnes concernées :</strong> ${esc(p.touche.map((t) => t.label).join(', '))}.</p>
  <h4>Comment corriger</h4>
  <ol>${p.etapes.map((e) => `<li>${esc(e)}</li>`).join('')}</ol>
  ${p.cms ? `<h4>Dans votre outil</h4><dl>${Object.entries(p.cms).map(([k, v]) => `<dt>${esc({ wordpress: 'WordPress', wix: 'Wix', shopify: 'Shopify' }[k] ?? k)}</dt><dd>${esc(v ?? '')}</dd>`).join('')}</dl>` : ''}
  ${p.wcag.length ? `<p class="wcag">Référence WCAG : ${esc(p.wcag.join(', '))}</p>` : ''}
</article>`,
    )
    .join('');

  const detailPages = r.pages
    .map((page) => {
      const probs = page.rapport.problemes;
      const blocs = probs
        .map((p) => {
          const captures = page.captures.filter((c) => c.regle === p.id).slice(0, Math.max(0, Math.min(MAX_CAPTURES_PAR_PROBLEME, budget)));
          budget -= captures.length;
          return `<section class="probleme-page">
  <h4>${esc(p.titre)}</h4>
  <p class="meta">Priorité : ${esc(p.priorite)} · ${p.occurrences} élément${p.occurrences > 1 ? 's' : ''} concerné${p.occurrences > 1 ? 's' : ''}</p>
  ${captures
    .map(
      (c, i) => `<figure><img src="${c.image}" alt="${esc(`Capture ${i + 1} : ${p.titre.toLowerCase()}, sur la page ${chemin(page.url)}. L'élément concerné est entouré en rouge.`)}"><figcaption>Élément concerné entouré en rouge (capture ${i + 1} sur ${captures.length}).</figcaption></figure>`,
    )
    .join('')}
</section>`;
        })
        .join('');
      return `<section class="page-analysee">
  <h3>${esc(page.titre || chemin(page.url))}</h3>
  <p class="meta">Adresse : ${esc(decodeURI(page.url))} · Score de la page : ${page.rapport.score} sur 100</p>
  ${probs.length ? blocs : '<p>Aucun problème détecté automatiquement sur cette page.</p>'}
</section>`;
    })
    .join('');

  const annexe = r.problemes
    .map(
      (p) => `<section>
  <h3>${esc(p.titre)}</h3>
  <p class="meta">Règle axe-core : <code>${esc(p.id)}</code>${p.wcag.length ? ` · Critères WCAG : ${esc(p.wcag.join(', '))}` : ''}</p>
  <ul class="elements">${p.elements
    .slice(0, MAX_ELEMENTS_ANNEXE)
    .map((e) => `<li><p>Page ${esc(chemin(e.page))} — sélecteur : <code>${esc(e.selecteur)}</code></p><pre><code>${esc(tronquer(e.html, 400))}</code></pre></li>`)
    .join('')}</ul>
  ${p.elements.length > MAX_ELEMENTS_ANNEXE ? `<p>… et ${p.elements.length - MAX_ELEMENTS_ANNEXE} autres éléments.</p>` : ''}
</section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rapport d'accessibilité – ${esc(r.site)}</title>
<style>
${polices()}
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Atkinson Hyperlegible', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #14213d; }
h1, h2, h3, h4 { line-height: 1.25; margin: 0 0 8pt; break-after: avoid; }
h2 { font-size: 20pt; }
h3 { font-size: 14pt; margin-top: 16pt; }
h4 { font-size: 11.5pt; margin-top: 10pt; }
p, ol, ul, dl { margin: 0 0 8pt; }
.nouvelle-page { break-before: page; }
.meta { color: #3d4a63; font-size: 10pt; }
.garde { height: 245mm; display: flex; flex-direction: column; justify-content: center; }
.surtitre { font-size: 14pt; color: #9a3a06; font-weight: 700; letter-spacing: 0.02em; }
.garde h1 { font-size: 32pt; margin-bottom: 4pt; overflow-wrap: anywhere; }
.score { font-size: 18pt; margin-top: 24pt; }
.score .nombre { font-size: 54pt; font-weight: 700; }
.palier { display: inline-block; align-self: flex-start; padding: 3pt 12pt; border: 2pt solid #14213d; border-radius: 99pt; font-weight: 700; }
.garde .avertissement { margin-top: 32pt; padding-left: 10pt; border-left: 3pt solid #9a3a06; color: #3d4a63; max-width: 150mm; }
.chiffres { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4pt 16pt; }
.chiffres dt { color: #3d4a63; } .chiffres dd { margin: 0 0 6pt; font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
caption { text-align: left; font-weight: 700; margin-bottom: 6pt; }
th, td { border: 0.75pt solid #9aa6bb; padding: 4pt 6pt; text-align: left; vertical-align: top; }
thead th { background: #eef2f8; }
tbody th { font-weight: 400; }
tr { break-inside: avoid; }
article, figure, .probleme-page { break-inside: avoid; }
article { padding-bottom: 6pt; border-bottom: 0.75pt solid #c9d1de; }
dt { font-weight: 700; } dd { margin: 0 0 4pt; }
.wcag { color: #3d4a63; font-size: 9.5pt; }
figure { margin: 6pt 0 10pt; }
figure img { display: block; max-width: 100%; max-height: 90mm; border: 0.75pt solid #9aa6bb; }
figcaption { font-size: 9pt; color: #3d4a63; margin-top: 2pt; }
.page-analysee { break-before: page; }
.page-analysee:first-of-type { break-before: auto; }
.checklist { list-style: none; padding: 0; }
.checklist li { position: relative; padding-left: 20pt; margin-bottom: 6pt; break-inside: avoid; }
.checklist li::before { content: ''; position: absolute; left: 0; top: 3pt; width: 10pt; height: 10pt; border: 1.25pt solid #14213d; }
code, pre { font-family: Consolas, 'Courier New', monospace; font-size: 8.5pt; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f4f6fa; padding: 4pt 6pt; margin: 2pt 0 8pt; }
.elements { padding-left: 14pt; }
</style>
</head>
<body>
<main>
<section class="garde" aria-labelledby="titre">
  <p class="surtitre">Rapport d'accessibilité</p>
  <h1 id="titre">${esc(r.site)}</h1>
  <p class="meta">Analyse du ${date(r.scannedAt)} · ${r.pages.length} page${r.pages.length > 1 ? 's' : ''} analysée${r.pages.length > 1 ? 's' : ''}</p>
  <p class="score"><span class="nombre">${r.score}</span> sur 100</p>
  <p class="palier">${esc(r.palier)}</p>
  <p class="avertissement">${esc(r.mentions.find((m) => m.includes('environ un tiers')) ?? '')}</p>
</section>

<section class="nouvelle-page">
  <h2>Résumé</h2>
  <p><strong>${esc(r.synthese)}</strong></p>
  ${r.effortTotal ? `<p>Temps de correction estimé : ${esc(r.effortTotal.texte)}.</p>` : ''}
  <h3>En chiffres</h3>
  <dl class="chiffres">
    <dt>Pages analysées</dt><dd>${r.pages.length}</dd>
    <dt>Problèmes critiques</dt><dd>${compte('Critique')}</dd>
    <dt>Problèmes importants</dt><dd>${compte('Importante')}</dd>
    <dt>Points à améliorer</dt><dd>${compte('À améliorer')}</dd>
    <dt>Points à vérifier manuellement</dt><dd>${r.aVerifier.length}</dd>
  </dl>
  ${r.problemes.length ? `<h3>Vos priorités</h3><ol>${r.problemes.slice(0, 5).map((p) => `<li><strong>${esc(p.titre)}</strong> — ${esc(p.quiCorrige.toLowerCase())}, ${esc(p.effort)}.</li>`).join('')}</ol>` : ''}
  <h3>Et ensuite ?</h3>
  <p>Commencez par les problèmes critiques : ce sont eux qui empêchent aujourd'hui certaines personnes d'utiliser votre site. Le plan d'action, page suivante, indique pour chacun qui peut le corriger et le temps nécessaire. Transmettez l'annexe technique à votre webdesigner ou à votre développeur.</p>
</section>

${r.problemes.length ? `<section class="nouvelle-page">
  <h2>Plan d'action</h2>
  <table>
    <caption>Problèmes triés par priorité</caption>
    <thead><tr><th scope="col">N°</th><th scope="col">Problème</th><th scope="col">Priorité</th><th scope="col">Pages</th><th scope="col">Effort</th><th scope="col">Qui peut corriger</th></tr></thead>
    <tbody>${planAction}</tbody>
  </table>
</section>

<section class="nouvelle-page">
  <h2>Comment corriger chaque problème</h2>
  ${corrections}
</section>` : ''}

<section class="nouvelle-page">
  <h2>Détail par page analysée</h2>
  ${detailPages}
</section>

<section class="nouvelle-page">
  <h2>À vérifier vous-même</h2>
  <p>Les tests automatiques ne voient pas tout. Ces vérifications prennent environ une heure et complètent ce rapport.</p>
  ${r.aVerifier.length ? `<h3>Points signalés par l'analyse</h3><ul>${r.aVerifier.map((a) => `<li><strong>${esc(a.titre)}</strong> (${a.occurrences} élément${a.occurrences > 1 ? 's' : ''}) — ${esc(a.pourquoi)}</li>`).join('')}</ul>` : ''}
  <h3>Liste de vérification</h3>
  <ul class="checklist">${CHECKLIST.map(([t, d]) => `<li><strong>${esc(t)}.</strong> ${esc(d)}</li>`).join('')}</ul>
</section>

${r.problemes.length ? `<section class="nouvelle-page">
  <h2>Annexe technique</h2>
  <p>Pour votre webdesigner ou votre développeur : l'emplacement exact de chaque élément concerné.</p>
  ${annexe}
</section>` : ''}

${lienDevis ? `<section class="nouvelle-page">
  <h2>Besoin d'aide pour corriger ?</h2>
  <p>Nous pouvons corriger ces problèmes pour vous, ou accompagner votre webdesigner. Décrivez votre besoin en deux minutes : nous vous répondons sous 2 jours ouvrables avec un devis adapté.</p>
  <p><a href="${esc(lienDevis)}">Demander un devis pour faire corriger mon site</a></p>
</section>` : ''}

<section${lienDevis ? '' : ' class="nouvelle-page"'}>
  <h2>À savoir</h2>
  <ul>${r.mentions.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
</section>
</main>
</body>
</html>`;
}

/** Tagged PDF (structure tree, language, bookmarks) rendered by Chromium, with no network access. */
export async function renderPdf(r: SiteReport, lienDevis?: string): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(pdfHtml(r, lienDevis), { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:8pt;color:#3d4a63;text-align:center">${esc(r.site)} · page <span class="pageNumber"></span> sur <span class="totalPages"></span></div>`,
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
    });
  } finally {
    await context.close();
  }
}
