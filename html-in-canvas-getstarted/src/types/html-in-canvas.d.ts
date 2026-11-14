// Chrome 157 の HTML-in-Canvas API の型定義（lib.dom にまだ無いもの）
// https://developer.chrome.com/docs/web-platform/html-in-canvas

interface CanvasPaintEvent extends Event {
  readonly changedElements: ReadonlyArray<Element>;
}

interface ElementGeometryOptions {
  canvasTransform?: DOMMatrixInit;
  canvasClip?: DOMRectInit;
  preserveHitTestOrder?: boolean;
}

interface HTMLCanvasElement {
  /** 'drawable' で子要素をレイアウト対象にする（既定は 'fallback'） */
  content: 'fallback' | 'drawable';
  onpaint: ((this: HTMLCanvasElement, ev: CanvasPaintEvent) => unknown) | null;
  requestPaint(): void;
  getElementImageDefaultSize(element: Element): { width: number; height: number };
  updateElementGeometry(element: Element, options?: ElementGeometryOptions): void;
  clearElementGeometry(element: Element): void;
  getElementTransform(element: Element): DOMMatrix;
}

interface WebGL2RenderingContext {
  texElementSubImage2D(
    target: GLenum,
    level: GLint,
    xoffset: GLint,
    yoffset: GLint,
    element: Element,
  ): void;
}
