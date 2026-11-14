import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ElementTexture } from './element-texture.ts';
import { createMainLabels, createPins, type Label, type LogFn } from './labels.ts';
import { BOXES, type Vec3 } from './scene-data.ts';

/** ラベル 1px あたりのワールド寸法 (m)。原典 shared/projection.ts と同じ値 */
const PX_TO_WORLD = 0.008;
const TARGET = new THREE.Vector3(0, 1, 0);
const DEFAULT_VIEW = { yaw: 1.15, pitch: 0.45, radius: 12.5 };
const PIN_COUNT = 8;

// ---- ログ ----
const logEl = document.querySelector<HTMLOListElement>('#log')!;
const log: LogFn = (msg) => {
  const li = document.createElement('li');
  li.textContent = msg;
  logEl.prepend(li);
  while (logEl.children.length > 50) logEl.lastChild?.remove();
};

// ---- 対応チェック（原典 strategies/canvas の supportsHtmlInCanvas と同じ判定） ----
function supportsHtmlInCanvas(): boolean {
  const c = document.createElement('canvas');
  c.setAttribute('content', 'drawable');
  return c.content === 'drawable' && 'requestPaint' in c;
}

const canvas = document.querySelector<HTMLCanvasElement>('#gl')!;
if (!supportsHtmlInCanvas()) {
  document.querySelector<HTMLElement>('#unsupported')!.style.display = 'block';
  throw new Error('HTML-in-Canvas unsupported');
}

// ---- three.js の土台 ----
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
// 原典（素の WebGL）は色変換を一切していないので、出力側の sRGB 変換を切って見た目を揃える
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(new THREE.Color(0.96, 0.97, 0.98), 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 80);
const controls = new OrbitControls(camera, canvas);
controls.target.copy(TARGET);
controls.enableDamping = false;

function setView(v: Partial<typeof DEFAULT_VIEW>): void {
  const { yaw, pitch, radius } = { ...DEFAULT_VIEW, ...v };
  const cp = Math.cos(pitch);
  camera.position.set(
    TARGET.x + radius * cp * Math.sin(yaw),
    TARGET.y + radius * Math.sin(pitch),
    TARGET.z + radius * cp * Math.cos(yaw),
  );
  controls.target.copy(TARGET);
  controls.update();
}
setView({});

// ---- 箱シーン（床・壁・機器） ----
// 原典の自前シェーダは 「0.55 + 0.45 * max(dot(n, L), 0)」 という単純な陰影。
// three r155 以降のライトは物理単位で強度が π で割られるため、同じ見え方になるよう π 倍して合わせる
scene.add(new THREE.AmbientLight(0xffffff, 0.55 * Math.PI));
const sun = new THREE.DirectionalLight(0xffffff, 0.45 * Math.PI);
sun.position.set(4, 8, 5); // 方向は normalize(0.4, 0.8, 0.5) とほぼ同じ
scene.add(sun);

const wallMeshes: THREE.Mesh[] = [];
for (const b of BOXES) {
  const size: Vec3 = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(...b.color) }),
  );
  mesh.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  scene.add(mesh);
  if (b.occluder) wallMeshes.push(mesh);
}

// ---- ラベル ----
const labels: Label[] = [...createMainLabels(log), ...createPins(PIN_COUNT, log)];
interface LabelView {
  tex: ElementTexture;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hitRegistered: boolean;
  screen: { left: number; top: number; scale: number; visible: boolean; occluded: boolean; depth: number };
}
const planeGeo = new THREE.PlaneGeometry(1, 1);
const views = new Map<Label, LabelView>();

for (const l of labels) {
  canvas.append(l.el); // canvas の子にする（content="drawable" でレイアウト＆描画対象になる）
  // OrbitControls は canvas 上の pointerdown を無条件に setPointerCapture してしまうため、
  // ラベル起点の pointerdown を canvas へ伝播させると pointerup が奪われて click が成立しない。
  // ラベルで止める（原典の自前カメラは target チェックで同じ問題を回避していた）。
  l.el.addEventListener('pointerdown', (e) => e.stopPropagation());
  l.w = l.el.offsetWidth;
  l.h = l.el.offsetHeight;
  const tex = new ElementTexture(l.el, l.w, l.h);
  tex.init(renderer);
  const mat = new THREE.MeshBasicMaterial({
    map: tex.texture,
    transparent: true,
    depthWrite: false,
    // テクスチャ側が乗算済みアルファなので、合成も乗算済み用の式にする（原典 billboard と同じ）
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(planeGeo, mat);
  mesh.scale.set(l.w * PX_TO_WORLD, l.h * PX_TO_WORLD, 1);
  mesh.renderOrder = 10;
  scene.add(mesh);
  views.set(l, { tex, mesh, hitRegistered: false, screen: { left: 0, top: 0, scale: 1, visible: false, occluded: false, depth: 0 } });
}

// ピンの支柱（床からアンカーまでの線）。原典 scene-renderer の setStems 相当
{
  const pts: number[] = [];
  for (const l of labels) if (l.kind === 'pin') pts.push(l.anchor[0], 0, l.anchor[2], l.anchor[0], l.anchor[1], l.anchor[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: new THREE.Color(0.35, 0.4, 0.5) })));
}

// ---- 1 フレーム分（paint イベントの中でだけ実行する） ----
const raycaster = new THREE.Raycaster();
let renderedFrames = 0;
const frameWaiters: { target: number; resolve: () => void }[] = [];
let pendingCapture: ((b: Blob | null) => void) | null = null;

function renderFrame(changed: ReadonlySet<Element>): void {
  camera.updateMatrixWorld();
  const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;

  // 1. DOM → テクスチャ（変化した要素と初回だけ）とビルボードの姿勢
  for (const l of labels) {
    const v = views.get(l)!;
    if (!v.tex.uploadedOnce || changed.has(l.el)) v.tex.upload(renderer, canvas);
    const hW = l.h * PX_TO_WORLD;
    v.mesh.position.set(l.anchor[0] + camUp.x * hW / 2, l.anchor[1] + camUp.y * hW / 2, l.anchor[2] + camUp.z * hW / 2);
    v.mesh.quaternion.copy(camera.quaternion);
  }
  renderer.resetState(); // 生 GL でテクスチャを触ったので three の状態キャッシュを合わせ直す
  renderer.render(scene, camera);

  // 2. ヒットテスト用の画面矩形（原典 projection.ts の式を three の行列で計算）
  const order: Label[] = [];
  for (const l of labels) {
    const v = views.get(l)!;
    const s = v.screen;
    const hW = l.h * PX_TO_WORLD;
    const c: Vec3 = [l.anchor[0] + camUp.x * hW / 2, l.anchor[1] + camUp.y * hW / 2, l.anchor[2] + camUp.z * hW / 2];
    const b4 = new THREE.Vector4(l.anchor[0], l.anchor[1], l.anchor[2], 1).applyMatrix4(vp);
    const t4 = new THREE.Vector4(c[0] + camUp.x * hW / 2, c[1] + camUp.y * hW / 2, c[2] + camUp.z * hW / 2, 1).applyMatrix4(vp);
    if (b4.w <= 0.1 || t4.w <= 0.1) {
      s.visible = false;
      s.occluded = false;
      s.depth = -Infinity; // 登録解除だけは走らせるため order には入れる
      order.push(l);
      continue;
    }
    const x0 = (b4.x / b4.w * 0.5 + 0.5) * cssW;
    const y0 = (1 - (b4.y / b4.w * 0.5 + 0.5)) * cssH;
    const y1 = (1 - (t4.y / t4.w * 0.5 + 0.5)) * cssH;
    s.scale = (y0 - y1) / l.h;
    s.left = x0 - (l.w * s.scale) / 2;
    s.top = y1;
    s.depth = b4.w;
    s.visible = s.left + l.w * s.scale > 0 && s.left < cssW && y0 > 0 && s.top < cssH;
    // 壁との遮蔽はレイキャストで判定（当たり判定は深度を見ないので、裏側のラベルは登録を外す）
    const center = new THREE.Vector3(...c);
    const dir = center.clone().sub(camera.position);
    const dist = dir.length();
    raycaster.set(camera.position, dir.normalize());
    raycaster.far = dist - 0.05;
    s.occluded = raycaster.intersectObjects(wallMeshes, false).length > 0;
    order.push(l);
  }
  // 奥→手前の順に登録すると、手前のラベルが最前面のヒット対象になる
  order.sort((a, b) => views.get(b)!.screen.depth - views.get(a)!.screen.depth);
  for (const l of order) {
    const v = views.get(l)!;
    const s = v.screen;
    if (s.visible && !s.occluded) {
      canvas.updateElementGeometry(l.el, { canvasTransform: new DOMMatrix([s.scale, 0, 0, s.scale, s.left, s.top]) });
      v.hitRegistered = true;
    } else if (v.hitRegistered) {
      canvas.clearElementGeometry(l.el);
      v.hitRegistered = false;
    }
  }

  renderedFrames++;
  for (let i = frameWaiters.length - 1; i >= 0; i--) {
    if (renderedFrames >= frameWaiters[i]!.target) frameWaiters.splice(i, 1)[0]!.resolve();
  }
  if (pendingCapture) {
    const resolve = pendingCapture;
    pendingCapture = null;
    canvas.toBlob((b) => resolve(b), 'image/png');
  }
}

canvas.onpaint = (e) => renderFrame(new Set(e.changedElements));

// スナップショットが有効なのは paint の間だけなので、描画は onpaint に寄せ、
// rAF 側はカメラ更新と requestPaint だけを行う（原典と同じ駆動方式）
requestAnimationFrame(function tick() {
  requestAnimationFrame(tick);
  controls.update();
  canvas.requestPaint();
});

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas.parentElement!);
resize();

// ---- UI ----
const capture = (): Promise<Blob | null> => new Promise((resolve) => (pendingCapture = resolve));
document.querySelector('#resetView')!.addEventListener('click', () => setView({}));
document.querySelector('#shot')!.addEventListener('click', async () => {
  const b = await capture();
  if (b) document.querySelector<HTMLImageElement>('#shotImg')!.src = URL.createObjectURL(b);
});

// ---- 検証用（scripts/verify.ts から使う） ----
(window as unknown as { __demo: unknown }).__demo = {
  setView,
  labels: () =>
    labels.map((l) => {
      const s = views.get(l)!.screen;
      return { id: l.id, left: s.left, top: s.top, scale: s.scale, visible: s.visible, occluded: s.occluded, w: l.w, h: l.h };
    }),
  nextFrames: (n: number) =>
    new Promise<void>((resolve) => frameWaiters.push({ target: renderedFrames + n, resolve })),
  captureDataUrl: async () => {
    const b = await capture();
    if (!b) return null;
    return await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.readAsDataURL(b);
    });
  },
};
