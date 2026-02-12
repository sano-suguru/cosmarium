import type { FBO } from '../types.ts';
import { gl, viewport } from './webgl-setup.ts';

export const fbos: { scene: FBO | null; bloom1: FBO | null; bloom2: FBO | null } = {
  scene: null,
  bloom1: null,
  bloom2: null,
};

function delFBO(fbo: FBO | null) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.framebuffer);
  gl.deleteTexture(fbo.texture);
}

function createFBO(w: number, h: number): FBO {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) console.error('FBO incomplete:', w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer: f, texture: t, width: w, height: h };
}

export function createFBOs() {
  delFBO(fbos.scene);
  delFBO(fbos.bloom1);
  delFBO(fbos.bloom2);
  fbos.scene = createFBO(viewport.W, viewport.H);
  fbos.bloom1 = createFBO(viewport.W >> 1, viewport.H >> 1);
  fbos.bloom2 = createFBO(viewport.W >> 1, viewport.H >> 1);
}
