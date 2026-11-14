// A minimal D1Database implementation backed by Node's built-in SQLite
// (node:sqlite). Every test database is a fresh in-memory database built
// from the real files in ./migrations, so the SQL under test is the SQL
// that runs in production. Nothing here touches local or remote D1.

import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");

export interface Row { [key: string]: unknown }

export function createTestD1() {
  const sql = new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    sql.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  const plain = (row: unknown) => (row ? { ...(row as Row) } : null);

  function statement(query: string, args: SQLInputValue[] = []) {
    return {
      bind(...values: unknown[]) {
        return statement(query, values as SQLInputValue[]);
      },
      async run() {
        const result = sql.prepare(query).run(...args);
        return {
          success: true,
          meta: {
            last_row_id: Number(result.lastInsertRowid),
            changes: Number(result.changes)
          }
        };
      },
      async first(column?: string) {
        const row = plain(sql.prepare(query).get(...args));
        if (!row) return null;
        return column ? row[column] : row;
      },
      async all() {
        return {
          success: true,
          results: sql.prepare(query).all(...args).map((r) => plain(r)!)
        };
      }
    };
  }

  const db = { prepare: (query: string) => statement(query) } as unknown as D1Database;

  return {
    db,
    sql,
    get runs(): Map<string, Row> {
      const rows = sql.prepare("SELECT * FROM agent_runs").all() as Row[];
      return new Map(rows.map((r) => [String(r.id), { ...r }]));
    },
    get logs(): Row[] {
      return (sql.prepare("SELECT * FROM activity_logs ORDER BY id").all() as Row[]).map((r) => ({ ...r }));
    },
    get alerts(): Row[] {
      return (sql.prepare("SELECT * FROM security_alerts ORDER BY id").all() as Row[]).map((r) => ({ ...r }));
    }
  };
}
