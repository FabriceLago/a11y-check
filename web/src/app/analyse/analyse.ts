import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { APP_NAME, Job, messageErreur, nomDeSite, POLL_MS, ScanApi } from '../api';
import { CarteProbleme } from '../ui/carte-probleme';
import { OffrePdf } from '../ui/offre-pdf';
import { QuestionnaireEaa } from '../ui/questionnaire-eaa';
import { RapportEmail } from '../ui/rapport-email';
import { ScoreJauge } from '../ui/score-jauge';

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n === 1 ? un : plusieurs}`;
const dateFr = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'long', timeStyle: 'short' });

@Component({
  selector: 'app-analyse',
  imports: [RouterLink, ScoreJauge, CarteProbleme, OffrePdf, QuestionnaireEaa, RapportEmail],
  templateUrl: './analyse.html',
  styleUrl: './analyse.scss',
})
export class Analyse {
  /** From the route (withComponentInputBinding). */
  readonly id = input.required<string>();
  /** ?paiement=annule when the customer comes back from Stripe Checkout without paying. */
  readonly paiement = input<string>();

  private readonly api = inject(ScanApi);
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly pollMs = inject(POLL_MS);
  private readonly titre = viewChild<ElementRef<HTMLElement>>('titre');

  protected readonly job = signal<Job | null>(null);
  protected readonly erreur = signal<string | null>(null);
  protected readonly rapport = computed(() => this.job()?.report ?? null);
  protected readonly etapes = computed(() => this.job()?.steps ?? []);
  protected readonly site = computed(() => {
    const url = this.job()?.url;
    return url ? nomDeSite(url) : 'votre site';
  });
  protected readonly file = computed(() => {
    const job = this.job();
    if (job?.status !== 'queued' || !job.position) return '';
    return job.position === 1
      ? 'Votre analyse va démarrer dans un instant.'
      : `Vous êtes ${job.position}e dans la file d'attente.`;
  });
  /** "…/Wikip%C3%A9dia" → "…/Wikipédia" for display only (the link keeps the real URL). */
  protected readonly urlLisible = computed(() => {
    const url = this.rapport()?.finalUrl ?? '';
    try {
      return decodeURI(url);
    } catch {
      return url;
    }
  });
  protected readonly date = computed(() => {
    const r = this.rapport();
    return r ? dateFr.format(new Date(r.scannedAt)) : '';
  });
  protected readonly reste = computed(() => {
    const r = this.rapport();
    if (!r) return null;
    const autres = r.totalProblemes - r.problemes.length;
    const parties = [
      autres > 0 ? pluriel(autres, 'autre problème', 'autres problèmes') : '',
      r.pointsAVerifier > 0
        ? pluriel(
            r.pointsAVerifier,
            'point à vérifier manuellement',
            'points à vérifier manuellement',
          )
        : '',
    ].filter(Boolean);
    return parties.length
      ? `Notre analyse a aussi relevé ${parties.join(' et ')}. Ils seront détaillés dans le rapport complet.`
      : null;
  });

  private timer: ReturnType<typeof setTimeout> | undefined;
  private requete: Subscription | undefined;

  constructor() {
    // The component is reused when only :id changes (e.g. "Relancer"): restart cleanly.
    effect(() => {
      const id = this.id();
      untracked(() => this.demarrer(id));
    });

    // Each state (attente / rapport / erreur) has its own h1: move focus to it when it appears.
    afterRenderEffect(() => this.titre()?.nativeElement.focus());

    effect(() => {
      const r = this.rapport();
      const site = this.site();
      this.title.setTitle(
        this.erreur()
          ? `Erreur d'analyse – ${APP_NAME}`
          : r
            ? `Résultat : ${r.score}/100 – ${site} – ${APP_NAME}`
            : `Analyse en cours – ${site} – ${APP_NAME}`,
      );
    });

    inject(DestroyRef).onDestroy(() => this.arreter());
  }

  protected relancer() {
    const url = this.job()?.url;
    if (!url) return;
    this.api.start(url).subscribe({
      next: ({ id }) => this.router.navigate(['/analyse', id]),
      error: (e) => this.erreur.set(messageErreur(e)),
    });
  }

  private demarrer(id: string) {
    this.arreter();
    this.job.set(null);
    this.erreur.set(null);
    this.interroger(id);
  }

  private interroger(id: string) {
    this.requete = this.api.get(id).subscribe({
      next: (job) => {
        this.job.set(job);
        if (job.status === 'error')
          this.erreur.set(job.error ?? "L'analyse a échoué. Réessayez plus tard.");
        else if (job.status !== 'done')
          this.timer = setTimeout(() => this.interroger(id), this.pollMs);
      },
      error: (e) => this.erreur.set(messageErreur(e)),
    });
  }

  private arreter() {
    clearTimeout(this.timer);
    this.requete?.unsubscribe();
  }
}
