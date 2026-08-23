import type { Config } from '@netlify/functions';
import { getCurrentSession } from '../../server/sessionStore';

export default async (_req: Request) => {
  const session = await getCurrentSession();
  // A blob can exist but be inactive (already exited) — `active` must reflect
  // isActive, not merely whether a record is present.
  if (!session || !session.isActive) {
    return new Response(JSON.stringify({ active: false }), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ active: true, session }), { headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  path: '/api/session/state',
};
