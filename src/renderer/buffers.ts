import { required } from './assert.ts';
import { mainLocations, minimapLocations } from './shaders.ts';
import { gl } from './webgl-setup.ts';

const STRIDE_BYTES = 36;
export const MINIMAP_MAX = 1200;
export const MAX_INSTANCES = 100000;

let quadBuffer: WebGLBuffer;
export let instanceData: Float32Array;
export let instanceDataI32: Int32Array;
export let instanceBuffer: WebGLBuffer;
export let minimapData: Float32Array;
export let minimapDataI32: Int32Array;
export let minimapBuffer: WebGLBuffer;
export let mainVAO: WebGLVertexArrayObject;
export let mmVAO: WebGLVertexArrayObject;
export let qVAO: WebGLVertexArrayObject;

interface AttribEntry {
  loc: number;
  size: number;
  offset: number;
  integer?: true | undefined;
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
    if (attr.integer) {
      gl.vertexAttribIPointer(attr.loc, attr.size, gl.INT, STRIDE_BYTES, attr.offset);
    } else {
      gl.vertexAttribPointer(attr.loc, attr.size, gl.FLOAT, false, STRIDE_BYTES, attr.offset);
    }
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
  intBuf: Int32Array,
  base: number,
  x: number,
  y: number,
  size: number,
  r: number,
  g: number,
  b: number,
  a: number,
  angle: number,
  shapeId: number,
): void {
  buf[base] = x;
  buf[base + 1] = y;
  buf[base + 2] = size;
  buf[base + 3] = r;
  buf[base + 4] = g;
  buf[base + 5] = b;
  buf[base + 6] = a;
  buf[base + 7] = angle;
  intBuf[base + 8] = shapeId;
}

export function initBuffers() {
  quadBuffer = required(gl.createBuffer(), 'quadBuffer');
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const instanceAB = new ArrayBuffer(MAX_INSTANCES * STRIDE_BYTES);
  instanceData = new Float32Array(instanceAB);
  instanceDataI32 = new Int32Array(instanceAB);
  instanceBuffer = required(gl.createBuffer(), 'instanceBuffer');

  const minimapAB = new ArrayBuffer(MINIMAP_MAX * STRIDE_BYTES);
  minimapData = new Float32Array(minimapAB);
  minimapDataI32 = new Int32Array(minimapAB);
  minimapBuffer = required(gl.createBuffer(), 'minimapBuffer');

  const mainAttribs: readonly AttribEntry[] = [
    { loc: mainLocations.aO, size: 2, offset: 0 },
    { loc: mainLocations.aS, size: 1, offset: 8 },
    { loc: mainLocations.aC, size: 4, offset: 12 },
    { loc: mainLocations.aA, size: 1, offset: 28 },
    { loc: mainLocations.aSh, size: 1, offset: 32, integer: true },
  ];
  mainVAO = setupVAO('mainVAO', instanceBuffer, mainLocations.aP, mainAttribs);

  const mmAttribs: readonly AttribEntry[] = [
    { loc: minimapLocations.aO, size: 2, offset: 0 },
    { loc: minimapLocations.aS, size: 1, offset: 8 },
    { loc: minimapLocations.aC, size: 4, offset: 12 },
    { loc: minimapLocations.aSY, size: 1, offset: 28 },
    { loc: minimapLocations.aSh, size: 1, offset: 32, integer: true },
  ];
  mmVAO = setupVAO('mmVAO', minimapBuffer, minimapLocations.aP, mmAttribs);

  setupQuadVAO();
}
