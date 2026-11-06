const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const port = 3400 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'edvyro-api-test-'));
const store = path.join(testStorage, 'applications.json');
let server;
before(async () => {
  server = spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname, '..'), env:{...process.env, PORT:String(port), HOST:'127.0.0.1', APPLICATIONS_FILE:store}, stdio:'ignore' });
  for (let i=0; i<60; i++) {
    try { if ((await fetch(`${base}/api/internships`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start');
});
after(() => {
  server?.kill();
  const tempRoot = path.resolve(os.tmpdir());
  const isolatedPath = path.resolve(testStorage);
  if (path.dirname(isolatedPath) === tempRoot && path.basename(isolatedPath).startsWith('edvyro-api-test-')) {
    fs.rmSync(isolatedPath, { recursive:true, force:true });
  }
});

test('dataset loads with the supplied IDs and fields', async () => {
  const response = await fetch(`${base}/api/internships`), body = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(body.data.map(item => item.id), ['INT-101','INT-102','INT-103','INT-104','INT-105']);
  assert.equal(body.pagination.total, 5); assert.deepEqual(body.data[0].skills, ['HTML','CSS','JavaScript']);
});
test('HTML loads the stylesheet with a relative project path', async () => {
  const html = await (await fetch(base)).text();
  assert.match(html, /href="\.\/styles\.css"/);
  const css = await fetch(`${base}/styles.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /text\/css/);
  assert.match(await css.text(), /\.internship-grid/);
});
test('security headers are set and private project files are not served', async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(`${base}/server.js`)).status, 404);
  assert.equal((await fetch(`${base}/data/internship-records-sample.json`)).status, 404);
});
test('search and combined filters work; no matches return an empty list', async () => {
  const combined = await (await fetch(`${base}/api/internships?search=sql&domain=Full%20Stack%20Development&mode=Hybrid`)).json();
  assert.deepEqual(combined.data.map(item => item.id), ['INT-102']);
  const empty = await (await fetch(`${base}/api/internships?search=unicorn`)).json(); assert.deepEqual(empty.data, []);
});
test('individual details endpoint returns a record or 404', async () => {
  assert.equal((await fetch(`${base}/api/internships/INT-104`)).status, 200);
  assert.equal((await fetch(`${base}/api/internships/missing`)).status, 404);
});
test('application validation rejects invalid input and unsafe URLs', async () => {
  const headers = {'content-type':'application/json'};
  const missingName = await fetch(`${base}/api/applications`, {method:'POST',headers,body:JSON.stringify({name:'',email:'test@example.com',internshipId:'INT-101'})});
  assert.equal(missingName.status, 400);
  const invalidEmail = await fetch(`${base}/api/applications`, {method:'POST',headers,body:JSON.stringify({name:'Test User',email:'wrong',internshipId:'INT-101'})});
  assert.equal(invalidEmail.status, 400);
  const unsafe = await fetch(`${base}/api/applications`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Test User',email:'test@example.com',internshipId:'INT-101',portfolio:'javascript:alert(1)'})});
  assert.equal(unsafe.status, 400);
});
test('application API rejects unsupported media types and oversized bodies', async () => {
  const unsupported = await fetch(`${base}/api/applications`, {method:'POST',headers:{'content-type':'text/plain'},body:'{}'});
  assert.equal(unsupported.status, 415);
  const malformed = await fetch(`${base}/api/applications`, {method:'POST',headers:{'content-type':'application/json'},body:'{invalid'});
  assert.equal(malformed.status, 400);
  const oversized = await fetch(`${base}/api/applications`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({padding:'x'.repeat(20_000)})});
  assert.equal(oversized.status, 413);
});
test('applications persist and duplicate email plus internship is rejected', async () => {
  const payload = {name:'Test User',email:'test@example.com',internshipId:'INT-101',portfolio:'https://example.com'};
  const first = await fetch(`${base}/api/applications`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(first.status, 201); assert.equal(JSON.parse(fs.readFileSync(store, 'utf8')).length, 1);
  const duplicate = await fetch(`${base}/api/applications`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  assert.equal(duplicate.status, 409);
});
test('application endpoint applies a request limit', async () => {
  for (let attempt=0; attempt<2; attempt++) {
    const response = await fetch(`${base}/api/applications`, {method:'POST',headers:{'content-type':'text/plain'},body:'{}'});
    assert.equal(response.status, 415);
  }
  const limited = await fetch(`${base}/api/applications`, {method:'POST',headers:{'content-type':'text/plain'},body:'{}'});
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get('retry-after'));
});
