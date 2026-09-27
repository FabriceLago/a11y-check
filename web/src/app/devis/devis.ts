import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { messageErreur, nomDeSite, Rapport, ScanApi } from '../api';

// Same values and labels as server/src/devis.ts.
export const OUTILS = [
  ['inconnu', 'Je ne sais pas'],
  ['wordpress', 'WordPress'],
  ['wix', 'Wix'],
  ['shopify', 'Shopify'],
  ['autre', 'Autre outil'],
] as const;
export const BESOINS = [
  ['critiques', 'Corriger les problèmes critiques'],
  ['tout', 'Corriger tous les problèmes du rapport'],
  ['audit', 'Un audit manuel complet (clavier, lecteur d’écran…)'],
  ['accompagnement', 'Un accompagnement dans la durée'],
] as const;
export const DELAIS = [
  ['flexible', 'Pas de délai particulier'],
  ['urgent', 'Le plus vite possible'],
  ['3-mois', 'Dans les 3 mois'],
  ['6-mois', 'Dans les 6 mois'],
] as const;
export const BUDGETS = [
  ['inconnu', 'Je ne sais pas encore'],
  ['moins-500', 'Moins de 500 €'],
  ['500-1500', 'De 500 à 1 500 €'],
  ['1500-5000', 'De 1 500 à 5 000 €'],
  ['plus-5000', 'Plus de 5 000 €'],
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Formulaire = { nom: string; email: string; site: string; besoins: string[] };

/** Field id → message, in form order (the error summary follows it). */
export function validerDevis(f: Formulaire): Record<string, string> {
  const erreurs: Record<string, string> = {};
  if (!f.nom.trim()) erreurs['devis-nom'] = 'Indiquez votre nom.';
  if (!f.email.trim()) erreurs['devis-email'] = 'Indiquez votre adresse e-mail.';
  else if (!EMAIL_RE.test(f.email.trim()))
    erreurs['devis-email'] =
      'Cette adresse e-mail ne semble pas valide. Exemple : prenom@entreprise.be';
  if (!f.site.trim()) erreurs['devis-site'] = "Indiquez l'adresse de votre site.";
  if (!f.besoins.length)
    erreurs['devis-besoins'] = 'Choisissez au moins une option dans « Ce que vous souhaitez ».';
  return erreurs;
}

/** Server field names → form field ids. */
const CHAMPS_SERVEUR: Record<string, string> = {
  nom: 'devis-nom',
  email: 'devis-email',
  site: 'devis-site',
  besoins: 'devis-besoins',
};

@Component({
  selector: 'app-devis',
  imports: [RouterLink],
  templateUrl: './devis.html',
  styles: `
    .page {
      padding-top: var(--space-6);
    }
    .chapeau {
      max-width: var(--measure);
      font-size: var(--fs-1);
      color: var(--c-text-muted);
    }
    .lie {
      max-width: var(--measure);
      padding: var(--space-3) var(--space-4);
      border-left: 4px solid var(--c-accent);
      background: var(--c-surface);
    }
    form {
      margin-top: var(--space-5);
    }
    .champs {
      display: grid;
      gap: 0 var(--space-5);
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      max-width: 44rem;
    }
    .champs > div {
      margin-bottom: var(--space-3);
    }
    .groupe > .groupe-titre {
      font-size: var(--fs-1);
    }
    .facultatif {
      font-weight: 400;
      color: var(--c-text-muted);
    }
    /* Honeypot: off-screen, not display:none (bots skip hidden fields). */
    .piege {
      position: absolute;
      left: -10000px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
    .merci {
      margin-top: var(--space-5);
    }
  `,
})
export class Devis {
  /** ?scan=<id> when coming from a report. */
  readonly scan = input<string>();

  private readonly api = inject(ScanApi);
  private readonly injector = inject(Injector);
  private readonly recap = viewChild<ElementRef<HTMLElement>>('recap');
  private readonly merci = viewChild<ElementRef<HTMLElement>>('merci');

  protected readonly outils = OUTILS;
  protected readonly besoinsOptions = BESOINS;
  protected readonly delais = DELAIS;
  protected readonly budgets = BUDGETS;

  protected readonly nom = signal('');
  protected readonly entreprise = signal('');
  protected readonly email = signal('');
  protected readonly telephone = signal('');
  protected readonly site = signal('');
  protected readonly outil = signal('inconnu');
  protected readonly besoins = signal<string[]>([]);
  protected readonly delai = signal('flexible');
  protected readonly budget = signal('inconnu');
  protected readonly message = signal('');
  protected readonly siteWeb = signal(''); // honeypot

  protected readonly rapport = signal<Rapport | null>(null);
  protected readonly erreurs = signal<Record<string, string>>({});
  protected readonly listeErreurs = computed(() =>
    Object.entries(this.erreurs()).map(([id, message]) => ({ id, message })),
  );
  protected readonly erreurGenerale = signal<string | null>(null);
  protected readonly envoi = signal(false);
  protected readonly envoye = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.scan();
      if (!id) return;
      untracked(() =>
        this.api.get(id).subscribe({
          next: (job) => {
            if (!job.report) return;
            this.rapport.set(job.report);
            if (!this.site()) this.site.set(job.report.finalUrl);
          },
          error: () => {}, // expired report: the form works without it
        }),
      );
    });
  }

  protected nomDuSite(url: string) {
    return nomDeSite(url);
  }

  protected erreur(id: string) {
    return this.erreurs()[id] ?? null;
  }

  protected basculer(valeur: string, coche: boolean) {
    this.besoins.update((b) => (coche ? [...b, valeur] : b.filter((x) => x !== valeur)));
  }

  /** Error summary links: move focus to the field (href alone would reload because of <base href>). */
  protected allerA(event: Event, id: string) {
    event.preventDefault();
    const cible = document.getElementById(id);
    (cible?.matches('fieldset') ? cible.querySelector<HTMLElement>('input') : cible)?.focus();
  }

  protected envoyer(event: Event) {
    event.preventDefault();
    if (this.envoi()) return;
    this.erreurGenerale.set(null);
    const erreurs = validerDevis({
      nom: this.nom(),
      email: this.email(),
      site: this.site(),
      besoins: this.besoins(),
    });
    if (Object.keys(erreurs).length) return this.afficherErreurs(erreurs);

    this.envoi.set(true);
    this.api
      .demanderDevis({
        nom: this.nom(),
        entreprise: this.entreprise() || undefined,
        email: this.email(),
        telephone: this.telephone() || undefined,
        site: this.site(),
        outil: this.outil(),
        besoins: this.besoins(),
        delai: this.delai(),
        budget: this.budget(),
        message: this.message() || undefined,
        scanId: this.rapport() ? this.scan() : undefined,
        siteWeb: this.siteWeb() || undefined,
      })
      .subscribe({
        next: ({ message }) => {
          this.envoi.set(false);
          this.envoye.set(message);
          afterNextRender(() => this.merci()?.nativeElement.focus(), { injector: this.injector });
        },
        error: (e) => {
          this.envoi.set(false);
          const champs =
            e instanceof HttpErrorResponse
              ? (e.error?.champs as Record<string, string> | undefined)
              : undefined;
          if (champs) {
            this.afficherErreurs(
              Object.fromEntries(
                Object.entries(champs).map(([k, v]) => [CHAMPS_SERVEUR[k] ?? k, v]),
              ),
            );
          } else {
            this.erreurGenerale.set(messageErreur(e));
            this.afficherErreurs({});
          }
        },
      });
  }

  private afficherErreurs(erreurs: Record<string, string>) {
    this.erreurs.set(erreurs);
    afterNextRender(() => this.recap()?.nativeElement.focus(), { injector: this.injector });
  }
}
