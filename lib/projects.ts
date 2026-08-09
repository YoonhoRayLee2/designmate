import { db } from './db';

// Server-side project persistence, scoped to a user. `turns` is stored as a JSON
// blob (turns_json) — the server never interprets its shape, matching the
// client's Turn union. Ownership is always enforced with WHERE user_id = ?.

const MAX_TURNS = 40; // mirror the old client-side cap (persistStore)
const MAX_TURNS_JSON = 1_500_000; // ~1.5MB safety cap per project

export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface ProjectDetail extends ProjectSummary {
  turns: unknown[];
}

export function listProjects(userId: string): ProjectSummary[] {
  const rows = db
    .prepare('SELECT id, title, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as { id: string; title: string; updated_at: number }[];
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

export function getProject(userId: string, projectId: string): ProjectDetail | null {
  const row = db
    .prepare('SELECT id, title, turns_json, updated_at FROM projects WHERE id = ? AND user_id = ?')
    .get(projectId, userId) as { id: string; title: string; turns_json: string; updated_at: number } | undefined;
  if (!row) return null;
  let turns: unknown[] = [];
  try {
    const parsed = JSON.parse(row.turns_json);
    if (Array.isArray(parsed)) turns = parsed;
  } catch {
    /* corrupt row → empty turns */
  }
  return { id: row.id, title: row.title, updatedAt: row.updated_at, turns };
}

/** Upsert a project for this user. Trims turns defensively (server-side guard). */
export function saveProject(
  userId: string,
  projectId: string,
  title: string,
  turns: unknown[],
  updatedAt: number,
): void {
  let trimmed = Array.isArray(turns) ? turns.slice(-MAX_TURNS) : [];
  let json = JSON.stringify(trimmed);
  // If still too large, halve until under the cap (keeps most recent turns).
  while (json.length > MAX_TURNS_JSON && trimmed.length > 1) {
    trimmed = trimmed.slice(Math.ceil(trimmed.length / 2));
    json = JSON.stringify(trimmed);
  }
  db.prepare(
    `INSERT INTO projects (id, user_id, title, turns_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       turns_json = excluded.turns_json,
       updated_at = excluded.updated_at
     WHERE projects.user_id = excluded.user_id`,
  ).run(projectId, userId, title.slice(0, 200) || '새 프로젝트', json, updatedAt || Date.now());
}

/** Delete a project owned by this user. Returns true if a row was removed. */
export function deleteProject(userId: string, projectId: string): boolean {
  const res = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(projectId, userId);
  return res.changes > 0;
}
