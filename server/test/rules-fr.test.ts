import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { AXE_TAGS, EXTRA_RULES, RULES, ruleFr } from '../src/rules-fr.js';
import { synthese } from '../src/report.js';

const axeIds = axe.getRules(AXE_TAGS).map((r) => r.ruleId);
const all = { ...RULES, ...EXTRA_RULES };

// Every user-facing string we can produce (mentions excluded: their wording is imposed).
const texts = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(texts) : [];
const everything = [
  ...texts(all),
  ...texts(ruleFr('unknown-rule', 'serious')),
  ...[100, 85, 60, 20].flatMap((s) => [0, 1, 3].map((c) => synthese(s, c, c ? 5 : 0))),
];

describe('rules-fr coverage', () => {
  it(`translates every axe rule we run (${axeIds.length})`, () => {
    expect(axeIds.filter((id) => !RULES[id])).toEqual([]);
  });

  it('has no entry for a rule axe does not run (catches typos)', () => {
    expect(Object.keys(RULES).filter((id) => !axeIds.includes(id))).toEqual([]);
  });

  it.each(Object.entries(all))('%s has a title, a why, audiences and 2–3 steps', (_id, r) => {
    expect(r.titre.length).toBeGreaterThan(10);
    expect(r.pourquoi.length).toBeGreaterThan(20);
    expect(r.touche.length).toBeGreaterThan(0);
    expect(r.etapes.length).toBeGreaterThanOrEqual(2);
    expect(r.etapes.length).toBeLessThanOrEqual(3);
  });
});

// \b is ASCII-only: "en-tête" would match "te". Use Unicode letter boundaries instead.
const word = (alternatives: string) => new RegExp(`(?<!\\p{L})(${alternatives})(?!\\p{L})`, 'iu');

describe('language guards', () => {
  it('never qualifies a site as « conforme » or « certifié »', () => {
    expect(everything.filter((t) => /conform|certifi/i.test(t))).toEqual([]);
  });

  it('never uses « tu »', () => {
    const tu = word("tu|toi|ton|ta|tes|te|t['’]");
    expect(everything.filter((t) => tu.test(t))).toEqual([]);
    expect(tu.test('Peux-tu vérifier ton site ?')).toBe(true); // the guard itself works
  });

  it('contains no leftover English', () => {
    const english = word('the|should|must|ensure|please|elements?|fix');
    expect(everything.filter((t) => english.test(t))).toEqual([]);
    expect(english.test('Ensure images have alt text')).toBe(true);
  });

  it('keeps technical jargon out of what the owner reads (titles and « pourquoi »)', () => {
    const lus = Object.values(all).flatMap((r) => [r.titre, r.pourquoi]);
    expect(lus.filter((t) => /ARIA|SVG|<\w+|attribut/i.test(t))).toEqual([]);
  });

  it('uses French typography: no line can start with « : » or an orphan quote mark', () => {
    const regle = Object.values(all).flatMap(texts);
    expect(regle.filter((t) => / [:;!?»]|« /.test(t))).toEqual([]);
  });
});

describe('priorities', () => {
  it('treats keyboard dead ends as blocking', () => {
    for (const id of ['scrollable-region-focusable', 'frame-focusable-content', 'server-side-image-map']) {
      expect(RULES[id].bloquant, id).toBe(true);
    }
  });
});
