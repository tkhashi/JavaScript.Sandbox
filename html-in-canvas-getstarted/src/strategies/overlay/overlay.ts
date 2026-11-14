import type { CameraFrame } from '../../shared/camera.ts';
import type { Label } from '../../shared/labels.ts';
import type { LabelStrategy, RenderFn } from '../types.ts';

/**
 * 従来方式: canvas の上に重ねた <div> を、毎フレーム CSS transform で 3D の位置に追従させる。
 * ラベルは普通の DOM なので、ホバー・クリック・入力はブラウザがそのまま処理する。
 */
export class OverlayStrategy implements LabelStrategy {
  readonly id = 'overlay';
  readonly title = 'HTML オーバーレイ: ラベルは DOM を毎フレーム追従';
  private render: RenderFn | null = null;

  constructor(private readonly root: HTMLElement) {}

  attach(label: Label): void {
    label.el.removeAttribute('style');
    this.root.append(label.el);
  }

  activate(render: RenderFn): void {
    this.render = render;
  }

  deactivate(): void {
    this.render = null;
  }

  requestFrame(): void {
    this.render?.(null);
  }

  update(_camera: CameraFrame, labels: Label[]): void {
    labels.forEach((l, i) => {
      const s = l.screen;
      const style = l.el.style;
      style.display = s.visible ? '' : 'none';
      style.zIndex = String(i); // 奥→手前の順 = DOM の重なり順。壁との前後関係は表現できない
      style.transform = `translate(${s.left}px, ${s.top}px) scale(${s.scale})`;
    });
  }
}
