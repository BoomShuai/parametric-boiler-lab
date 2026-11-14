import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('real WebGL rendering, all modes, reset, export and responsive layout', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const unexpected = [];
  page.on('request', request => {
    if (request.url().startsWith('http') && !request.url().startsWith('http://127.0.0.1:8771/')) unexpected.push(request.url());
  });
  await page.goto('/');
  await expect(page.locator('#scene')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('heading', {level: 1})).toHaveText('参数化锅炉实验室');
  await expect(page.locator('#max-actual')).not.toHaveText('—');
  const baseline = await page.locator('#baseline-hash').textContent();
  const firstActual = await page.locator('#max-actual').textContent();
  const firstDisplayed = await page.locator('#max-display').textContent();
  await page.locator('#visualScale').fill('30');
  await page.locator('#visualScale').dispatchEvent('input');
  await expect(page.locator('#max-display')).not.toHaveText(firstDisplayed);
  await expect(page.locator('#max-actual')).toHaveText(firstActual);
  await page.getByRole('button', {name: '复位几何', exact: true}).click();
  await expect(page.locator('#current-hash')).toHaveText(baseline);
  await expect(page.locator('#residual')).toHaveText('0.000000 mm');
  for (const mode of ['thermal','pressure','sag','combined']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await expect(page.locator('#current-hash')).not.toHaveText(baseline);
  }
  await page.getByText('02 / 修改虚构几何参数', {exact: true}).click();
  await page.locator('#height').fill('64');
  await page.getByRole('button', {name: '从参数重新生成'}).click();
  await expect(page.locator('#original-box')).toHaveText('24.000 × 20.000 × 64.000 m');
  await page.getByText('03 / 导入与导出', {exact: true}).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#export-parameters').click()]);
  const parameters = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(parameters.geometry.height).toBe(64);
  const [glb] = await Promise.all([page.waitForEvent('download'), page.locator('#export-glb').click()]);
  const bytes = await readFile(await glb.path());
  expect(bytes.subarray(0, 4).toString()).toBe('glTF');
  await page.getByRole('button', {name: '数据与方法 ↗'}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({path: 'test-results/desktop.png', fullPage: true});
  await page.setViewportSize({width: 390, height: 844});
  await expect(page.locator('#scene canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path: 'test-results/mobile.png', fullPage: true});
  expect(errors).toEqual([]);
  expect(unexpected).toEqual([]);
});

test('invalid imported parameters are rejected without changing geometry', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#scene')).toHaveAttribute('data-ready', 'true');
  const before = await page.locator('#baseline-hash').textContent();
  await page.locator('#import-file').setInputFiles({name: 'invalid.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({schema: 1, geometry: {height: 9999}, deformation: {}}))});
  await expect(page.locator('#notice')).toContainText('导入失败');
  await expect(page.locator('#baseline-hash')).toHaveText(before);
});
