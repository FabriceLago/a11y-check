import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { messageErreur, ScanApi } from '../api';
import { ScoreJauge } from '../ui/score-jauge';

/** Light check only: the server does the real (security) validation. */
export function validerUrl(url: string): string | null {
  if (!url) return "Indiquez l'adresse de votre site.";
  if (url.length > 2048 || /\s/.test(url) || !url.includes('.')) {
    return 'Cette adresse ne semble pas valide. Exemple : www.monentreprise.be';
  }
  return null;
}

@Component({
  selector: 'app-accueil',
  imports: [ScoreJauge],
  templateUrl: './accueil.html',
  styleUrl: './accueil.scss',
})
export class Accueil {
  private readonly api = inject(ScanApi);
  private readonly router = inject(Router);
  private readonly champ = viewChild.required<ElementRef<HTMLInputElement>>('champ');

  protected readonly url = signal('');
  protected readonly erreur = signal<string | null>(null);
  protected readonly envoi = signal(false);

  protected saisir(valeur: string) {
    this.url.set(valeur);
    this.erreur.set(null);
  }

  protected envoyer(event: Event) {
    event.preventDefault();
    if (this.envoi()) return;
    const url = this.url().trim();
    const probleme = validerUrl(url);
    if (probleme) return this.echec(probleme);

    this.envoi.set(true);
    this.api.start(url).subscribe({
      next: ({ id }) => this.router.navigate(['/analyse', id]),
      error: (e) => {
        this.envoi.set(false);
        this.echec(messageErreur(e));
      },
    });
  }

  private echec(message: string) {
    this.erreur.set(message);
    this.champ().nativeElement.focus();
  }
}
