import type { FBO } from '../types.ts';
import { gl, viewport } from './webgl-setup.ts';

export const fbos: { sF: FBO | null; bF1: FBO | null; bF2: FBO | null } = {
  sF: null,
  bF1: null,
  bF2: null,
};

function delFBO(fbo: FBO | null) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.fb);
  gl.deleteTexture(fbo.tex);
}

function mkFBO(w: number, h: number): FBO {
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
  return { fb: f, tex: t, w: w, h: h };
}

export function mkFBOs() {
  delFBO(fbos.sF);
  delFBO(fbos.bF1);
  delFBO(fbos.bF2);
  fbos.sF = mkFBO(viewport.W, viewport.H);
  fbos.bF1 = mkFBO(viewport.W >> 1, viewport.H >> 1);
  fbos.bF2 = mkFBO(viewport.W >> 1, viewport.H >> 1);
}
