import { describe, expect, it } from 'vitest';
import { bumpEffort, buildReport, computeScore, effortPhrase, freeView, priorite, synthese } from '../src/report.js';

type V = { id: string; impact: string; n?: number; tags?: string[] };
type Opts = { skipLink?: boolean; videos?: { src: string | null; hasCaptions: boolean }[]; embeds?: string[]; incomplete?: V[] };

const violation = ({ id, impact, n = 1, tags = [] }: V) => ({
  id,
  impact,
  tags,
  nodes: Array.from({ length: Math.min(n, 50) }, (_, i) => ({ target: [`#${id}-${i}`], html: `<x id="${id}-${i}">` })),
  nodeCount: n,
});

function scanOf(desktop: V[], mobile: V[] = desktop, o: Opts = {}) {
  const pass = (vs: V[]) => ({
    violations: vs.map(violation),
    incomplete: (o.incomplete ?? []).map(violation),
    checks: { skipLink: { found: o.skipLink ?? true, text: null }, videos: { native: o.videos ?? [], embeds: o.embeds ?? [] } },
  });
  return {
    url: 'https://exemple.be/',
    finalUrl: 'https://exemple.be/',
    scannedAt: '2026-09-27T10:00:00.000Z',
    desktop: pass(desktop),
    mobile: pass(mobile),
    blockedRequests: [],
  } as never;
}

describe('priorite', () => {
  it.each([
    ['critical', 1, false, 'Critique'],
    ['serious', 1, false, 'Importante'],
    ['serious', 5, false, 'Critique'],
    ['serious', 1, true, 'Critique'],
    ['moderate', 9, false, 'À améliorer'],
    ['moderate', 10, false, 'Importante'],
    ['moderate', 50, true, 'Importante'],
    ['minor', 100, true, 'À améliorer'],
  ] as const)('%s × %i (bloquant=%s) → %s', (impact, n, bloquant, expected) => {
    expect(priorite(impact, n, bloquant)).toBe(expected);
  });
});

describe('computeScore', () => {
  it('is 100 with no problem', () => expect(computeScore([])).toBe(100));
  it('removes 15 for one critical element', () => expect(computeScore([{ impact: 'critical', nodeCount: 1 }])).toBe(85));
  it('doubles the penalty at 10 occurrences', () => expect(computeScore([{ impact: 'serious', nodeCount: 10 }])).toBe(80));
  it('caps the occurrence factor at ×2', () => expect(computeScore([{ impact: 'serious', nodeCount: 5000 }])).toBe(80));
  it('never goes below 0', () => expect(computeScore(Array(20).fill({ impact: 'critical', nodeCount: 100 }))).toBe(0));
  it('always drops when a problem is added', () => {
    const base = [{ impact: 'moderate' as const, nodeCount: 3 }];
    expect(computeScore([...base, { impact: 'minor', nodeCount: 1 }])).toBeLessThan(computeScore(base));
  });
});

describe('effort', () => {
  it.each([
    [15, "moins d'une heure"],
    [60, "moins d'une heure"],
    [61, '1 à 2 heures'],
    [150, '1 à 2 heures'],
    [151, 'environ une demi-journée'],
    [300, 'environ une demi-journée'],
    [301, 'environ 1 journée'],
    [540, 'environ 1 journée'],
    [541, 'environ 2 jours'],
    [1500, 'environ 4 jours'],
  ])('%i min → %s', (minutes, phrase) => expect(effortPhrase(minutes)).toBe(phrase));

  it('goes up one level above 20 elements', () => {
    expect(bumpEffort('15 min', 20)).toBe('15 min');
    expect(bumpEffort('15 min', 21)).toBe('1–2 h');
    expect(bumpEffort('une journée ou plus', 500)).toBe('une journée ou plus');
  });
});

describe('synthese', () => {
  it('handles singular and plural', () => {
    expect(synthese(85, 1, 3)).toContain('1 problème empêche certaines personnes');
    expect(synthese(85, 3, 3)).toContain('3 problèmes empêchent certaines personnes');
  });
  it('stays reassuring when the score is low', () => expect(synthese(20, 6, 12)).toContain('Bonne nouvelle'));
  it('handles a clean page', () => expect(synthese(100, 0, 0)).toContain('Aucun problème'));
});

describe('buildReport', () => {
  it('merges desktop and mobile and flags viewport-only problems', () => {
    const r = buildReport(scanOf([{ id: 'image-alt', impact: 'critical', n: 3 }], [{ id: 'image-alt', impact: 'critical', n: 3 }, { id: 'target-size', impact: 'serious', n: 2 }]));
    const img = r.problemes.find((p) => p.id === 'image-alt')!;
    expect(img.seulement).toBeUndefined();
    expect(img.elements).toHaveLength(3);
    expect(img.occurrences).toBe(3);
    expect(r.problemes.find((p) => p.id === 'target-size')!.seulement).toBe('mobile');
  });

  it('sorts by priority first', () => {
    const r = buildReport(scanOf([{ id: 'p-as-heading', impact: 'serious', n: 1 }, { id: 'image-alt', impact: 'critical' }]));
    expect(r.problemes.map((p) => p.priorite)).toEqual(['Critique', 'Importante']);
  });

  it('adds the skip-link check only when axe did not already report bypass', () => {
    expect(buildReport(scanOf([], [], { skipLink: false })).problemes.map((p) => p.id)).toEqual(['x-skip-link']);
    expect(buildReport(scanOf([{ id: 'bypass', impact: 'serious' }], undefined, { skipLink: false })).problemes.map((p) => p.id)).toEqual(['bypass']);
  });

  it('adds uncaptioned videos unless axe already did', () => {
    const videos = [{ src: '/film.mp4', hasCaptions: false }];
    expect(buildReport(scanOf([], [], { videos })).problemes.map((p) => p.id)).toEqual(['x-video-captions']);
    expect(buildReport(scanOf([{ id: 'video-caption', impact: 'critical' }], undefined, { videos })).problemes.map((p) => p.id)).toEqual(['video-caption']);
  });

  it('lists video embeds and axe "incomplete" results as things to check manually', () => {
    const r = buildReport(scanOf([], [], { embeds: ['https://www.youtube.com/embed/x'], incomplete: [{ id: 'color-contrast', impact: 'serious', n: 4 }] }));
    expect(r.aVerifier.map((a) => a.id)).toEqual(['color-contrast', 'x-video-embed']);
    expect(r.score).toBe(100); // "to check" never counts in the score
  });

  it('uses a clean French text for unknown rules, with WCAG from tags', () => {
    const p = buildReport(scanOf([{ id: 'rule-from-the-future', impact: 'serious', tags: ['wcag2aa', 'wcag1412'] }])).problemes[0];
    expect(p.titre).toBe('Un point technique est à corriger');
    expect(p.wcag).toEqual(['1.4.12']);
    expect(p.quiCorrige).toBe('Un développeur');
  });

  it('adds up effort for the essential problems', () => {
    // image-alt (critical, 15 min) + color-contrast (serious ×1 → Importante, 90 min) = 105 min
    const r = buildReport(scanOf([{ id: 'image-alt', impact: 'critical' }, { id: 'color-contrast', impact: 'serious' }, { id: 'p-as-heading', impact: 'minor' }]));
    expect(r.effortTotal).toEqual({ minutes: 105, texte: "1 à 2 heures de travail pour l'essentiel" });
  });

  it('falls back to "tout corriger" when only minor problems remain', () => {
    const r = buildReport(scanOf([{ id: 'p-as-heading', impact: 'minor' }]));
    expect(r.effortTotal?.texte).toBe("moins d'une heure de travail pour tout corriger");
  });

  it('always carries the mandatory notices, plus a special one at 100', () => {
    const clean = buildReport(scanOf([]));
    expect(clean.score).toBe(100);
    expect(clean.effortTotal).toBeNull();
    expect(clean.mentions[0]).toContain('Aucun problème détecté automatiquement');
    const dirty = buildReport(scanOf([{ id: 'image-alt', impact: 'critical' }]));
    expect(dirty.mentions.join(' ')).toContain('environ un tiers');
    expect(dirty.mentions.join(' ')).toContain("n'est pas un avis juridique");
  });
});

describe('freeView', () => {
  it('keeps only the top 5 problems and strips selectors and HTML', () => {
    const ids = ['image-alt', 'label', 'link-name', 'button-name', 'color-contrast', 'target-size', 'p-as-heading'];
    const r = freeView(buildReport(scanOf(ids.map((id) => ({ id, impact: 'serious' })), undefined, { incomplete: [{ id: 'color-contrast', impact: 'serious' }] })));
    expect(r.totalProblemes).toBe(7);
    expect(r.problemes).toHaveLength(5);
    expect(r.pointsAVerifier).toBe(1);
    expect(JSON.stringify(r)).not.toMatch(/<x id=|#image-alt-0/);
  });
});
