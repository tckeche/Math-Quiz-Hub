#!/usr/bin/env node

const BASE_URL = process.env.TARGET_URL || 'https://mcec-tests.replit.app';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Chomukamba';

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    redirect: 'follow',
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const body = await response.text();
  return { status: response.status, body, headers: response.headers };
}

async function run() {
  const summary = [];

  summary.push({
    test: 'Unauthenticated admin session probe',
    ...(await request('/api/admin/session')),
  });

  for (const payload of ["' OR '1'='1", "admin' --", "' UNION SELECT NULL--", "'; DROP TABLE users; --"]) {
    summary.push({
      test: `SQLi-style admin login payload: ${payload}`,
      ...(await request('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: payload }),
      })),
    });
  }

  const validLogin = await request('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  summary.push({ test: 'Valid admin login', ...validLogin });

  const bruteForce = [];
  for (let i = 1; i <= 7; i += 1) {
    bruteForce.push(
      await request('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ password: `wrong-${i}` }),
      }),
    );
  }

  summary.push({
    test: 'Brute-force throttling (7 sequential invalid logins)',
    status: bruteForce[bruteForce.length - 1].status,
    body: bruteForce[bruteForce.length - 1].body,
    headers: bruteForce[bruteForce.length - 1].headers,
  });

  summary.push({
    test: 'Public quiz endpoint exposure check',
    ...(await request('/api/quizzes')),
  });

  console.log(JSON.stringify(summary.map((x) => ({
    test: x.test,
    status: x.status,
    bodyPreview: x.body.slice(0, 180),
    setCookie: x.headers?.get?.('set-cookie') || null,
  })), null, 2));
}

run().catch((error) => {
  console.error('[extreme-protocol] execution failed:', error);
  process.exitCode = 1;
});
