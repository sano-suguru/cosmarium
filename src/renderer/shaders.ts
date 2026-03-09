import bloomFragSrc from '../shaders/bloom.frag.glsl';
import brightPassFragSrc from '../shaders/bright-pass.frag.glsl';
import compositeFragSrc from '../shaders/composite.frag.glsl';
import mainFragSrc from '../shaders/main.frag.glsl';
import mainVertSrc from '../shaders/main.vert.glsl';
import minimapFragSrc from '../shaders/minimap.frag.glsl';
import minimapVertSrc from '../shaders/minimap.vert.glsl';
import quadVertSrc from '../shaders/quad.vert.glsl';
import { devError, devWarn } from '../ui/dev-overlay/DevOverlay.tsx';
import { required } from './assert.ts';
import { gl } from './webgl-setup.ts';

export let mainProgram: WebGLProgram;
export let brightPassProgram: WebGLProgram;
export let bloomProgram: WebGLProgram;
export let compositeProgram: WebGLProgram;
export let minimapProgram: WebGLProgram;

export let mainLocations: {
  aP: number;
  aO: number;
  aS: number;
  aC: number;
  aA: number;
  aSh: number;
  uR: WebGLUniformLocation | null;
  uCam: WebGLUniformLocation | null;
  uZ: WebGLUniformLocation | null;
  uTime: WebGLUniformLocation | null;
};

export let minimapLocations: {
  aP: number;
  aO: number;
  aS: number;
  aC: number;
  aSY: number;
  aSh: number;
};

export let brightPassLocations: {
  uT: WebGLUniformLocation | null;
  uTh: WebGLUniformLocation | null;
};

export let bloomLocations: {
  uT: WebGLUniformLocation | null;
  uD: WebGLUniformLocation | null;
  uR: WebGLUniformLocation | null;
};

export let compositeLocations: {
  uS: WebGLUniformLocation | null;
  uB1: WebGLUniformLocation | null;
  uB2: WebGLUniformLocation | null;
  uB3: WebGLUniformLocation | null;
  uAberration: WebGLUniformLocation | null;
  uFlash: WebGLUniformLocation | null;
};

function compileShader(s: string, t: number) {
  const shader = required(gl.createShader(t), 'createShader');
  gl.shaderSource(shader, s);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'unknown error';
    devError(log);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

function createProgram(v: string, f: string) {
  const p = required(gl.createProgram(), 'createProgram');
  gl.attachShader(p, compileShader(v, gl.VERTEX_SHADER));
  gl.attachShader(p, compileShader(f, gl.FRAGMENT_SHADER));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? 'unknown error';
    devError(log);
    throw new Error(`Program link failed: ${log}`);
  }
  return p;
}

export function initShaders() {
  mainProgram = createProgram(mainVertSrc, mainFragSrc);
  brightPassProgram = createProgram(quadVertSrc, brightPassFragSrc);
  bloomProgram = createProgram(quadVertSrc, bloomFragSrc);
  compositeProgram = createProgram(quadVertSrc, compositeFragSrc);
  minimapProgram = createProgram(minimapVertSrc, minimapFragSrc);

  mainLocations = {
    aP: gl.getAttribLocation(mainProgram, 'aP'),
    aO: gl.getAttribLocation(mainProgram, 'aO'),
    aS: gl.getAttribLocation(mainProgram, 'aS'),
    aC: gl.getAttribLocation(mainProgram, 'aC'),
    aA: gl.getAttribLocation(mainProgram, 'aA'),
    aSh: gl.getAttribLocation(mainProgram, 'aSh'),
    uR: gl.getUniformLocation(mainProgram, 'uR'),
    uCam: gl.getUniformLocation(mainProgram, 'uCam'),
    uZ: gl.getUniformLocation(mainProgram, 'uZ'),
    uTime: gl.getUniformLocation(mainProgram, 'uTime'),
  };

  minimapLocations = {
    aP: gl.getAttribLocation(minimapProgram, 'aP'),
    aO: gl.getAttribLocation(minimapProgram, 'aO'),
    aS: gl.getAttribLocation(minimapProgram, 'aS'),
    aC: gl.getAttribLocation(minimapProgram, 'aC'),
    aSY: gl.getAttribLocation(minimapProgram, 'aSY'),
    aSh: gl.getAttribLocation(minimapProgram, 'aSh'),
  };

  brightPassLocations = {
    uT: gl.getUniformLocation(brightPassProgram, 'uT'),
    uTh: gl.getUniformLocation(brightPassProgram, 'uTh'),
  };

  bloomLocations = {
    uT: gl.getUniformLocation(bloomProgram, 'uT'),
    uD: gl.getUniformLocation(bloomProgram, 'uD'),
    uR: gl.getUniformLocation(bloomProgram, 'uR'),
  };

  compositeLocations = {
    uS: gl.getUniformLocation(compositeProgram, 'uS'),
    uB1: gl.getUniformLocation(compositeProgram, 'uB1'),
    uB2: gl.getUniformLocation(compositeProgram, 'uB2'),
    uB3: gl.getUniformLocation(compositeProgram, 'uB3'),
    uAberration: gl.getUniformLocation(compositeProgram, 'uAberration'),
    uFlash: gl.getUniformLocation(compositeProgram, 'uFlash'),
  };

  if (import.meta.env.DEV) {
    const locs: Record<string, WebGLUniformLocation | null> = {
      'mainLocations.uR': mainLocations.uR,
      'mainLocations.uCam': mainLocations.uCam,
      'mainLocations.uZ': mainLocations.uZ,
      'mainLocations.uTime': mainLocations.uTime,
      'brightPassLocations.uT': brightPassLocations.uT,
      'brightPassLocations.uTh': brightPassLocations.uTh,
      'bloomLocations.uT': bloomLocations.uT,
      'bloomLocations.uD': bloomLocations.uD,
      'bloomLocations.uR': bloomLocations.uR,
      'compositeLocations.uS': compositeLocations.uS,
      'compositeLocations.uB1': compositeLocations.uB1,
      'compositeLocations.uB2': compositeLocations.uB2,
      'compositeLocations.uB3': compositeLocations.uB3,
      'compositeLocations.uAberration': compositeLocations.uAberration,
      'compositeLocations.uFlash': compositeLocations.uFlash,
    };
    for (const name in locs) {
      if (locs[name] === null) {
        devWarn('Uniform location is null:', name);
      }
    }
  }
}
