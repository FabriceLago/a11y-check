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
import { HttpErrorResponse } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { APP_NAME, Commande as CommandeApi, messageErreur, POLL_MS, ScanApi } from '../api';

/** ~2 minutes of polling before telling the customer the confirmation is late (webhooks can lag). */
export const ATTENTE_MAX = 60;

type Etat = 'confirmation' | 'retard' | 'analyse' | 'pret' | 'echec' | 'erreur';

@Component({
  selector: 'app-commande',
  imports: [RouterLink],
  templateUrl: './commande.html',
  styles: `
    .page { padding-top: var(--space-6); }
    p { max-width: var(--measure); }
    progress { display: block; width: 100%; max-width: 30rem; height: 1rem; margin: var(--space-2) 0 var(--space-4); accent-color: var(--c-accent); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-4); }
    .echec { padding: var(--space-3) var(--space-4); border-left: 4px solid var(--c-critique); background: var(--c-critique-bg); }
  `,
})
export class Commande {
  readonly session = input.required<string>();

  private readonly api = inject(ScanApi);
  private readonly title = inject(Title);
  private readonly pollMs = inject(POLL_MS);
  private readonly titre = viewChild<ElementRef<HTMLElement>>('titre');

  protected readonly commande = signal<CommandeApi | null>(null);
  protected readonly essais = signal(0);
  protected readonly erreur = signal<string | null>(null);

  protected readonly etat = computed<Etat>(() => {
    if (this.erreur()) return 'erreur';
    const c = this.commande();
    if (!c) return this.essais() >= ATTENTE_MAX ? 'retard' : 'confirmation';
    if (c.statut === 'ready') return 'pret';
    if (c.statut === 'failed' || c.statut === 'refunded') return 'echec';
    return 'analyse';
  });
  protected readonly progression = computed(() => this.commande()?.progression ?? null);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private requete: Subscription | undefined;

  constructor() {
    effect(() => {
      const session = this.session();
      untracked(() => this.interroger(session));
    });
    // One h1 per state: focus follows the state (retard/confirmation share the same heading element).
    afterRenderEffect(() => this.titre()?.nativeElement.focus());
    effect(() => {
      const etat = this.etat();
      const libelles: Record<Etat, string> = {
        confirmation: 'Confirmation du paiement',
        retard: 'Confirmation du paiement',
        analyse: 'Rapport en préparation',
        pret: 'Votre rapport est prêt',
        echec: 'Rapport non réalisé',
        erreur: 'Commande introuvable',
      };
      this.title.setTitle(`${libelles[etat]} – ${APP_NAME}`);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.requete?.unsubscribe();
    });
  }

  private interroger(session: string) {
    this.requete = this.api.commande(session).subscribe({
      next: (c) => {
        this.commande.set(c);
        if (c.statut === 'paid' || c.statut === 'processing') this.timer = setTimeout(() => this.interroger(session), this.pollMs);
      },
      error: (e) => {
        // 404 "pending": the Stripe webhook has not arrived yet. Keep waiting, it is not the customer's problem.
        if (e instanceof HttpErrorResponse && e.status === 404) {
          this.essais.update((n) => n + 1);
          this.timer = setTimeout(() => this.interroger(session), this.pollMs);
        } else {
          this.erreur.set(messageErreur(e));
        }
      },
    });
  }
}
