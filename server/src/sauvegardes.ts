import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const JOURS_SAUVEGARDE = 14;
const DAY = 86_400_000;
const NOM = /^a11y-(\d{4}-\d{2}-\d{2})\.db$/;

/**
 * Daily copy of the database (SQLite online backup: consistent even while the app writes),
 * one file per day, older ones removed. Copy them off the server too: see DEPLOIEMENT.md.
 */
export async function sauvegarderBase(copier: (dest: string) => Promise<unknown>, dossier: string, t: number, jours = JOURS_SAUVEGARDE) {
  await mkdir(dossier, { recursive: true });
  const dest = join(dossier, `a11y-${new Date(t).toISOString().slice(0, 10)}.db`);
  await rm(dest, { force: true }); // second run on the same day: the newer copy wins
  await copier(dest);

  const limite = t - jours * DAY;
  for (const fichier of await readdir(dossier)) {
    const date = fichier.match(NOM)?.[1];
    if (date && Date.parse(`${date}T00:00:00Z`) < limite) await rm(join(dossier, fichier), { force: true });
  }
  return dest;
}
