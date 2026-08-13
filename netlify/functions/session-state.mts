import type { Config } from '@netlify/functions';
import { getCurrentSession } from '../../server/sessionStore';

export default async (_req: Request) => {
  const session = await getCurrentSession();
  if (!session) {
    return new Response(JSON.stringify({ active: false }), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ active: true, session }), { headers: { 'Content-Type': 'application/json' } });
};

export const config: Config = {
  path: '/api/session/state',
};
