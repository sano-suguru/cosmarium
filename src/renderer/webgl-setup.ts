export var canvas: HTMLCanvasElement;
export var gl: WebGL2RenderingContext;
export var viewport = { W: 0, H: 0 };

export function initWebGL() {
  canvas = document.querySelector<HTMLCanvasElement>('#c')!;
  var ctx = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
  });
  if (!ctx) {
    var menu = document.getElementById('menu')!;
    menu.innerHTML =
      '<h1 style="color:#f44;font-size:24px;text-shadow:0 0 20px #f44">' +
      'WebGL 2 is not supported</h1>' +
      '<p style="color:#888;margin-top:16px;font-size:13px">' +
      'Please update your browser or enable hardware acceleration.</p>';
    throw new Error('WebGL 2 not available');
  }
  gl = ctx;
  resize();
}

export function resize() {
  viewport.W = canvas.width = innerWidth;
  viewport.H = canvas.height = innerHeight;
  gl.viewport(0, 0, viewport.W, viewport.H);
}
