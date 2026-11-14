// 実ブラウザ(Chrome 157+)で three.js 試作を検証する E2E。
// 使い方: サーバー起動中に `node scripts/verify.ts [URL] [出力ディレクトリ]`
// Chrome の場所: 環境変数 CHROME_PATH → Playwright のキャッシュ → channel 'chrome' の順で探す。
import { chromium, type Page } from 'playwright-core';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5199/';
const outDir = process.argv[3] ?? 'verify-shots';

function findChrome(): string | undefined {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cache = join(homedir(), '.cache/ms-playwright');
  if (existsSync(cache)) {
    for (const name of readdirSync(cache).sort().reverse()) {
      const p = join(cache, name, 'chrome-linux64/chrome');
      if (name.startsWith('chromium-') && existsSync(p)) return p;
    }
  }
  return undefined;
}

const exe = findChrome();
const browser = await chromium.launch({
  ...(exe ? { executablePath: exe } : { channel: 'chrome' }),
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const log = (k: string, v: unknown): void => console.log(`${k}:`, typeof v === 'string' ? v : JSON.stringify(v));
let failures = 0;
const check = (name: string, ok: boolean, detail: unknown): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  if (!ok) failures++;
};

log('chrome', exe ?? '(channel: chrome)');
log('support', await page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2')!;
  return {
    ua: navigator.userAgent,
    // Chrome 157 では旧名 texElementImage2D は削除済み → three r187 の HTMLTexture は転送できない
    texElementImage2D: 'texElementImage2D' in gl,
    texElementSubImage2D: 'texElementSubImage2D' in gl,
    content: 'content' in c,
    requestPaint: 'requestPaint' in c,
  };
}));

await page.goto(url);
await page.waitForFunction(() => '__demo' in window);
const demo = (fn: string): Promise<unknown> => page.evaluate(`(async()=>{const d=window.__demo;${fn}})()`);

// ---- 初期画面 ----
await demo(`await d.nextFrames(12);`);
log('labels(initial)', await demo(`return d.labels()`));
await page.screenshot({ path: `${outDir}/01-initial.png` });

// ラベル中心の elementFromPoint（ヒットテスト登録が効いているか）
async function center(page: Page, sel: string): Promise<{ x: number; y: number }> {
  return page.evaluate((s) => {
    const el = document.querySelector(s)!;
    const t = el.closest('.tag') as HTMLElement;
    const id = t.id.replace('tag-', '');
    const l = (window as any).__demo.labels().find((x: any) => x.id === id);
    const cv = document.querySelector('#gl')!.getBoundingClientRect();
    const e = el as HTMLElement;
    const cx = e === t ? t.offsetWidth / 2 : e.offsetLeft + e.offsetWidth / 2;
    const cy = e === t ? t.offsetHeight / 2 : e.offsetTop + e.offsetHeight / 2;
    return { x: cv.left + l.left + cx * l.scale, y: cv.top + l.top + cy * l.scale };
  }, sel);
}

const tagCenter = await center(page, '#tag-roomA');
log('elementFromPoint(roomA center)', await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  return el ? `${el.tagName}#${el.id || ''}.${el.className}` : null;
}, tagCenter));

// ---- hover / click（実マウス） ----
const btn = await center(page, '#tag-roomA button');
await page.mouse.move(btn.x, btn.y);
await page.waitForTimeout(300);
check('hover roomA button :hover', await page.evaluate(() => document.querySelector('#tag-roomA button')!.matches(':hover')), '');
await page.mouse.click(btn.x, btn.y);
await page.waitForTimeout(200);
check('click roomA 詳細', (await page.evaluate(() => document.querySelector('#tag-roomA .clicks')!.textContent)) === '1', await page.evaluate(() => document.querySelector('#tag-roomA .clicks')!.textContent));

// ---- 反対側の視点（A 側のタグが壁の裏になる） ----
await demo(`d.setView({yaw: -1.15}); await d.nextFrames(10);`);
log('labels(flipped)', await demo(`return d.labels()`));
await page.screenshot({ path: `${outDir}/02-flipped.png` });

// ---- メモ入力（FCU-12 は B 側。反転視点では手前） ----
const memo = await center(page, '#tag-fcu12 input');
await page.mouse.click(memo.x, memo.y);
await page.keyboard.type('テスト入力');
await page.waitForTimeout(200);
const memoVal = await page.evaluate(() => (document.querySelector('#tag-fcu12 input') as HTMLInputElement).value);
check('input fcu12 memo', memoVal === 'テスト入力', memoVal);
check('input focused', await page.evaluate(() => document.activeElement === document.querySelector('#tag-fcu12 input')), '');
await page.screenshot({ path: `${outDir}/03-input.png` });

// ---- 低アングル: 視線が壁を横切るので B 側のタグが壁に隠れる（遮蔽の目視確認用） ----
await demo(`d.setView({yaw: 1.15, pitch: 0.18}); await d.nextFrames(10);`);
log('labels(low-angle)', await demo(`return d.labels()`));
await page.screenshot({ path: `${outDir}/05-occlusion-low.png` });
await demo(`d.setView({yaw: 1.15}); await d.nextFrames(8);`);

// ---- 撮影（canvas.toBlob にラベルが入るか） ----
const dataUrl = (await demo(`return await d.captureDataUrl();`)) as string | null;
check('capture dataUrl', !!dataUrl && dataUrl.startsWith('data:image/png'), dataUrl ? `${dataUrl.length} chars` : dataUrl);
if (dataUrl) writeFileSync(`${outDir}/capture-raw.png`, Buffer.from(dataUrl.split(',')[1]!, 'base64'));
await page.click('#shot');
await page.waitForFunction(() => document.querySelector<HTMLImageElement>('#shotImg')!.src.startsWith('blob:'));
await page.locator('.shot').screenshot({ path: `${outDir}/04-capture-panel.png` });

log('console errors', errors.slice(0, 10));
await browser.close();
if (failures > 0) {
  console.error(`${failures} 件のチェックが失敗`);
  process.exit(1);
}
console.log('verify: all checks passed');
