#version 300 es
in vec2 aP,aO;
in float aS,aA,aSh;
in vec4 aC;
out vec4 vC; out vec2 vU; out float vSh,vA;
uniform vec2 uR,uCam; uniform float uZ;
void main(){
  float c=cos(aA),s=sin(aA);
  vec2 p=mat2(c,s,-s,c)*aP*aS+aO;
  p=(p-uCam)*uZ;
  gl_Position=vec4(p/uR*2.0,0.0,1.0);
  vC=aC; vU=aP; vSh=aSh; vA=aA;
}
