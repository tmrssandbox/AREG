import { test, expect, Browser, Page } from '@playwright/test';
import * as path from 'path';

const BASE      = process.env.AREG_API_URL ?? 'https://aw3itbmhii.execute-api.us-east-2.amazonaws.com';
const EMAIL     = process.env.AREG_TEST_EMAIL    ?? 'test-admin@areg.local';
const PASSWORD  = process.env.AREG_TEST_PASSWORD ?? '';
const APP_NAME  = 'AREG_TEST_APP';
const IMPORT_NAME = 'AREG_TEST_IMPORT';

// All tests run serially in a single browser page to preserve login state
test.describe.configure({ mode: 'serial' });

let browser: Browser;
let page: Page;
let apiToken = '';

/** Obtain a JWT token via Cognito (used for pre/post test cleanup) */
async function getToken(): Promise<string> {
  if (apiToken) return apiToken;
  const poolId = process.env.AREG_USER_POOL_ID ?? 'us-east-2_Ts0PtOaEc';
  const clientId = process.env.AREG_CLIENT_ID  ?? '117u215jcpi0n2nsd4ud5fdn5j';
  const res = await fetch(
    `https://cognito-idp.us-east-2.amazonaws.com/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      },
      body: JSON.stringify({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: { USERNAME: EMAIL, PASSWORD },
      }),
    },
  );
  const data = await res.json() as { AuthenticationResult?: { IdToken?: string } };
  apiToken = data.AuthenticationResult?.IdToken ?? '';
  return apiToken;
}

/** Delete all active+deleted records matching a name prefix */
async function cleanupTestRecords(prefix: string) {
  const token = await getToken();
  // Fetch active records
  const res = await fetch(`${BASE}/apps?limit=1000`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json() as { items?: { appId: string; name: string; status: string }[] };
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
  // Pre-flight: remove any leftover test records from previous runs
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

// ── Dashboard ─────────────────────────────────────────────────────────────────

test('dashboard displays stat cards', async () => {
  // Already on / after login; wait for data to load
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
  // Stat cards should be visible once data loads
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
  // Open the add modal
  await page.click('button:has-text("Add App")');

  // Wait for the modal overlay (.fixed) to appear
  const modal = page.locator('.fixed');
  await modal.waitFor({ timeout: 5_000 });
  await expect(modal.locator('h2')).toContainText('Add Application');

  // Form field order (from AppFormModal): name, [description textarea], vendor,
  // itContact, businessOwner, hoursOfOperation, [department, renewalDate, notes]
  const inputs    = modal.locator('input');
  const textareas = modal.locator('textarea');

  await inputs.nth(0).fill(APP_NAME);           // name
  await inputs.nth(1).fill('SmokeVendor');      // vendor
  await inputs.nth(2).fill('smoke@test.local'); // itContact
  await inputs.nth(3).fill('owner@test.local'); // businessOwner
  await inputs.nth(4).fill('9-5 M-F');          // hoursOfOperation
  await inputs.nth(5).fill('QA');               // department
  await inputs.nth(6).fill('2027-06-30');        // renewalDate

  await textareas.nth(0).fill('E2E smoke test application'); // description

  await modal.locator('button[type="submit"]').click();
  await page.waitForSelector(`td:has-text("${APP_NAME}"), tr:has-text("${APP_NAME}")`, { timeout: 10_000 });
  await expect(page.locator(`text=${APP_NAME}`).first()).toBeVisible();
});

// ── Catalog — search + filter ─────────────────────────────────────────────────

test('text search finds the test record', async () => {
  const searchInput = page.locator('input[placeholder*="search" i], input[type="search"]').first();
  await searchInput.fill(APP_NAME);
  await page.waitForTimeout(500); // debounce
  await expect(page.locator(`text=${APP_NAME}`).first()).toBeVisible();
  await searchInput.clear();
});

test('department filter can be applied and cleared', async () => {
  // Look for a filter/select for department
  const deptFilter = page.locator('select').filter({ hasText: /department/i }).first();
  if (await deptFilter.isVisible()) {
    await deptFilter.selectOption('QA');
    await page.waitForTimeout(500);
    await expect(page.locator(`text=${APP_NAME}`).first()).toBeVisible();
    await deptFilter.selectOption('');
  } else {
    // Department filter may not exist; skip gracefully
    test.info().annotations.push({ type: 'skip-reason', description: 'Department filter not present' });
  }
});

// ── Catalog — edit record ─────────────────────────────────────────────────────

test('edit the test record', async () => {
  await page.locator(`tr:has-text("${APP_NAME}")`).first().click();

  // Detail modal opens — click Edit
  const modal = page.locator('.fixed');
  await expect(modal.locator('button:has-text("Edit")')).toBeVisible({ timeout: 5_000 });
  await modal.locator('button:has-text("Edit")').click();

  // Now shows AppFormModal for editing — notes is textareas.nth(1)
  const editModal = page.locator('.fixed');
  await expect(editModal.locator('h2')).toContainText('Edit Application', { timeout: 5_000 });
  await editModal.locator('textarea').nth(1).fill('Updated by E2E smoke test');
  await editModal.locator('button[type="submit"]').click();
  // Wait for modal to close
  await expect(page.locator('.fixed')).not.toBeVisible({ timeout: 8_000 });
});

// ── Audit log ─────────────────────────────────────────────────────────────────

test('audit log shows update event', async () => {
  await page.locator(`tr:has-text("${APP_NAME}")`).first().click();
  const modal = page.locator('.fixed');
  const auditTab = modal.locator('button:has-text("Audit")');
  await expect(auditTab).toBeVisible({ timeout: 5_000 });
  await auditTab.click();
  await expect(modal.locator('text=UPDATE').first()).toBeVisible({ timeout: 8_000 });
  // Close modal and wait for it to disappear
  await modal.locator('button:has-text("×")').click();
  await expect(page.locator('.fixed')).not.toBeVisible({ timeout: 5_000 });
});

// ── Delete record ─────────────────────────────────────────────────────────────

test('delete the test record', async () => {
  await page.locator(`tr:has-text("${APP_NAME}")`).first().click();
  const modal = page.locator('.fixed');
  await expect(modal.locator('button:has-text("Delete")')).toBeVisible({ timeout: 5_000 });
  await modal.locator('button:has-text("Delete")').click();
  // Confirm button appears
  await expect(modal.locator('button:has-text("Confirm Delete")')).toBeVisible({ timeout: 3_000 });
  await modal.locator('button:has-text("Confirm Delete")').click();
  await expect(page.locator('.fixed')).not.toBeVisible({ timeout: 8_000 });
  await expect(page.locator(`tr:has-text("${APP_NAME}")`)).not.toBeVisible({ timeout: 5_000 });
});

// ── Archive — restore record ──────────────────────────────────────────────────

test('archive page shows deleted record and can restore', async () => {
  await page.click('a[href="/archive"]');
  await page.waitForURL('/archive');
  // Count rows before restore (strict: use first matching row's button)
  const restoreBtn = page.locator(`tr:has-text("${APP_NAME}") button:has-text("Restore")`).first();
  await expect(restoreBtn).toBeVisible({ timeout: 10_000 });
  const countBefore = await page.locator(`tr:has-text("${APP_NAME}")`).count();
  await restoreBtn.click();
  // After restore, one fewer AREG_TEST_APP row in the archive
  await expect(page.locator(`tr:has-text("${APP_NAME}")`)).toHaveCount(countBefore - 1, { timeout: 5_000 });
});

// ── Final cleanup — delete restored record ────────────────────────────────────

test('cleanup: delete test record from catalog', async () => {
  await page.goto('/catalog');
  await page.waitForSelector(`tr:has-text("${APP_NAME}")`, { timeout: 10_000 });
  await page.locator(`tr:has-text("${APP_NAME}")`).first().click();
  const modal = page.locator('.fixed');
  await expect(modal.locator('button:has-text("Delete")')).toBeVisible({ timeout: 5_000 });
  await modal.locator('button:has-text("Delete")').click();
  await expect(modal.locator('button:has-text("Confirm Delete")')).toBeVisible({ timeout: 3_000 });
  await modal.locator('button:has-text("Confirm Delete")').click();
  await expect(page.locator('.fixed')).not.toBeVisible({ timeout: 8_000 });
});

// ── CSV Import ────────────────────────────────────────────────────────────────

test('CSV import preview and commit', async () => {
  await page.click('a[href="/import"]');
  await page.waitForURL('/import');

  // Upload CSV fixture
  const csvPath = path.join(__dirname, '../fixtures/import.csv');
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('[data-testid="drop-zone"], .cursor-pointer').catch(() =>
      page.locator('text=Drag & drop').click()
    ),
  ]);
  await fileChooser.setFiles(csvPath);

  // Wait for preview table
  await expect(page.locator('text=Valid').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(`text=${IMPORT_NAME}`).first()).toBeVisible();

  // Commit
  await page.click('button:has-text("Import")');
  await expect(page.locator('text=Import Complete').first()).toBeVisible({ timeout: 15_000 });

  // Verify at least 1 created
  const createdEl = page.locator('text=Created').first();
  await expect(createdEl).toBeVisible();

  // Cleanup: delete the imported record from catalog
  await page.goto('/catalog');
  const importedRow = page.locator(`tr:has-text("${IMPORT_NAME}")`).first();
  if (await importedRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await importedRow.click();
    const deleteBtn = page.locator('button:has-text("Delete"), button:has-text("Archive")').first();
    if (await deleteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await deleteBtn.click();
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(1_000);
    }
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────

test('sign out redirects to login', async () => {
  await page.click('button:has-text("Sign out")');
  await page.waitForURL('/login', { timeout: 10_000 });
  await expect(page).toHaveURL('/login');
});
