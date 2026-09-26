import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { REDIRECTION } from '../api';
import { OffrePdf } from './offre-pdf';

describe('OffrePdf', () => {
  let http: HttpTestingController;
  let redirection: ReturnType<typeof vi.fn>;

  async function render(disponible = true) {
    const fixture = TestBed.createComponent(OffrePdf);
    fixture.componentRef.setInput('scanId', 'abc');
    await fixture.whenStable();
    http.expectOne('/api/offre').flush({ libelle: '39 € TVAC', disponible });
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  beforeEach(() => {
    redirection = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), { provide: REDIRECTION, useValue: redirection }],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('stays hidden while online payment is not available', async () => {
    const { el } = await render(false);
    expect(el.querySelector('button')).toBeNull();
  });

  it('shows the price and what is included', async () => {
    const { el } = await render();
    expect(el.querySelector('h2')?.textContent).toContain('Recevoir le rapport complet');
    expect(el.textContent).toContain('39 € TVAC');
    expect(el.querySelectorAll('li').length).toBeGreaterThanOrEqual(4);
    expect(el.querySelector('a[href="/conditions"]')).not.toBeNull();
  });

  it('sends the customer to Stripe Checkout', async () => {
    const { el, fixture } = await render();
    el.querySelector('button')!.click();
    await fixture.whenStable();
    http.expectOne({ method: 'POST', url: '/api/scan/abc/commande' }).flush({ url: 'https://checkout.stripe.test/1' });
    expect(redirection).toHaveBeenCalledWith('https://checkout.stripe.test/1');
    expect(el.querySelector('button')?.textContent).toContain('Redirection');
  });

  it('explains a payment service problem', async () => {
    const { el, fixture } = await render();
    el.querySelector('button')!.click();
    await fixture.whenStable();
    http
      .expectOne('/api/scan/abc/commande')
      .flush({ message: 'Le service de paiement ne répond pas. Réessayez dans quelques instants.' }, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('ne répond pas');
    expect(redirection).not.toHaveBeenCalled();
  });
});
