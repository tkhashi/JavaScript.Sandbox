import { createProgram } from './gl-utils.ts';
import type { Mat4, Vec3 } from './math.ts';
import { BOXES } from './scene.ts';

// 床・壁・機器・ピンの支柱を描くだけの WebGL2 レンダラ。ラベル（HTML）のことは何も知らない。

const VS = `#version 300 es
in vec3 aPos; in vec3 aNormal; in vec3 aColor;
uniform mat4 uVP;
out vec3 vColor; out vec3 vNormal;
void main() { vColor = aColor; vNormal = aNormal; gl_Position = uVP * vec4(aPos, 1.0); }`;

const FS = `#version 300 es
precision mediump float;
in vec3 vColor; in vec3 vNormal;
out vec4 outColor;
void main() {
  float l = 1.0;
  if (dot(vNormal, vNormal) > 0.01) l = 0.55 + 0.45 * max(dot(normalize(vNormal), normalize(vec3(0.4, 0.8, 0.5))), 0.0);
  outColor = vec4(vColor * l, 1.0);
}`;

/** 直方体 → 三角形（pos, normal, color） */
function boxVertices(): number[] {
  const out: number[] = [];
  const faces: [Vec3, Vec3, Vec3][] = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ];
  for (const b of BOXES) {
    const c: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    const h: Vec3 = [(b.max[0] - b.min[0]) / 2, (b.max[1] - b.min[1]) / 2, (b.max[2] - b.min[2]) / 2];
    for (const [n, u, v] of faces) {
      const corner = (su: number, sv: number): Vec3 => [
        c[0] + h[0] * (n[0] + su * u[0] + sv * v[0]),
        c[1] + h[1] * (n[1] + su * u[1] + sv * v[1]),
        c[2] + h[2] * (n[2] + su * u[2] + sv * v[2]),
      ];
      const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      for (const i of [0, 1, 2, 0, 2, 3]) out.push(...q[i]!, ...n, ...b.color);
    }
  }
  return out;
}

export class SceneRenderer {
  readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private uVP: WebGLUniformLocation | null;
  private boxVao: WebGLVertexArrayObject;
  private boxCount: number;
  private lineVao: WebGLVertexArrayObject;
  private lineBuf: WebGLBuffer;
  private lineCount = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 が使えません');
    this.gl = gl;
    this.program = createProgram(gl, VS, FS);
    this.uVP = gl.getUniformLocation(this.program, 'uVP');

    const data = new Float32Array(boxVertices());
    this.boxCount = data.length / 9;
    this.boxVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.boxVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.bindAttribs();

    this.lineVao = gl.createVertexArray()!;
    this.lineBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    this.bindAttribs();
    gl.bindVertexArray(null);
  }

  private bindAttribs(): void {
    const { gl } = this;
    for (const [name, size, offset] of [['aPos', 3, 0], ['aNormal', 3, 12], ['aColor', 3, 24]] as const) {
      const loc = gl.getAttribLocation(this.program, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, offset);
    }
  }

  /** ピンの支柱（床からアンカーまでの線） */
  setStems(anchors: Vec3[]): void {
    const { gl } = this;
    const v: number[] = [];
    for (const a of anchors) {
      v.push(a[0], 0, a[2], 0, 0, 0, 0.35, 0.4, 0.5);
      v.push(a[0], a[1], a[2], 0, 0, 0, 0.35, 0.4, 0.5);
    }
    this.lineCount = v.length / 9;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);
  }

  resize(width: number, height: number): void {
    this.gl.viewport(0, 0, width, height);
  }

  draw(vp: Mat4): void {
    const { gl } = this;
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clearColor(0.96, 0.97, 0.98, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uVP, false, vp);
    gl.bindVertexArray(this.boxVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.boxCount);
    if (this.lineCount > 0) {
      gl.bindVertexArray(this.lineVao);
      gl.drawArrays(gl.LINES, 0, this.lineCount);
    }
    gl.bindVertexArray(null);
  }
}
