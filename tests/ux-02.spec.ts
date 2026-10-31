import { expect, test } from './helpers/test';
import type { Dialog, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { openReaderFixture, readerHeaders, readerLogin } from './helpers/reader-session';

/** Counts confirm prompts and answers each one with `accept`. */
function answerPrompts(page: Page, accept: boolean) {
  const seen: string[] = [];
  const answer = async (dialog: Dialog) => {
    seen.push(dialog.message());
    await (accept ? dialog.accept() : dialog.dismiss());
  };
  page.on('dialog', answer);
  return { seen, stop: () => page.off('dialog', answer) };
}

function workspaceLink(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Điều hướng không gian' })
    .getByRole('link', { name, exact: true });
}

test('an unsaved review card asks before leaving the reader or the deck', async ({ page }) => {
  test.setTimeout(90_000);
  // Unique per run: the ux02 account keeps cards from earlier runs.
  const question = `Câu hỏi chưa lưu ${randomUUID().slice(0, 8)}`;
  const fixture = await openReaderFixture(page, 'ux02');
  const created = await page.request.post(`${fixture.path}/highlights`, {
    headers: await readerHeaders(page),
    data: {
      pageNumber: 1,
      content: '',
      color: '#FFF59D',
      requestId: randomUUID(),
      anchor: {
        coordinateSpace: 'normalized-pdf-v1',
        quote: 'HUCEScholar reader fixture',
        quads: [[0.08, 0.9, 0.5, 0.9, 0.5, 0.88, 0.08, 0.88]],
      },
    },
  });
  expect(created.status()).toBe(201);
  const highlight = (await created.json()).item;
  await page.reload();
  await page.getByRole('tab', { name: 'Đoạn tô', exact: true }).click();
  const row = page.getByRole('article', { name: `Vùng tô ${highlight.id}`, exact: true });
  await row.getByRole('button', { name: 'Tạo thẻ ôn tập', exact: true }).click();
  const form = row.getByRole('form', { name: 'Tạo thẻ ôn tập' });

  // An opened but empty form is not a draft: leaving does not ask.
  const quiet = answerPrompts(page, false);
  await workspaceLink(page, 'Kho học liệu').click();
  await expect(page).toHaveURL(/\/workspace\/library$/);
  expect(quiet.seen).toEqual([]);
  quiet.stop();

  await page.goBack();
  await page.getByRole('tab', { name: 'Đoạn tô', exact: true }).click();
  await row.getByRole('button', { name: 'Tạo thẻ ôn tập', exact: true }).click();
  await form.getByLabel('Câu hỏi', { exact: true }).fill(question);
  const stay = answerPrompts(page, false);
  await workspaceLink(page, 'Kho học liệu').click();
  expect(stay.seen).toEqual(['Bạn có thẻ ôn tập chưa lưu. Rời trang và bỏ thay đổi?']);
  stay.stop();
  await expect(page).toHaveURL(new RegExp(`${fixture.route}`));
  await expect(form.getByLabel('Câu hỏi', { exact: true })).toHaveValue(question);

  // Saving clears the draft, so the link to the deck leaves without a prompt.
  await form.getByLabel('Đáp án', { exact: true }).fill('Đáp án đã lưu');
  await form.getByRole('button', { name: 'Lưu thẻ', exact: true }).click();
  await expect(row.getByRole('status')).toContainText('Đã tạo thẻ.');
  const saved = answerPrompts(page, false);
  await row.getByRole('link', { name: 'Xem thẻ ôn tập', exact: true }).click();
  await expect(page).toHaveURL('/workspace/study');
  expect(saved.seen).toEqual([]);
  saved.stop();

  // Editing the card on the deck guards the same way.
  const card = page.getByRole('article', { name: question });
  await card.getByRole('button', { name: 'Sửa thẻ', exact: true }).click();
  await card.getByLabel('Đáp án', { exact: true }).fill('Đáp án đang sửa');
  const keep = answerPrompts(page, false);
  await workspaceLink(page, 'Kho học liệu').click();
  expect(keep.seen).toEqual(['Bạn có thay đổi thẻ ôn tập chưa lưu. Rời trang và bỏ thay đổi?']);
  keep.stop();
  await expect(page).toHaveURL('/workspace/study');
  await expect(card.getByLabel('Đáp án', { exact: true })).toHaveValue('Đáp án đang sửa');

  const leave = answerPrompts(page, true);
  await workspaceLink(page, 'Kho học liệu').click();
  await expect(page).toHaveURL(/\/workspace\/library$/);
  expect(leave.seen).toHaveLength(1);
  leave.stop();
});

test('scheduling a reading session asks before leaving once a field changed', async ({ page }) => {
  test.setTimeout(90_000);
  await openReaderFixture(page, 'ux02');
  await page.getByRole('button', { name: 'Lên lịch đọc', exact: true }).click();
  const schedule = page.getByRole('form', { name: 'Lên lịch đọc' });
  await schedule.getByLabel('Giờ bắt đầu', { exact: true }).fill('07:30');
  const stay = answerPrompts(page, false);
  await workspaceLink(page, 'Lịch học').click();
  expect(stay.seen).toEqual(['Bạn có buổi đọc chưa thêm vào lịch. Rời trang và bỏ thay đổi?']);
  stay.stop();
  await expect(schedule.getByLabel('Giờ bắt đầu', { exact: true })).toHaveValue('07:30');

  // Cancelling the form drops the draft, so leaving afterwards is silent.
  await schedule.getByRole('button', { name: 'Hủy', exact: true }).click();
  const quiet = answerPrompts(page, false);
  await workspaceLink(page, 'Lịch học').click();
  await expect(page).toHaveURL('/workspace/calendar');
  expect(quiet.seen).toEqual([]);
  quiet.stop();
});

test('the calendar editor asks before leaving or replacing an edited form', async ({ page }) => {
  test.setTimeout(90_000);
  const run = randomUUID().slice(0, 8);
  await readerLogin(page, 'student', 'ux02');
  await page.goto('/workspace/calendar');
  await expect(page.getByRole('button', { name: 'Thêm lịch học', exact: true })).toBeVisible();

  // A fresh form that nobody typed in can be replaced or left without a prompt.
  const quiet = answerPrompts(page, false);
  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Thêm lịch học' });
  await expect(editor.getByLabel('Tiêu đề', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  await expect(editor.getByLabel('Tiêu đề', { exact: true })).toBeFocused();
  expect(quiet.seen).toEqual([]);
  quiet.stop();

  await editor.getByLabel('Tiêu đề', { exact: true }).fill(`Buổi chưa lưu ${run}`);
  const message = 'Bạn có mục lịch chưa lưu. Rời trang và bỏ thay đổi?';
  const keep = answerPrompts(page, false);
  // Opening another new item would remount the form and drop the title.
  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  await expect(editor.getByLabel('Tiêu đề', { exact: true })).toHaveValue(`Buổi chưa lưu ${run}`);
  await workspaceLink(page, 'Kho học liệu').click();
  await expect(page).toHaveURL('/workspace/calendar');
  await expect(editor.getByLabel('Tiêu đề', { exact: true })).toHaveValue(`Buổi chưa lưu ${run}`);
  expect(keep.seen).toEqual([message, message]);
  keep.stop();

  // Accepting the replacement starts a clean form.
  const replace = answerPrompts(page, true);
  await page.getByRole('button', { name: 'Thêm lịch học', exact: true }).click();
  await expect(editor.getByLabel('Tiêu đề', { exact: true })).toHaveValue('');
  expect(replace.seen).toEqual([message]);
  replace.stop();

  // Hủy is an explicit discard; afterwards leaving is silent.
  await editor.getByLabel('Tiêu đề', { exact: true }).fill(`Bỏ đi ${run}`);
  await editor.getByRole('button', { name: 'Hủy', exact: true }).click();
  const gone = answerPrompts(page, false);
  await workspaceLink(page, 'Kho học liệu').click();
  await expect(page).toHaveURL(/\/workspace\/library$/);
  expect(gone.seen).toEqual([]);
  gone.stop();
});
