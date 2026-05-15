/**
 * Shortlink Cloudflare Worker
 * Using D1 Database and Cache API
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Redirect handler (GET /:code)
    // Exclude /api paths
    if (!path.startsWith('/api/') && path !== '/') {
      return handleRedirect(request, env, ctx);
    }

    // API Routes
    if (path.startsWith('/api/')) {
      // Authorization Check
      const authHeader = request.headers.get('Authorization');
      console.log(authHeader, env.PASSKEY_AUTH)
      if (!authHeader || authHeader !== `Bearer ${env.PASSKEY_AUTH}`) {
        return new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (path === '/api/link' && request.method === 'POST') {
        return handleCreate(request, env);
      }

      if (path.startsWith('/api/link/') && request.method === 'PUT') {
        const code = path.split('/').pop();
        return handleUpdate(request, env, ctx, code);
      }

      if (path.startsWith('/api/link/') && request.method === 'DELETE') {
        const code = path.split('/').pop();
        return handleDelete(request, env, ctx, code);
      }

      if (path === '/api/links' && request.method === 'GET') {
        return handleList(request, env);
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};

/**
 * Handle Redirect with Caching logic
 */
async function handleRedirect(request, env, ctx) {
  const url = new URL(request.url);
  const code = url.pathname.slice(1);
  const cache = caches.default;
  
  // Use the full URL as cache key
  const cacheKey = new Request(url.toString(), request);
  let response = await cache.match(cacheKey);

  if (response) {
    console.log("[Get Code]: Request From Cache")
    return response;
  }

  // Not in cache, fetch from D1
  console.log("[Get Code]: Fetching From D1")
  const link = await env.DB.prepare('SELECT url FROM links WHERE code = ?')
    .bind(code)
    .first();

  if (!link) {
    response = new Response(JSON.stringify({ message: 'Link Not Found' }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800', // Cache 404 for 30 minutes
      },
    });
  } else {
    response = new Response(null, {
      status: 302,
      headers: {
        'Location': link.url,
        'Cache-Control': 'public, max-age=3600', // Cache redirect for 1 hour
      },
    });
  }

  // Store in cache
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

/**
 * Create Shortlink
 */
async function handleCreate(request, env) {
  try {
    const { url, key } = await request.json();
    if (!url) {
      return new Response(JSON.stringify({ message: 'URL is required' }), {
        status:400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const code = key || generateRandomKey();
    const now = new Date().toISOString();

    await env.DB.prepare(
      'INSERT INTO links (code, url, created_at) VALUES (?, ?, ?)'
    )
      .bind(code, url, now)
      .run();

    return new Response(
      JSON.stringify({
        code,
        created_at: now,
        updated_at: null,
      }),
      {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    if (e.message.includes('UNIQUE constraint failed')) {
      return new Response(JSON.stringify({ message: 'Code already exists' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Update Shortlink
 */
async function handleUpdate(request, env, ctx, code) {
  try {
    const { url } = await request.json();
    if (!url) {
      return new Response(JSON.stringify({ message: 'URL is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      'UPDATE links SET url = ?, updated_at = ? WHERE code = ?'
    )
      .bind(url, now, code)
      .run();

    if (result.meta.changes === 0) {
      return new Response(JSON.stringify({ message: 'Link Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get original created_at for response (as per api.md)
    const link = await env.DB.prepare('SELECT created_at FROM links WHERE code = ?')
      .bind(code)
      .first();

    // Invalidate cache
    const cache = caches.default;
    const urlObj = new URL(request.url);
    urlObj.pathname = `/${code}`;
    ctx.waitUntil(cache.delete(new Request(urlObj.toString())));

    return new Response(
      JSON.stringify({
        code,
        created_at: link.created_at,
        updated_at: now,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Delete Shortlink
 */
async function handleDelete(request, env, ctx, code) {
  try {
    const link = await env.DB.prepare('SELECT * FROM links WHERE code = ?')
      .bind(code)
      .first();

    if (!link) {
      return new Response(JSON.stringify({ message: 'Link Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await env.DB.prepare('DELETE FROM links WHERE code = ?').bind(code).run();

    // Invalidate cache
    const cache = caches.default;
    const urlObj = new URL(request.url);
    urlObj.pathname = `/${code}`;
    ctx.waitUntil(cache.delete(new Request(urlObj.toString())));

    return new Response(
      JSON.stringify({
        code: link.code,
        created_at: link.created_at,
        updated_at: link.updated_at,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * List Shortlinks
 */
async function handleList(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '0');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = page * limit;

  const links = await env.DB.prepare(
    'SELECT * FROM links ORDER BY created_at DESC LIMIT ? OFFSET ?'
  )
    .bind(limit, offset)
    .all();

  return new Response(JSON.stringify(links.results), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Generate 8 hex characters
 */
function generateRandomKey() {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
