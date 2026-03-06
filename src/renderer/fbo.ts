import type { FBO } from '../types.ts';
import { devError } from '../ui/dev-overlay.ts';
import { required } from './assert.ts';
import { gl, viewport } from './webgl-setup.ts';

export type BloomScale = { tmp: FBO; result: FBO };
export type BloomScales = readonly [BloomScale, BloomScale, BloomScale];

export const fbos: {
  scene: FBO | null;
  bright: FBO | null;
  bloom: BloomScales | null;
} = {
  scene: null,
  bright: null,
  bloom: null,
};

function deleteFBO(fbo: FBO | null) {
  if (!fbo) {
    return;
  }
  gl.deleteFramebuffer(fbo.framebuffer);
  gl.deleteTexture(fbo.texture);
}

function createFBO(w: number, h: number): FBO {
  const t = required(gl.createTexture(), 'createTexture');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const f = required(gl.createFramebuffer(), 'createFramebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    devError('FBO incomplete:', w, h);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { framebuffer: f, texture: t, width: w, height: h };
}

export function createFBOs() {
  deleteFBO(fbos.scene);
  deleteFBO(fbos.bright);
  if (fbos.bloom) {
    for (const s of fbos.bloom) {
      deleteFBO(s.tmp);
      deleteFBO(s.result);
    }
  }
  fbos.scene = createFBO(viewport.W, viewport.H);
  fbos.bright = createFBO(viewport.W >> 1, viewport.H >> 1);
  fbos.bloom = [
    { tmp: createFBO(viewport.W >> 1, viewport.H >> 1), result: createFBO(viewport.W >> 1, viewport.H >> 1) },
    { tmp: createFBO(viewport.W >> 2, viewport.H >> 2), result: createFBO(viewport.W >> 2, viewport.H >> 2) },
    { tmp: createFBO(viewport.W >> 3, viewport.H >> 3), result: createFBO(viewport.W >> 3, viewport.H >> 3) },
  ];
}
