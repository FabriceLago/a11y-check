import type { PageAnalysee } from './crawl.js';
import { buildReport, EFFORT_MINUTES, effortTotal, MENTION_100, MENTIONS, palier, parPriorite, synthese, type FullReport, type Priorite } from './report.js';

const RANG: Record<Priorite, number> = { Critique: 0, Importante: 1, 'À améliorer': 2 };
type Probleme = Omit<FullReport['problemes'][number], 'elements'> & {
  pages: string[];
  elements: { page: string; selecteur: string; html: string }[];
};

const hote = (url: string) => new URL(url).hostname.replace(/^www\./, '');

/**
 * Paid report: one report per page, then problems merged across pages
 * (a template defect shows up on every page but is fixed once).
 */
export function buildSiteReport(pages: PageAnalysee[]) {
  const parPage = pages.map((p) => ({
    url: p.result.finalUrl,
    titre: p.result.desktop.title,
    rapport: buildReport(p.result),
    captures: p.result.desktop.captures ?? [],
  }));

  const fusion = new Map<string, Probleme>();
  for (const page of parPage) {
    for (const { elements, ...p } of page.rapport.problemes) {
      const avecPage = elements.map((e) => ({ page: page.url, ...e }));
      const prev = fusion.get(p.id);
      if (!prev) {
        fusion.set(p.id, { ...p, pages: [page.url], elements: avecPage });
        continue;
      }
      prev.pages.push(page.url);
      prev.occurrences += p.occurrences;
      prev.elements.push(...avecPage);
      if (RANG[p.priorite] < RANG[prev.priorite]) prev.priorite = p.priorite;
      if (EFFORT_MINUTES[p.effort] > EFFORT_MINUTES[prev.effort]) prev.effort = p.effort;
      if (prev.seulement !== p.seulement) prev.seulement = undefined;
    }
  }
  const problemes = [...fusion.values()].sort(parPriorite);

  const aVerifier = new Map<string, FullReport['aVerifier'][number]>();
  for (const page of parPage) {
    for (const a of page.rapport.aVerifier) {
      const prev = aVerifier.get(a.id);
      aVerifier.set(a.id, prev ? { ...prev, occurrences: prev.occurrences + a.occurrences } : { ...a });
    }
  }

  // Site score = mean of page scores: easy to explain ("la moyenne de vos pages").
  const score = Math.round(parPage.reduce((s, p) => s + p.rapport.score, 0) / parPage.length);
  const n = parPage.length;
  return {
    url: pages[0].result.url,
    site: hote(pages[0].result.finalUrl),
    scannedAt: new Date().toISOString(),
    score,
    palier: palier(score),
    synthese: synthese(score, problemes.filter((p) => p.priorite === 'Critique').length, problemes.length),
    effortTotal: effortTotal(problemes),
    problemes,
    aVerifier: [...aVerifier.values()],
    pages: parPage,
    mentions: [
      ...(score === 100 ? [MENTION_100] : []),
      ...MENTIONS,
      `Ce rapport porte sur ${n} page${n > 1 ? 's' : ''} de votre site : les autres pages n'ont pas été analysées.`,
    ],
  };
}

export type SiteReport = ReturnType<typeof buildSiteReport>;
