// Local, no-store static server for docs/, plus a /local/ mount that serves the
// two content repos so a pack can be checked in the real app before it ships.
// Throwaway: not part of the site, and docs/ is what GitHub Pages publishes.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'docs');
const REPOS = {
  'de-ch': path.join(__dirname, '..', 'fluidez-de-ch'),
  'es-ni': path.join(__dirname, '..', 'fluidez-es-ni'),
};

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

// /dev.html is index.html with one script bolted on in front of the app: it
// rewrites every raw.githubusercontent / jsDelivr content URL to the local
// checkouts above, so the real app runs against an unpublished pack.
const SHIM = `<script>
(function () {
  const map = (u) => {
    const s = String(u);
    if (/fluidez-languages/.test(s)) return '/local/languages.json';
    let m = s.match(/githubusercontent\\.com\\/[^/]+\\/fluidez-([a-z]{2}-[a-z]{2})\\/[^/]+\\/(.+)$/);
    if (m) return '/local/' + m[1] + '/' + m[2];
    m = s.match(/jsdelivr\\.net\\/gh\\/[^/]+\\/fluidez-([a-z]{2}-[a-z]{2})@[^/]+\\/(.+)$/);
    if (m) return '/local/' + m[1] + '/' + m[2];
    return u;
  };
  const real = window.fetch;
  window.fetch = (u, o) => real(map(u && u.url ? u.url : u), o);
  window.__DEV_PACK__ = true;
  // No service worker in here: it would cache the app shell and the pack, and
  // this page exists precisely to see the newest of both.
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = () => Promise.reject(new Error('dev'));
    navigator.serviceWorker.getRegistrations &&
      navigator.serviceWorker.getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }
  try { Object.keys(localStorage).forEach((k) => {
    if (k.indexOf('fl:c:') === 0) localStorage.removeItem(k);
  }); } catch (e) {}
})();
</script>`;

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  let file;

  if (url === '/dev.html') {
    let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    html = html.replace('<head>', '<head>' + SHIM);
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }
  if (url === '/local/languages.json') {
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      languages: [
        { code: 'de-ch', name: 'Swiss German', flag: '🇨🇭',
          user: 'scenicprints', repo: 'fluidez-de-ch', branch: 'main' },
      ],
    }));
    return;
  }
  const m = url.match(/^\/local\/([a-z]{2}-[a-z]{2})\/(.+)$/);
  if (m && REPOS[m[1]]) {
    file = path.join(REPOS[m[1]], m[2]);
  } else {
    if (url === '/') url = '/index.html';
    file = path.join(ROOT, url);
  }
  fs.readFile(file, (err, buf) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (err) { res.writeHead(404); res.end('not found: ' + url); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain' });
    res.end(buf);
  });
}).listen(8123, () => console.log('fluidez dev server on http://localhost:8123'));
