import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Devis, validerDevis } from './devis';

describe('validerDevis', () => {
  it('returns errors in form order, keyed by field id', () => {
    expect(Object.keys(validerDevis({ nom: '', email: 'x', site: '', besoins: [] }))).toEqual([
      'devis-nom',
      'devis-email',
      'devis-site',
      'devis-besoins',
    ]);
    expect(
      validerDevis({
        nom: 'Marie',
        email: 'marie@exemple.be',
        site: 'exemple.be',
        besoins: ['audit'],
      }),
    ).toEqual({});
  });
});

describe('Devis', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Devis>;
  let el: HTMLElement;

  const saisir = (id: string, valeur: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = valeur;
    input.dispatchEvent(new Event('input'));
  };
  const cocher = (valeur: string) => {
    const box = el.querySelector<HTMLInputElement>(`input[type="checkbox"][value="${valeur}"]`)!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
  };
  const envoyer = async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };

  async function render(scan?: string) {
    fixture = TestBed.createComponent(Devis);
    if (scan) fixture.componentRef.setInput('scan', scan);
    el = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('labels every field and marks optional ones', async () => {
    await render();
    for (const id of [
      'devis-nom',
      'devis-entreprise',
      'devis-email',
      'devis-telephone',
      'devis-site',
      'devis-outil',
      'devis-delai',
      'devis-budget',
      'devis-message',
    ]) {
      expect(el.querySelector(`label[for="${id}"]`), id).not.toBeNull();
    }
    expect(el.querySelector('label[for="devis-budget"]')?.textContent).toContain('facultatif');
    expect(el.querySelector<HTMLInputElement>('#devis-email')!.autocomplete).toBe('email');
    expect(el.querySelector<HTMLSelectElement>('#devis-budget')!.value).toBe('inconnu');
    expect(el.querySelector('fieldset#devis-besoins legend')?.textContent).toContain(
      'Ce que vous souhaitez',
    );
  });

  it('shows a focused error summary whose links lead to the fields', async () => {
    await render();
    await envoyer();
    const recap = el.querySelector<HTMLElement>('.recap-erreurs')!;
    expect(document.activeElement).toBe(recap);
    expect(recap.querySelector('h2')?.textContent).toContain('4 points sont à corriger');
    expect(el.querySelector('#devis-nom')?.getAttribute('aria-describedby')).toBe(
      'devis-nom-erreur',
    );
    expect(el.querySelector('#devis-besoins')?.getAttribute('aria-describedby')).toContain(
      'devis-besoins-erreur',
    );

    recap.querySelector<HTMLAnchorElement>('a[href="#devis-email"]')!.click();
    expect(document.activeElement).toBe(el.querySelector('#devis-email'));
    recap.querySelector<HTMLAnchorElement>('a[href="#devis-besoins"]')!.click();
    expect(document.activeElement).toBe(el.querySelector('#devis-besoins input'));
  });

  it('sends the request, links the report, then confirms and focuses the confirmation', async () => {
    await render('scan-1');
    http.expectOne('/api/scan/scan-1').flush({
      id: 'scan-1',
      url: 'https://exemple.be/',
      status: 'done',
      steps: [],
      position: 0,
      report: { finalUrl: 'https://www.exemple.be/', score: 65, totalProblemes: 7 },
    });
    await fixture.whenStable();
    expect(el.querySelector('.lie')?.textContent).toContain('exemple.be');
    expect(el.querySelector<HTMLInputElement>('#devis-site')!.value).toBe(
      'https://www.exemple.be/',
    );

    saisir('devis-nom', 'Marie Dupont');
    saisir('devis-email', 'marie@exemple.be');
    cocher('critiques');
    await envoyer();
    const req = http.expectOne('/api/devis');
    expect(req.request.body).toMatchObject({
      nom: 'Marie Dupont',
      email: 'marie@exemple.be',
      site: 'https://www.exemple.be/',
      besoins: ['critiques'],
      budget: 'inconnu',
      delai: 'flexible',
      outil: 'inconnu',
      scanId: 'scan-1',
    });
    expect(req.request.body.siteWeb).toBeUndefined();
    req.flush({ message: 'Merci ! Nous vous répondons sous 2 jours ouvrables.' });
    await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain('Demande envoyée');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('2 jours ouvrables');
  });

  it('maps server field errors onto the form', async () => {
    await render();
    saisir('devis-nom', 'Marie');
    saisir('devis-email', 'marie@exemple.be');
    saisir('devis-site', 'exemple.be');
    cocher('audit');
    await envoyer();
    http
      .expectOne('/api/devis')
      .flush({ champs: { email: 'Adresse refusée.' } }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect(el.querySelector('#devis-email-erreur')?.textContent).toContain('Adresse refusée.');
  });

  it('hides the honeypot from people and assistive technologies', async () => {
    await render();
    const piege = el.querySelector('#devis-siteweb')!;
    expect(piege.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(piege.getAttribute('tabindex')).toBe('-1');
  });
});
