import { initBuffers } from './buffers.ts';
import { createFBOs } from './fbo.ts';
import { initShaders } from './shaders.ts';
import { initWebGL } from './webgl-setup.ts';

export function initRenderer() {
  initWebGL();
  initShaders();
  createFBOs();
  initBuffers();
}
