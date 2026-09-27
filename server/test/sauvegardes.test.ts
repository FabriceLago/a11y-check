import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../src/db.js';
import { scans } from '../src/schema.js';
import { sauvegarderBase } from '../src/sauvegardes.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'a11y-sauv-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('sauvegarderBase', () => {
  it('writes a complete, readable copy named after the day', async () => {
    const base = openDb(join(dir, 'a11y.db'));
    await base.migrate();
    await base.db.insert(scans).values({ id: 's1', url: 'https://exemple.be/', status: 'done', createdAt: new Date() });

    const dest = await sauvegarderBase(base.sauvegarder, join(dir, 'sauvegardes'), Date.parse('2026-09-27T03:00:00Z'));
    base.close();

    expect(dest.endsWith('a11y-2026-09-27.db')).toBe(true);
    const copie = new DatabaseSync(dest, { readOnly: true });
    expect(copie.prepare('select count(*) as n from scans').get()).toEqual({ n: 1 });
    copie.close();
  });

  it('keeps 14 days and never touches other files', async () => {
    const dossier = join(dir, 'sauvegardes');
    await sauvegarderBase(async (d) => writeFileSync(d, 'x'), dossier, Date.parse('2026-09-01T03:00:00Z'));
    await sauvegarderBase(async (d) => writeFileSync(d, 'x'), dossier, Date.parse('2026-09-20T03:00:00Z'));
    writeFileSync(join(dossier, 'note.txt'), 'à garder');

    await sauvegarderBase(async (d) => writeFileSync(d, 'x'), dossier, Date.parse('2026-09-27T03:00:00Z'));

    expect(readdirSync(dossier).sort()).toEqual(['a11y-2026-09-20.db', 'a11y-2026-09-27.db', 'note.txt']);
    expect(existsSync(join(dossier, 'a11y-2026-09-01.db'))).toBe(false);
  });
});
