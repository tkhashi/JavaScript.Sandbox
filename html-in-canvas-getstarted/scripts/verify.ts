// 実ブラウザ(Chrome)で HTML-in-Canvas の疑念を検証する E2E。
// 使い方: pnpm dev を起動した状態で `node scripts/verify.ts [URL] [出力ディレクトリ]`
import { chromium, type Page } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5199/';
const outDir = process.argv[3] ?? '.';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1360, height: 860 } });
const errors: string[] = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

await page.goto(url);
await page.waitForFunction(() => '__demo' in window);
const demo = (fn: string): Promise<unknown> => page.evaluate(`(async()=>{const d=window.__demo;${fn}})()`);

const log = (k: string, v: unknown): void => console.log(`${k}:`, typeof v === 'string' ? v : JSON.stringify(v));

log('support', await page.evaluate(() => {
  const c = document.createElement('canvas');
  return { texElementSubImage2D: 'texElementSubImage2D' in c.getContext('webgl2')!, content: 'content' in c };
}));

// ---- 画面（両方式）----
await demo(`d.setMode('canvas'); await d.nextFrames(8);`);
await page.screenshot({ path: `${outDir}/canvas-mode.png` });
await demo(`d.setMode('overlay'); await d.nextFrames(8);`);
await page.screenshot({ path: `${outDir}/overlay-mode.png` });
await demo(`d.setMode('canvas'); await d.nextFrames(4);`);

// ---- 疑念1: 壁の裏の室名タグ ----
log('labels(canvas)', await demo(`return d.labels().filter(l=>!l.id.startsWith('pin'))`));

// ---- 疑念2: 実マウスで hover / click / input ----
async function center(page: Page, sel: string): Promise<{ x: number; y: number }> {
  return page.evaluate((s) => {
    const el = document.querySelector(s)!;
    const id = el.closest('.tag')!.id.replace('tag-', '');
    const l = (window as any).__demo.labels().find((x: any) => x.id === id);
    const cv = document.querySelector('#gl')!.getBoundingClientRect();
    const t = el.closest('.tag') as HTMLElement;
    const e = el as HTMLElement;
    const cx = e === t ? t.offsetWidth / 2 : e.offsetLeft + e.offsetWidth / 2;
    const cy = e === t ? t.offsetHeight / 2 : e.offsetTop + e.offsetHeight / 2;
    return { x: cv.left + l.left + cx * l.scale, y: cv.top + l.top + cy * l.scale };
  }, sel);
}

const btn = await center(page, '#tag-roomA button');
await page.mouse.move(btn.x, btn.y);
await page.waitForTimeout(300);
log('hover(roomA button) :hover', await page.evaluate(() => document.querySelector('#tag-roomA button')!.matches(':hover')));
log('hover(roomA tag) :hover', await page.evaluate(() => document.querySelector('#tag-roomA')!.matches(':hover')));
await page.mouse.click(btn.x, btn.y);
log('clicks(roomA)', await page.evaluate(() => document.querySelector('#tag-roomA .clicks')!.textContent));

// FCU-12 は B 側（壁の裏）。A 側から見ると隠れている → 視点を反対側へ回して操作する
await demo(`d.setView({yaw: -1.15}); await d.nextFrames(6);`);
await page.screenshot({ path: `${outDir}/canvas-mode-flipped.png` });
const memo = await center(page, '#tag-fcu12 input');
await page.mouse.click(memo.x, memo.y);
await page.keyboard.type('テスト入力');
log('input(fcu12 memo)', await page.evaluate(() => (document.querySelector('#tag-fcu12 input') as HTMLInputElement).value));
log('input focused', await page.evaluate(() => document.activeElement === document.querySelector('#tag-fcu12 input')));
await page.screenshot({ path: `${outDir}/canvas-mode-input.png` });
await demo(`d.setView({yaw: 1.15}); await d.nextFrames(4);`);

// ---- 疑念5: in-page 自動テスト ----
const tests = (await demo(`return await d.runSelfTests();`)) as { name: string; status: string; detail: string }[];
for (const t of tests) console.log(`  ${t.status.padEnd(4)} ${t.name} — ${t.detail}`);
const failed = tests.filter((t) => t.status === 'FAIL').length;

// ---- 疑念3: 画像書き出し（両方式）----
await page.click('#shotBoth');
await page.waitForTimeout(1500);
const shots = await page.evaluate(async () => {
  const out: Record<string, { w: number; h: number }> = {};
  for (const [k, sel] of [['overlay', '#shotOverlay'], ['canvas', '#shotCanvas']] as const) {
    const img = document.querySelector<HTMLImageElement>(sel)!;
    out[k] = { w: img.naturalWidth, h: img.naturalHeight };
  }
  return out;
});
log('captured sizes', shots);
await page.locator('.shots').screenshot({ path: `${outDir}/shots-compare.png` });

// ---- 疑念4: ピン数と JS 時間 ----
for (const n of [30, 500]) {
  await page.evaluate((v) => {
    const r = document.querySelector<HTMLInputElement>('#pins')!;
    r.value = String(v);
    r.dispatchEvent(new Event('input'));
  }, n);
  for (const m of ['overlay', 'canvas']) {
    await demo(`d.setMode('${m}'); await d.nextFrames(120);`);
    log(`perf pins=${n} ${m}`, await page.evaluate(() => ({ fps: document.querySelector('#stFps')!.textContent, sync: document.querySelector('#stSync')!.textContent })));
    await page.screenshot({ path: `${outDir}/perf-${n}-${m}.png` });
  }
}

log('console errors', errors.slice(0, 10));
await browser.close();
if (failed > 0) {
  console.error(`${failed} 件の自動テストが失敗`);
  process.exit(1);
}
