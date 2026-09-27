import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Commande as CommandeApi, POLL_MS } from '../api';
import { Commande } from './commande';

const URL_API = '/api/commandes/cs_test_1';
const pause = () => new Promise((r) => setTimeout(r, 5));
const commande = (patch: Partial<CommandeApi>): CommandeApi => ({
  statut: 'processing',
  site: 'exemple.be',
  email: 'c•••@exemple.be',
  progression: null,
  telechargement: null,
  ...patch,
});

describe('Commande', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Commande>;
  let el: HTMLElement;

  async function repondre(body: object, status = 200) {
    await pause();
    http
      .expectOne(URL_API)
      .flush(body, status === 200 ? undefined : { status, statusText: 'Erreur' });
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: POLL_MS, useValue: 1 },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Commande);
    fixture.componentRef.setInput('session', 'cs_test_1');
    el = fixture.nativeElement;
    await fixture.whenStable();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('waits calmly for the Stripe confirmation (404 = not yet)', async () => {
    await repondre({ error: 'pending' }, 404);
    expect(el.querySelector('h1')?.textContent).toContain('Nous confirmons votre paiement');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    await pause();
    http.expectOne(URL_API); // still polling
  });

  it('shows the progress with a labelled native progress bar', async () => {
    await repondre(commande({ progression: { fait: 4, total: 10 } }));
    const progress = el.querySelector<HTMLProgressElement>('progress')!;
    expect(el.querySelector('label[for="progression"]')?.textContent).toContain('Pages analysées');
    expect(progress.value).toBe(4);
    expect(progress.max).toBe(10);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('4 pages analysées sur 10');
    await pause();
    http
      .expectOne(URL_API)
      .flush(commande({ statut: 'ready', telechargement: '/api/commandes/telechargement/jeton' }));
  });

  it('offers the download, focuses the heading and stops polling', async () => {
    await repondre(
      commande({ statut: 'ready', telechargement: '/api/commandes/telechargement/jeton' }),
    );
    const h1 = el.querySelector('h1')!;
    expect(h1.textContent).toContain('Votre rapport est prêt');
    expect(document.activeElement).toBe(h1);
    const lien = el.querySelector<HTMLAnchorElement>('a[download]')!;
    expect(lien.getAttribute('href')).toBe('/api/commandes/telechargement/jeton');
    expect(lien.textContent).toContain('Télécharger le rapport (PDF)');
    await pause();
    http.expectNone(URL_API);
  });

  it('is honest about a failed order and the refund', async () => {
    await repondre(commande({ statut: 'refunded' }));
    expect(el.querySelector('h1')?.textContent).toContain(
      "Nous n'avons pas pu réaliser votre rapport",
    );
    expect(el.textContent).toContain('intégralement remboursé');
  });
});
