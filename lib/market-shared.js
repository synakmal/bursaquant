import {timingSafeEqual} from 'node:crypto';

function allowedOrigin(req) {
  const origin = req.headers?.origin || '';
  const configured = process.env.BQ_ALLOWED_ORIGIN || '';
  if (!origin) return '';
  if (configured && origin === configured) return origin;
  if (!configured && /^https:\/\/[a-z0-9-]+\.github\.io$/i.test(origin)) return origin;
  if (!configured && /^http:\/\/localhost(?::\d+)?$/i.test(origin)) return origin;
  if (!configured && /^https:\/\/[^.]+\.vercel\.app$/i.test(origin)) return origin;
  return '';
}

function cors(req, res) {
  const origin = allowedOrigin(req);
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, X-BQ-Access-Token');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function fail(res, status, code, message, extra = {}) {
  return json(res, status, { status: 'error', error: { code, message, ...extra } });
}

function authorize(req,res,{requirePrivate=false}={}) {
  const secret=process.env.BQ_ACCESS_TOKEN||'';
  const local=req.bqLocal===true&&process.env.VERCEL!=='1';
  if(!secret&&requirePrivate&&!local){fail(res,503,'ACCESS_CODE_NOT_CONFIGURED','Set BQ_ACCESS_TOKEN on this personal gateway before enabling Yahoo.');return false;}
  if(!secret)return true;
  const provided=req.headers?.['x-bq-access-token'];
  const a=Buffer.from(typeof provided==='string'?provided:''),b=Buffer.from(secret);
  if(a.length!==b.length||!timingSafeEqual(a,b)){fail(res,403,'ACCESS_DENIED','Enter your personal gateway access code in Risk & Data Settings.');return false;}
  return true;
}

function parseExchangeLocalToEpoch(value, timeZone) {
  const raw = String(value || '').trim();
  if (!raw) return NaN;
  if (/^\d{10,13}$/.test(raw)) return Math.floor(Number(raw) / (raw.length === 13 ? 1000 : 1));
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Math.floor(Date.parse(raw + 'T00:00:00Z') / 1000);
  const normalized = raw.replace(' ', 'T');
  if (/(?:Z|[+-]\d\d:?\d\d)$/i.test(normalized)) return Math.floor(Date.parse(normalized) / 1000);
  const wanted = Date.parse(normalized + 'Z');
  if (!Number.isFinite(wanted)) return NaN;
  let utc = wanted;
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    for (let i = 0; i < 4; i += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(utc))
        .filter(x => x.type !== 'literal')
        .map(x => [x.type, Number(x.value)]));
      const observed = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
      const correction = wanted - observed;
      if (correction === 0) break;
      utc += correction;
    }
  } catch {
    return Math.floor(wanted / 1000);
  }
  return Math.floor(utc / 1000);
}

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.^:-]/g, '').slice(0, 32);
}

function positiveInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
}

export { cors, json, fail, authorize, parseExchangeLocalToEpoch, cleanSymbol, positiveInt };
