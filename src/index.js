const APP_NAME = 'Instagram/Reels Embed';
const ALLOWED_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'kkinstagram.com',
  'www.kkinstagram.com'
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/fallback.jpg' && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const input = url.searchParams.get('u') || '';
        if (input) return handleMake(input, request, ctx);
        return html(generatorPage(url.origin));
      }

      if (url.pathname === '/make') {
        const input = url.searchParams.get('u') || '';
        return handleMake(input, request, ctx);
      }

      if (url.pathname === '/api') {
        const input = url.searchParams.get('u') || '';
        const meta = await getMetadata(input, request, ctx);
        return json(meta, 200, 3600);
      }

      if (url.pathname === '/oembed') {
        const input = url.searchParams.get('u') || '';
        const meta = await getMetadata(input, request, ctx);
        const src = `${url.origin}/u/${encodeForPath(meta.canonicalUrl)}`;
        return json({
          version: '1.0',
          type: 'rich',
          provider_name: APP_NAME,
          provider_url: url.origin,
          title: meta.title,
          author_name: meta.author || 'Instagram',
          thumbnail_url: meta.image,
          width: 430,
          height: 650,
          html: iframeCode(src)
        }, 200, 3600);
      }

      if (url.pathname.startsWith('/u/')) {
        const encoded = url.pathname.slice(3).replace(/\/$/, '');
        const input = decodeFromPath(encoded);
        const meta = await getMetadata(input, request, ctx);
        return html(embedPage(meta, url.toString(), url.origin), 200, 3600);
      }

      if (url.pathname === '/healthz') return new Response('ok');

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      const status = err.status || 500;
      const message = err.publicMessage || err.message || 'Ошибка';
      return html(generatorPage(url.origin, { input: url.searchParams.get('u') || '', error: message }), status, 0);
    }
  }
};

async function handleMake(input, request, ctx) {
  try {
    const url = new URL(request.url);
    const meta = await getMetadata(input, request, ctx);
    const share = `${url.origin}/u/${encodeForPath(meta.canonicalUrl)}`;
    const iframe = iframeCode(share);
    return html(generatorPage(url.origin, { input, meta, share, iframe, message: 'Готово.' }), 200, 0);
  } catch (err) {
    const url = new URL(request.url);
    const message = err.publicMessage || err.message || 'Ошибка';
    return html(generatorPage(url.origin, { input, error: message }), err.status || 400, 0);
  }
}

async function getMetadata(input, request, ctx) {
  const info = normalizeInstagramUrl(input);

  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = '/__meta_cache__';
  cacheUrl.search = `?u=${encodeURIComponent(info.canonicalUrl)}`;
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) return cached.json();

  let og = {};
  let fetchError = '';
  try {
    og = await fetchOpenGraph(info.canonicalUrl);
  } catch (e) {
    fetchError = String(e && e.message ? e.message : e);
  }

  const origin = new URL(request.url).origin;
  const rawTitle = cleanText(og.title || titleByType(info.type));
  const rawDescription = cleanText(og.description || 'Preview для Instagram-ссылки.');
  const author = parseAuthor(rawTitle, rawDescription) || info.username || 'Instagram';
  const image = absoluteImage(og.image, info.canonicalUrl) || `${origin}/fallback.jpg`;

  const meta = {
    ok: true,
    originalUrl: info.originalUrl,
    canonicalUrl: info.canonicalUrl,
    openUrl: info.canonicalUrl,
    shortcode: info.shortcode,
    type: info.type,
    author,
    title: rawTitle,
    description: rawDescription,
    image,
    fetched: Boolean(og.title || og.description || og.image),
    fetchError
  };

  const res = json(meta, 200, 86400);
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return meta;
}

async function fetchOpenGraph(targetUrl) {
  const res = await fetch(targetUrl, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    cf: { cacheTtl: 3600, cacheEverything: true }
  });

  if (!res.ok) throw new Error(`Instagram HTTP ${res.status}`);
  return parseMeta(await res.text());
}

function parseMeta(htmlText) {
  const out = {};
  const metaRe = /<meta\s+([^>]*?)>/gi;
  let m;

  while ((m = metaRe.exec(htmlText))) {
    const attrs = parseAttrs(m[1]);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    const val = attrs.content || '';
    if (!key || !val) continue;
    if (key === 'og:title' || key === 'twitter:title') out.title ||= decodeEntities(val);
    if (key === 'og:description' || key === 'twitter:description' || key === 'description') out.description ||= decodeEntities(val);
    if (key === 'og:image' || key === 'twitter:image') out.image ||= decodeEntities(val);
  }

  const title = htmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title && !out.title) out.title = decodeEntities(title[1]);
  return out;
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z_:.-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;
  let m;

  while ((m = re.exec(raw))) {
    const key = m[1].toLowerCase();
    let val = m[2] || '';
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    attrs[key] = val;
  }

  return attrs;
}

function normalizeInstagramUrl(input) {
  if (!input || !String(input).trim()) throw publicError('Вставь ссылку.', 400);

  let u;
  try {
    u = new URL(String(input).trim());
  } catch {
    throw publicError('Некорректная ссылка.', 400);
  }

  if (!['http:', 'https:'].includes(u.protocol)) throw publicError('Нужна http/https ссылка.', 400);

  const host = u.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) throw publicError('Поддерживаются только instagram.com и kkinstagram.com.', 400);

  const parts = u.pathname.split('/').filter(Boolean);
  let type = '';
  let shortcode = '';
  let username = '';

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toLowerCase();
    if ((p === 'p' || p === 'reel' || p === 'tv') && parts[i + 1]) {
      type = p;
      shortcode = parts[i + 1];
      if (i > 0) username = parts[i - 1];
      break;
    }
  }

  if (!type || !/^[A-Za-z0-9_-]{5,}$/.test(shortcode)) {
    throw publicError('Не найден код публикации.', 400);
  }

  const canonicalUrl = `https://www.instagram.com/${type}/${shortcode}/`;
  return { originalUrl: String(input).trim(), canonicalUrl, type, shortcode, username };
}

function embedPage(meta, selfUrl, origin) {
  const image = meta.image || `${origin}/fallback.jpg`;
  const title = meta.title || titleByType(meta.type);
  const description = meta.description || 'Preview для Instagram-ссылки.';
  const author = meta.author || 'Instagram';
  const badge = meta.type === 'reel' ? 'Instagram Reel' : (meta.type === 'tv' ? 'Instagram Video' : 'Instagram Post');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttr(description)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${escapeAttr(APP_NAME)}">
  <meta property="og:url" content="${escapeAttr(selfUrl)}">
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:image" content="${escapeAttr(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${escapeAttr(image)}">
  <style>${pageCss()}</style>
</head>
<body>
  <main class="wrap">
    <article class="card">
      <a class="cover" href="${escapeAttr(meta.openUrl)}" target="_blank" rel="noopener noreferrer">
        <img src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="eager">
        <span class="pill">Instagram</span>
        <span class="play">▶</span>
      </a>
      <section class="body">
        <div class="overline">${escapeHtml(badge)} · ${escapeHtml(author)}</div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
        <a class="btn" href="${escapeAttr(meta.openUrl)}" target="_blank" rel="noopener noreferrer">Открыть в Instagram</a>
      </section>
    </article>
  </main>
</body>
</html>`;
}

function generatorPage(origin, state = {}) {
  const input = state.input || '';
  const meta = state.meta || null;
  const share = state.share || '';
  const iframe = state.iframe || '';
  const message = state.error || state.message || '';
  const preview = meta ? previewCard(meta) : '<div class="empty">Превью появится здесь.</div>';

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Instagram/Reels Embed Generator</title>
  <meta name="description" content="Генератор embed-ссылок для Instagram/Reels.">
  <style>${pageCss()}${generatorCss()}</style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <h1>Instagram/Reels Embed Generator</h1>
      <p class="lead">Вставь ссылку на Reel/Post — получишь embed-ссылку и iframe-код.</p>

      <form method="get" action="/make" autocomplete="off">
        <label for="src">Ссылка Instagram / kkinstagram</label>
        <input id="src" name="u" value="${escapeAttr(input)}" inputmode="url" placeholder="https://www.instagram.com/reel/.../">
        <button class="primary" type="submit">Сделать ссылку</button>
        ${message ? `<div class="msg">${escapeHtml(message)}</div>` : ''}
      </form>

      <label for="share">Embed-ссылка</label>
      <textarea id="share" readonly>${escapeHtml(share)}</textarea>
      <button type="button" data-copy="share">Скопировать ссылку</button>

      <label for="iframe">iframe-код</label>
      <textarea id="iframe" readonly>${escapeHtml(iframe)}</textarea>
      <button type="button" data-copy="iframe">Скопировать iframe</button>
    </section>

    <section class="preview">${preview}</section>
  </main>

  <script>
    document.querySelectorAll('[data-copy]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        var el = document.getElementById(btn.getAttribute('data-copy'));
        if (!el || !el.value) return;
        try {
          await navigator.clipboard.writeText(el.value);
          var old = btn.textContent;
          btn.textContent = 'Скопировано';
          setTimeout(function(){ btn.textContent = old; }, 1200);
        } catch (e) {
          el.focus();
          el.select();
          document.execCommand('copy');
        }
      });
    });
  </script>
</body>
</html>`;
}

function previewCard(data) {
  const image = data.image || '/fallback.jpg';
  const title = data.title || titleByType(data.type);
  const description = data.description || '';
  return `<article class="card mini">
    <a class="cover" href="${escapeAttr(data.openUrl)}" target="_blank" rel="noopener noreferrer">
      <img src="${escapeAttr(image)}" alt="${escapeAttr(title)}">
      <span class="pill">Instagram</span>
      <span class="play">▶</span>
    </a>
    <section class="body">
      <div class="overline">${escapeHtml(data.author || 'Instagram')}</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <a class="btn" href="${escapeAttr(data.openUrl)}" target="_blank" rel="noopener noreferrer">Открыть в Instagram</a>
    </section>
  </article>`;
}

function pageCss() {
  return `:root{color-scheme:dark;--bg:#0f0f13;--card:#18181e;--line:#34343d;--text:#f4f4f7;--muted:#b9b9c7;--pink:#ff0f7b;--orange:#ff6b35;--violet:#6b20ff}*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;background:radial-gradient(circle at 10% 0%,#25202d 0,#0f0f13 38%,#08080b 100%);color:var(--text)}.wrap{min-height:100svh;display:grid;place-items:center;padding:22px}.card{width:min(430px,100%);background:var(--card);border:1px solid var(--line);border-radius:28px;overflow:hidden;box-shadow:0 30px 90px #0008}.cover{display:block;position:relative;aspect-ratio:1/1.12;background:linear-gradient(135deg,var(--orange),var(--pink),var(--violet));overflow:hidden}.cover img{width:100%;height:100%;object-fit:cover;display:block}.pill{position:absolute;left:18px;top:18px;background:#0009;color:white;font-weight:800;border-radius:99px;padding:8px 12px;font-size:13px}.play{position:absolute;right:18px;bottom:18px;width:54px;height:54px;border-radius:999px;background:#140a3ccc;display:grid;place-items:center;font-size:22px}.body{padding:20px}.overline{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-size:12px;font-weight:900}.body h1{margin:8px 0 10px;font-size:24px;line-height:1.1}.body p{margin:0 0 16px;color:var(--muted);line-height:1.45}.btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;color:white;background:linear-gradient(135deg,var(--orange),var(--pink),var(--violet));font-weight:900;border-radius:14px;padding:12px 16px}`;
}

function generatorCss() {
  return `.shell{width:min(1100px,100%);margin:0 auto;padding:38px 18px;display:grid;grid-template-columns:1fr 440px;gap:22px}.panel{background:#18181ecc;border:1px solid var(--line);border-radius:28px;padding:22px}.panel h1{font-size:42px;line-height:1;margin:0 0 10px}.lead{color:var(--muted);line-height:1.5;margin:0 0 24px}label{display:block;margin:16px 0 8px;font-weight:800}input,textarea{width:100%;border:1px solid var(--line);background:#101015;color:var(--text);border-radius:16px;padding:14px;font:inherit}textarea{min-height:70px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}button{appearance:none;border:0;border-radius:999px;padding:12px 16px;background:#2a2a33;color:white;font-weight:900;margin:12px 8px 0 0;cursor:pointer}.primary{background:linear-gradient(135deg,var(--orange),var(--pink),var(--violet));box-shadow:0 0 0 2px #fff}.msg{color:var(--muted);font-size:13px;margin-top:10px}.preview{display:grid;place-items:start}.mini{width:100%}.empty{width:100%;border:1px dashed var(--line);border-radius:28px;padding:40px;color:var(--muted);text-align:center}@media(max-width:900px){.shell{grid-template-columns:1fr}.panel h1{font-size:32px}}`;
}

function titleByType(type) {
  if (type === 'reel') return 'Instagram Reel';
  if (type === 'tv') return 'Instagram Video';
  return 'Instagram Post';
}

function parseAuthor(title, description) {
  for (const s of [title, description].filter(Boolean)) {
    let m = s.match(/^([^:•|]{2,80})\s+(?:on|в)\s+Instagram/i);
    if (m) return cleanText(m[1]);
    m = s.match(/@([A-Za-z0-9_.]{2,30})/);
    if (m) return '@' + m[1];
  }
  return '';
}

function iframeCode(src) {
  return `<iframe src="${escapeAttr(src)}" width="430" height="650" style="border:0;max-width:100%;border-radius:24px;overflow:hidden;" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allow="clipboard-write" title="Instagram preview"></iframe>`;
}

function encodeForPath(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeFromPath(s) {
  let b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function absoluteImage(src, base) {
  if (!src) return '';
  try { return new URL(src, base).toString(); } catch { return ''; }
}

function cleanText(s) {
  return decodeEntities(String(s || '')).replace(/\s+/g, ' ').trim();
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escapeAttr(s) {
  return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function publicError(message, status = 400) {
  return Object.assign(new Error(message), { status, publicMessage: message });
}

function html(body, status = 200, maxAge = 0) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : 'no-store'
    }
  });
}

function json(data, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : 'no-store'
    }
  });
}
