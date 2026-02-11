import { gl } from './webgl-setup.ts';
import { Loc, mmLoc } from './shaders.ts';
import { MAX_I, MM_MAX, S_STRIDE } from '../constants.ts';

var qB: WebGLBuffer;
export var iD: Float32Array;
export var iB: WebGLBuffer;
export var mmD: Float32Array;
export var mmB: WebGLBuffer;
export var mainVAO: WebGLVertexArrayObject;
export var mmVAO: WebGLVertexArrayObject;
export var qVAO: WebGLVertexArrayObject;

export function initBuffers() {
  qB = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, qB);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  iD = new Float32Array(MAX_I * 9);
  iB = gl.createBuffer()!;

  mmD = new Float32Array(MM_MAX * 9);
  mmB = gl.createBuffer()!;

  /* --- mainVAO --- */
  mainVAO = gl.createVertexArray()!;
  gl.bindVertexArray(mainVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, qB);
  gl.enableVertexAttribArray(Loc.aP);
  gl.vertexAttribPointer(Loc.aP, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, iB);
  gl.enableVertexAttribArray(Loc.aO);
  gl.vertexAttribPointer(Loc.aO, 2, gl.FLOAT, false, S_STRIDE, 0);
  gl.vertexAttribDivisor(Loc.aO, 1);
  gl.enableVertexAttribArray(Loc.aS);
  gl.vertexAttribPointer(Loc.aS, 1, gl.FLOAT, false, S_STRIDE, 8);
  gl.vertexAttribDivisor(Loc.aS, 1);
  gl.enableVertexAttribArray(Loc.aC);
  gl.vertexAttribPointer(Loc.aC, 4, gl.FLOAT, false, S_STRIDE, 12);
  gl.vertexAttribDivisor(Loc.aC, 1);
  gl.enableVertexAttribArray(Loc.aA);
  gl.vertexAttribPointer(Loc.aA, 1, gl.FLOAT, false, S_STRIDE, 28);
  gl.vertexAttribDivisor(Loc.aA, 1);
  gl.enableVertexAttribArray(Loc.aSh);
  gl.vertexAttribPointer(Loc.aSh, 1, gl.FLOAT, false, S_STRIDE, 32);
  gl.vertexAttribDivisor(Loc.aSh, 1);
  gl.bindVertexArray(null);

  /* --- mmVAO --- */
  mmVAO = gl.createVertexArray()!;
  gl.bindVertexArray(mmVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, qB);
  gl.enableVertexAttribArray(mmLoc.aP);
  gl.vertexAttribPointer(mmLoc.aP, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, mmB);
  gl.enableVertexAttribArray(mmLoc.aO);
  gl.vertexAttribPointer(mmLoc.aO, 2, gl.FLOAT, false, S_STRIDE, 0);
  gl.vertexAttribDivisor(mmLoc.aO, 1);
  gl.enableVertexAttribArray(mmLoc.aS);
  gl.vertexAttribPointer(mmLoc.aS, 1, gl.FLOAT, false, S_STRIDE, 8);
  gl.vertexAttribDivisor(mmLoc.aS, 1);
  gl.enableVertexAttribArray(mmLoc.aC);
  gl.vertexAttribPointer(mmLoc.aC, 4, gl.FLOAT, false, S_STRIDE, 12);
  gl.vertexAttribDivisor(mmLoc.aC, 1);
  gl.enableVertexAttribArray(mmLoc.aSY);
  gl.vertexAttribPointer(mmLoc.aSY, 1, gl.FLOAT, false, S_STRIDE, 28);
  gl.vertexAttribDivisor(mmLoc.aSY, 1);
  gl.enableVertexAttribArray(mmLoc.aSh);
  gl.vertexAttribPointer(mmLoc.aSh, 1, gl.FLOAT, false, S_STRIDE, 32);
  gl.vertexAttribDivisor(mmLoc.aSh, 1);
  gl.bindVertexArray(null);

  /* --- qVAO --- */
  qVAO = gl.createVertexArray()!;
  gl.bindVertexArray(qVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, qB);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
}
