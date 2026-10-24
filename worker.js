/*
  Market Wire relay for Cloudflare Workers (free plan is enough).

  What it does: fetches a news feed for the app and adds the header browsers need.
  Use it as:  https://YOUR-NAME.workers.dev/?url=<feed link>

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

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return new Response('Missing ?url=', { status: 400, headers: cors });

    let u;
    try { u = new URL(target); } catch (e) { return new Response('Bad url', { status: 400, headers: cors }); }
    if (u.protocol !== 'https:' || !ALLOWED.includes(u.hostname)) {
      return new Response('Host not allowed', { status: 403, headers: cors });
    }

    const upstream = await fetch(u.href, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketWire/1.0)',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*'
      },
      cf: { cacheTtl: 30, cacheEverything: true }
    });

    const headers = new Headers(cors);
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8');
    headers.set('Cache-Control', 'public, max-age=30');
    return new Response(upstream.body, { status: upstream.status, headers });
  }
};
