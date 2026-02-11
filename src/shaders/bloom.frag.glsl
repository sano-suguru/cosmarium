#version 300 es
precision mediump float;
in vec2 vU; uniform sampler2D uT; uniform vec2 uD,uR;
out vec4 fragColor;
void main(){
  vec4 s=texture(uT,vU)*0.227;
  for(int i=1;i<5;i++){
    float w = i==1?0.195 : i==2?0.122 : i==3?0.054 : 0.016;
    vec2 o=uD*float(i)/uR;
    s+=texture(uT,vU+o)*w; s+=texture(uT,vU-o)*w;
  }
  fragColor=s;
}
