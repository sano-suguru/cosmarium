#version 300 es
in vec2 aP,aO;
in float aS,aSY,aSh; // aSY: Y-scale (reuses angle slot from main shader layout)
in vec4 aC;
out vec4 vC; out vec2 vU; out float vSh;
void main(){
  vec2 sc=aSY>0.0?vec2(aS,aSY):vec2(aS);
  gl_Position=vec4(aP*sc+aO,0.0,1.0);
  vC=aC; vU=aP; vSh=aSh;
}
