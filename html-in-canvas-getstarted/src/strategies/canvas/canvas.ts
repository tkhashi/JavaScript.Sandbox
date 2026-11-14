import type { CameraFrame } from '../../shared/camera.ts';
import type { Label } from '../../shared/labels.ts';
import { PX_TO_WORLD } from '../../shared/projection.ts';
import type { LabelStrategy, RenderFn } from '../types.ts';
import { BillboardRenderer, type ElementTexture } from './billboard.ts';

/** この方式（canvas の content="drawable"）を使えるブラウザか */
export function supportsHtmlInCanvas(): boolean {
  const c = document.createElement('canvas');
  c.setAttribute('content', 'drawable');
  return c.content === 'drawable' && 'requestPaint' in c;
}

/** ラベルごとの、この方式だけが持つ状態 */
interface LabelGpuState {
  texture: ElementTexture;
  /** 次の paint で DOM → テクスチャの再転送が必要か */
  dirty: boolean;
  /** ヒットテスト用の座標を canvas に登録済みか */
  hitRegistered: boolean;
}

/**
 * HTML-in-Canvas 方式: ラベルは canvas の子要素のまま、スナップショットを WebGL テクスチャにして 3D シーンの中に描く。
 *  - 描画: paint イベントの中で texElementSubImage2D → ビルボードとして描画（壁との前後関係は深度テストで解決）
 *  - 操作: ブラウザは画面上のどこにラベルがあるかを知らないので、毎フレーム updateElementGeometry で教える
 */
export class CanvasStrategy implements LabelStrategy {
  readonly id = 'canvas';
  readonly title = 'HTML-in-Canvas: ラベルは GPU テクスチャ';
  private readonly billboard: BillboardRenderer;
  private readonly states = new WeakMap<Label, LabelGpuState>();
  private uploadErrors = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.billboard = new BillboardRenderer(gl);
  }

  attach(label: Label): void {
    label.el.removeAttribute('style'); // overlay 方式が付けた display / transform を消す（残ると描画対象から外れる）
    this.canvas.append(label.el); // canvas の直接の子にする（content="drawable" でレイアウトされる）
    const prev = this.states.get(label);
    if (prev) {
      prev.dirty = true;
      prev.hitRegistered = false;
    }
  }

  activate(render: RenderFn): void {
    this.canvas.onpaint = (e) => render(new Set(e.changedElements));
  }

  deactivate(): void {
    this.canvas.onpaint = null;
  }

  requestFrame(): void {
    // HTML のスナップショットが有効なのは paint イベントの間だけ。描画は onpaint の中で行う
    this.canvas.requestPaint();
  }

  update(camera: CameraFrame, labels: Label[], changed: ReadonlySet<Element> | null): void {
    this.billboard.begin(camera.vp);
    for (const l of labels) {
      const s = l.screen;
      const state = this.stateOf(l);

      // 1. DOM → テクスチャ（変化した要素だけ転送）
      if (state.dirty || changed === null || changed.has(l.el)) {
        try {
          this.billboard.upload(this.canvas, state.texture, l.el);
          state.dirty = false;
        } catch (err) {
          if (this.uploadErrors++ < 3) console.warn('upload failed', err);
        }
      }

      // 2. ビルボードとして描画
      if (s.visible && state.texture.width > 0) {
        this.billboard.draw(state.texture, l.anchor, camera.right, camera.up, l.w * PX_TO_WORLD, l.h * PX_TO_WORLD);
      }

      // 3. ヒットテスト用の座標同期。当たり判定は深度を見ないので、壁の裏のラベルは外す。
      //    奥→手前の順に更新すると、手前のラベルが最前面のヒット対象になる
      if (s.visible && !s.occluded) {
        this.canvas.updateElementGeometry(l.el, { canvasTransform: new DOMMatrix([s.scale, 0, 0, s.scale, s.left, s.top]) });
        state.hitRegistered = true;
      } else if (state.hitRegistered) {
        this.canvas.clearElementGeometry(l.el);
        state.hitRegistered = false;
      }
    }
  }

  private stateOf(l: Label): LabelGpuState {
    let s = this.states.get(l);
    if (!s) {
      s = { texture: this.billboard.createTexture(), dirty: true, hitRegistered: false };
      this.states.set(l, s);
    }
    return s;
  }
}
