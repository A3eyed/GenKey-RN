/**
 * GenKey Worker - API surface
 * Full WebAuthn via @simplewebauthn when bundled by wrangler from full source
 */
function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: cors(origin) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '*';
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors(origin) });
    }

    if (path === '/' || path === '/health') {
      return json({
        status: 'ok',
        service: 'GenKey',
        message: 'Backend API is live. Use /api/register/options, /api/login/options, etc.',
        docs: 'https://github.com/A3eyed/GenKey-RN'
      }, 200, origin);
    }

    try {
      if (path.startsWith('/api/')) {
        if (!env.DB) {
          return json({ error: 'D1 database not bound. Redeploy with wrangler.toml D1 config.' }, 500, origin);
        }

        if (path === '/api/register/options' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          if (!body.username) return json({ error: 'username required' }, 400, origin);
          return json({
            error: 'Full passkey registration requires complete Worker deployed via GitHub Actions.',
            hint: 'Add secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID, then Run workflow Deploy GenKey Backend',
            received: { username: body.username, mode: body.mode || 'passwordless' }
          }, 501, origin);
        }

        if (path === '/api/login/options' && request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          return json({
            error: 'Full passkey login requires complete Worker deployed via GitHub Actions.',
            received: { username: body.username }
          }, 501, origin);
        }

        if (path === '/api/risk/check' && request.method === 'POST') {
          return json({ score: 5, level: 'low', reasons: [], requireStepUp: false }, 200, origin);
        }

        return json({ error: 'Not found', path }, 404, origin);
      }

      return json({ status: 'ok', path }, 200, origin);
    } catch (e) {
      return json({ error: e.message || 'Internal error' }, 500, origin);
    }
  }
};
