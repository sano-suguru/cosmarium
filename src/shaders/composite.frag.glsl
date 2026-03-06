#version 300 es
precision mediump float;
in vec2 vU; uniform sampler2D uS,uB1,uB2,uB3;
uniform float uAberration;
uniform float uFlash;
out vec4 fragColor;
void main(){
  vec2 dir = vU - 0.5;
  float dist = length(dir);
  vec3 bloom = texture(uB1, vU).rgb * 0.8
             + texture(uB2, vU).rgb * 0.3
             + texture(uB3, vU).rgb * 0.12;
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
  // スプリットトーニング（暗部=冷色、明部=暖色）
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec3 coolTint = vec3(0.92, 0.95, 1.08);
  vec3 warmTint = vec3(1.08, 1.0, 0.92);
  float tintBlend = smoothstep(0.2, 0.8, lum / (lum + 0.5));
  c *= mix(coolTint, warmTint, tintBlend);
  c *= 1.0 - dist * 0.7;
  c = c / (c + 0.75);
  c = mix(c, vec3(1.0), uFlash * 0.3);
  fragColor = vec4(c, 1.0);
}
