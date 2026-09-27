import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RapportEmail } from './rapport-email';

const CONSENT = {
  version: '2026-09-27',
  texte: "J'accepte de recevoir vos conseils et offres par e-mail.",
};

describe('RapportEmail', () => {
  let http: HttpTestingController;

  async function render({ consent = true } = {}) {
    const fixture = TestBed.createComponent(RapportEmail);
    fixture.componentRef.setInput('scanId', 'abc');
    await fixture.whenStable();
    const req = http.expectOne('/api/consentement');
    if (consent) req.flush(CONSENT);
    else req.flush(null, { status: 500, statusText: 'Erreur' });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const envoyer = async (email: string, cocher = false) => {
      const input = el.querySelector<HTMLInputElement>('#email')!;
      input.value = email;
      input.dispatchEvent(new Event('input'));
      if (cocher) {
        const box = el.querySelector<HTMLInputElement>('#conseils')!;
        box.checked = true;
        box.dispatchEvent(new Event('change'));
      }
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { fixture, el, envoyer };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shows the exact consent wording, unticked, and optional', async () => {
    const { el } = await render();
    const box = el.querySelector<HTMLInputElement>('#conseils')!;
    expect(box.checked).toBe(false);
    expect(el.querySelector('label[for="conseils"]')?.textContent).toContain(CONSENT.texte);
    expect(el.querySelector('label[for="conseils"]')?.textContent).toContain('facultatif');
    expect(el.querySelector('a[href="/confidentialite"]')).not.toBeNull();
  });

  it('validates the address, links the error and keeps focus', async () => {
    const { el, envoyer } = await render();
    await envoyer('marie@');
    const input = el.querySelector('#email')!;
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('email-erreur');
    expect(document.activeElement).toBe(input);
  });

  it('sends no consent when the box stays unticked', async () => {
    const { envoyer } = await render();
    await envoyer('marie@exemple.be');
    const req = http.expectOne('/api/scan/abc/email');
    expect(req.request.body).toEqual({ email: 'marie@exemple.be', conseils: false });
    req.flush({ message: "C'est envoyé !" });
  });

  it('sends the consent version when ticked, then announces and focuses the confirmation', async () => {
    const { fixture, el, envoyer } = await render();
    await envoyer('marie@exemple.be', true);
    const req = http.expectOne('/api/scan/abc/email');
    expect(req.request.body).toEqual({
      email: 'marie@exemple.be',
      conseils: true,
      consentVersion: CONSENT.version,
    });
    req.flush({ message: "C'est envoyé ! Un lien vous permettra de confirmer." });
    await fixture.whenStable();
    const ok = el.querySelector('[role="status"]')!;
    expect(ok.textContent).toContain("C'est envoyé");
    expect(document.activeElement).toBe(ok);
    expect(el.querySelector('form')).toBeNull();
  });

  it('never offers consent without its wording (text failed to load)', async () => {
    const { el, envoyer } = await render({ consent: false });
    expect(el.querySelector('#conseils')).toBeNull();
    await envoyer('marie@exemple.be');
    http.expectOne('/api/scan/abc/email').flush({ message: 'ok' });
  });
});
