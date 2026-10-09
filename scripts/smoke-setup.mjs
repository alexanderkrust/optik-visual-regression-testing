#!/usr/bin/env node
// Prepares a fresh optik instance for a smoke test: waits until it is ready,
// creates the admin account, a project and an API token, and prints the token.
//
//   OPTIK_TOKEN=$(node scripts/smoke-setup.mjs http://localhost:3000)
import { randomBytes } from 'node:crypto';

const base = (process.argv[2] ?? process.env.OPTIK_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const api = `${base}/api`;

async function request(path, { token, json } = {}) {
  const res = await fetch(`${api}${path}`, {
    method: json ? 'POST' : 'GET',
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: json ? JSON.stringify(json) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path}: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

for (let attempt = 1; ; attempt++) {
  try {
    await request('/ready');
    break;
  } catch (err) {
    if (attempt === 60) throw err;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const { required } = await request('/auth/setup');
if (!required) throw new Error('optik is already set up — the smoke test needs a fresh instance');

const { accessToken } = await request('/auth/register', {
  json: { email: 'smoke@optik.test', password: randomBytes(16).toString('hex') },
});
await request('/projects', { token: accessToken, json: { name: 'Smoke test', slug: 'smoke' } });
const { token } = await request('/projects/smoke/tokens', { token: accessToken, json: { name: 'smoke' } });
console.log(token);
