#version 300 es
precision mediump float;
in vec4 vC; in vec2 vU; flat in int vSh;
out vec4 fragColor;
void main(){
  // Shape 0 (circle) はクワッド角が見えるため円形クリッピングが必要。
  // 他の shape はクワッド全体をそのまま色出力するため不要。
  if(vSh==0 && length(vU)>1.0) discard;
  fragColor=vC;
}
