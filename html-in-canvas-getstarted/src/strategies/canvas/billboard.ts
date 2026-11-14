import { createProgram } from '../../shared/gl-utils.ts';
import type { Mat4, Vec3 } from '../../shared/math.ts';

// HTML 要素のスナップショットを WebGL テクスチャにして、常にカメラを向く板（ビルボード）に貼る。

const VS = `#version 300 es
in vec2 aUV;
uniform mat4 uVP;
uniform vec3 uAnchor; uniform vec3 uRight; uniform vec3 uUp; uniform vec2 uSize;
out vec2 vUV;
void main() {
  vec3 p = uAnchor + uRight * ((aUV.x - 0.5) * uSize.x) + uUp * (aUV.y * uSize.y);
  gl_Position = uVP * vec4(p, 1.0);
  vUV = vec2(aUV.x, 1.0 - aUV.y);
}`;

const FS = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uTex; out vec4 outColor;
void main() { outColor = texture(uTex, vUV); }`;

export interface ElementTexture {
  tex: WebGLTexture;
  width: number;
  height: number;
}

export class BillboardRenderer {
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, VS, FS);
    for (const n of ['uVP', 'uAnchor', 'uRight', 'uUp', 'uSize', 'uTex']) this.u[n] = gl.getUniformLocation(this.program, n);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'aUV');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** ラベル描画の前に 1 回。半透明合成 + 深度テストのみ（深度は書かない）で壁の裏が隠れる */
  begin(vp: Mat4): void {
    const { gl } = this;
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.u.uVP!, false, vp);
    gl.uniform1i(this.u.uTex!, 0);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
  }

  draw(t: ElementTexture, anchor: Vec3, right: Vec3, up: Vec3, w: number, h: number): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.uniform3fv(this.u.uAnchor!, anchor);
    gl.uniform3fv(this.u.uRight!, right);
    gl.uniform3fv(this.u.uUp!, up);
    gl.uniform2f(this.u.uSize!, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  createTexture(): ElementTexture {
    const { gl } = this;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex, width: 0, height: 0 };
  }

  /** DOM 要素のスナップショットをテクスチャへ転送する（paint イベント内で呼ぶこと） */
  upload(canvas: HTMLCanvasElement, t: ElementTexture, el: Element): void {
    const { gl } = this;
    const size = canvas.getElementImageDefaultSize(el);
    const w = Math.ceil(size.width);
    const h = Math.ceil(size.height);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (t.width !== w || t.height !== h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      t.width = w;
      t.height = h;
    }
    gl.texElementSubImage2D(gl.TEXTURE_2D, 0, 0, 0, el);
  }
}
