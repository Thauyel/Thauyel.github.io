// Cloudflare Worker - CORS Proxy for Permesso Status Tracker
// Deploy this to Cloudflare Workers (free tier: 100,000 requests/day)

export default {
    async fetch(request) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Max-Age': '86400',
                }
            });
        }

        const url = new URL(request.url);
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
            return new Response('Missing ?url= parameter', {
                status: 400,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        // Only allow requests to the Italian police site (security)
        if (!targetUrl.includes('questure.poliziadistato.it')) {
            return new Response('Forbidden target URL', {
                status: 403,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }

        try {
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                }
            });

            const html = await response.text();

            return new Response(html, {
                status: response.status,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                }
            });
        } catch (error) {
            return new Response(`Fetch error: ${error.message}`, {
                status: 500,
                headers: { 'Access-Control-Allow-Origin': '*' }
            });
        }
    }
};
