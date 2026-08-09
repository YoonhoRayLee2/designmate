import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Lightweight health check for uptime monitoring / Render. No auth.
// Runs a trivial query to confirm the DB connection is alive.
export const dynamic = 'force-dynamic';

export async function GET() {
  let dbOk = false;
  try {
    db.prepare('SELECT 1').get();
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json(
    { ok: dbOk, db: dbOk ? 'up' : 'down', uptime: Math.round(process.uptime()) },
    { status: dbOk ? 200 : 503 },
  );
}
