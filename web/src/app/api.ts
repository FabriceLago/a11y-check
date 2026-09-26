import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';

/** Provisional product name, used in page titles. */
export const APP_NAME = "Vérificateur d'accessibilité";

/** Poll interval while a scan runs; tests shorten it. */
export const POLL_MS = new InjectionToken<number>('POLL_MS', { factory: () => 2000 });

// Mirrors server/src/report.ts freeView().
export type Priorite = 'Critique' | 'Importante' | 'À améliorer';

export interface Probleme {
  id: string;
  titre: string;
  pourquoi: string;
  touche: { id: string; label: string }[];
  priorite: Priorite;
  effort: string;
  quiCorrige: string;
  etapes: string[];
  cms?: Partial<Record<'wordpress' | 'wix' | 'shopify', string>>;
  wcag: string[];
  occurrences: number;
  seulement?: 'ordinateur' | 'mobile';
}

export interface Rapport {
  url: string;
  finalUrl: string;
  scannedAt: string;
  score: number;
  palier: string;
  synthese: string;
  effortTotal: { minutes: number; texte: string } | null;
  mentions: string[];
  totalProblemes: number;
  problemes: Probleme[];
  pointsAVerifier: number;
}

export interface Job {
  id: string;
  url: string;
  status: 'queued' | 'running' | 'done' | 'error';
  steps: string[];
  position: number;
  report?: Rapport;
  error?: string;
}

const INDISPONIBLE = 'Le service est momentanément indisponible. Réessayez dans quelques instants.';

/** The API already answers in French; framework errors (English) never reach the user. */
export function messageErreur(
  e: unknown,
  invalide = "Cette adresse n'est pas valide. Exemple : www.monentreprise.be",
): string {
  if (!(e instanceof HttpErrorResponse)) return INDISPONIBLE;
  if (e.error?.code === 'FST_ERR_VALIDATION') return invalide;
  return typeof e.error?.message === 'string' ? e.error.message : INDISPONIBLE;
}

export const nomDeSite = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

@Injectable({ providedIn: 'root' })
export class ScanApi {
  private readonly http = inject(HttpClient);

  start(url: string) {
    return this.http.post<{ id: string }>('/api/scan', { url });
  }

  get(id: string) {
    return this.http.get<Job>(`/api/scan/${encodeURIComponent(id)}`);
  }

  offre() {
    return this.http.get<Offre>('/api/offre');
  }

  commander(scanId: string) {
    return this.http.post<{ url: string }>(`/api/scan/${encodeURIComponent(scanId)}/commande`, {});
  }

  commande(session: string) {
    return this.http.get<Commande>(`/api/commandes/${encodeURIComponent(session)}`);
  }

  demanderDevis(demande: DemandeDevis) {
    return this.http.post<{ message: string }>('/api/devis', demande);
  }

  consentement() {
    return this.http.get<Consentement>('/api/consentement');
  }

  envoyerRapport(id: string, email: string, conseils: Consentement | null) {
    return this.http.post<{ message: string }>(`/api/scan/${encodeURIComponent(id)}/email`, {
      email,
      conseils: !!conseils,
      ...(conseils ? { consentVersion: conseils.version } : {}),
    });
  }
}

export interface Offre {
  libelle: string;
  disponible: boolean;
}

export interface Commande {
  statut: 'paid' | 'processing' | 'ready' | 'failed' | 'refunded';
  site: string;
  email: string;
  progression: { fait: number; total: number } | null;
  telechargement: string | null;
}

/** Leaving the app for Stripe Checkout; replaced in tests. */
export const REDIRECTION = new InjectionToken<(url: string) => void>('REDIRECTION', {
  factory: () => (url) => window.location.assign(url),
});

export interface DemandeDevis {
  nom: string;
  entreprise?: string;
  email: string;
  telephone?: string;
  site: string;
  outil: string;
  besoins: string[];
  delai: string;
  budget: string;
  message?: string;
  scanId?: string;
  siteWeb?: string;
}

export interface Consentement {
  version: string;
  texte: string;
}
