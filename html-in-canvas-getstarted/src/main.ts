import { createApp, type App } from './demo/app.ts';
import { startLiveValues } from './demo/live-values.ts';
import { bindPanel, createLogger } from './demo/panel.ts';
import { supportsHtmlInCanvas } from './strategies/canvas/canvas.ts';

const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
const overlayRoot = document.querySelector<HTMLElement>('#overlay')!;

if (!supportsHtmlInCanvas()) {
  document.querySelector<HTMLElement>('#unsupported')!.style.display = 'block';
  throw new Error('HTML-in-Canvas unsupported');
}

let app: App;
const log = createLogger(document.querySelector<HTMLOListElement>('#log')!, () => app.mode);
app = createApp({ canvas, overlayRoot, log });
bindPanel(app);
startLiveValues(app);

// E2E（scripts/verify.ts）用
(window as unknown as { __demo: unknown }).__demo = {
  setMode: app.setMode,
  setView: app.camera.set.bind(app.camera),
  labels: () => app.labels().map((l) => ({ id: l.id, ...l.screen, w: l.w, h: l.h })),
  nextFrames: app.nextFrames,
  runSelfTests: async () => (await import('./demo/selftest.ts')).runSelfTests(app),
};
