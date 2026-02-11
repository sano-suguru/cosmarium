import { gl } from './webgl-setup.ts';

import mainVertSrc from '../shaders/main.vert.glsl?raw';
import mainFragSrc from '../shaders/main.frag.glsl?raw';
import quadVertSrc from '../shaders/quad.vert.glsl?raw';
import bloomFragSrc from '../shaders/bloom.frag.glsl?raw';
import compositeFragSrc from '../shaders/composite.frag.glsl?raw';
import minimapVertSrc from '../shaders/minimap.vert.glsl?raw';
import minimapFragSrc from '../shaders/minimap.frag.glsl?raw';

export var mP: WebGLProgram;
export var blP: WebGLProgram;
export var coP: WebGLProgram;
export var mmP: WebGLProgram;

export var Loc: {
  aP: number; aO: number; aS: number; aC: number; aA: number; aSh: number;
  uR: WebGLUniformLocation | null;
  uCam: WebGLUniformLocation | null;
  uZ: WebGLUniformLocation | null;
};

export var mmLoc: {
  aP: number; aO: number; aS: number; aC: number; aSY: number; aSh: number;
};

export var blLoc: {
  uT: WebGLUniformLocation | null;
  uD: WebGLUniformLocation | null;
  uR: WebGLUniformLocation | null;
};

export var coLoc: {
  uS: WebGLUniformLocation | null;
  uB: WebGLUniformLocation | null;
};

function CS(s: string, t: number) {
  var sh = gl.createShader(t)!;
  gl.shaderSource(sh, s);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(sh));
  return sh;
}

function CP(v: string, f: string) {
  var p = gl.createProgram()!;
  gl.attachShader(p, CS(v, gl.VERTEX_SHADER));
  gl.attachShader(p, CS(f, gl.FRAGMENT_SHADER));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    console.error(gl.getProgramInfoLog(p));
  return p;
}

export function initShaders() {
  mP = CP(mainVertSrc, mainFragSrc);
  blP = CP(quadVertSrc, bloomFragSrc);
  coP = CP(quadVertSrc, compositeFragSrc);
  mmP = CP(minimapVertSrc, minimapFragSrc);

  Loc = {
    aP:  gl.getAttribLocation(mP, 'aP'),
    aO:  gl.getAttribLocation(mP, 'aO'),
    aS:  gl.getAttribLocation(mP, 'aS'),
    aC:  gl.getAttribLocation(mP, 'aC'),
    aA:  gl.getAttribLocation(mP, 'aA'),
    aSh: gl.getAttribLocation(mP, 'aSh'),
    uR:  gl.getUniformLocation(mP, 'uR'),
    uCam:gl.getUniformLocation(mP, 'uCam'),
    uZ:  gl.getUniformLocation(mP, 'uZ')
  };

  mmLoc = {
    aP:  gl.getAttribLocation(mmP, 'aP'),
    aO:  gl.getAttribLocation(mmP, 'aO'),
    aS:  gl.getAttribLocation(mmP, 'aS'),
    aC:  gl.getAttribLocation(mmP, 'aC'),
    aSY: gl.getAttribLocation(mmP, 'aSY'),
    aSh: gl.getAttribLocation(mmP, 'aSh')
  };

  blLoc = {
    uT: gl.getUniformLocation(blP, 'uT'),
    uD: gl.getUniformLocation(blP, 'uD'),
    uR: gl.getUniformLocation(blP, 'uR')
  };

  coLoc = {
    uS: gl.getUniformLocation(coP, 'uS'),
    uB: gl.getUniformLocation(coP, 'uB')
  };

  if (import.meta.env.DEV) {
    var locs: Record<string, WebGLUniformLocation | null> = { 'Loc.uR': Loc.uR, 'Loc.uCam': Loc.uCam, 'Loc.uZ': Loc.uZ, 'blLoc.uT': blLoc.uT, 'blLoc.uD': blLoc.uD, 'blLoc.uR': blLoc.uR, 'coLoc.uS': coLoc.uS, 'coLoc.uB': coLoc.uB };
    for (var name in locs) if (locs[name] === null) console.warn('Uniform location is null:', name);
  }
}
