import type { ImpactValue as AxeImpact } from 'axe-core';
import { AUDIENCE_LABELS, FIXER_LABELS, ruleFr, type Effort } from './rules-fr.js';
import type { ScanResult } from './scan.js';

type ImpactValue = NonNullable<AxeImpact>;

// ─── Tuning knobs: adjust after scanning real sites ───────────
export const PENALTY: Record<ImpactValue, number> = { critical: 15, serious: 10, moderate: 5, minor: 2 };
const MAX_OCCURRENCE_FACTOR = 2;
const EFFORT_BUMP_THRESHOLD = 20; // above this many elements, effort goes up one level
const FREE_TOP = 5;

const EFFORTS: Effort[] = ['15 min', '1–2 h', 'une demi-journée', 'nécessite un développeur'];
export const EFFORT_MINUTES: Record<Effort, number> = { '15 min': 15, '1–2 h': 90, 'une demi-journée': 240, 'nécessite un développeur': 480 };

export type Priorite = 'Critique' | 'Importante' | 'À améliorer';
const PRIORITES: Priorite[] = ['Critique', 'Importante', 'À améliorer'];
type Viewport = 'ordinateur' | 'mobile';
type Element = { selecteur: string; html: string };

export const MENTIONS = [
  "Les tests automatiques ne détectent qu'une partie des problèmes d'accessibilité (environ un tiers). Un bon score ne signifie pas que le site est conforme.",
  "Ce rapport n'est pas un avis juridique.",
];
export const MENTION_100 = "Aucun problème détecté automatiquement : cela ne couvre qu'environ un tiers des critères. Une vérification manuelle reste indispensable.";

type Violation = { id: string; impact: ImpactValue; tags: string[]; elements: Element[]; nodeCount: number; viewports: Viewport[] };

export function priorite(impact: ImpactValue, n: number, bloquant = false): Priorite {
  if (impact === 'critical') return 'Critique';
  if (impact === 'serious') return n >= 5 || bloquant ? 'Critique' : 'Importante';
  if (impact === 'moderate') return n >= 10 ? 'Importante' : 'À améliorer';
  return 'À améliorer';
}

const occurrenceFactor = (n: number) => Math.min(MAX_OCCURRENCE_FACTOR, 1 + Math.log10(Math.max(1, n)));

export function computeScore(violations: { impact: ImpactValue; nodeCount: number }[]): number {
  const lost = violations.reduce((sum, v) => sum + PENALTY[v.impact] * occurrenceFactor(v.nodeCount), 0);
  return Math.max(0, Math.round(100 - lost));
}

export function palier(score: number) {
  return score < 50 ? 'Des obstacles importants' : score < 80 ? 'Une base à consolider' : 'Une bonne base';
}

export function bumpEffort(effort: Effort, n: number): Effort {
  return n > EFFORT_BUMP_THRESHOLD ? EFFORTS[Math.min(EFFORTS.indexOf(effort) + 1, EFFORTS.length - 1)] : effort;
}

export function effortPhrase(minutes: number): string {
  if (minutes <= 60) return "moins d'une heure";
  if (minutes <= 150) return '1 à 2 heures';
  if (minutes <= 300) return 'environ une demi-journée';
  if (minutes <= 540) return 'environ 1 journée';
  return `environ ${Math.ceil(minutes / 480)} jours`;
}

const pluriel = (n: number, un: string, plusieurs: string) => (n === 1 ? un : plusieurs);

export function synthese(score: number, critiques: number, total: number): string {
  if (total === 0) return "Aucun problème n'a été détecté automatiquement sur cette page. Une vérification manuelle reste indispensable.";
  const bloquent = `${critiques} ${pluriel(critiques, 'problème empêche', 'problèmes empêchent')} certaines personnes de l'utiliser`;
  if (score >= 80) {
    return critiques ? `Votre site a une bonne base, mais ${bloquent}.` : 'Votre site a une bonne base. Quelques améliorations le rendront plus confortable pour tout le monde.';
  }
  if (score >= 50) {
    return critiques
      ? `Votre site est sur la bonne voie, mais ${bloquent}. Les corriger en priorité fera une vraie différence.`
      : "Votre site est sur la bonne voie. Plusieurs points gênent certaines personnes et méritent d'être corrigés.";
  }
  return "Plusieurs obstacles empêchent aujourd'hui certaines personnes d'utiliser votre site. Bonne nouvelle : la plupart se corrigent sans refaire le site.";
}

function wcagFromTags(tags: string[]): string[] {
  return [...new Set(tags.filter((t) => /^wcag\d{3,}$/.test(t)).map((t) => `${t[4]}.${t[5]}.${t.slice(6)}`))];
}

const toElement = (n: { target: unknown[]; html: string }): Element => ({ selecteur: n.target.map(String).join(' '), html: n.html });

/** Desktop + mobile → one list; our own checks become pseudo-rules. */
function merge(scan: ScanResult): Violation[] {
  const byId = new Map<string, Violation>();
  const passes: [Viewport, ScanResult['desktop']][] = [['ordinateur', scan.desktop], ['mobile', scan.mobile]];
  for (const [viewport, pass] of passes) {
    for (const v of pass.violations) {
      const elements = v.nodes.map(toElement);
      const prev = byId.get(v.id);
      if (!prev) {
        byId.set(v.id, { id: v.id, impact: v.impact ?? 'moderate', tags: v.tags, elements, nodeCount: v.nodeCount, viewports: [viewport] });
        continue;
      }
      prev.viewports.push(viewport);
      const seen = new Set(prev.elements.map((e) => e.selecteur));
      prev.elements.push(...elements.filter((e) => !seen.has(e.selecteur)));
      // ponytail: same page twice, max() approximates the union beyond the 50-node cap.
      prev.nodeCount = Math.max(prev.nodeCount, v.nodeCount, prev.elements.length);
    }
  }

  const add = (id: string, impact: ImpactValue, elements: Element[]) =>
    byId.set(id, { id, impact, tags: [], elements, nodeCount: Math.max(1, elements.length), viewports: ['ordinateur', 'mobile'] });
  const { skipLink, videos } = scan.desktop.checks;
  if (!skipLink.found && !byId.has('bypass')) add('x-skip-link', 'minor', []);
  const uncaptioned = videos.native.filter((v) => !v.hasCaptions);
  if (uncaptioned.length && !byId.has('video-caption')) {
    add('x-video-captions', 'serious', uncaptioned.map((v) => ({ selecteur: 'video', html: `<video src="${v.src ?? ''}">` })));
  }
  return [...byId.values()];
}

type Triable = { priorite: Priorite; touche: unknown[]; occurrences: number };
export const parPriorite = (a: Triable, b: Triable) =>
  PRIORITES.indexOf(a.priorite) - PRIORITES.indexOf(b.priorite) ||
  b.touche.length - a.touche.length ||
  b.occurrences - a.occurrences;

/** Sum of the Critique + Importante problems ("l'essentiel"), or of everything if none. */
export function effortTotal(problemes: { priorite: Priorite; effort: Effort }[]) {
  if (!problemes.length) return null;
  const essentiels = problemes.filter((p) => p.priorite !== 'À améliorer');
  const minutes = (essentiels.length ? essentiels : problemes).reduce((s, p) => s + EFFORT_MINUTES[p.effort], 0);
  return { minutes, texte: `${effortPhrase(minutes)} de travail ${essentiels.length ? "pour l'essentiel" : 'pour tout corriger'}` };
}

export function buildReport(scan: ScanResult) {
  const violations = merge(scan);
  const problemes = violations
    .map((v) => {
      const rule = ruleFr(v.id, v.impact);
      return {
        id: v.id,
        titre: rule.titre,
        pourquoi: rule.pourquoi,
        touche: rule.touche.map((id) => ({ id, label: AUDIENCE_LABELS[id] })),
        priorite: priorite(v.impact, v.nodeCount, rule.bloquant),
        effort: bumpEffort(rule.effort, v.nodeCount),
        quiCorrige: FIXER_LABELS[rule.quiCorrige],
        etapes: rule.etapes,
        cms: rule.cms,
        wcag: rule.wcag ?? wcagFromTags(v.tags),
        occurrences: v.nodeCount,
        seulement: v.viewports.length === 1 ? v.viewports[0] : undefined,
        elements: v.elements,
      };
    })
    .sort(parPriorite);

  const score = computeScore(violations);

  // "À vérifier": axe could not decide, plus video embeds we cannot inspect.
  const incomplete = new Map<string, number>();
  for (const pass of [scan.desktop, scan.mobile]) {
    for (const r of pass.incomplete) incomplete.set(r.id, Math.max(incomplete.get(r.id) ?? 0, r.nodeCount));
  }
  const aVerifier = [...incomplete].map(([id, occurrences]) => {
    const { titre, pourquoi } = ruleFr(id, null);
    return { id, titre, pourquoi, occurrences };
  });
  const embeds = scan.desktop.checks.videos.embeds;
  if (embeds.length) {
    const { titre, pourquoi } = ruleFr('x-video-embed', null);
    aVerifier.push({ id: 'x-video-embed', titre, pourquoi, occurrences: embeds.length });
  }

  return {
    url: scan.url,
    finalUrl: scan.finalUrl,
    scannedAt: scan.scannedAt,
    score,
    palier: palier(score),
    synthese: synthese(score, problemes.filter((p) => p.priorite === 'Critique').length, problemes.length),
    effortTotal: effortTotal(problemes),
    problemes,
    aVerifier,
    mentions: score === 100 ? [MENTION_100, ...MENTIONS] : MENTIONS,
  };
}

export type FullReport = ReturnType<typeof buildReport>;

/** What the free on-screen report may see: top problems, no selectors, no HTML. */
export function freeView(report: FullReport) {
  const { problemes, aVerifier, ...rest } = report;
  return {
    ...rest,
    totalProblemes: problemes.length,
    problemes: problemes.slice(0, FREE_TOP).map(({ elements, ...p }) => p),
    pointsAVerifier: aVerifier.length,
  };
}
