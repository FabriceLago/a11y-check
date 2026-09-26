import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import * as schema from './schema.js';

const MIGRATIONS = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Drizzle over Node's built-in SQLite (node:sqlite) through the proxy driver:
 * no native dependency to compile or approve.
 */
export function openDb(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      if (method === 'run') {
        stmt.run(...(params as never[]));
        return { rows: [] };
      }
      stmt.setReturnArrays(true);
      // No row → rows must be undefined (an empty array makes Drizzle map a ghost row).
      if (method === 'get') return { rows: stmt.get(...(params as never[])) as never };
      return { rows: stmt.all(...(params as never[])) as unknown as unknown[][] }; // arrays via setReturnArrays
    },
    { schema },
  );

  return {
    db,
    close: () => sqlite.close(),
    migrate: () =>
      migrate(db, async (queries) => {
        sqlite.exec('BEGIN');
        try {
          for (const q of queries) sqlite.exec(q);
          sqlite.exec('COMMIT');
        } catch (e) {
          sqlite.exec('ROLLBACK');
          throw e;
        }
      }, { migrationsFolder: MIGRATIONS }),
  };
}

export type Db = ReturnType<typeof openDb>['db'];
