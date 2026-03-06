// Shape rendering helpers — shared across unit-shapes.glsl and effect-shapes.glsl

// Soft saturation clamp: limit*tanh(x/limit)
float softClamp(float x, float limit) {
  return limit * tanh(x / limit);
}

// Per-shape soft clamp using SOFT_LIMIT array
float shapeSoftClamp(float x, int sh) {
  return softClamp(x, SOFT_LIMIT[sh]);
}

// Anti-aliased shape base: compute fwidth-scaled AA width and height field
void shapeBase(float d, int sh, out float aa, out float hf) {
  aa = fwidth(d) * FWIDTH_MULT[sh];
  hf = 1.0 - smoothstep(0.0, aa, d);
}

// Rim lighting from signed distance, AA width, and (possibly modified) height field
float shapeRim(float d, float hf, float aa, int sh) {
  return (1.0 - smoothstep(RIM_THRESH[sh], RIM_THRESH[sh] + aa, abs(d))) * hf;
}

// Convenience: base + rim in one call (most shapes use this)
void shapeAA(float d, int sh, out float aa, out float hf, out float rim) {
  shapeBase(d, sh, aa, hf);
  rim = shapeRim(d, hf, aa, sh);
}
