import { test, expect, Browser, Page } from '@playwright/test';
import * as path from 'path';

const EMAIL    = process.env.AREG_TEST_EMAIL    ?? 'test-admin@areg.local';
const PASSWORD = process.env.AREG_TEST_PASSWORD ?? '';
const APP_NAME = 'AREG_TEST_APP';
const IMPORT_NAME = 'AREG_TEST_IMPORT';

// All tests run serially in a single browser page to preserve login state
test.describe.configure({ mode: 'serial' });

let browser: Browser;
let page: Page;

test.beforeAll(async ({ browser: b }) => {
  if (!PASSWORD) throw new Error('AREG_TEST_PASSWORD env var is required');
  browser = b;
  page = await browser.newPage();
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
  await expect(page.locator('text=Total')).toBeVisible();
  await expect(page.locator('text=Active')).toBeVisible();
  await expect(page.locator('text=Renewal')).toBeVisible();
});

// ── Catalog — add record ──────────────────────────────────────────────────────

test('catalog page loads', async () => {
  await page.click('a[href="/catalog"]');
  await page.waitForURL('/catalog');
  await expect(page.locator('h1, [role="heading"]').filter({ hasText: /catalog/i })).toBeVisible();
});

test('add new application record', async () => {
  // Open the add/new modal
  await page.click('button:has-text("Add"), button:has-text("New")');
  await page.waitForSelector('input[name="name"], input[placeholder*="name" i]');

  await page.fill('input[name="name"], input[placeholder*="name" i]', APP_NAME);
  await page.fill('input[name="description"], input[placeholder*="description" i]', 'E2E smoke test application');
  await page.fill('input[name="vendor"], input[placeholder*="vendor" i]', 'SmokeVendor');
  await page.fill('input[name="itContact"], input[placeholder*="it" i], input[name*="contact" i]', 'smoke@test.local');
  await page.fill('input[name="businessOwner"], input[placeholder*="owner" i]', 'owner@test.local');
  await page.fill('input[name="hoursOfOperation"], input[placeholder*="hours" i]', '9-5 M-F');
  await page.fill('input[name="department"], input[placeholder*="department" i]', 'QA');
  await page.fill('input[type="date"], input[name="renewalDate"]', '2027-06-30');

  await page.click('button[type="submit"]:has-text("Save"), button:has-text("Create"), button:has-text("Add")');
  await page.waitForSelector(`text=${APP_NAME}`, { timeout: 10_000 });
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
  // Click the record row or an edit button
  const row = page.locator(`tr:has-text("${APP_NAME}"), [data-name="${APP_NAME}"]`).first();
  await row.click();

  // Wait for detail panel / edit modal
  const editBtn = page.locator('button:has-text("Edit")').first();
  await editBtn.waitFor({ timeout: 5_000 });
  await editBtn.click();

  const notesInput = page.locator('input[name="notes"], textarea[name="notes"]').first();
  await notesInput.fill('Updated by E2E smoke test');
  await page.click('button[type="submit"]:has-text("Save"), button:has-text("Update")');
  await page.waitForTimeout(1_000);
});

// ── Audit log ─────────────────────────────────────────────────────────────────

test('audit log shows update event', async () => {
  // Open the record and look for audit tab / button
  const row = page.locator(`tr:has-text("${APP_NAME}"), [data-name="${APP_NAME}"]`).first();
  await row.click();
  const auditBtn = page.locator('button:has-text("Audit"), button:has-text("History")').first();
  if (await auditBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await auditBtn.click();
    await expect(page.locator('text=update').first()).toBeVisible({ timeout: 5_000 });
  } else {
    test.info().annotations.push({ type: 'skip-reason', description: 'Audit button not found in detail panel' });
  }
});

// ── Delete record ─────────────────────────────────────────────────────────────

test('delete the test record', async () => {
  await page.goto('/catalog');
  await page.waitForSelector(`text=${APP_NAME}`, { timeout: 10_000 });

  const row = page.locator(`tr:has-text("${APP_NAME}"), [data-name="${APP_NAME}"]`).first();
  await row.click();

  const deleteBtn = page.locator('button:has-text("Delete"), button:has-text("Archive")').first();
  await deleteBtn.waitFor({ timeout: 5_000 });
  await deleteBtn.click();

  // Confirm dialog if present
  const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
  if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  await page.waitForTimeout(1_500);
  await expect(page.locator(`text=${APP_NAME}`).first()).not.toBeVisible({ timeout: 5_000 });
});

// ── Archive — restore record ──────────────────────────────────────────────────

test('archive page shows deleted record and can restore', async () => {
  await page.click('a[href="/archive"]');
  await page.waitForURL('/archive');
  await expect(page.locator(`text=${APP_NAME}`).first()).toBeVisible({ timeout: 10_000 });

  const row = page.locator(`tr:has-text("${APP_NAME}"), [data-name="${APP_NAME}"]`).first();
  await row.click();

  const restoreBtn = page.locator('button:has-text("Restore")').first();
  await restoreBtn.waitFor({ timeout: 5_000 });
  await restoreBtn.click();

  await page.waitForTimeout(1_500);
  // Record should leave archive view
  await expect(page.locator(`text=${APP_NAME}`).first()).not.toBeVisible({ timeout: 5_000 });
});

// ── Final cleanup — delete restored record permanently ────────────────────────

test('cleanup: delete test record from catalog', async () => {
  await page.goto('/catalog');
  await page.waitForSelector(`text=${APP_NAME}`, { timeout: 10_000 });

  const row = page.locator(`tr:has-text("${APP_NAME}"), [data-name="${APP_NAME}"]`).first();
  await row.click();

  const deleteBtn = page.locator('button:has-text("Delete"), button:has-text("Archive")').first();
  await deleteBtn.waitFor({ timeout: 5_000 });
  await deleteBtn.click();

  const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes"), button:has-text("Delete")').last();
  if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await confirmBtn.click();
  }

  await page.waitForTimeout(1_500);
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
