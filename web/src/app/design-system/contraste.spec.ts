import { niveau, ratio, versRgb } from './contraste';

describe('contraste', () => {
  it('parses hex and rgb() colours', () => {
    expect(versRgb('#fff')).toEqual([255, 255, 255]);
    expect(versRgb(' #14213D ')).toEqual([20, 33, 61]);
    expect(versRgb('rgb(29, 52, 97)')).toEqual([29, 52, 97]);
    expect(versRgb('var(--x)')).toBeNull();
  });

  it('matches WCAG reference values', () => {
    expect(ratio('#000000', '#ffffff')).toBe(21);
    expect(ratio('#ffffff', '#ffffff')).toBe(1);
    expect(ratio('#767676', '#ffffff')).toBe(4.54); // the classic "lightest AA grey"
    expect(ratio('#777777', '#ffffff')).toBe(4.47);
  });

  it('never rounds a failing ratio up into a pass', () => {
    const r = ratio('#777777', '#ffffff')!;
    expect(niveau(r)).toBe('Insuffisant');
  });

  it('checks the documented tokens (light theme)', () => {
    expect(niveau(ratio('#14213d', '#ffffff')!)).toBe('AAA');
    expect(niveau(ratio('#3d4a63', '#f4f6fa')!)).toBe('AAA');
    expect(niveau(ratio('#b54708', '#ffffff')!, true)).toBe('AA (3:1 minimum)');
  });
});
