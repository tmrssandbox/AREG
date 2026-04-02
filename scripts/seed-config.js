#!/usr/bin/env node
/**
 * Seed initial lookup values for Service Hours, Service Level, and Department.
 * Safe to run multiple times — uses check-before-write (skips categories that already have values).
 *
 * Usage:
 *   AREG_TOKEN=<admin-id-token> node scripts/seed-config.js
 *
 * Or obtain a fresh token via:
 *   aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH \
 *     --auth-parameters USERNAME=...,PASSWORD=... \
 *     --client-id 117u215jcpi0n2nsd4ud5fdn5j
 */

const API_BASE = 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';

async function main() {
  const token = process.env.AREG_TOKEN;
  if (!token) {
    console.error('Error: AREG_TOKEN environment variable not set.');
    console.error('Set it to a valid admin Cognito id_token.');
    process.exit(1);
  }

  const res = await fetch(`${API_BASE}/config/seed`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('Seed failed:', data.message ?? res.status);
    process.exit(1);
  }

  console.log('Seed result:');
  if (data.seeded.length > 0) console.log('  Seeded:', data.seeded.join(', '));
  if (data.skipped.length > 0) console.log('  Skipped (already had values):', data.skipped.join(', '));
}

main().catch(e => { console.error(e); process.exit(1); });
