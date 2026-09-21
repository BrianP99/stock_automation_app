import type { Config } from '@netlify/functions';
import { getCurrentSession } from '../../server/sessionStore';
import { brokerEnvironment } from '../../server/brokerExecution';

export default async (_req: Request) => {
  const session = await getCurrentSession();
  // Whether a real broker is attached, and which account type, is reported on
  // every poll. The dashboard must never be able to look identical whether a
  // button places a real order or only edits a paper ledger.
  const broker = { connected: brokerEnvironment() !== null, environment: brokerEnvironment() };

  // A blob can exist but be inactive (already exited) — `active` must reflect
  // isActive, not merely whether a record is present.
  if (!session || !session.isActive) {
    return new Response(JSON.stringify({ active: false, broker }), { headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ active: true, session, broker }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config: Config = {
  path: '/api/session/state',
};
