import type { FullReport } from './report.js';

const APP_NAME = "Vérificateur d'accessibilité";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export type RapportLinks = { rapport: string; supprimer: string; confirmer?: string; desinscrire?: string };

/** The report e-mail: semantic HTML (lang, headings, AA contrast) + a plain-text version. */
export function rapportEmail(report: FullReport, links: RapportLinks) {
  const site = hostOf(report.url);
  const top = report.problemes.slice(0, 5);
  const subject = `Votre rapport d'accessibilité : ${report.score}/100 pour ${site}`;

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#14213d;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.6">
<main style="max-width:600px;margin:0 auto">
  <h1 style="font-size:26px;line-height:1.25;margin:0 0 16px">Votre rapport d'accessibilité pour ${esc(site)}</h1>
  <p style="margin:0 0 4px;font-size:22px"><strong>Score : ${report.score} sur 100</strong> — ${esc(report.palier)}</p>
  <p style="margin:0 0 16px">${esc(report.synthese)}</p>
  ${report.effortTotal ? `<p style="margin:0 0 16px"><strong>Temps de correction estimé :</strong> ${esc(report.effortTotal.texte)}.</p>` : ''}
  ${top.length ? `<h2 style="font-size:20px;margin:24px 0 8px">Les points à corriger en priorité</h2>
  <ol style="padding-left:24px;margin:0 0 16px">
    ${top.map((p) => `<li style="margin-bottom:8px"><strong>${esc(p.titre)}</strong><br>Priorité : ${esc(p.priorite)} · Effort : ${esc(p.effort)} · ${esc(p.quiCorrige)}</li>`).join('\n    ')}
  </ol>` : ''}
  <p style="margin:0 0 24px"><a href="${esc(links.rapport)}" style="color:#1d4fa3">Voir le rapport détaillé en ligne</a> (conseils pas à pas pour chaque point).</p>
  ${links.confirmer ? `<div style="margin:0 0 24px;padding:16px;border-left:4px solid #9a3a06;background:#f4f6fa">
    <h2 style="font-size:18px;margin:0 0 8px">Confirmez votre inscription à nos conseils</h2>
    <p style="margin:0 0 8px">Vous avez demandé à recevoir nos conseils et offres par e-mail. Pour l'activer, confirmez en un clic. Sans confirmation, nous ne vous écrirons pas.</p>
    <p style="margin:0"><a href="${esc(links.confirmer)}" style="color:#1d4fa3;font-weight:bold">Je confirme mon inscription</a></p>
  </div>` : ''}
  <h2 style="font-size:16px;margin:24px 0 8px">À savoir</h2>
  <ul style="padding-left:24px;margin:0 0 24px;color:#3d4a63;font-size:15px">
    ${report.mentions.map((m) => `<li>${esc(m)}</li>`).join('\n    ')}
  </ul>
  <p style="border-top:1px solid #c9d1de;padding-top:16px;color:#3d4a63;font-size:15px">
    Vous recevez cet e-mail parce que vous l'avez demandé sur ${esc(APP_NAME)}.<br>
    ${links.desinscrire ? `<a href="${esc(links.desinscrire)}" style="color:#1d4fa3">Ne plus recevoir nos conseils</a> · ` : ''}<a href="${esc(links.supprimer)}" style="color:#1d4fa3">Supprimer mes données</a>
  </p>
</main>
</body>
</html>`;

  const text = [
    `Votre rapport d'accessibilité pour ${site}`,
    '',
    `Score : ${report.score} sur 100 — ${report.palier}`,
    report.synthese,
    report.effortTotal ? `Temps de correction estimé : ${report.effortTotal.texte}.` : '',
    '',
    ...(top.length ? ['Les points à corriger en priorité :', ...top.map((p, i) => `${i + 1}. ${p.titre} (priorité : ${p.priorite}, effort : ${p.effort})`), ''] : []),
    `Rapport détaillé : ${links.rapport}`,
    '',
    ...(links.confirmer ? ['Confirmez votre inscription à nos conseils (sans confirmation, nous ne vous écrirons pas) :', links.confirmer, ''] : []),
    'À savoir :',
    ...report.mentions.map((m) => `- ${m}`),
    '',
    `Vous recevez cet e-mail parce que vous l'avez demandé sur ${APP_NAME}.`,
    ...(links.desinscrire ? [`Ne plus recevoir nos conseils : ${links.desinscrire}`] : []),
    `Supprimer mes données : ${links.supprimer}`,
  ].join('\n');

  return { subject, html, text };
}

/** Short transactional e-mail: one heading, a few paragraphs (already escaped HTML), same text version. */
export function emailSimple(titre: string, paragraphes: { html: string; text: string }[]) {
  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titre)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#14213d;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.6">
<main style="max-width:600px;margin:0 auto">
  <h1 style="font-size:24px;line-height:1.25;margin:0 0 16px">${esc(titre)}</h1>
  ${paragraphes.map((p) => `<p style="margin:0 0 16px">${p.html}</p>`).join('\n  ')}
  <p style="border-top:1px solid #c9d1de;padding-top:16px;color:#3d4a63;font-size:15px">${esc(APP_NAME)}</p>
</main>
</body>
</html>`;
  return { subject: titre, html, text: [titre, '', ...paragraphes.map((p) => p.text)].join('\n\n') };
}

export const lien = (href: string, texte: string) => ({
  html: `<a href="${esc(href)}" style="color:#1d4fa3;font-weight:bold">${esc(texte)}</a>`,
  text: `${texte} : ${href}`,
});
export const texte = (t: string) => ({ html: esc(t), text: t });

export function livraisonEmail({ site, telechargement, joint }: { site: string; telechargement: string; joint: boolean }) {
  return emailSimple(`Votre rapport d'accessibilité complet pour ${site}`, [
    texte('Merci pour votre commande. Votre rapport complet est prêt.'),
    texte(joint ? 'Vous le trouverez en pièce jointe (PDF). Vous pouvez aussi le télécharger à tout moment pendant 12 mois :' : 'Téléchargez-le ici (lien valable 12 mois) :'),
    lien(telechargement, 'Télécharger le rapport (PDF)'),
    texte("Commencez par le résumé et le plan d'action ; l'annexe technique est destinée à votre webdesigner ou à votre développeur. Votre facture vous est envoyée séparément par notre prestataire de paiement, Stripe."),
  ]);
}

export function excusesEmail({ site, rembourse }: { site: string; rembourse: boolean }) {
  return emailSimple(`Votre rapport pour ${site} n'a pas pu être réalisé`, [
    texte(`Nous sommes désolés : malgré trois tentatives, nous n'avons pas pu analyser ${site}. Le site était peut-être hors ligne, trop lent ou protégé contre les robots.`),
    texte(
      rembourse
        ? 'Vous avez été intégralement remboursé. Le montant apparaîtra sur votre compte sous 5 à 10 jours ouvrables.'
        : 'Nous allons vous rembourser intégralement dans les plus brefs délais. Nous vous confirmerons le remboursement par e-mail.',
    ),
    texte("Si votre site est de nouveau accessible, n'hésitez pas à relancer une analyse gratuite avant de commander à nouveau."),
  ]);
}

export function alerteAdmin({ commande, site, erreur, rembourse }: { commande: string; site: string; erreur: string; rembourse: boolean }) {
  return emailSimple(`[Alerte] Commande ${commande} en échec (${site})`, [
    texte(`La génération du rapport payant a échoué 3 fois pour ${site}.`),
    texte(rembourse ? 'Remboursement automatique effectué via Stripe.' : 'ATTENTION : le remboursement automatique a échoué. À faire manuellement dans le tableau de bord Stripe.'),
    texte(`Dernière erreur : ${erreur}`),
  ]);
}

/** Small accessible page for the links clicked from e-mails (works without the Angular app). */
export function page(titre: string, corps: string, status = 200) {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${esc(titre)} – ${esc(APP_NAME)}</title>
<style>
  :root { --bg:#fff; --text:#14213d; --muted:#3d4a63; --primary:#1d3461; --on-primary:#fff; --link:#1d4fa3; --focus:#b54708; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1729; --text:#eef2f8; --muted:#c3cad8; --primary:#cfdcf7; --on-primary:#0f1729; --link:#9cc0ff; --focus:#ffb27a; } }
  body { margin:0; padding:48px 16px; background:var(--bg); color:var(--text); font:18px/1.6 system-ui, sans-serif; }
  main { max-width:36rem; margin:0 auto; }
  h1 { font-size:1.75rem; line-height:1.25; }
  p { color:var(--muted); }
  a { color:var(--link); }
  button { min-height:44px; padding:.6rem 1.4rem; border:0; border-radius:6px; background:var(--primary); color:var(--on-primary); font:inherit; font-weight:700; cursor:pointer; }
  :focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
</style>
</head>
<body><main><h1>${esc(titre)}</h1>${corps}</main></body>
</html>`;
  return { html, status };
}
