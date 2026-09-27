import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Job, POLL_MS, Rapport } from '../api';
import { Analyse } from './analyse';

const URL_API = '/api/scan/abc';
const pause = () => new Promise((r) => setTimeout(r, 5));

const RAPPORT: Rapport = {
  url: 'https://www.exemple.be/',
  finalUrl: 'https://www.exemple.be/',
  scannedAt: '2026-09-27T10:00:00.000Z',
  score: 65,
  palier: 'Une base à consolider',
  synthese: 'Votre site est sur la bonne voie.',
  effortTotal: { minutes: 180, texte: "environ une demi-journée de travail pour l'essentiel" },
  mentions: ["Ce rapport n'est pas un avis juridique."],
  totalProblemes: 7,
  problemes: [],
  pointsAVerifier: 1,
};

const job = (patch: Partial<Job>): Job => ({
  id: 'abc',
  url: 'https://www.exemple.be/',
  status: 'queued',
  steps: [],
  position: 0,
  ...patch,
});

describe('Analyse', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Analyse>;
  let el: HTMLElement;

  /** Answers the pending poll, then lets Angular render. */
  async function repondre(body: Job | object, status = 200) {
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
    fixture = TestBed.createComponent(Analyse);
    fixture.componentRef.setInput('id', 'abc');
    el = fixture.nativeElement;
    await fixture.whenStable();
  });
  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  it('focuses the waiting heading and tells the queue position', async () => {
    await repondre(job({ status: 'queued', position: 2 }));
    const h1 = el.querySelector('h1')!;
    expect(h1.textContent).toContain('Analyse de exemple.be en cours');
    expect(document.activeElement).toBe(h1);
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Vous êtes 2e dans la file');
  });

  it('only appends new steps to the live region (no re-announcement)', async () => {
    await repondre(
      job({ status: 'running', steps: ['Connexion au site…', 'Page chargée (ordinateur).'] }),
    );
    const live = el.querySelector('[aria-live="polite"]')!;
    const premier = live.querySelector('li');
    expect(live.querySelectorAll('li')).toHaveLength(2);

    await repondre(
      job({
        status: 'running',
        steps: [
          'Connexion au site…',
          'Page chargée (ordinateur).',
          '32 points vérifiés (ordinateur).',
        ],
      }),
    );
    expect(live.querySelectorAll('li')).toHaveLength(3);
    expect(live.querySelector('li')).toBe(premier); // same DOM node: not re-rendered, not re-read
  });

  it('shows the report, moves focus to its title and updates the tab title', async () => {
    await repondre(job({ status: 'running', steps: ['Connexion au site…'] }));
    await repondre(job({ status: 'done', steps: ['Connexion au site…'], report: RAPPORT }));

    const h1 = el.querySelector('h1')!;
    expect(h1.textContent).toContain('Résultat pour exemple.be');
    expect(document.activeElement).toBe(h1);
    expect(TestBed.inject(Title).getTitle()).toContain('Résultat : 65/100 – exemple.be');
    expect(el.textContent).toContain('65');
    expect(el.textContent).toContain("n'est pas un avis juridique");
    expect(el.querySelector('.reste')?.textContent).toContain(
      '7 autres problèmes et 1 point à vérifier manuellement',
    );
    // The report also offers the EAA questionnaire and the e-mail form (which loads the consent text).
    expect(el.querySelector('app-questionnaire-eaa h2')?.textContent).toContain(
      "concernée par l'EAA",
    );
    http.expectOne('/api/consentement').flush({ version: 'v', texte: 'Texte' });
    http.expectOne('/api/offre').flush({ libelle: '39 € TVAC', disponible: true });
    await pause();
    http.expectNone(URL_API); // polling stopped
  });

  it('explains a failed scan and offers to run it again', async () => {
    await repondre(
      job({
        status: 'error',
        error: 'Le site a mis trop de temps à répondre (plus de 30 secondes).',
      }),
    );
    const h1 = el.querySelector('h1')!;
    expect(h1.textContent).toContain("L'analyse n'a pas pu aboutir");
    expect(document.activeElement).toBe(h1);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('trop de temps');
    expect(el.querySelector('button')?.textContent).toContain("Relancer l'analyse");
  });

  it('handles an expired analysis without offering a pointless retry', async () => {
    await repondre(
      { error: 'not_found', message: 'Cette analyse est introuvable ou a expiré.' },
      404,
    );
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('introuvable ou a expiré');
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('a')?.textContent).toContain('Analyser une autre adresse');
  });
});
