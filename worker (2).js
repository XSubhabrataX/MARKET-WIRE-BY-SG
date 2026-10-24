/*
  Market Wire relay for Cloudflare Workers (free plan is enough).

  What it does: fetches a news feed for the app and adds the header browsers need.
  Use it as:  https://YOUR-NAME.workers.dev/?url=<feed link>

  Version 2: sends a normal browser identity (many sites refuse unknown bots),
  retries once when a site answers "busy", and remembers each feed for 10 minutes
  so it can serve the last good copy when a site fails.

  Only the hosts listed below are allowed, so nobody can use your relay for other sites.
  When you add a custom source in the app, add its host name here too.
*/
const ALLOWED = [
  'news.google.com',
  'www.fxstreet.com',
  'www.federalreserve.gov',
  'www.ecb.europa.eu',
  'www.rbi.org.in',
  'search.cnbc.com',
  'feeds.marketwatch.com',
  'www.investing.com',
  'economictimes.indiatimes.com',
  'www.livemint.com',
  'nfs.faireconomy.media'
];

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/json;q=0.8, */*;q=0.5',
  'Accept-Language': 'en-US,en;q=0.9'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function grab(href) {
  try {
    return await fetch(href, { headers: BROWSER_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(8000) });
  } catch (e) {
    return new Response('Upstream timeout', { status: 504 });
  }
}

function reply(body, status, type, extra) {
  const h = new Headers(CORS);
  h.set('Content-Type', type);
  if (extra) for (const k in extra) h.set(k, extra[k]);
  return new Response(body, { status, headers: h });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return reply('Missing ?url=', 400, 'text/plain');

    let u;
    try { u = new URL(target); } catch (e) { return reply('Bad url', 400, 'text/plain'); }
    if (u.protocol !== 'https:' || !ALLOWED.includes(u.hostname)) return reply('Host not allowed', 403, 'text/plain');

    const cache = caches.default;
    const key = new Request(u.href, { method: 'GET' });
    const cached = await cache.match(key);
    if (cached) {
      const age = Date.now() - Number(cached.headers.get('x-cached-at') || 0);
      if (age < 45000) return reply(await cached.arrayBuffer(), 200, cached.headers.get('Content-Type') || 'text/plain', { 'x-cache': 'fresh' });
    }

    let up = await grab(u.href);
    if (!up.ok && (up.status === 429 || up.status >= 500)) {
      await sleep(800);
      up = await grab(u.href);
    }

    if (up.ok) {
      const buf = await up.arrayBuffer();
      const type = up.headers.get('Content-Type') || 'text/plain; charset=utf-8';
      ctx.waitUntil(cache.put(key, new Response(buf, {
        status: 200,
        headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=600', 'x-cached-at': String(Date.now()) }
      })));
      return reply(buf, 200, type, { 'x-cache': 'miss' });
    }

    if (cached) return reply(await cached.arrayBuffer(), 200, cached.headers.get('Content-Type') || 'text/plain', { 'x-cache': 'stale' });
    return reply('Upstream answered ' + up.status, up.status || 502, 'text/plain');
  }
};
