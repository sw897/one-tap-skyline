import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const baseURL = process.env.SKYLINE_BASE_URL || 'http://localhost:5173/';
const repoRoot = process.cwd();
const evidenceDir = path.resolve(process.env.SKYLINE_EVIDENCE_DIR || path.join(os.tmpdir(), 'one-tap-skyline-evidence', new Date().toISOString().replaceAll(':', '-')));
if (evidenceDir === repoRoot || evidenceDir.startsWith(repoRoot + path.sep)) throw new Error('Raw evidence must be outside the repository');
await mkdir(evidenceDir, { recursive: true });
const smoke = process.argv.includes('--smoke');
const testConfig = { cityDisplayName: '城市天际线', game: { roundSeconds: 180, baseSpeed: 3.2, speedStep: 0, perfectRatio: 0.12, comboMilestone: 3, dropSeconds: 0.12 }, visual: { cameraSeconds: 0.4, growthSeconds: 0.85, maxPixelRatio: 1.5 } };
const report = { timestamp: new Date().toISOString(), clientTimezone: 'Asia/Shanghai', scope: smoke ? 'visual smoke' : 'real running application automation', physicalPhoneTest: 'not executed', baseURL, testConfig, checks: [], errors: [], screenshots: [], passed: false };
const browser = await chromium.launch({ headless: true, channel: process.env.SKYLINE_BROWSER_CHANNEL || 'chrome' });
report.browserVersion = browser.version();
const contexts = [];
const snap = page => page.evaluate(() => window.__SKYLINE_QA__.snapshot());
const record = (name, detail) => { report.checks.push({ name, passed: true, ...detail }); console.log(`PASS ${name}`); };
const screenshot = async (page, name) => { await page.screenshot({ path: path.join(evidenceDir, name), fullPage: true }); report.screenshots.push(name); };
async function setup(mobile, recordVideo = false) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, ...(recordVideo ? { recordVideo: { dir: path.join(evidenceDir, 'videos'), size: { width: 1440, height: 900 } } } : {}) });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await context.route('**/runtime-config.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(testConfig) }));
  await page.goto(new URL('?qa=1', baseURL).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__SKYLINE_QA__);
  return { context, page };
}
async function tap(page, selector, mobile) { if (mobile) await page.locator(selector).tap(); else await page.locator(selector).click(); }
async function buildFloors(page, target, mobile, repeated = false) {
  for (let i = 0; i < target; i++) {
    await page.waitForFunction(() => {
      const g = window.__SKYLINE_QA__.snapshot().game;
      const top = g.tower.layers.at(-1) || { x: 0, z: 0, width: g.tower.baseWidth, depth: g.tower.depth };
      const size = g.activeAxis === 'x' ? top.width : top.depth;
      return g.phase === 'moving' && Math.abs(g.movingPosition - top[g.activeAxis]) < size * 0.055;
    }, null, { polling: 'raf', timeout: 12000 });
    if (repeated && i === 0 && !mobile) {
      const box = await page.locator('#drop-button').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { clickCount: 3, delay: 0 });
    } else await tap(page, '#drop-button', mobile);
    await page.waitForFunction(n => window.__SKYLINE_QA__.snapshot().game.tower.layers.length === n, i + 1, { timeout: 3500 });
    assert.equal((await snap(page)).game.tower.layers.length, i + 1);
  }
}
async function endByMiss(page, mobile) {
  const canvas = await page.locator('#viewport canvas').boundingBox();
  await page.waitForFunction(() => {
    const g = window.__SKYLINE_QA__.snapshot().game;
    const top = g.tower.layers.at(-1) || { x: 0, z: 0, width: g.tower.baseWidth, depth: g.tower.depth };
    const size = g.activeAxis === 'x' ? top.width : top.depth;
    return g.phase === 'moving' && Math.abs(g.movingPosition - top[g.activeAxis]) > size + 0.35;
  }, null, { polling: 'raf', timeout: 12000 });
  // Direct trusted input on the canvas avoids locator auto-wait delaying a moving target.
  if (mobile) await page.touchscreen.tap(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.6);
  else await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.6);
  await page.locator('[data-screen=result]').waitFor({ state: 'visible' });
  await page.waitForTimeout(1100);
}

try {
  const desktop = await setup(false, !smoke);
  await desktop.page.waitForTimeout(1200);
  await screenshot(desktop.page, 'p2-intro-desktop.png');
  if (smoke) {
    await desktop.page.locator('#overview-button').click();
    await desktop.page.waitForTimeout(1600);
    await screenshot(desktop.page, 'p2-city-smoke-desktop.png');
    const mobile = await setup(true);
    await mobile.page.waitForTimeout(1500);
    await screenshot(mobile.page, 'p2-intro-mobile.png');
    await mobile.page.locator('#start-button').tap();
    await mobile.page.waitForTimeout(1600);
    await screenshot(mobile.page, 'p2-game-smoke-mobile.png');
    record('desktop and mobile initial rendering', {});
  } else {
    const page = desktop.page;
    await page.locator('#start-button').click();
    await buildFloors(page, 12, false, true);
    record('mouse gameplay and rapid repeated clicks', { floors: 12 });
    await screenshot(page, 'p2-game-desktop.png');
    await endByMiss(page, false);
    assert.equal((await snap(page)).completed.tower.layers.length, 12);
    await screenshot(page, 'p2-result-desktop.png');
    await page.locator('#signature').fill('试玩小楼'); await page.locator('#skip-sticker').click();
    assert.equal((await snap(page)).stickerSkipped, true);
    await page.locator('#submit-button').click(); await page.waitForTimeout(1500);
    const first = await snap(page);
    assert.deepEqual(first.own.tower, first.completed.tower);
    assert.ok(Math.abs(first.rendered.displayedHeight - first.rendered.logicalHeight) < 1e-6);
    assert.equal(await page.locator('#city-event').getAttribute('data-kind'), 'first');
    await screenshot(page, 'p2-city-first.png'); record('first simulated entry uses completed geometry', { own: first.own, rendered: first.rendered });
    await page.waitForTimeout(1500);
    await page.locator('#city-play').click(); await buildFloors(page, 9, false); await endByMiss(page, false);
    await page.locator('#signature').fill('不应替换署名'); await page.locator('#submit-button').click(); await page.waitForTimeout(1500);
    const unchanged = await snap(page);
    assert.deepEqual(unchanged.own, first.own); assert.deepEqual(unchanged.rendered, first.rendered);
    assert.equal(await page.locator('#city-event').getAttribute('data-kind'), 'unchanged');
    await screenshot(page, 'p2-city-unchanged.png'); record('non-record leaves complete building unchanged', { floors: 9 });
    await page.waitForTimeout(1500);
    await page.locator('#city-play').click(); await buildFloors(page, 16, false); await endByMiss(page, false);
    await page.locator('#submit-button').click();
    const growthStart = await snap(page);
    assert.ok(growthStart.rendered.displayedHeight < growthStart.rendered.logicalHeight);
    await page.waitForTimeout(1800);
    const best = await snap(page);
    for (const key of ['playerId', 'plotId', 'color', 'name']) assert.equal(best.own[key], first.own[key]);
    assert.deepEqual(best.own.tower, best.completed.tower);
    assert.deepEqual(best.rendered.plotPosition, first.rendered.plotPosition);
    assert.ok(Math.abs(best.rendered.displayedHeight - best.rendered.logicalHeight) < 1e-6);
    assert.equal(best.own.tower.layers.length, 16);
    assert.equal(await page.locator('#city-event').getAttribute('data-kind'), 'best');
    await screenshot(page, 'p2-city-best.png'); record('new best grows in place 12→16 without identity drift', { growthStart: growthStart.rendered, final: best.rendered });
    await page.waitForTimeout(2200);
    const video = page.video(); await desktop.context.close(); contexts.splice(contexts.indexOf(desktop.context), 1);
    if (video) { const videoPath = await video.path(); await copyFile(videoPath, path.join(evidenceDir, 'p2-first-unchanged-best.webm')); report.video = 'p2-first-unchanged-best.webm'; }

    const mobile = await setup(true), phone = mobile.page;
    await screenshot(phone, 'p2-intro-mobile.png');
    await phone.locator('#start-button').tap(); await buildFloors(phone, 6, true);
    await screenshot(phone, 'p2-game-mobile.png');
    await phone.locator('#pause-button').tap(); const paused = await snap(phone);
    await phone.waitForTimeout(700); assert.equal((await snap(phone)).game.elapsed, paused.game.elapsed);
    await phone.setViewportSize({ width: 844, height: 390 });
    await phone.waitForTimeout(800);
    assert.equal((await snap(phone)).game.tower.layers.length, 6);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await phone.locator('#resume-button').tap(); await phone.waitForTimeout(200);
    await screenshot(phone, 'p2-game-landscape.png');
    await phone.setViewportSize({ width: 390, height: 844 }); await phone.waitForTimeout(800);
    await endByMiss(phone, true); await screenshot(phone, 'p2-result-mobile.png');
    const result = await snap(phone); assert.equal(result.completed.tower.layers.length, 6);
    await phone.locator('#signature').fill('触摸试玩'); await phone.locator('#submit-button').tap(); await phone.waitForTimeout(1600);
    await screenshot(phone, 'p2-city-mobile.png');
    const phoneCity = await snap(phone); assert.deepEqual(phoneCity.own.tower, result.completed.tower);
    record('mobile-emulated touch / pause / orientation / same-model result and city', { viewport: '390x844 / 844x390', floors: 6 });
    await phone.reload({ waitUntil: 'networkidle' }); assert.equal((await snap(phone)).own, undefined);
    record('refresh resets memory simulation honestly', {});
    await mobile.context.unroute('**/runtime-config.json');
    await mobile.context.route('**/runtime-config.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ cityDisplayName: '活动体验城' }) }));
    await phone.goto(new URL('?qa=1&view=city', baseURL).href, { waitUntil: 'networkidle' });
    assert.equal(await phone.locator('#city-name').textContent(), '活动体验城');
    await mobile.context.unroute('**/runtime-config.json');
    await mobile.context.route('**/runtime-config.json', route => route.fulfill({ status: 503, body: '{}' }));
    await phone.reload({ waitUntil: 'networkidle' }); assert.equal(await phone.locator('#city-name').textContent(), '城市天际线');
    record('runtime activity override and unavailable-config neutral fallback', {});
    report.errors = report.errors.filter(message => !message.includes('503 (Service Unavailable)'));
  }
  assert.deepEqual(report.errors, []);
  report.passed = true;
} catch (error) {
  report.failure = error.stack || String(error); console.error(report.failure);
  const active = contexts.at(-1)?.pages().at(-1);
  if (active) { await screenshot(active, 'failure-state.png').catch(() => {}); report.failureSnapshot = await snap(active).catch(() => null); }
  process.exitCode = 1;
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await writeFile(path.join(evidenceDir, smoke ? 'visual-smoke-results.json' : 'browser-tests-results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, errors: report.errors, evidenceDir, video: report.video || null }));
}
