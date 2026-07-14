import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function waitForStableRendering(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  });
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const accessibility = await new AxeBuilder({ page }).analyze();
  const seriousViolations = accessibility.violations.filter((violation) => (
    violation.impact === 'serious' || violation.impact === 'critical'
  ));
  expect(seriousViolations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('完成抽取、双语切换并在刷新后保留状态', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page).toHaveTitle('Cold Call Roulette');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  const spinButton = page.getByRole('button', { name: 'SPIN' });
  await expect(spinButton).toBeVisible();
  await spinButton.click();
  await expect(page.getByText('RESPONDER LOCKED').first()).toBeVisible();
  await expect(page.locator('.history-block li')).toHaveCount(1);

  await page.getByRole('button', { name: '切换到中文' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByText('本轮回答者')).toBeVisible();

  const settledTransform = await page.locator('.wheel-disc').evaluate((element) => element.getAttribute('style'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.history-block li')).toHaveCount(1);
  await expect(page.locator('.wheel-disc')).toHaveAttribute('style', settledTransform ?? '');
  expect(errors).toEqual([]);
});

test('旋转中刷新不会扣除参与者或写入残缺历史', async ({ page }) => {
  // 此用例必须在真实动画窗口内刷新，避免全局减少动画设置把竞态压缩到单帧。
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const deckBefore = await page.evaluate(() => JSON.parse(
    window.localStorage.getItem('cold-call-roulette:v1:participant-deck') ?? '[]',
  ) as string[]);

  await page.getByRole('button', { name: 'SPIN' }).click();
  await expect(page.getByRole('button', { name: 'LOCKING IN' })).toBeDisabled();
  await page.reload();

  const persisted = await page.evaluate(() => ({
    deck: JSON.parse(window.localStorage.getItem('cold-call-roulette:v1:participant-deck') ?? '[]') as string[],
    history: JSON.parse(window.localStorage.getItem('cold-call-roulette:v1:history') ?? '[]') as unknown[],
  }));
  expect(persisted.deck).toEqual(deckBefore);
  expect(persisted.history).toEqual([]);
});

test('损坏或越界的本地数据不会让页面白屏', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem('cold-call-roulette:v1:participants', '{broken-json');
    window.localStorage.setItem('cold-call-roulette:v1:history', JSON.stringify([{
      id: 'bad-record',
      participantId: 'participant-01',
      participantName: 'Maya Chen',
      questionId: 'question-01',
      questionZh: '问题',
      questionEn: 'Question',
      createdAt: 1e20,
    }]));
  });
  await page.reload();

  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.getByRole('button', { name: 'SPIN' })).toBeVisible();
  await expect(page.locator('.history-block li')).toHaveCount(0);
});

test('编辑名单与问题、保留重名并阻止连续点击重复抽取', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'OPEN SETTINGS' }).first().click();
  await expect(page.locator('.editor-dialog')).toHaveCSS('opacity', '1');
  await waitForStableRendering(page);
  await page.screenshot({ path: testInfo.outputPath('editor.png'), fullPage: true });

  const roster = page.getByRole('textbox', { name: 'ROSTER', exact: true });
  const questionBank = page.getByRole('textbox', { name: 'BILINGUAL QUESTION BANK', exact: true });
  await roster.fill('林晓\n林晓\nMaya Chen');
  await questionBank.fill('为什么？ | Why?\n下一步是什么？ | What comes next?');
  await page.getByRole('button', { name: 'SAVE AND START A NEW ROUND' }).click();

  const storedParticipants = await page.evaluate(() => {
    const raw = window.localStorage.getItem('cold-call-roulette:v1:participants');
    return raw ? JSON.parse(raw) as Array<{ id: string; name: string }> : [];
  });
  expect(storedParticipants.map((item) => item.name)).toEqual(['林晓', '林晓', 'Maya Chen']);
  expect(new Set(storedParticipants.map((item) => item.id)).size).toBe(3);

  const spinButton = page.getByRole('button', { name: 'SPIN' });
  await spinButton.evaluate((button) => {
    button.click();
    button.click();
    button.click();
  });
  await expect(page.locator('.history-block li')).toHaveCount(1);

  await page.getByRole('button', { name: 'UNDO LAST DRAW' }).click();
  await expect(page.locator('.history-block li')).toHaveCount(0);
});

test('窄屏设置弹窗无溢出、限制焦点并在关闭后恢复触发点', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');

  const opener = page.getByRole('button', { name: 'OPEN SETTINGS' }).first();
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'SET UP THIS CLASS' });
  const closeButton = page.getByRole('button', { name: 'CLOSE SETTINGS' });
  const restoreButton = page.getByRole('button', { name: 'RESTORE DEMO DATA' });
  const saveButton = page.getByRole('button', { name: 'SAVE AND START A NEW ROUND' });

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(page.getByRole('textbox', { name: 'ROSTER', exact: true })).toBeFocused();
  expect(await page.locator('.console-header').evaluate((element) => (element as HTMLElement).inert)).toBe(true);

  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth > document.documentElement.clientWidth
    || document.querySelector('.editor-dialog')!.scrollWidth > document.querySelector('.editor-dialog')!.clientWidth
  ));
  expect(overflow).toBe(false);

  const restoreBox = await restoreButton.boundingBox();
  const saveBox = await saveButton.boundingBox();
  expect(restoreBox).not.toBeNull();
  expect(saveBox).not.toBeNull();
  expect(saveBox!.y).toBeGreaterThanOrEqual(restoreBox!.y + restoreBox!.height);
  expect(restoreBox!.x).toBeGreaterThanOrEqual(0);
  expect(saveBox!.x + saveBox!.width).toBeLessThanOrEqual(320);
  expect(Math.abs(restoreBox!.width - saveBox!.width)).toBeLessThanOrEqual(1);

  await expectNoSeriousAccessibilityViolations(page);
  await closeButton.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(saveButton).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(closeButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('移动抽取后先显示完整回答者，再显示问题', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'SPIN' }).click();
  await expect(page.getByText('RESPONDER LOCKED').first()).toBeVisible();

  const resultBlock = page.locator('.result-block');
  const questionBlock = page.locator('.question-block');
  const name = resultBlock.locator('strong');
  const resultBox = await resultBlock.boundingBox();
  const questionBox = await questionBlock.boundingBox();
  const nameBox = await name.boundingBox();

  expect(resultBox).not.toBeNull();
  expect(questionBox).not.toBeNull();
  expect(nameBox).not.toBeNull();
  expect(resultBox!.y).toBeLessThan(questionBox!.y);
  expect(nameBox!.y).toBeGreaterThanOrEqual(0);
  expect(nameBox!.y + nameBox!.height).toBeLessThanOrEqual(844);

  await page.getByRole('button', { name: 'OPEN SETTINGS' }).first().click();
  await page.getByRole('textbox', { name: 'ROSTER', exact: true })
    .fill('Dr. Alexandra Catherine Montgomery-Smythe the Third');
  await page.getByRole('button', { name: 'SAVE AND START A NEW ROUND' }).click();
  await page.getByRole('button', { name: 'SPIN' }).click();
  const longName = page.locator('.result-block strong');
  await expect(longName).toHaveText('Dr. Alexandra Catherine Montgomery-Smythe the Third');
  await expect(longName).not.toHaveCSS('white-space', 'nowrap');
  const longNameHeight = await longName.evaluate((element) => element.getBoundingClientRect().height);
  expect(longNameHeight).toBeGreaterThan(28);
});

test('桌面与移动视口无横向溢出，关键无障碍规则通过', async ({ page }, testInfo) => {
  const failedRequests: string[] = [];
  page.on('requestfailed', (request) => failedRequests.push(request.url()));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.wheel-assembly')).toBeVisible();

  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(desktopOverflow).toBe(false);
  await waitForStableRendering(page);
  await page.screenshot({ path: testInfo.outputPath('desktop.png'), fullPage: true });

  await expectNoSeriousAccessibilityViolations(page);

  await page.getByRole('button', { name: 'SPIN' }).click();
  await expect(page.getByText('RESPONDER LOCKED').first()).toBeVisible();
  await expect(page.locator('.result-block strong')).not.toHaveText('••••••');
  await expect(page.locator('.question-block p')).not.toHaveText('LOCKING IN');
  await waitForStableRendering(page);
  await page.screenshot({ path: testInfo.outputPath('selected-dark.png'), fullPage: true });

  await page.getByRole('button', { name: 'SWITCH COLOR THEME' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await waitForStableRendering(page);
  await page.screenshot({ path: testInfo.outputPath('selected-light.png'), fullPage: true });
  await page.getByRole('button', { name: 'SWITCH COLOR THEME' }).click();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.reload();
  await expect(page.getByRole('button', { name: 'UNDO LAST DRAW' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'RESET ROUND' })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(mobileOverflow).toBe(false);
  await expect(page.getByRole('button', { name: 'SPIN' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'SWITCH COLOR THEME' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'TURN SOUND ON' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'UNDO LAST DRAW' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'RESET ROUND' })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  await waitForStableRendering(page);
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
  expect(failedRequests).toEqual([]);
});
