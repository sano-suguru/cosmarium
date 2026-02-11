#version 300 es
precision mediump float;
#include includes/sdf.glsl;
in vec4 vC; in vec2 vU; in float vSh;
out vec4 fragColor;
void main(){
  float d=length(vU), a=0.0;
  int sh=int(vSh+0.5);
  if(sh==0){ a=smoothstep(1.0,0.55,d)+exp(-d*2.5)*0.7; }
  else if(sh==1){ float dd=manDist(vU); a=smoothstep(1.0,0.7,dd)+exp(-dd*3.0)*0.4; }
  else if(sh==2){ float t=vU.x*0.5+0.5,w=mix(0.7,0.0,t);
    a=smoothstep(0.15,0.0,abs(vU.y)-w)*smoothstep(-0.1,0.1,1.0-t)+exp(-d*2.0)*0.3; }
  else if(sh==3){ float dd=hexDist(vU);
    a=smoothstep(1.0,0.8,dd)+exp(-dd*2.5)*0.5; }
  else if(sh==4){ float cx=step(abs(vU.x),0.2)+step(abs(vU.y),0.2);
    a=min(cx,1.0)*smoothstep(1.0,0.6,d)+exp(-d*2.0)*0.4; }
  else if(sh==5){ float ring=abs(d-0.7);
    a=smoothstep(0.2,0.03,ring)+exp(-d*1.5)*0.2; }
  else if(sh==6){ float t=vU.x*0.5+0.5,w=mix(0.45,0.0,t*t);
    float body=step(abs(vU.y),0.12)*step(0.0,vU.x+0.6);
    a=max(smoothstep(0.1,0.0,abs(vU.y)-w)*step(0.35,t),body)*0.9+exp(-d*2.5)*0.4; }
  else if(sh==7){ float r=polarR(vU,5.0,0.6,0.35);
    a=smoothstep(r+0.15,r-0.05,d)+exp(-d*2.0)*0.3; }
  else if(sh==8){ float d2=length(vU-vec2(0.3,0.0));
    a=smoothstep(0.85,0.6,d)*smoothstep(0.45,0.7,d2)+exp(-d*2.0)*0.3; }
  else if(sh==9){ vec2 av=abs(vU); float dd=max(av.x,av.y);
    a=smoothstep(0.85,0.55,dd)+exp(-dd*2.0)*0.4; }
  else if(sh==10){ float ring=abs(d-0.75);
    a=exp(-ring*8.0)*0.6+exp(-d*1.0)*0.08; }
  else if(sh==11){ float bx=abs(vU.x),by=abs(vU.y);
    a=step(by,bx*0.8)*smoothstep(1.0,0.65,d)+exp(-d*2.0)*0.35; }
  else if(sh==12){ float by=abs(vU.y);
    a=exp(-by*6.0)*1.0+exp(-by*2.5)*0.4+exp(-d*1.5)*0.2; }
  else if(sh==13){ float dd=manDist(vU);
    a=(smoothstep(1.0,0.65,dd)-smoothstep(0.55,0.35,dd))*0.8+exp(-dd*2.0)*0.5; }
  else if(sh==14){ float r=polarR(vU,3.0,0.55,0.3);
    a=smoothstep(r+0.15,r-0.1,d)+exp(-d*2.0)*0.3; }
  else if(sh==15){ float bx=abs(vU.x-vU.y*0.3),by=abs(vU.y);
    a=exp(-bx*5.0)*0.8*step(by,0.8)+exp(-d*2.0)*0.3; }
  else if(sh==16){ float an=atan(vU.y,vU.x),se=1.2566,hse=0.6283;
    float r=0.809/cos(mod(an+6.2832,se)-hse); float dd=d/(r*0.9);
    a=smoothstep(1.0,0.75,dd)+exp(-dd*2.5)*0.4; }
  else if(sh==20){ float dd=hexDist(vU);
    a=smoothstep(1.0,0.75,dd)+exp(-dd*1.5)*0.6+exp(-d*1.2)*0.4; }
  else { a=smoothstep(1.0,0.6,d); }
  fragColor=vec4(vC.rgb*a, vC.a*clamp(a,0.0,1.0));
}
