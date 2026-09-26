import { TestBed } from '@angular/core/testing';
import { AVERTISSEMENT, evaluerEaa, QuestionnaireEaa, VERDICTS } from './questionnaire-eaa';

describe('evaluerEaa', () => {
  it.each([
    [{ secteur: 'commerce', clients: 'particuliers', taille: 'plus' }, 'concerne'],
    [{ secteur: 'finance', clients: 'deux', taille: 'plus' }, 'concerne'],
    [{ secteur: 'commerce', clients: 'particuliers', taille: 'inconnu' }, 'concerne-sauf-micro'],
    [{ secteur: 'transport', clients: 'deux', taille: 'micro' }, 'exemption-possible'],
    [{ secteur: 'commerce', clients: 'pros', taille: 'plus' }, 'moins-concerne'],
    [{ secteur: 'autre', clients: 'pros', taille: 'micro' }, 'moins-concerne'],
    [{ secteur: 'autre', clients: 'particuliers', taille: 'plus' }, 'indetermine'],
  ] as const)('%o → %s', (reponses, verdict) => {
    expect(evaluerEaa(reponses)).toBe(verdict);
  });

  it('never states a legal conclusion', () => {
    const textes = Object.values(VERDICTS).flatMap((v) => [v.titre, v.texte]).join(' ');
    expect(textes).not.toMatch(/conforme|certifi|vous devez|obligatoirement|vous êtes (exempté|soumis)/i);
    expect(AVERTISSEMENT).toContain("n'est pas un avis juridique");
  });
});

describe('QuestionnaireEaa', () => {
  async function render() {
    const fixture = TestBed.createComponent(QuestionnaireEaa);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const choisir = async (name: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`input[name="eaa-${name}"][value="${value}"]`)!;
      input.checked = true;
      input.dispatchEvent(new Event('change'));
      await fixture.whenStable();
    };
    const valider = async () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { el, choisir, valider };
  }

  it('groups each question in a fieldset with a legend', async () => {
    const { el } = await render();
    const legends = [...el.querySelectorAll('fieldset legend')].map((l) => l.textContent?.trim());
    expect(legends).toHaveLength(3);
    expect(legends[1]).toContain('À qui vendez-vous');
    expect(el.querySelectorAll('input[type="radio"]:checked')).toHaveLength(0);
  });

  it('flags unanswered questions and focuses the first one', async () => {
    const { el, choisir, valider } = await render();
    await choisir('secteur', 'commerce');
    await valider();
    const fieldsets = el.querySelectorAll('fieldset');
    expect(fieldsets[0].hasAttribute('aria-describedby')).toBe(false);
    expect(fieldsets[1].getAttribute('aria-describedby')).toBe('eaa-erreur-clients');
    expect(el.querySelector('#eaa-erreur-clients')?.textContent).toContain('Choisissez une réponse');
    expect(document.activeElement).toBe(el.querySelector('input[name="eaa-clients"]'));
    expect(el.querySelector('.verdict')).toBeNull();
  });

  it('shows a nuanced answer, focuses it, and hides it again when an answer changes', async () => {
    const { el, choisir, valider } = await render();
    await choisir('secteur', 'commerce');
    await choisir('clients', 'particuliers');
    await choisir('taille', 'micro');
    await valider();
    const h3 = el.querySelector('.verdict h3')!;
    expect(h3.textContent).toBe('Vous pourriez être exempté');
    expect(document.activeElement).toBe(h3);
    expect(el.querySelector('.verdict')?.textContent).toContain("n'est pas un avis juridique");

    await choisir('taille', 'plus');
    expect(el.querySelector('.verdict')).toBeNull();
  });
});
