import { required } from './assert.ts';
import { mainLocations, minimapLocations } from './shaders.ts';
import { gl } from './webgl-setup.ts';

const STRIDE_BYTES = 36;
export const MINIMAP_MAX = 1200;
export const MAX_INSTANCES = 100000;

let quadBuffer: WebGLBuffer;
export let instanceData: Float32Array;
export let instanceBuffer: WebGLBuffer;
export let minimapData: Float32Array;
export let minimapBuffer: WebGLBuffer;
export let mainVAO: WebGLVertexArrayObject;
export let mmVAO: WebGLVertexArrayObject;
export let qVAO: WebGLVertexArrayObject;

interface AttribEntry {
  loc: number;
  size: number;
  offset: number;
}

function setupVAO(
  name: string,
  instBuf: WebGLBuffer,
  posLoc: number,
  attribs: readonly AttribEntry[],
): WebGLVertexArrayObject {
  const vao = required(gl.createVertexArray(), name);
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  for (const attr of attribs) {
    gl.enableVertexAttribArray(attr.loc);
    gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, STRIDE_BYTES, attr.offset);
    gl.vertexAttribDivisor(attr.loc, 1);
  }
  gl.bindVertexArray(null);
  return vao;
}

function setupQuadVAO() {
  qVAO = required(gl.createVertexArray(), 'qVAO');
  gl.bindVertexArray(qVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
}

export function writeSlots(
  buf: Float32Array,
  base: number,
  v0: number,
  v1: number,
  v2: number,
  v3: number,
  v4: number,
  v5: number,
  v6: number,
  v7: number,
  v8: number,
): void {
  buf[base] = v0;
  buf[base + 1] = v1;
  buf[base + 2] = v2;
  buf[base + 3] = v3;
  buf[base + 4] = v4;
  buf[base + 5] = v5;
  buf[base + 6] = v6;
  buf[base + 7] = v7;
  buf[base + 8] = v8;
}

export function initBuffers() {
  quadBuffer = required(gl.createBuffer(), 'quadBuffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  instanceData = new Float32Array(MAX_INSTANCES * 9);
  instanceBuffer = required(gl.createBuffer(), 'instanceBuffer');

  minimapData = new Float32Array(MINIMAP_MAX * 9);
  minimapBuffer = required(gl.createBuffer(), 'minimapBuffer');

  const mainAttribs: readonly AttribEntry[] = [
    { loc: mainLocations.aO, size: 2, offset: 0 },
    { loc: mainLocations.aS, size: 1, offset: 8 },
    { loc: mainLocations.aC, size: 4, offset: 12 },
    { loc: mainLocations.aA, size: 1, offset: 28 },
    { loc: mainLocations.aSh, size: 1, offset: 32 },
  ];
  mainVAO = setupVAO('mainVAO', instanceBuffer, mainLocations.aP, mainAttribs);

  const mmAttribs: readonly AttribEntry[] = [
    { loc: minimapLocations.aO, size: 2, offset: 0 },
    { loc: minimapLocations.aS, size: 1, offset: 8 },
    { loc: minimapLocations.aC, size: 4, offset: 12 },
    { loc: minimapLocations.aSY, size: 1, offset: 28 },
    { loc: minimapLocations.aSh, size: 1, offset: 32 },
  ];
  mmVAO = setupVAO('mmVAO', minimapBuffer, minimapLocations.aP, mmAttribs);

  setupQuadVAO();
}
