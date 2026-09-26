/** WCAG 2.x contrast, computed from the real token values (so the documentation cannot drift). */

export function versRgb(couleur: string): [number, number, number] | null {
  const c = couleur.trim();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const plein = hex.length === 3 ? [...hex].map((x) => x + x).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(plein.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Ratio rounded down to 2 decimals (rounding up could turn 4.499 into a false "AA"). */
export function ratio(a: string, b: string): number | null {
  const [ra, rb] = [versRgb(a), versRgb(b)];
  if (!ra || !rb) return null;
  const [clair, sombre] = [luminance(ra), luminance(rb)].sort((x, y) => y - x);
  return Math.floor(((clair + 0.05) / (sombre + 0.05)) * 100) / 100;
}

export function niveau(r: number, nonTexte = false): string {
  if (nonTexte) return r >= 3 ? 'AA (3:1 minimum)' : 'Insuffisant';
  return r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : 'Insuffisant';
}
