import { expect, type Page } from '@playwright/test';

/**
 * The workspace navigation lives in the ☰ menu of the top bar. Opens it when closed and returns
 * the navigation, so a test can click one of its links.
 */
export async function workspaceNavigation(page: Page) {
  const navigation = page.getByRole('navigation', { name: 'Điều hướng không gian' });
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  // A press right after a navigation can land before hydration; retry until the menu is open.
  await expect(async () => {
    if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
    await expect(navigation).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  return navigation;
}

/** A link of the workspace navigation, with the ☰ menu opened for it. */
export async function navLink(page: Page, name: string) {
  return (await workspaceNavigation(page)).getByRole('link', { name, exact: true });
}

/** Closes the ☰ menu again (Escape returns focus to its button). */
export async function closeNavigation(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  if ((await menu.getAttribute('aria-expanded')) === 'true') {
    await menu.focus();
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('navigation', { name: 'Điều hướng không gian' })).toBeHidden();
}
