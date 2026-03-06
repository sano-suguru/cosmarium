#version 300 es
precision mediump float;
in vec2 vU; uniform sampler2D uT;
uniform float uTh;
out vec4 fragColor;
void main(){
  fragColor=max(texture(uT,vU)-uTh,0.0);
}
