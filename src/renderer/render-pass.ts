import { cam } from '../input/camera.ts';
import { screenEffects } from '../screen-effects.ts';
import { state } from '../state.ts';
import type { FBO } from '../types.ts';
import { required } from './assert.ts';
import { instanceBuffer, instanceData, mainVAO, qVAO } from './buffers.ts';
import type { BloomScales } from './fbo.ts';
import { fbos } from './fbo.ts';
import { renderScene } from './render-scene.ts';
import { WRAP_PERIOD } from './render-write.ts';
import {
  bloomLocations,
  bloomProgram,
  brightPassLocations,
  brightPassProgram,
  compositeLocations,
  compositeProgram,
  mainLocations,
  mainProgram,
} from './shaders.ts';
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

  const ic = renderScene(now, cx, cy, cz, W, H);
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

function brightPass(src: FBO, dst: FBO, threshold: number) {
  gl.useProgram(brightPassProgram);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
  gl.viewport(0, 0, dst.width, dst.height);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, src.texture);
  gl.uniform1i(brightPassLocations.uT, 0);
  gl.uniform1f(brightPassLocations.uTh, threshold);
  drawQuad();
}

function blurPass(src: FBO, tmp: FBO, dst: FBO, radius: number) {
  gl.useProgram(bloomProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(bloomLocations.uT, 0);

  // Horizontal
  gl.bindFramebuffer(gl.FRAMEBUFFER, tmp.framebuffer);
  gl.viewport(0, 0, tmp.width, tmp.height);
  gl.bindTexture(gl.TEXTURE_2D, src.texture);
  gl.uniform2f(bloomLocations.uD, radius, 0);
  gl.uniform2f(bloomLocations.uR, tmp.width, tmp.height);
  drawQuad();

  // Vertical
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst.framebuffer);
  gl.viewport(0, 0, dst.width, dst.height);
  gl.bindTexture(gl.TEXTURE_2D, tmp.texture);
  gl.uniform2f(bloomLocations.uD, 0, radius);
  drawQuad();
}

const BRIGHT_THRESHOLD = 0.18;
const BLUR_RADIUS = 2.5;

function renderBloomPass(sceneFBO: FBO, brightFBO: FBO, bloom: BloomScales) {
  brightPass(sceneFBO, brightFBO, BRIGHT_THRESHOLD);
  let src: FBO = brightFBO;
  for (const scale of bloom) {
    blurPass(src, scale.tmp, scale.result, BLUR_RADIUS);
    src = scale.result;
  }
}

function renderCompositePass(sceneFBO: FBO, bloom: BloomScales, W: number, H: number) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, H);
  gl.useProgram(compositeProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneFBO.texture);
  gl.uniform1i(compositeLocations.uS, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, bloom[0].result.texture);
  gl.uniform1i(compositeLocations.uB1, 1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, bloom[1].result.texture);
  gl.uniform1i(compositeLocations.uB2, 2);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, bloom[2].result.texture);
  gl.uniform1i(compositeLocations.uB3, 3);
  gl.uniform1f(compositeLocations.uAberration, screenEffects.aberrationIntensity);
  gl.uniform1f(compositeLocations.uFlash, screenEffects.flashIntensity);
  drawQuad();
  gl.activeTexture(gl.TEXTURE0);
}

export function renderFrame(now: number) {
  const sceneFBO = required(fbos.scene, 'fbos.scene');
  const brightFBO = required(fbos.bright, 'fbos.bright');
  const bloom = required(fbos.bloom, 'fbos.bloom');
  const W = viewport.W,
    H = viewport.H;

  const cx = state.codexOpen ? cam.x : cam.x + cam.shakeX;
  const cy = state.codexOpen ? cam.y : cam.y + cam.shakeY;
  const cz = cam.z;

  renderScenePass(sceneFBO, W, H, cx, cy, cz, now);
  renderBloomPass(sceneFBO, brightFBO, bloom);
  renderCompositePass(sceneFBO, bloom, W, H);
}
