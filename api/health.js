import { cors, json } from '../lib/market-shared.js';

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { status: 'error', message: 'GET only' });
  return json(res, 200, {
    status: 'ok',
    service: 'BursaQuant market-data gateway',
    providers: {
      us: Boolean(process.env.TWELVE_DATA_API_KEY),
      bursa: Boolean(process.env.ISAHAM_API_TOKEN)
    },
    note: 'Provider credentials are server-side environment variables and are never returned.'
  });
};
