import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Accueil, validerUrl } from './accueil';

describe('validerUrl', () => {
  it('accepts what a non-developer would type', () => {
    expect(validerUrl('monsite.be')).toBeNull();
    expect(validerUrl('https://www.monsite.be/')).toBeNull();
  });
  it.each(['', 'mon site.be', 'monsite', 'x.'.repeat(1100)])('rejects %j', (url) => {
    expect(validerUrl(url)).not.toBeNull();
  });
});

describe('Accueil', () => {
  let http: HttpTestingController;

  async function render() {
    const fixture = TestBed.createComponent(Accueil);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    const submit = async (value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { fixture, el, input, submit };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('labels the field and links its hint', async () => {
    const { el, input } = await render();
    expect(el.querySelector('label[for="url"]')?.textContent).toContain('Adresse de votre site');
    expect(input.getAttribute('aria-describedby')).toBe('url-aide');
    expect(input.getAttribute('inputmode')).toBe('url');
  });

  it('shows a linked error and keeps focus in the field when empty', async () => {
    const { el, input, submit } = await render();
    await submit('');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('url-aide url-erreur');
    expect(el.querySelector('#url-erreur')?.textContent).toContain("Indiquez l'adresse");
    expect(document.activeElement).toBe(input);
  });

  it('clears the error as soon as the user types again', async () => {
    const { el, input, fixture, submit } = await render();
    await submit('');
    input.value = 'm';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.querySelector('#url-erreur')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('starts a scan and opens the analysis page', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { submit } = await render();
    await submit('  monsite.be ');
    const req = http.expectOne('/api/scan');
    expect(req.request.body).toEqual({ url: 'monsite.be' });
    req.flush({ id: 'abc' });
    expect(navigate).toHaveBeenCalledWith(['/analyse', 'abc']);
  });

  it('shows the French message sent by the server', async () => {
    const { el, submit } = await render();
    await submit('10.0.0.1.example');
    http
      .expectOne('/api/scan')
      .flush(
        {
          error: 'private',
          message: 'Cette adresse pointe vers un réseau privé et ne peut pas être analysée.',
        },
        { status: 400, statusText: 'Bad Request' },
      );
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('#url-erreur')?.textContent).toContain('réseau privé');
  });

  it('never shows an English framework error', async () => {
    const { el, submit } = await render();
    await submit('monsite.be');
    http
      .expectOne('/api/scan')
      .flush(
        { code: 'FST_ERR_VALIDATION', message: 'body/url must NOT have more than 2048 characters' },
        { status: 400, statusText: 'Bad Request' },
      );
    await new Promise((r) => setTimeout(r));
    expect(el.querySelector('#url-erreur')?.textContent).not.toContain('must');
  });
});
