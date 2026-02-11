#version 300 es
precision mediump float;
in vec4 vC; in vec2 vU; in float vSh;
out vec4 fragColor;
void main(){
  if(int(vSh+0.5)==0 && length(vU)>1.0) discard;
  fragColor=vC;
}
