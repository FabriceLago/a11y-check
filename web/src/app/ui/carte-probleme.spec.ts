import { TestBed } from '@angular/core/testing';
import type { Probleme } from '../api';
import { CarteProbleme, listeFr } from './carte-probleme';

const PROBLEME: Probleme = {
  id: 'label',
  titre: "Certains champs de formulaire n'ont pas d'étiquette",
  pourquoi: 'Sans étiquette, une personne aveugle ne sait pas quoi écrire.',
  touche: [
    { id: 'aveugles', label: 'Personnes aveugles' },
    { id: 'cognitif', label: 'Personnes avec des difficultés cognitives' },
  ],
  priorite: 'Critique',
  effort: '1–2 h',
  quiCorrige: 'Votre webdesigner',
  etapes: ['Étape un.', 'Étape deux.'],
  cms: { wordpress: 'Réglage WordPress.', wix: 'Réglage Wix.' },
  wcag: ['4.1.2'],
  occurrences: 1,
  seulement: 'mobile',
};

describe('CarteProbleme', () => {
  async function render(p: Probleme = PROBLEME) {
    const fixture = TestBed.createComponent(CarteProbleme);
    fixture.componentRef.setInput('probleme', p);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('is a named region headed by the problem title', async () => {
    const el = await render();
    const article = el.querySelector('article')!;
    const h3 = el.querySelector('h3')!;
    expect(h3.textContent).toContain("n'ont pas d'étiquette");
    expect(article.getAttribute('aria-labelledby')).toBe(h3.id);
  });

  it('states the priority in words', async () => {
    const el = await render();
    expect(el.querySelector('.badge')?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Priorité : Critique',
    );
  });

  it('lists the steps in order and the viewport restriction', async () => {
    const el = await render();
    expect([...el.querySelectorAll('.etapes li')].map((li) => li.textContent)).toEqual([
      'Étape un.',
      'Étape deux.',
    ]);
    expect(el.textContent).toContain('(sur mobile uniquement)');
  });

  it('keeps CMS instructions folded, with an explicit summary', async () => {
    const el = await render();
    expect(el.querySelector('details')?.hasAttribute('open')).toBe(false);
    expect(el.querySelector('summary')?.textContent).toBe('Instructions pour WordPress ou Wix');
  });

  it('omits the CMS block when there is nothing to say', async () => {
    const el = await render({ ...PROBLEME, cms: undefined });
    expect(el.querySelector('details')).toBeNull();
  });
});

describe('listeFr', () => {
  it('joins like a French sentence', () => {
    expect(listeFr(['WordPress'])).toBe('WordPress');
    expect(listeFr(['WordPress', 'Wix', 'Shopify'])).toBe('WordPress, Wix ou Shopify');
  });
});
