#version 300 es
precision mediump float;
in vec2 vU; uniform sampler2D uS,uB;
out vec4 fragColor;
void main(){
  vec3 s=texture(uS,vU).rgb, b=texture(uB,vU).rgb;
  vec3 c=s+b*2.0;
  c*=1.0-length(vU-0.5)*0.6;
  c=c/(c+0.6);
  fragColor=vec4(c,1.0);
}
