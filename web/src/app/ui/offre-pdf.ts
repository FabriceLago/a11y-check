import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { messageErreur, Offre, REDIRECTION, ScanApi } from '../api';

/** Paid report call to action. Hidden entirely while online payment is not configured. */
@Component({
  selector: 'app-offre-pdf',
  imports: [RouterLink],
  template: `
    @if (offre(); as o) {
      @if (o.disponible) {
        <section class="offre" aria-labelledby="titre-offre">
          <h2 id="titre-offre">Recevoir le rapport complet</h2>
          <ul>
            <li>Jusqu'à 10 pages de votre site analysées</li>
            <li>
              Un plan d'action trié par priorité, avec le temps nécessaire et qui peut corriger
            </li>
            <li>Des captures d'écran des éléments à corriger</li>
            <li>Une annexe technique pour votre webdesigner ou votre développeur</li>
            <li>La liste des vérifications à faire vous-même</li>
          </ul>
          <p class="prix">
            <strong>{{ o.libelle }}</strong
            >, rapport PDF envoyé par e-mail en quelques minutes.
          </p>
          @if (erreur(); as message) {
            <p class="message-erreur" role="alert">{{ message }}</p>
          }
          <button
            type="button"
            class="button"
            (click)="commander()"
            [attr.aria-disabled]="envoi() ? 'true' : null"
          >
            {{ envoi() ? 'Redirection vers le paiement…' : 'Recevoir le rapport complet (PDF)' }}
          </button>
          <p class="petit">
            Vous allez être redirigé vers la page de paiement sécurisée de notre prestataire Stripe.
            <a routerLink="/conditions">Conditions générales de vente</a>
          </p>
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .offre {
      height: 100%;
      padding: var(--space-5);
      border: 2px solid var(--c-accent);
      border-radius: var(--radius);
      background: var(--c-bg);
    }
    ul {
      padding-left: 1.2em;
      max-width: var(--measure);
    }
    li + li {
      margin-top: var(--space-1);
    }
    .prix {
      font-size: var(--fs-1);
    }
    .petit {
      margin: var(--space-3) 0 0;
      max-width: var(--measure);
    }
  `,
})
export class OffrePdf {
  readonly scanId = input.required<string>();

  private readonly api = inject(ScanApi);
  private readonly rediriger = inject(REDIRECTION);

  protected readonly offre = signal<Offre | null>(null);
  protected readonly erreur = signal<string | null>(null);
  protected readonly envoi = signal(false);

  constructor() {
    this.api.offre().subscribe({ next: (o) => this.offre.set(o), error: () => {} });
  }

  protected commander() {
    if (this.envoi()) return;
    this.envoi.set(true);
    this.erreur.set(null);
    this.api.commander(this.scanId()).subscribe({
      next: ({ url }) => this.rediriger(url), // stays "busy": the page is being left
      error: (e) => {
        this.envoi.set(false);
        this.erreur.set(messageErreur(e));
      },
    });
  }
}
