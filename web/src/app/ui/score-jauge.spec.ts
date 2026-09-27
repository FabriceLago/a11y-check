import { TestBed } from '@angular/core/testing';
import { ScoreJauge } from './score-jauge';

describe('ScoreJauge', () => {
  async function render(score: number, palier: string) {
    const fixture = TestBed.createComponent(ScoreJauge);
    fixture.componentRef.setInput('score', score);
    fixture.componentRef.setInput('palier', palier);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('says the score in words, not only with a ring', async () => {
    const el = await render(65, 'Une base à consolider');
    expect(el.textContent?.replace(/\s+/g, ' ')).toContain('Score : 65 sur 100');
    expect(el.textContent).toContain('Une base à consolider');
    expect(el.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('fills the dial proportionally (65 % of the track)', async () => {
    const el = await render(65, 'x');
    const longueur = (sel: string) =>
      Number(el.querySelector(sel)!.getAttribute('stroke-dasharray')!.split(' ')[0]);
    expect(longueur('.arc') / longueur('.piste')).toBeCloseTo(0.65);
  });

  it.each([
    [30, 'bas'],
    [65, 'moyen'],
    [92, 'haut'],
  ])('%i → level %s (icon + colour, both decorative)', async (score, niveau) => {
    const el = await render(score, 'x');
    expect(el.querySelector('.palier')?.getAttribute('data-niveau')).toBe(niveau);
    expect(el.querySelector('.palier__icone')?.getAttribute('aria-hidden')).toBe('true');
  });
});
