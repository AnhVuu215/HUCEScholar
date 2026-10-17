import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

test('landing explains access and offers a real login destination', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Học liệu đúng chỗ. Vững nền kiến thức.',
  );
  await expect(page.getByText('Các bìa sách chỉ là minh họa.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tải ứng dụng', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Đăng nhập HUCEScholar', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
});

test('guide switches role by keyboard and explains the current reader honestly', async ({
  page,
}) => {
  await page.goto('/#huong-dan');
  const lecturer = page.getByRole('button', { name: 'Giảng viên', exact: true });
  await lecturer.focus();
  await lecturer.press('Enter');
  await expect(lecturer).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Hướng dẫn Giảng viên' })).toContainText(
    'môn được phân công',
  );
  await page.getByRole('button', { name: 'Sinh viên', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hướng dẫn Sinh viên' })).toContainText(
    'Kho học liệu',
  );
  await page.getByText('Đã đọc và ghi chú trên PDF được chưa?', { exact: true }).click();
  await expect(
    page.getByText('Đã có kho học liệu và trình đọc PDF cho tài khoản được cấp.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('tô sáng đoạn chữ trên PDF có lớp văn bản', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText('Highlight và đọc offline chưa được hỗ trợ.', { exact: false }),
  ).toHaveCount(0);
  await page.getByRole('link', { name: 'Tiến độ dự án', exact: true }).click();
  await expect(page).toHaveURL('/project');
  await expect(page.getByRole('heading', { name: 'Kết nối hệ thống' })).toBeVisible();
});

for (const [device, width, height] of [
  ['desktop', 1440, 1000],
  ['user-1253', 1253, 900],
  ['tablet', 768, 1024],
  ['mobile', 390, 844],
  ['narrow', 320, 800],
] as const) {
  test(`${device}: landing keeps navigation and content inside viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByRole('navigation', { name: 'Điều hướng trang chủ' })
      .getByRole('link', { name: 'Hướng dẫn', exact: true })
      .click();
    await expect(page).toHaveURL(/#huong-dan$/);
    if (process.env.CAPTURE_LANDING_UI === '1') {
      mkdirSync('.impeccable/review/landing', { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `.impeccable/review/landing/${device}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  });
}
