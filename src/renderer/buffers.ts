import { MAX_INSTANCES, MINIMAP_MAX, STRIDE_BYTES } from '../constants.ts';
import { mainLocations, minimapLocations } from './shaders.ts';
import { gl } from './webgl-setup.ts';

let quadBuffer: WebGLBuffer;
export let instanceData: Float32Array;
export let instanceBuffer: WebGLBuffer;
export let minimapData: Float32Array;
export let minimapBuffer: WebGLBuffer;
export let mainVAO: WebGLVertexArrayObject;
export let mmVAO: WebGLVertexArrayObject;
export let qVAO: WebGLVertexArrayObject;

export function initBuffers() {
  quadBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  instanceData = new Float32Array(MAX_INSTANCES * 9);
  instanceBuffer = gl.createBuffer()!;

  minimapData = new Float32Array(MINIMAP_MAX * 9);
  minimapBuffer = gl.createBuffer()!;

  /* --- mainVAO --- */
  mainVAO = gl.createVertexArray()!;
  gl.bindVertexArray(mainVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(mainLocations.aP);
  gl.vertexAttribPointer(mainLocations.aP, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.enableVertexAttribArray(mainLocations.aO);
  gl.vertexAttribPointer(mainLocations.aO, 2, gl.FLOAT, false, STRIDE_BYTES, 0);
  gl.vertexAttribDivisor(mainLocations.aO, 1);
  gl.enableVertexAttribArray(mainLocations.aS);
  gl.vertexAttribPointer(mainLocations.aS, 1, gl.FLOAT, false, STRIDE_BYTES, 8);
  gl.vertexAttribDivisor(mainLocations.aS, 1);
  gl.enableVertexAttribArray(mainLocations.aC);
  gl.vertexAttribPointer(mainLocations.aC, 4, gl.FLOAT, false, STRIDE_BYTES, 12);
  gl.vertexAttribDivisor(mainLocations.aC, 1);
  gl.enableVertexAttribArray(mainLocations.aA);
  gl.vertexAttribPointer(mainLocations.aA, 1, gl.FLOAT, false, STRIDE_BYTES, 28);
  gl.vertexAttribDivisor(mainLocations.aA, 1);
  gl.enableVertexAttribArray(mainLocations.aSh);
  gl.vertexAttribPointer(mainLocations.aSh, 1, gl.FLOAT, false, STRIDE_BYTES, 32);
  gl.vertexAttribDivisor(mainLocations.aSh, 1);
  gl.bindVertexArray(null);

  /* --- mmVAO --- */
  mmVAO = gl.createVertexArray()!;
  gl.bindVertexArray(mmVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(minimapLocations.aP);
  gl.vertexAttribPointer(minimapLocations.aP, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, minimapBuffer);
  gl.enableVertexAttribArray(minimapLocations.aO);
  gl.vertexAttribPointer(minimapLocations.aO, 2, gl.FLOAT, false, STRIDE_BYTES, 0);
  gl.vertexAttribDivisor(minimapLocations.aO, 1);
  gl.enableVertexAttribArray(minimapLocations.aS);
  gl.vertexAttribPointer(minimapLocations.aS, 1, gl.FLOAT, false, STRIDE_BYTES, 8);
  gl.vertexAttribDivisor(minimapLocations.aS, 1);
  gl.enableVertexAttribArray(minimapLocations.aC);
  gl.vertexAttribPointer(minimapLocations.aC, 4, gl.FLOAT, false, STRIDE_BYTES, 12);
  gl.vertexAttribDivisor(minimapLocations.aC, 1);
  gl.enableVertexAttribArray(minimapLocations.aSY);
  gl.vertexAttribPointer(minimapLocations.aSY, 1, gl.FLOAT, false, STRIDE_BYTES, 28);
  gl.vertexAttribDivisor(minimapLocations.aSY, 1);
  gl.enableVertexAttribArray(minimapLocations.aSh);
  gl.vertexAttribPointer(minimapLocations.aSh, 1, gl.FLOAT, false, STRIDE_BYTES, 32);
  gl.vertexAttribDivisor(minimapLocations.aSh, 1);
  gl.bindVertexArray(null);

  /* --- qVAO --- */
  qVAO = gl.createVertexArray()!;
  gl.bindVertexArray(qVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
}
