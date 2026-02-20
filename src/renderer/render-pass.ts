import { WRAP_PERIOD } from '../constants.ts';
import { cam } from '../input/camera.ts';
import { state } from '../state.ts';
import type { FBO } from '../types.ts';
import { instanceBuffer, instanceData, mainVAO, qVAO } from './buffers.ts';
import { fbos } from './fbo.ts';
import { renderScene } from './render-scene.ts';
import {
  bloomLocations,
  bloomProgram,
  compositeLocations,
  compositeProgram,
  mainLocations,
  mainProgram,
} from './shaders.ts';
import { required } from './utils.ts';
import { gl, viewport } from './webgl-setup.ts';

function drawQuad() {
  gl.bindVertexArray(qVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

function renderScenePass(sceneFBO: FBO, W: number, H: number, cx: number, cy: number, cz: number, now: number) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.framebuffer);
  gl.viewport(0, 0, W, H);
  gl.clearColor(0.007, 0.003, 0.013, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const ic = renderScene(now);
  if (ic > 0) {
    gl.useProgram(mainProgram);
    gl.uniform2f(mainLocations.uR, W, H);
    gl.uniform2f(mainLocations.uCam, cx, cy);
    gl.uniform1f(mainLocations.uZ, cz);
    gl.uniform1f(mainLocations.uTime, now % WRAP_PERIOD);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instanceData.subarray(0, ic * 9), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(mainVAO);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, ic);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }
}

function renderBloomPass(sceneFBO: FBO, bloomFBO1: FBO, bloomFBO2: FBO) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.framebuffer);
  gl.viewport(0, 0, bloomFBO1.width, bloomFBO1.height);
  gl.useProgram(bloomProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneFBO.texture);
  gl.uniform1i(bloomLocations.uT, 0);
  gl.uniform2f(bloomLocations.uD, 2.5, 0);
  gl.uniform2f(bloomLocations.uR, bloomFBO1.width, bloomFBO1.height);
  drawQuad();

  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO2.framebuffer);
  gl.viewport(0, 0, bloomFBO2.width, bloomFBO2.height);
  gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.texture);
  gl.uniform2f(bloomLocations.uD, 0, 2.5);
  drawQuad();
}

function renderCompositePass(sceneFBO: FBO, bloomFBO2: FBO, W: number, H: number) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.useProgram(compositeProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneFBO.texture);
  gl.uniform1i(compositeLocations.uS, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, bloomFBO2.texture);
  gl.uniform1i(compositeLocations.uB, 1);
  drawQuad();
  gl.activeTexture(gl.TEXTURE0);
}

export function renderFrame(now: number) {
  const sceneFBO = required(fbos.scene, 'fbos.scene');
  const bloomFBO1 = required(fbos.bloom1, 'fbos.bloom1');
  const bloomFBO2 = required(fbos.bloom2, 'fbos.bloom2');
  const W = viewport.W,
    H = viewport.H;

  const cx = state.codexOpen ? cam.x : cam.x + cam.shakeX;
  const cy = state.codexOpen ? cam.y : cam.y + cam.shakeY;
  const cz = cam.z;

  renderScenePass(sceneFBO, W, H, cx, cy, cz, now);
  renderBloomPass(sceneFBO, bloomFBO1, bloomFBO2);
  renderCompositePass(sceneFBO, bloomFBO2, W, H);
}
