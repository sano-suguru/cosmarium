#version 300 es
precision mediump float;
in vec2 vU; uniform sampler2D uS,uB;
uniform float uAberration;
out vec4 fragColor;
const float BLOOM_THRESHOLD = 0.18;
const float BLOOM_GAIN = 1.1;
void main(){
  vec2 dir = vU - 0.5;
  float dist = length(dir);
  vec3 bloom = max(texture(uB, vU).rgb - BLOOM_THRESHOLD, 0.0) * BLOOM_GAIN;
  vec3 scene;
  if (uAberration < 0.001) {
    scene = texture(uS, vU).rgb;
  } else {
    vec2 offset = dir * dist * uAberration * 0.008;
    scene = vec3(
      texture(uS, vU + offset).r,
      texture(uS, vU).g,
      texture(uS, vU - offset).b
    );
  }
  vec3 c = scene + bloom;
  c *= 1.0 - dist * 0.6;
  c = c / (c + 0.85);
  fragColor = vec4(c, 1.0);
}
