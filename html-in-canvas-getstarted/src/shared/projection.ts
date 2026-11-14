import type { CameraFrame } from './camera.ts';
import { measure, type Label } from './labels.ts';
import type { Vec3 } from './math.ts';
import { segmentHitsAabb, transform } from './math.ts';
import { OCCLUDERS } from './scene.ts';

/** ラベル 1px あたりのワールド寸法 (m)。HTML のピクセルサイズ → 3D 上の大きさ */
export const PX_TO_WORLD = 0.008;

/**
 * 全ラベルについて「3D のアンカー → 画面上の矩形」を計算して label.screen に書き込む。
 * overlay / canvas どちらの方式でも共通の前処理。
 *
 * @returns 奥→手前の順に並べたラベルと、壁の裏にあるラベル数
 */
export function projectLabels(labels: Label[], cam: CameraFrame): { sorted: Label[]; occluded: number } {
  const { vp, up, eye, cssW, cssH } = cam;
  let occluded = 0;
  for (const l of labels) {
    if (l.w === 0) measure(l);
    const hW = l.h * PX_TO_WORLD;
    const top: Vec3 = [l.anchor[0] + up[0] * hW, l.anchor[1] + up[1] * hW, l.anchor[2] + up[2] * hW];
    const c0 = transform(vp, l.anchor);
    const c1 = transform(vp, top);
    const s = l.screen;
    if (c0[3] <= 0.1 || c1[3] <= 0.1) {
      s.visible = false;
      s.occluded = false;
      continue;
    }
    const x0 = (c0[0] / c0[3] * 0.5 + 0.5) * cssW;
    const y0 = (1 - (c0[1] / c0[3] * 0.5 + 0.5)) * cssH;
    const y1 = (1 - (c1[1] / c1[3] * 0.5 + 0.5)) * cssH;
    s.scale = (y0 - y1) / l.h;
    const wPx = l.w * s.scale;
    s.left = x0 - wPx / 2;
    s.top = y1;
    s.depth = c0[3];
    s.visible = s.left + wPx > 0 && s.left < cssW && y0 > 0 && s.top < cssH;
    const center: Vec3 = [l.anchor[0] + up[0] * hW / 2, l.anchor[1] + up[1] * hW / 2, l.anchor[2] + up[2] * hW / 2];
    s.occluded = OCCLUDERS.some((box) => segmentHitsAabb(eye, center, box));
    if (s.occluded) occluded++;
  }
  return { sorted: [...labels].sort((a, b) => b.screen.depth - a.screen.depth), occluded };
}
