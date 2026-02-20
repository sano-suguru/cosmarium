export let canvas: HTMLCanvasElement;
export let gl: WebGL2RenderingContext;
export const viewport = { W: 0, H: 0, dpr: 1 };

export function initWebGL() {
  const c = document.querySelector<HTMLCanvasElement>('#c');
  if (!c) throw new Error('Canvas element #c not found');
  canvas = c;
  const ctx = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!ctx) {
    const menu = document.getElementById('menu');
    if (menu) {
      menu.innerHTML =
        '<h1 style="color:#f44;font-size:24px;text-shadow:0 0 20px #f44">' +
        'WebGL 2 is not supported</h1>' +
        '<p style="color:#888;margin-top:16px;font-size:13px">' +
        'Please update your browser or enable hardware acceleration.</p>';
    }
    throw new Error('WebGL 2 not available');
  }
  gl = ctx;
  resize();
}

export function resize() {
  const dpr = Math.min(devicePixelRatio, 2);
  viewport.dpr = dpr;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  viewport.W = canvas.width = (innerWidth * dpr) | 0;
  viewport.H = canvas.height = (innerHeight * dpr) | 0;
  gl.viewport(0, 0, viewport.W, viewport.H);
}
