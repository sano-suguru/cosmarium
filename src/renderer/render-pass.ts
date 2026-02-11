import { cam } from '../input/camera.ts';
import { catalogOpen } from '../state.ts';
import { iB, iD, mainVAO, qVAO } from './buffers.ts';
import { fbos } from './fbo.ts';
import { renderScene } from './render-scene.ts';
import { blLoc, blP, coLoc, coP, Loc, mP } from './shaders.ts';
import { gl, viewport } from './webgl-setup.ts';

function dQ() {
  gl.bindVertexArray(qVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

export function renderFrame(now: number) {
  var sF = fbos.sF!;
  var bF1 = fbos.bF1!;
  var bF2 = fbos.bF2!;
  var W = viewport.W,
    H = viewport.H;

  var cx = catalogOpen ? 0 : cam.x + cam.shkx;
  var cy = catalogOpen ? 0 : cam.y + cam.shky;
  var cz = catalogOpen ? 2.5 : cam.z;

  // Render pass 1: scene
  gl.bindFramebuffer(gl.FRAMEBUFFER, sF.fb);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0.007, 0.003, 0.013, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  var ic = renderScene(now);
  if (ic > 0) {
    gl.useProgram(mP);
    gl.uniform2f(Loc.uR, W, H);
    gl.uniform2f(Loc.uCam, cx, cy);
    gl.uniform1f(Loc.uZ, cz);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.bindBuffer(gl.ARRAY_BUFFER, iB);
    gl.bufferData(gl.ARRAY_BUFFER, iD.subarray(0, ic * 9), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(mainVAO);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, ic);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  // Render pass 2-3: bloom
  gl.bindFramebuffer(gl.FRAMEBUFFER, bF1.fb);
  gl.viewport(0, 0, bF1.w, bF1.h);
  gl.useProgram(blP);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sF.tex);
  gl.uniform1i(blLoc.uT, 0);
  gl.uniform2f(blLoc.uD, 2.5, 0);
  gl.uniform2f(blLoc.uR, bF1.w, bF1.h);
  dQ();

  gl.bindFramebuffer(gl.FRAMEBUFFER, bF2.fb);
  gl.viewport(0, 0, bF2.w, bF2.h);
  gl.bindTexture(gl.TEXTURE_2D, bF1.tex);
  gl.uniform2f(blLoc.uD, 0, 2.5);
  dQ();

  // Render pass 4: composite
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.useProgram(coP);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sF.tex);
  gl.uniform1i(coLoc.uS, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, bF2.tex);
  gl.uniform1i(coLoc.uB, 1);
  dQ();
  gl.activeTexture(gl.TEXTURE0);
}
