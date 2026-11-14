import * as THREE from 'three';

// HTML 要素 1 枚分のテクスチャを three.js の THREE.Texture として扱うための薄いラッパー。
//
// なぜ THREE.HTMLTexture を使わないか（調査結果は REPORT.md）:
// three r187 の WebGLTextures は HTMLTexture の転送に旧名 texElementImage2D と
// layoutsubtree しか使っておらず、両方とも Chrome 157 で削除済みのため転送が一切走らない。
//
// 代わりに取る経路（すべて three の公開 API + 標準 WebGL2）:
//  1. 通常の THREE.Texture（中身はダミーの小 canvas）を作り、renderer.initTexture() で
//     three に GL テクスチャ実体を先に作らせる
//  2. paint イベントの中で renderer.properties 経由で GL テクスチャ実体を取り出し、
//     生 WebGL2 の texImage2D(..., null) 再確保 + texElementSubImage2D で中身だけ差し替える
//     （texture.version は上げないので、three がダミー画像から再転送することはない）
//  3. 生 GL を触った後は renderer.resetState() で three の GL 状態キャッシュを合わせ直す
//     （呼び出し側＝描画側の責務）

interface TextureProperties {
  __webglTexture?: WebGLTexture;
}

export class ElementTexture {
  readonly texture: THREE.Texture;
  private allocW = 0;
  private allocH = 0;
  /** 一度でも要素スナップショットの転送に成功したか */
  uploadedOnce = false;

  constructor(
    readonly el: Element,
    cssW: number,
    cssH: number,
  ) {
    // three に GL テクスチャを作らせるためだけのダミー画像（中身は使われない）
    const img = document.createElement('canvas');
    img.width = Math.max(1, Math.round(cssW));
    img.height = Math.max(1, Math.round(cssH));
    this.texture = new THREE.Texture(img);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.needsUpdate = true;
  }

  /** three 側の GL テクスチャ実体を先に作る（最初の描画より前に呼ぶ） */
  init(renderer: THREE.WebGLRenderer): void {
    renderer.initTexture(this.texture);
  }

  /**
   * 要素のスナップショットを GL テクスチャへ転送する。
   * スナップショットが有効な paint イベントの中でだけ呼ぶこと。
   * @returns 転送できたら true（GL 実体がまだ無い等でできなければ false）
   */
  upload(renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement): boolean {
    // three r187 のレンダラは WebGL2 専用（getContext の型は union だが実体は WebGL2）
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const tex = (renderer.properties.get(this.texture) as TextureProperties).__webglTexture;
    if (!tex) return false;
    // getElementImageDefaultSize は paint 中でないと「No cached paint record」で例外になる
    const size = canvas.getElementImageDefaultSize(this.el);
    const w = Math.max(1, Math.ceil(size.width));
    const h = Math.max(1, Math.ceil(size.height));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // three の flipY=true 前提に合わせ、原典と同じく乗算済みアルファで取り込む
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (w !== this.allocW || h !== this.allocH) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.allocW = w;
      this.allocH = h;
    }
    gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.el);
    this.uploadedOnce = true;
    return true;
  }
}
