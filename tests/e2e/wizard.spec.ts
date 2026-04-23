import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const ALLOWED_STORAGE_KEYS = new Set(['ckb.devToken', 'ckb.devUser']);

async function assertNoContractDataInStorage(page: import('@playwright/test').Page): Promise<void> {
  const storage = await page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
  }));
  const extraLocal = storage.local.filter((k) => !ALLOWED_STORAGE_KEYS.has(k));
  expect(extraLocal, 'Non-Negotiable #7: no contract data in localStorage').toEqual([]);
  expect(storage.session, 'Non-Negotiable #7: sessionStorage must be empty').toEqual([]);
}

test.describe('Contract creation wizard (NN #7)', () => {
  test('happy path: login → wizard → create → detail page', async ({ page }) => {
    await page.goto('/login');

    await assertNoContractDataInStorage(page);

    await page.getByRole('button', { name: /sign in as this user/i }).first().click();
    await page.waitForURL(/\/contracts(\/|$)/);

    await expect(page).toHaveURL(/\/contracts$/);
    await page.getByRole('link', { name: /new contract/i }).click();
    await page.waitForURL(/\/contracts\/new/);

    // Step 1
    await page.getByLabel(/contract name/i).fill(`E2E Test ${Date.now()}`);
    await page.getByLabel(/^client party/i).selectOption({ index: 1 });
    await page.getByLabel(/responsible pm/i).selectOption({ index: 1 });
    await assertNoContractDataInStorage(page);
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 2
    await page.getByLabel(/start date/i).fill('2026-05-01');
    await page.getByLabel(/governing law/i).selectOption({ value: 'CA-ON' });
    await assertNoContractDataInStorage(page);
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 3
    await assertNoContractDataInStorage(page);
    await page.getByRole('button', { name: /^create contract$/i }).click();

    await page.waitForURL(/\/contracts\/[0-9A-Z]{26}$/);
    await expect(page.getByText(/SUMMARY UNVERIFIED/)).toBeVisible();
    await expect(page.getByText(/Onboarding/)).toBeVisible();

    await assertNoContractDataInStorage(page);
  });

  test('login page passes axe accessibility scan', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
