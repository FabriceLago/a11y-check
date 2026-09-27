import {
  afterRenderEffect,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Consentement, messageErreur, ScanApi } from '../api';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

@Component({
  selector: 'app-rapport-email',
  imports: [RouterLink],
  templateUrl: './rapport-email.html',
  styles: `
    :host {
      display: block;
    }
    .intro,
    .petit {
      max-width: var(--measure);
    }
    .choix {
      margin: var(--space-3) 0;
    }
  `,
})
export class RapportEmail {
  readonly scanId = input.required<string>();

  private readonly api = inject(ScanApi);
  private readonly champ = viewChild<ElementRef<HTMLInputElement>>('champ');
  private readonly confirmationEl = viewChild<ElementRef<HTMLElement>>('confirmationEl');

  /** If the wording cannot be loaded, the checkbox is simply not offered (no consent without its text). */
  protected readonly consentement = signal<Consentement | null>(null);
  protected readonly email = signal('');
  protected readonly conseils = signal(false); // unticked by default (GDPR)
  protected readonly erreur = signal<string | null>(null);
  protected readonly envoi = signal(false);
  protected readonly confirmation = signal<string | null>(null);

  constructor() {
    this.api.consentement().subscribe({ next: (c) => this.consentement.set(c), error: () => {} });
    afterRenderEffect(() => this.confirmationEl()?.nativeElement.focus());
  }

  protected saisir(valeur: string) {
    this.email.set(valeur);
    this.erreur.set(null);
  }

  protected envoyer(event: Event) {
    event.preventDefault();
    if (this.envoi()) return;
    const email = this.email().trim();
    if (!email) return this.echec('Indiquez votre adresse e-mail.');
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return this.echec(
        'Cette adresse e-mail ne semble pas valide. Exemple : prenom@entreprise.be',
      );
    }
    this.envoi.set(true);
    this.api
      .envoyerRapport(this.scanId(), email, this.conseils() ? this.consentement() : null)
      .subscribe({
        next: ({ message }) => {
          this.envoi.set(false);
          this.confirmation.set(message);
        },
        error: (e) => {
          this.envoi.set(false);
          this.echec(
            messageErreur(
              e,
              'Cette adresse e-mail ne semble pas valide. Exemple : prenom@entreprise.be',
            ),
          );
        },
      });
  }

  private echec(message: string) {
    this.erreur.set(message);
    this.champ()?.nativeElement.focus();
  }
}
