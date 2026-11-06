const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const applicationsFile = path.resolve(process.env.APPLICATIONS_FILE || path.join(ROOT, 'data', 'applications.json'));
const MAX_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 10;
const internships = require('./data/internship-records-sample.json').internships;
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
const publicFiles = new Map([
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js']
]);
const applicationAttempts = new Map();
const securityHeaders = {
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};

function send(res, status, body, headers = {}) {
  if (res.destroyed || res.headersSent) return;
  res.writeHead(status, { ...securityHeaders, 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function readApplications() {
  try {
    const records = JSON.parse(fs.readFileSync(applicationsFile, 'utf8'));
    if (!Array.isArray(records) || records.some(record => !record || typeof record !== 'object' || Array.isArray(record))) {
      throw new Error('Application storage has an invalid format');
    }
    return records;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
function validUrl(value) {
  if (value === '') return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}
function collectBody(req) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(req.headers['content-length']);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      req.resume();
      reject(Object.assign(new Error('Request body exceeds the 16 KB limit.'), { statusCode:413 }));
      return;
    }
    const chunks = [];
    let byteLength = 0;
    let oversized = false;
    req.on('data', chunk => {
      if (oversized) return;
      byteLength += chunk.length;
      if (byteLength > MAX_BODY_BYTES) {
        oversized = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversized) return reject(Object.assign(new Error('Request body exceeds the 16 KB limit.'), { statusCode:413 }));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('Request body must be valid JSON.'), { statusCode:400 })); }
    });
    req.on('aborted', () => reject(Object.assign(new Error('Request body was interrupted.'), { statusCode:400 })));
    req.on('error', reject);
  });
}
function isRateLimited(req, now = Date.now()) {
  const key = req.socket.remoteAddress || 'unknown';
  let record = applicationAttempts.get(key);
  if (!record || now - record.startedAt >= RATE_WINDOW_MS) {
    if (applicationAttempts.size >= 5000) {
      for (const [address, attempt] of applicationAttempts) {
        if (now - attempt.startedAt >= RATE_WINDOW_MS) applicationAttempts.delete(address);
      }
      if (applicationAttempts.size >= 5000) return true;
    }
    record = { startedAt:now, count:0 };
    applicationAttempts.set(key, record);
  }
  record.count += 1;
  return record.count > RATE_LIMIT;
}
function staticFile(req, res, pathname) {
  const relativePath = publicFiles.get(pathname);
  if (!relativePath) return send(res, 404, { status:'error', error:{ message:'Page not found.' } });
  const file = path.join(ROOT, relativePath);
  fs.readFile(file, (error, content) => {
    if (error) return send(res, 404, { status:'error', error:{ message:'Page not found.' } });
    if (res.destroyed || res.headersSent) return;
    res.writeHead(200, { ...securityHeaders, 'Content-Type':mime[path.extname(file)], 'Cache-Control':'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}
async function handle(req, res) {
  let url;
  try { url = new URL(req.url, `http://${req.headers.host || 'localhost'}`); }
  catch { return send(res, 400, { status:'error', error:{ message:'Invalid request URL.' } }); }
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    if (req.method === 'GET' && pathname === '/api/internships') {
      const domain = url.searchParams.get('domain'), mode = url.searchParams.get('mode');
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const filtered = internships.filter(item => (!domain || item.domain === domain) && (!mode || item.mode === mode) && (!search || [item.title,item.domain,item.mode,item.location,...item.skills].join(' ').toLowerCase().includes(search)));
      return send(res, 200, { status:'success', data:filtered, pagination:{ total:filtered.length } });
    }
    const itemMatch = pathname.match(/^\/api\/internships\/([\w-]+)$/);
    if (req.method === 'GET' && itemMatch) {
      const item = internships.find(record => record.id === itemMatch[1]);
      return item ? send(res, 200, { status:'success', data:item }) : send(res, 404, { status:'error', error:{ message:'Internship not found.' } });
    }
    if (pathname === '/api/applications' && req.method === 'POST') {
      if (isRateLimited(req)) return send(res, 429, { status:'error', error:{ message:'Too many application attempts. Please try again later.' } }, { 'Retry-After':String(Math.ceil(RATE_WINDOW_MS / 1000)) });
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { status:'error', error:{ message:'Content-Type must be application/json.' } });
      let input;
      try { input = await collectBody(req); }
      catch (error) { return send(res, error.statusCode || 400, { status:'error', error:{ message:error.statusCode ? error.message : 'Could not read request body.' } }); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return send(res, 400, { status:'error', error:{ message:'Request body must be a JSON object.' } });
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      const internshipId = typeof input.internshipId === 'string' ? input.internshipId : '';
      const portfolio = typeof input.portfolio === 'string' ? input.portfolio.trim() : '';
      if (!name || name.length > 100) return send(res, 400, { status:'error', error:{ message:'Enter a name between 1 and 100 characters.' } });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return send(res, 400, { status:'error', error:{ message:'Enter a valid email address.' } });
      if (!internships.some(item => item.id === internshipId)) return send(res, 400, { status:'error', error:{ message:'Choose a valid internship.' } });
      if (!validUrl(portfolio)) return send(res, 400, { status:'error', error:{ message:'Portfolio must be a valid http or https URL.' } });
      let applications;
      try { applications = readApplications(); }
      catch { return send(res, 500, { status:'error', error:{ message:'Applications are temporarily unavailable.' } }); }
      if (applications.some(item => item.email === email && item.internshipId === internshipId)) return send(res, 409, { status:'error', error:{ message:'An application with this email already exists for this internship.' } });
      const application = { id:crypto.randomUUID(), name, email, internshipId, portfolio, submittedAt:new Date().toISOString() };
      try {
        fs.writeFileSync(applicationsFile, JSON.stringify([...applications, application], null, 2), { mode:0o600 });
        fs.chmodSync(applicationsFile, 0o600);
      } catch { return send(res, 500, { status:'error', error:{ message:'Your application could not be saved. Please try again.' } }); }
      return send(res, 201, { status:'success', data:{ id:application.id, internshipId, submittedAt:application.submittedAt } });
    }
    if (pathname === '/api/applications' || pathname === '/api/internships' || /^\/api\/internships\/[^/]+$/.test(pathname)) {
      return send(res, 405, { status:'error', error:{ message:'Method not allowed.' } }, { Allow:pathname === '/api/applications' ? 'POST' : 'GET' });
    }
    return send(res, 404, { status:'error', error:{ message:'API route not found.' } });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { status:'error', error:{ message:'Method not allowed.' } }, { Allow:'GET, HEAD' });
  const staticPath = pathname === '/' ? '/index.html' : pathname;
  return staticFile(req, res, staticPath);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => send(res, 500, { status:'error', error:{ message:'Unexpected server error.' } }));
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(PORT, HOST, () => console.log(`EdVyro board listening on http://${HOST}:${PORT}`));
