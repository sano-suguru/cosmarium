#version 300 es
precision mediump float;
#include includes/sdf.glsl;
#include includes/shape-count.glsl;
in vec4 vC; in vec2 vU; flat in int vSh; in float vA;
uniform float uTime;
out vec4 fragColor;
#include includes/shape-params.glsl;
#include includes/shape-util.glsl;
void main(){
  float d=length(vU), a=0.0;
  int sh=clamp(vSh,0,NUM_SHAPES-1);
  vec3 col=vC.rgb; // デフォルト色。色カスタムが必要な分岐のみ上書き（else-if で排他）
  // ── Unit Shapes (0-18) ──────────────────────
#include includes/shapes/unit-shapes.glsl;
  // ── Effect Shapes (19-29) ───────────────────
#include includes/shapes/effect-shapes.glsl;
  else { a=smoothstep(1.0,0.6,d); }
  fragColor=vec4(col*a, vC.a*clamp(a,0.0,1.0));
}
