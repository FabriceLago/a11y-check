import { Routes } from '@angular/router';
import { Accueil } from './accueil/accueil';
import { Analyse } from './analyse/analyse';
import { APP_NAME } from './api';
import { Commande } from './commande/commande';
import { Conditions } from './conditions/conditions';
import { Confidentialite } from './confidentialite/confidentialite';
import { DesignSystem } from './design-system/design-system';
import { Devis } from './devis/devis';

export const routes: Routes = [
  { path: '', component: Accueil, title: `Vérifiez l'accessibilité de votre site – ${APP_NAME}` },
  { path: 'analyse/:id', component: Analyse, title: `Analyse en cours – ${APP_NAME}` },
  { path: 'confidentialite', component: Confidentialite, title: `Politique de confidentialité – ${APP_NAME}` },
  { path: 'conditions', component: Conditions, title: `Conditions générales de vente – ${APP_NAME}` },
  { path: 'commande/:session', component: Commande, title: `Votre commande – ${APP_NAME}` },
  { path: 'faire-corriger', component: Devis, title: `Faire corriger mon site – ${APP_NAME}` },
  { path: 'design-system', component: DesignSystem, title: `Design system – ${APP_NAME}` },
  { path: '**', redirectTo: '' },
];
