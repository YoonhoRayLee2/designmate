import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

// Reads cookies + DB → must run per-request, never statically collected at build.
export const dynamic = 'force-dynamic';

// Returns { user } or { user: null } — always 200 so the client can branch simply.
export async function GET() {
  return NextResponse.json({ user: getSessionUser() });
}
