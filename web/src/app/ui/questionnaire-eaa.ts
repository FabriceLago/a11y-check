import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';

export type Secteur = 'commerce' | 'finance' | 'transport' | 'ebook' | 'telecom' | 'autre';
export type Clients = 'particuliers' | 'pros' | 'deux';
export type Taille = 'micro' | 'plus' | 'inconnu';
export type Reponses = { secteur?: Secteur; clients?: Clients; taille?: Taille };
export type Verdict =
  'concerne' | 'concerne-sauf-micro' | 'exemption-possible' | 'moins-concerne' | 'indetermine';

/** Deliberately simplified reading of the EAA. Never a legal conclusion: see AVERTISSEMENT. */
export function evaluerEaa({ secteur, clients, taille }: Required<Reponses>): Verdict {
  if (clients === 'pros') return 'moins-concerne';
  if (secteur === 'autre') return 'indetermine';
  if (taille === 'micro') return 'exemption-possible';
  return taille === 'inconnu' ? 'concerne-sauf-micro' : 'concerne';
}

export const AVERTISSEMENT =
  "Ceci n'est pas un avis juridique. Pour une réponse certaine, consultez votre comptable, un juriste ou le SPF Économie.";

export const VERDICTS: Record<Verdict, { titre: string; texte: string }> = {
  concerne: {
    titre: "Votre activité semble entrer dans le champ de l'EAA",
    texte:
      "Vous proposez à des particuliers un service visé par l'European Accessibility Act, et votre entreprise dépasse la taille d'une microentreprise. Vos services numériques (site, boutique en ligne, application) devraient donc être accessibles depuis le 28 juin 2025. Les points de ce rapport sont un bon point de départ.",
  },
  'concerne-sauf-micro': {
    titre: "Votre activité semble entrer dans le champ de l'EAA",
    texte:
      "Vous proposez à des particuliers un service visé par l'European Accessibility Act. Vous seriez exempté si votre entreprise est une microentreprise : moins de 10 personnes et un chiffre d'affaires ou un bilan annuel de 2 millions d'euros maximum. Votre comptable peut vous le confirmer rapidement.",
  },
  'exemption-possible': {
    titre: 'Vous pourriez être exempté',
    texte:
      "Les microentreprises qui fournissent des services peuvent être exemptées des obligations de l'EAA. Vérifiez vos chiffres exacts (effectif, chiffre d'affaires, bilan). Si vous vendez aussi certains produits couverts (liseuses, terminaux de paiement…), d'autres règles peuvent s'appliquer. Rendre votre site accessible reste utile : ce sont autant de clients qui peuvent acheter chez vous.",
  },
  'moins-concerne': {
    titre: 'Votre situation semble moins directement concernée',
    texte:
      "L'EAA vise surtout les produits et services proposés aux consommateurs. Si vous travaillez uniquement avec des professionnels, votre site est probablement moins directement concerné. D'autres obligations peuvent toutefois exister, par exemple si vous répondez à des marchés publics.",
  },
  indetermine: {
    titre: 'Nous ne pouvons pas nous prononcer',
    texte:
      "Votre secteur ne fait pas partie des services principalement visés par l'EAA, ou votre situation demande un examen plus précis. Le SPF Économie publie des informations sur l'EAA, et votre fédération professionnelle peut vous orienter.",
  },
};

type Question = {
  id: keyof Reponses;
  legende: string;
  options: { valeur: string; libelle: string }[];
};

export const QUESTIONS: Question[] = [
  {
    id: 'secteur',
    legende: 'Quelle est votre activité principale en ligne ?',
    options: [
      {
        valeur: 'commerce',
        libelle: 'Commerce en ligne : vente, réservation ou prise de rendez-vous',
      },
      { valeur: 'finance', libelle: 'Banque, assurance ou services financiers' },
      { valeur: 'transport', libelle: 'Transport de personnes (bus, train, avion, bateau)' },
      { valeur: 'ebook', libelle: 'Livres numériques' },
      { valeur: 'telecom', libelle: 'Télécommunications ou médias audiovisuels' },
      { valeur: 'autre', libelle: 'Autre activité (site vitrine, association…)' },
    ],
  },
  {
    id: 'clients',
    legende: 'À qui vendez-vous ?',
    options: [
      { valeur: 'particuliers', libelle: 'À des particuliers' },
      { valeur: 'deux', libelle: 'À des particuliers et à des professionnels' },
      { valeur: 'pros', libelle: 'Uniquement à des professionnels' },
    ],
  },
  {
    id: 'taille',
    legende:
      "Votre entreprise compte-t-elle moins de 10 personnes, avec un chiffre d'affaires ou un bilan annuel de 2 millions d'euros maximum ?",
    options: [
      { valeur: 'micro', libelle: 'Oui, les deux conditions sont remplies' },
      { valeur: 'plus', libelle: 'Non' },
      { valeur: 'inconnu', libelle: 'Je ne sais pas' },
    ],
  },
];

@Component({
  selector: 'app-questionnaire-eaa',
  templateUrl: './questionnaire-eaa.html',
  styleUrl: './questionnaire-eaa.scss',
})
export class QuestionnaireEaa {
  private readonly injector = inject(Injector);
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly titreVerdict = viewChild<ElementRef<HTMLElement>>('titreVerdict');

  protected readonly questions = QUESTIONS;
  protected readonly avertissement = AVERTISSEMENT;
  protected readonly reponses = signal<Reponses>({});
  protected readonly manquantes = signal<string[]>([]);
  protected readonly verdict = signal<((typeof VERDICTS)[Verdict] & { cle: Verdict }) | null>(null);

  protected choisir(id: keyof Reponses, valeur: string) {
    this.reponses.update((r) => ({ ...r, [id]: valeur }));
    this.manquantes.update((m) => m.filter((q) => q !== id));
    this.verdict.set(null); // never leave an answer that no longer matches the choices
  }

  protected evaluer(event: Event) {
    event.preventDefault();
    const r = this.reponses();
    const manquantes = QUESTIONS.filter((q) => !r[q.id]).map((q) => q.id);
    this.manquantes.set(manquantes);
    if (manquantes.length) {
      this.hote.nativeElement
        .querySelector<HTMLInputElement>(`input[name="eaa-${manquantes[0]}"]`)
        ?.focus();
      return;
    }
    const cle = evaluerEaa(r as Required<Reponses>);
    this.verdict.set({ cle, ...VERDICTS[cle] });
    afterNextRender(() => this.titreVerdict()?.nativeElement.focus(), { injector: this.injector });
  }
}
