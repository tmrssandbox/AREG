import { test, expect, Browser, Page } from '@playwright/test';
import * as path from 'path';

const BASE         = process.env.AREG_API_URL ?? 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';
const EMAIL        = process.env.AREG_TEST_EMAIL    ?? 'test-admin@areg.local';
const PASSWORD     = process.env.AREG_TEST_PASSWORD ?? '';
const VIEWER_EMAIL = process.env.AREG_VIEWER_EMAIL  ?? 'test-viewer@areg.local';
const APP_NAME     = 'AREG_TEST_APP';
const IMPORT_NAME  = 'AREG_TEST_IMPORT';

test.describe.configure({ mode: 'serial' });

let browser: Browser;
let page: Page;
let apiToken = '';
// Config IDs populated in beforeAll after seeding
let serviceHoursId = '';
let serviceLevelId = '';

const clientId = process.env.AREG_CLIENT_ID ?? '117u215jcpi0n2nsd4ud5fdn5j';

async function cognitoAuth(username: string, password: string): Promise<string> {
  const res = await fetch('https://cognito-idp.us-east-2.amazonaws.com/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  });
  const data = await res.json() as { AuthenticationResult?: { IdToken?: string } };
  return data.AuthenticationResult?.IdToken ?? '';
}

async function getToken(): Promise<string> {
  if (apiToken) return apiToken;
  // Use pre-obtained token if provided — avoids USER_PASSWORD_AUTH rate limiting
  if (process.env.AREG_API_TOKEN) {
    apiToken = process.env.AREG_API_TOKEN;
    return apiToken;
  }
  apiToken = await cognitoAuth(EMAIL, PASSWORD);
  return apiToken;
}

async function cleanupTestRecords(prefix: string) {
  const token = await getToken();
  const res = await fetch(`${BASE}/apps?limit=1000`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json() as { items?: { appId: string; name: string }[] };
  for (const item of data.items ?? []) {
    if (item.name.startsWith(prefix)) {
      await fetch(`${BASE}/apps/${item.appId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    }
  }
}

test.beforeAll(async ({ browser: b }) => {
  if (!PASSWORD) throw new Error('AREG_TEST_PASSWORD env var is required');
  browser = b;
  page = await browser.newPage();

  // Ensure config is seeded (check-before-write — safe to call every time)
  const token = await getToken();
  await fetch(`${BASE}/config/seed`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });

  // Fetch first serviceHours and serviceLevel IDs for API-level tests
  const [shRes, slRes] = await Promise.all([
    fetch(`${BASE}/config/serviceHours`, { headers: { Authorization: `Bearer ${token}` } }),
    fetch(`${BASE}/config/serviceLevel`, { headers: { Authorization: `Bearer ${token}` } }),
  ]);
  const sh = await shRes.json() as { id: string }[];
  const sl = await slRes.json() as { id: string }[];
  serviceHoursId = sh[0]?.id ?? '';
  serviceLevelId = sl[0]?.id ?? '';

  await cleanupTestRecords(APP_NAME);
  await cleanupTestRecords(IMPORT_NAME);
});

test.afterAll(async () => {
  await page.close();
});

// ── Auth ──────────────────────────────────────────────────────────────────────

test('login redirects to dashboard', async () => {
  await page.goto('/login');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('/', { timeout: 15_000 });
  await expect(page).toHaveURL('/');
});

// ── Profile page ──────────────────────────────────────────────────────────────

test('profile page loads with email and display name field', async () => {
  await page.goto('/profile');
  await expect(page.locator('h1')).toContainText('My Profile');
  await expect(page.locator('input[type="email"][disabled]')).toBeVisible();
  await expect(page.locator('#display-name')).toBeVisible();
  await expect(page.locator('label:has-text("Role")')).not.toBeVisible();
});

test('profile page can save display name', async () => {
  await page.fill('#display-name', 'Smoke Test User');
  await page.click('button:has-text("Save profile")');
  await expect(page.locator('text=Profile updated.')).toBeVisible({ timeout: 10_000 });
});

// ── Dashboard ─────────────────────────────────────────────────────────────────

test('dashboard displays stat cards', async () => {
  await page.goto('/');
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  await expect(page.locator('text=Total Apps')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('text=Active').first()).toBeVisible();
  await expect(page.locator('text=Renewals').first()).toBeVisible();
});

// ── Catalog — add record ──────────────────────────────────────────────────────

test('catalog page loads', async () => {
  await page.click('a[href="/catalog"]');
  await page.waitForURL('/catalog');
  await expect(page.locator('h1, [role="heading"]').filter({ hasText: /catalog/i })).toBeVisible();
});

test('add new application record', async () => {
  await page.click('button:has-text("Add App")');
  const modal = page.locator('.modal-overlay');
  await modal.waitFor({ timeout: 8_000 });
  await expect(modal.locator('h2')).toContainText('Add Application');

  // Wait for config dropdowns to load (form shows "Loading…" initially)
  await expect(modal.locator('text=Loading…')).not.toBeVisible({ timeout: 10_000 });

  const inputs = modal.locator('input[type="text"], input:not([type])');
  // Fields: name, tmrsBusinessOwner, tmrsBusinessContact, tmrsTechnicalContact,
  //         vendorName, vendorBusinessContact, vendorTechnicalContact
  await modal.locator('input').nth(0).fill(APP_NAME);           // name
  await modal.locator('input').nth(1).fill('Biz Owner');         // tmrsBusinessOwner
  await modal.locator('input').nth(3).fill('Tech Contact');      // tmrsTechnicalContact
  await modal.locator('input').nth(4).fill('SmokeVendor');       // vendorName

  await modal.locator('textarea').nth(0).fill('E2E smoke test application'); // description

  // Select managed dropdowns (serviceHours, serviceLevel, businessCriticality, department)
  const selects = modal.locator('.modal-field select');
  await selects.nth(0).selectOption({ index: 1 }); // serviceHours — first real option
  await selects.nth(1).selectOption({ index: 1 }); // serviceLevel — first real option

  await modal.locator('button[type="submit"]').click();

  // After creation the detail modal opens on the Contracts tab — close it
  const detailModal = page.locator('.modal-overlay');
  await detailModal.waitFor({ timeout: 10_000 });
  await expect(detailModal.locator('.modal-tab.active')).toContainText('Contracts', { timeout: 8_000 });
  await detailModal.locator('button.modal-close').click();
  await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 5_000 });

  await expect(page.locator(`text=${APP_NAME}`).first()).toBeVisible({ timeout: 8_000 });
});

// ── Catalog — search + filter ─────────────────────────────────────────────────

test('text search finds the test record', async () => {
  const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
  await searchInput.fill(APP_NAME);
  await page.waitForTimeout(500);
  await expect(page.locator(`text=${APP_NAME}`).first()).toBeVisible();
  await searchInput.clear();
});

// ── Catalog — edit record ─────────────────────────────────────────────────────

test('edit the test record', async () => {
  await page.locator(`tr:has-text("${APP_NAME}")`).first().click();
  const modal = page.locator('.modal-overlay');
  await expect(modal.locator('button:has-text("Edit")')).toBeVisible({ timeout: 5_000 });
  await modal.locator('button:has-text("Edit")').click();

  const editModal = page.locator('.modal-overlay');
  await expect(editModal.locator('h2')).toContainText('Edit Application', { timeout: 8_000 });
  await expect(editModal.locator('text=Loading…')).not.toBeVisible({ timeout: 10_000 });

  await editModal.locator('textarea').last().fill('Updated by E2E smoke test'); // notes
  await editModal.locator('button[type="submit"]').click();
  await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 8_000 });
});

// ── Audit log ─────────────────────────────────────────────────────────────────

test('audit log shows update event', async () => {
  await page.locator(`tr:has-text("${APP_NAME}")`).first().click();
  const modal = page.locator('.modal-overlay');
  await modal.locator('button:has-text("Audit")').click();
  await expect(modal.locator('text=UPDATE').first()).toBeVisible({ timeout: 8_000 });
  await modal.locator('button:has-text("×")').click();
  await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 5_000 });
});

// ── Delete record ─────────────────────────────────────────────────────────────

test('delete the test record', async () => {
  await page.locator(`tr:has-text("${APP_NAME}")`).first().click();
  const modal = page.locator('.modal-overlay');
  await modal.locator('button:has-text("Delete")').click();
  await modal.locator('button:has-text("Confirm Delete")').click();
  await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 8_000 });
  await expect(page.locator(`tr:has-text("${APP_NAME}")`)).not.toBeVisible({ timeout: 5_000 });
});

// ── Archive — restore record ──────────────────────────────────────────────────

test('archive page shows deleted record and can restore', async () => {
  await page.click('a[href="/admin"]');
  await page.waitForURL('/admin');
  await page.click('button:has-text("Archive")');
  const restoreBtn = page.locator(`tr:has-text("${APP_NAME}") button:has-text("Restore")`).first();
  await expect(restoreBtn).toBeVisible({ timeout: 10_000 });
  const countBefore = await page.locator(`tr:has-text("${APP_NAME}")`).count();
  await restoreBtn.click();
  await expect(page.locator(`tr:has-text("${APP_NAME}")`)).toHaveCount(countBefore - 1, { timeout: 5_000 });
});

// ── Final cleanup ─────────────────────────────────────────────────────────────

test('cleanup: delete test record from catalog', async () => {
  await page.goto('/catalog');
  await page.waitForSelector(`tr:has-text("${APP_NAME}")`, { timeout: 10_000 });
  await page.locator(`tr:has-text("${APP_NAME}")`).first().click();
  const modal = page.locator('.modal-overlay');
  await modal.locator('button:has-text("Delete")').click();
  await modal.locator('button:has-text("Confirm Delete")').click();
  await expect(page.locator('.modal-overlay')).not.toBeVisible({ timeout: 8_000 });
});

// ── Admin Lookups tab ─────────────────────────────────────────────────────────

test('admin lookups tab shows seeded service hours and departments', async () => {
  await page.click('a[href="/admin"]');
  await page.waitForURL('/admin');
  await page.click('button:has-text("Lookups")');
  await page.waitForLoadState('networkidle', { timeout: 10_000 });
  await expect(page.locator('text=Business Hours').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('text=IS').first()).toBeVisible();
});

// ── CSV Import ────────────────────────────────────────────────────────────────

test('CSV import preview and commit', async () => {
  await page.click('a[href="/admin"]');
  await page.waitForURL('/admin');
  await page.click('button:has-text("Import")');

  const csvPath = path.join(__dirname, '../fixtures/import.csv');
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('text=Drag & drop').click(),
  ]);
  await fileChooser.setFiles(csvPath);

  await expect(page.locator('text=Valid').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`text=${IMPORT_NAME}`).first()).toBeVisible();

  await page.click('button:has-text("valid record")');
  await expect(page.locator('text=Import Complete').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('text=Created').first()).toBeVisible();

  // Cleanup
  await page.goto('/catalog');
  const importedRow = page.locator(`tr:has-text("${IMPORT_NAME}")`).first();
  if (await importedRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await importedRow.click();
    const deleteBtn = page.locator('button:has-text("Delete")').first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
      const confirmBtn = page.locator('button:has-text("Confirm Delete")').first();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(1_000);
    }
  }
});

// ── Help page downtime table ──────────────────────────────────────────────────

test('help page shows downtime allowance table', async () => {
  await page.goto('/help');
  await expect(page.locator('text=Downtime Allowances').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('text=Business Hours').first()).toBeVisible();
  await expect(page.locator('text=24x7').first()).toBeVisible();
});

// ── Logout ────────────────────────────────────────────────────────────────────

test('sign out redirects to login', async () => {
  await page.click('button:has-text("Sign out")');
  await page.waitForURL('/login', { timeout: 10_000 });
  await expect(page).toHaveURL('/login');
});

// ── Auth page links ───────────────────────────────────────────────────────────

test('login page shows forgot password and create account links', async () => {
  await page.goto('/login');
  await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
  await expect(page.locator('a[href="/signup"]')).toBeVisible();
});

test('sign-up page loads and shows registration form', async () => {
  await page.goto('/signup');
  await expect(page.locator('h1')).toContainText('Create account');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]').first()).toBeVisible();
  await expect(page.locator('a[href="/login"]')).toBeVisible();
});

test('forgot password page loads and shows request form', async () => {
  await page.goto('/forgot-password');
  await expect(page.locator('h1')).toContainText('Forgot password');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('a[href="/login"]')).toBeVisible();
});

test('verify email page loads and shows code form', async () => {
  await page.goto('/verify');
  await expect(page.locator('h1')).toContainText('Verify your email');
  await expect(page.locator('input[placeholder="123456"]')).toBeVisible();
  await expect(page.locator('a[href="/login"]')).toBeVisible();
});

// ── Profile — MFA UI structure ────────────────────────────────────────────────

test('profile page shows mfa-option card with label', async () => {
  await page.goto('/login');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('/', { timeout: 15_000 });
  await page.goto('/profile');
  await expect(page.locator('.mfa-option')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.mfa-option-label')).toContainText('Authenticator app');
});

// ── Contracts API ─────────────────────────────────────────────────────────────

test('contracts: full upload → confirm → list → download-url → delete flow', async () => {
  const token = await getToken();

  // Create a temp app to attach a contract to
  const createRes = await fetch(`${BASE}/apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'CONTRACT_TEST_APP', description: 'temp for contract test',
      vendorName: 'vendor', tmrsBusinessOwner: 'owner', tmrsTechnicalContact: 'tech',
      serviceHours: serviceHoursId, serviceLevel: serviceLevelId,
    }),
  });
  expect(createRes.status).toBe(201);
  const createdApp = await createRes.json() as { appId?: string };
  const appId = createdApp.appId ?? '';
  expect(appId).toBeTruthy();

  try {
    // Step 1: get upload URL
    const urlRes = await fetch(`${BASE}/apps/${appId}/contracts/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'test-contract.pdf', contentType: 'application/pdf', sizeBytes: 1024, description: 'E2E test doc' }),
    });
    expect(urlRes.status).toBe(201);
    const { docId, uploadUrl } = await urlRes.json() as { docId: string; uploadUrl: string };
    expect(docId).toBeTruthy();
    expect(uploadUrl).toContain('amazonaws.com');

    // Step 2: upload a tiny PDF to S3 via presigned URL
    const pdfBytes = Buffer.from('%PDF-1.4 smoke test');
    const s3Res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: pdfBytes,
    });
    expect(s3Res.ok).toBe(true);

    // Step 3: confirm upload
    const confirmRes = await fetch(`${BASE}/apps/${appId}/contracts/${docId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(confirmRes.status).toBe(200);

    // Step 4: list contracts
    const listRes = await fetch(`${BASE}/apps/${appId}/contracts`, { headers: { Authorization: `Bearer ${token}` } });
    expect(listRes.status).toBe(200);
    const list = await listRes.json() as { items: { docId: string }[] };
    expect(list.items.some(d => d.docId === docId)).toBe(true);

    // Step 5: get download URL
    const dlRes = await fetch(`${BASE}/apps/${appId}/contracts/${docId}/download-url`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dlRes.status).toBe(200);
    const { downloadUrl } = await dlRes.json() as { downloadUrl: string };
    expect(downloadUrl).toContain('amazonaws.com');

    // Step 6: delete the contract
    const delRes = await fetch(`${BASE}/apps/${appId}/contracts/${docId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(delRes.status).toBe(200);

    // Verify gone from list
    const listAfterRes = await fetch(`${BASE}/apps/${appId}/contracts`, { headers: { Authorization: `Bearer ${token}` } });
    const listAfter = await listAfterRes.json() as { items: { docId: string }[] };
    expect(listAfter.items.some(d => d.docId === docId)).toBe(false);
  } finally {
    // Cleanup app
    await fetch(`${BASE}/apps/${appId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }
});

test('viewer cannot upload contracts via API', async () => {
  const adminToken = await getToken();
  const createRes = await fetch(`${BASE}/apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'CONTRACT_VIEWER_TEST', description: 'temp',
      vendorName: 'v', tmrsBusinessOwner: 'o', tmrsTechnicalContact: 't',
      serviceHours: serviceHoursId, serviceLevel: serviceLevelId,
    }),
  });
  const { appId } = await createRes.json() as { appId: string };
  try {
    const viewerToken = await cognitoAuth(VIEWER_EMAIL, PASSWORD);
    const res = await fetch(`${BASE}/apps/${appId}/contracts/upload-url`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: 'blocked.pdf', contentType: 'application/pdf', sizeBytes: 100, description: '' }),
    });
    expect(res.status).toBe(403);
  } finally {
    await fetch(`${BASE}/apps/${appId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
  }
});

// ── DELETE /users/me ──────────────────────────────────────────────────────────

test('DELETE /users/me returns 204 for authenticated user', async () => {
  const token = await getToken();
  const res = await fetch(`${BASE}/users/me`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status).toBe(204);
});

// ── Viewer role — API enforcement ─────────────────────────────────────────────

test('viewer cannot create a record via API', async () => {
  const token = await cognitoAuth(VIEWER_EMAIL, PASSWORD);
  const res = await fetch(`${BASE}/apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'VIEWER_BLOCKED', description: 'should fail',
      vendorName: 'v', tmrsBusinessOwner: 'owner', tmrsTechnicalContact: 'tech',
      serviceHours: serviceHoursId, serviceLevel: serviceLevelId,
    }),
  });
  expect(res.status).toBe(403);
});

test('viewer cannot update a record via API', async () => {
  const adminToken = await getToken();
  const createRes = await fetch(`${BASE}/apps`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'VIEWER_UPDATE_TEST', description: 'temp',
      vendorName: 'v', tmrsBusinessOwner: 'owner', tmrsTechnicalContact: 'tech',
      serviceHours: serviceHoursId, serviceLevel: serviceLevelId,
    }),
  });
  const created = await createRes.json() as { appId?: string };
  const appId = created.appId ?? '';

  const viewerToken = await cognitoAuth(VIEWER_EMAIL, PASSWORD);
  const updateRes = await fetch(`${BASE}/apps/${appId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${viewerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes: 'viewer attempted update' }),
  });
  expect(updateRes.status).toBe(403);

  await fetch(`${BASE}/apps/${appId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
});

test('viewer can read the catalog via API', async () => {
  const token = await cognitoAuth(VIEWER_EMAIL, PASSWORD);
  const res = await fetch(`${BASE}/apps`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
});
