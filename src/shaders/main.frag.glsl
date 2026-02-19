#version 300 es
precision mediump float;
#include includes/sdf.glsl;
in vec4 vC; in vec2 vU; in float vSh,vA;
out vec4 fragColor;
void main(){
  float d=length(vU), a=0.0;
  int sh=int(vSh+0.5);
  if(sh==0){ a=smoothstep(1.0,0.55,d)+exp(-d*2.5)*0.7; }
  else if(sh==1){ float dd=manDist(vU); a=smoothstep(1.0,0.7,dd)+exp(-dd*3.0)*0.4; }
  else if(sh==2){
    vec2 p=vU*1.03; float t=vA;
    // Heavy Bomber: Wide fuselage, thick wings, cargo bay
    
    // 1. Wings (Back): Wide sweep
    float dWingL=sdCapsule(p,vec2(0.2,0.35),vec2(-0.4,0.65),0.12);
    float dWingR=sdCapsule(p,vec2(0.2,-0.35),vec2(-0.4,-0.65),0.12);
    float dWings=min(dWingL,dWingR);

    // 2. Main Body: Central wide block
    float dBody=sdRoundedBox(p-vec2(0.1,0.0),vec2(0.55,0.22),0.15);
    
    // Smooth Union
    float dShape=smin(dBody,dWings,0.15);
    
    // 3. Cargo Bay Cutout (Belly)
    float dCargo=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.25,0.10),0.05);
    // Subtle indentation instead of full cutout
    float dShapeCarved=max(dShape,-dCargo); 

    // AA and Height Field
    float aa=fwidth(dShapeCarved)*1.5;
    float hf=1.0-smoothstep(0.0,aa,dShapeCarved);
    
    // 4. Details
    // Rim lighting
    float rim=(1.0-smoothstep(0.02,0.02+aa,abs(dShapeCarved)))*hf;
    // Cargo Bay Glow/Outline
    float cargoGlow=(1.0-smoothstep(0.0,aa,abs(dCargo)))*0.6; 
    
    // 5. Engine Glow (Rear)
    // Twin engines at back of wings
    float dEng1=length(p-vec2(-0.45,0.45));
    float dEng2=length(p-vec2(-0.45,-0.45));
    float engDist=min(dEng1,dEng2);
    
    float pulse=0.6+0.4*sin(t*4.0);
    float glow=exp(-engDist*6.0)*pulse;
    
    // Exhaust trails (going left, negative X)
    // p.x < -0.45 is behind engine.
    // Use exponential decay based on distance from engine center
    float trail=0.0;
    if(p.x < -0.45) {
       float dy1=abs(p.y-0.45);
       float dy2=abs(p.y+0.45);
       float dy=min(dy1,dy2);
       trail=exp(-dy*10.0) * exp((p.x+0.45)*2.0) * pulse * 0.5;
    }

    a=hf*0.5 + rim*0.4 + cargoGlow*0.3 + glow + trail;
    a=1.2*tanh(a/1.2); // Tone map
  }
  else if(sh==3){ float dd=hexDist(vU);
    a=smoothstep(1.0,0.8,dd)+exp(-dd*2.5)*0.5; }
  else if(sh==4){ float cx=step(abs(vU.x),0.2)+step(abs(vU.y),0.2);
    a=min(cx,1.0)*smoothstep(1.0,0.6,d)+exp(-d*2.0)*0.4; }
  else if(sh==5){ float ring=abs(d-0.7);
    a=smoothstep(0.2,0.03,ring)+exp(-d*1.5)*0.2; }
  else if(sh==6){
    vec2 p=vU*0.84; float t=vA;
    // Launcher: Sleek Missile Frigate
    // Long thin hull, sharp nose, side missile pods
    
    // 1. Main Hull (Elongated, thin)
    // Sharp nose: cut the front at an angle
    // p.x > 0.1: taper y
    float noseTaper = max(0.0, (p.x - 0.1) * 0.4);
    // noseTaper > 0.08 で y-extent が負になり、先端を鋭く絞る（意図的）
    float dHull = sdRoundedBox(p-vec2(-0.05,0.0), vec2(0.55, 0.08 - noseTaper), 0.03);
    
    // 2. Missile Pods (Side protrusions)
    // Located mid-ship, symmetric
    float dPodL=sdRoundedBox(p-vec2(0.0,0.18),vec2(0.15,0.06),0.02);
    float dPodR=sdRoundedBox(p-vec2(0.0,-0.18),vec2(0.15,0.06),0.02);
    float dPods=min(dPodL,dPodR);
    
    // 3. Bridge / Superstructure (Small bump on top/rear)
    float dBridge=sdRoundedBox(p-vec2(-0.25,0.0),vec2(0.08,0.12),0.02);
    
    // Smooth Union for organic but mechanical feel
    float dShape=smin(dHull,dPods,0.05);
    dShape=smin(dShape,dBridge,0.04);
    
    // 4. Details: Missile Tubes (Indentation on pods)
    // Repeating pattern or just a slit
    float dTubeL=sdRoundedBox(p-vec2(0.05,0.18),vec2(0.08,0.02),0.01);
    float dTubeR=sdRoundedBox(p-vec2(0.05,-0.18),vec2(0.08,0.02),0.01);
    float dTubes=min(dTubeL,dTubeR);
    
    // Engrave tubes
    dShape=max(dShape,-dTubes);
    
    // AA and Height Field
    float aa=fwidth(dShape)*1.5;
    float hf=1.0-smoothstep(0.0,aa,dShape);
    
    // 5. Visuals
    // Rim lighting (Sharp edge)
    float rim=(1.0-smoothstep(0.02,0.02+aa,abs(dShape)))*hf;
    
    // Engine Glow (Single, central, rear)
    float dEng=length(p-vec2(-0.6,0.0));
    float pulse=0.7+0.3*sin(t*10.0);
    float glow=exp(-dEng*8.0)*pulse;
    
    // Engine Trail (Single narrow stream)
    float trail=0.0;
    if(p.x < -0.6) {
       float dy=abs(p.y);
       trail=exp(-dy*15.0) * exp((p.x+0.6)*2.5) * pulse * 0.6;
    }
    
    // Missile Pod Glow (Subtle status lights)
    float podGlow=(1.0-smoothstep(0.0,0.02,abs(dTubes)))*0.5*(0.5+0.5*sin(t*3.0));

    a=hf*0.6 + rim*0.5 + glow + trail + podGlow;
    a=1.1*tanh(a/1.1);
  }
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
  else if(sh==12){ float by=abs(vU.y),bx=abs(vU.x);
    float xf=smoothstep(1.0,0.4,bx);
    a=(exp(-by*6.0)*1.0+exp(-by*2.5)*0.4)*xf+exp(-d*1.5)*0.2; }
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
  else if(sh==21){ float bx=abs(vU.x),by=abs(vU.y);
    a=smoothstep(1.0,0.95,bx)*smoothstep(0.18,0.1,by)+exp(-by*14.0)*0.06; }
  else if(sh==22){ float od=octDist(vU);
    float edge=abs(od-0.75);
    a=smoothstep(0.06,0.01,edge)*0.7;
    float t=vA*4.0;
    vec2 v0=vec2(0.75,0.311); vec2 v1=vec2(0.311,0.75);
    vec2 v2=vec2(-0.311,0.75); vec2 v3=vec2(-0.75,0.311);
    vec2 v4=vec2(-0.75,-0.311); vec2 v5=vec2(-0.311,-0.75);
    vec2 v6=vec2(0.311,-0.75); vec2 v7=vec2(0.75,-0.311);
    float n0=exp(-length(vU-v0)*22.0)*(0.3+0.7*(0.5+0.5*sin(t)));
    float n1=exp(-length(vU-v1)*22.0)*(0.3+0.7*(0.5+0.5*sin(t+0.785)));
    float n2=exp(-length(vU-v2)*22.0)*(0.3+0.7*(0.5+0.5*sin(t+1.571)));
    float n3=exp(-length(vU-v3)*22.0)*(0.3+0.7*(0.5+0.5*sin(t+2.356)));
    float n4=exp(-length(vU-v4)*22.0)*(0.3+0.7*(0.5+0.5*sin(t+3.142)));
    float n5=exp(-length(vU-v5)*22.0)*(0.3+0.7*(0.5+0.5*sin(t+3.927)));
    float n6=exp(-length(vU-v6)*22.0)*(0.3+0.7*(0.5+0.5*sin(t+4.712)));
    float n7=exp(-length(vU-v7)*22.0)*(0.3+0.7*(0.5+0.5*sin(t+5.498)));
    a+=n0+n1+n2+n3+n4+n5+n6+n7; }
  else if(sh==23){ float by=abs(vU.y);
    float core=exp(-by*8.0)*1.3;
    float glow=exp(-by*2.5)*0.4;
    a=core+glow; }
  else if(sh==24){ vec2 p=vU*1.05; float t=vA;
    float dTop=sdCapsule(p,vec2(-0.72,0.24),vec2(0.62,0.24),0.18);
    float dBot=sdCapsule(p,vec2(-0.72,-0.24),vec2(0.62,-0.24),0.18);
    float dBody=smin(min(dTop,dBot),sdRoundedBox(p-vec2(0.66,0.0),vec2(0.18,0.30),0.08),0.08);
    dBody=smin(dBody,sdRoundedBox(p-vec2(-0.84,0.0),vec2(0.11,0.36),0.07),0.07);
    dBody=max(dBody,-sdRoundedBox(p-vec2(-0.06,0.0),vec2(0.74,0.11),0.06));
    dBody=max(dBody,-sdRoundedBox(p-vec2(-0.84,0.0),vec2(0.18,0.12),0.06));
    dBody=max(dBody,-min(sdRoundedBox(p-vec2(-0.18,0.24),vec2(0.26,0.06),0.03),
                        sdRoundedBox(p-vec2(-0.18,-0.24),vec2(0.26,0.06),0.03)));
    float aa=fwidth(dBody)*1.35;
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(0.018,0.018+aa,abs(dBody)))*hf;
    float xSeg=p.x*7.0+0.2;
    float rib=(1.0-smoothstep(0.42,0.50,abs(fract(xSeg)-0.5)+fwidth(xSeg)*0.6))
              *smoothstep(-0.60,-0.10,p.x)*hf*0.16;
    float lane=max(1.0-smoothstep(0.055,0.055+aa,abs(p.y-0.24)),
                   1.0-smoothstep(0.055,0.055+aa,abs(p.y+0.24)));
    float wx=p.x*14.0+t*0.8;
    float win=(1.0-smoothstep(0.34,0.48,abs(fract(wx)-0.5)+fwidth(wx)*0.8))
              *smoothstep(-0.55,0.55,p.x)*lane*hf;
    float dCh=sdRoundedBox(p-vec2(-0.06,0.0),vec2(0.74,0.11),0.06);
    float reactor=exp(-18.0*max(length(p-vec2(0.08,0.0))-0.10,0.0))
                  *(0.72+0.28*sin(t*2.4))*(1.0-smoothstep(0.0,aa,dCh))*hf;
    float engP=0.70+0.30*sin(t*9.0+p.y*4.0);
    float eR=0.055; float eF=30.0; float pF=200.0; float pD=10.0;
    float e1=length(p-vec2(0.80,0.14))-eR; float e2=length(p-vec2(0.80,0.24))-eR;
    float e3=length(p-vec2(0.80,0.34))-eR; float e4=length(p-vec2(0.80,-0.14))-eR;
    float e5=length(p-vec2(0.80,-0.24))-eR; float e6=length(p-vec2(0.80,-0.34))-eR;
    float engC=exp(-eF*max(min(min(min(min(min(e1,e2),e3),e4),e5),e6),0.0))*engP;
    float plm=exp(-pD*max(p.x-0.78,0.0))*(
      exp(-pF*(p.y-0.14)*(p.y-0.14))+exp(-pF*(p.y-0.24)*(p.y-0.24))+
      exp(-pF*(p.y-0.34)*(p.y-0.34))+exp(-pF*(p.y+0.14)*(p.y+0.14))+
      exp(-pF*(p.y+0.24)*(p.y+0.24))+exp(-pF*(p.y+0.34)*(p.y+0.34)));
    float eng=(engC*0.85+plm*(0.55+0.45*engP)*0.45)*smoothstep(0.35,0.85,p.x);
    a=hf*0.52+rim*0.40+rib+win*0.22+reactor*0.55+eng*0.70;
    a=1.2*tanh(a/1.2); }
  else if(sh==25){ vec2 p=vU*0.69; float t=vA;
    // Medical Frigate: wide hull, nacelle wings, cross channel, healing rings

    // 1. Wide oval hull (distinctly rounder/wider than combat ships)
    float dHull=sdRoundedBox(p,vec2(0.38,0.26),0.16);

    // 2. Nacelle booms + pods (wide wingspan — medical sensor arrays)
    float dBoomL=sdCapsule(p,vec2(-0.08,0.22),vec2(-0.08,0.52),0.06);
    float dBoomR=sdCapsule(p,vec2(-0.08,-0.22),vec2(-0.08,-0.52),0.06);
    float dPodL=sdRoundedBox(p-vec2(-0.08,0.52),vec2(0.13,0.07),0.04);
    float dPodR=sdRoundedBox(p-vec2(-0.08,-0.52),vec2(0.13,0.07),0.04);
    float dNac=min(min(dBoomL,dBoomR),min(dPodL,dPodR));

    // 3. Forward emitter dish (converging arms + concavity)
    float dArmL=sdCapsule(p,vec2(0.22,0.18),vec2(0.48,0.04),0.05);
    float dArmR=sdCapsule(p,vec2(0.22,-0.18),vec2(0.48,-0.04),0.05);
    float dDish=smin(dArmL,dArmR,0.06);

    // Union all structure
    float dBody=smin(dHull,dNac,0.08);
    dBody=smin(dBody,dDish,0.06);

    // 4. Cross channel cutout (actual negative space — medical cross)
    float dCH=sdRoundedBox(p,vec2(0.30,0.04),0.02);
    float dCV=sdRoundedBox(p,vec2(0.04,0.20),0.02);
    dBody=max(dBody,-min(dCH,dCV));

    // 5. Dish concavity cutout
    dBody=max(dBody,-(length(p-vec2(0.52,0.0))-0.12));

    // 6. Nacelle bay cutouts (sensor indentations)
    float dBayL=sdRoundedBox(p-vec2(-0.08,0.52),vec2(0.06,0.03),0.01);
    float dBayR=sdRoundedBox(p-vec2(-0.08,-0.52),vec2(0.06,0.03),0.01);
    dBody=max(dBody,-min(dBayL,dBayR));

    float aa=fwidth(dBody)*1.4;
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(0.018,0.018+aa,abs(dBody)))*hf;

    // 7. Cross channel energy (pulsating glow along cross channels)
    float crossD=min(dCH,dCV);
    float cPulse=0.6+0.4*sin(t*2.5);
    float crossGlow=(1.0-smoothstep(0.0,aa*2.0,abs(crossD)))*cPulse*0.6;

    // 8. Reactor core at cross intersection
    float reactor=exp(-length(p)*16.0)*(0.7+0.3*sin(t*2.5))*hf;

    // 9. Healing pulse rings (expanding concentric — unique to Healer)
    float rT1=fract(t*0.35)*0.9;
    float rT2=fract(t*0.35+0.5)*0.9;
    float rA1=smoothstep(0.0,0.15,rT1)*smoothstep(0.9,0.45,rT1);
    float rA2=smoothstep(0.0,0.15,rT2)*smoothstep(0.9,0.45,rT2);
    float rings=(exp(-abs(d-rT1)*20.0)*rA1+exp(-abs(d-rT2)*20.0)*rA2)*0.25;

    // 10. Nacelle tip glows (pulsing sensor lights)
    float nP=0.5+0.5*sin(t*3.0);
    float nacGlow=(exp(-length(p-vec2(-0.08,0.52))*14.0)+
                   exp(-length(p-vec2(-0.08,-0.52))*14.0))*nP;

    // 11. Dish focus glow (phase offset from cross for alternating pulse)
    float dFocus=exp(-length(p-vec2(0.46,0.0))*10.0)*(0.5+0.5*sin(t*2.5+1.57));

    // 12. Twin engines + trails
    float eP=0.65+0.35*sin(t*4.0);
    float dE1=length(p-vec2(-0.40,0.15)); float dE2=length(p-vec2(-0.40,-0.15));
    float eng=exp(-min(dE1,dE2)*9.0)*eP;
    float trail=0.0;
    if(p.x<-0.40){
      float dy=min(abs(p.y-0.15),abs(p.y+0.15));
      trail=exp(-dy*12.0)*exp((p.x+0.40)*2.0)*eP*0.4;
    }

    a=hf*0.48+rim*0.38+crossGlow+reactor*0.50+rings+nacGlow*0.50+dFocus*0.40+eng*0.60+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==26){ vec2 p=vU*0.67; float t=vA;
    // Prism Shield: compact hull behind massive front shield, swept fins

    // 1. Compact angular hull (rear body)
    float dHull=sdRoundedBox(p-vec2(-0.18,0.0),vec2(0.30,0.18),0.05);

    // 2. Front shield array (dominant — convex V-shape, wide)
    float dShL=sdCapsule(p,vec2(0.20,0.0),vec2(0.10,0.44),0.07);
    float dShR=sdCapsule(p,vec2(0.20,0.0),vec2(0.10,-0.44),0.07);
    float dShield=smin(dShL,dShR,0.10);

    // 3. Swept stabilizer fins (rear, angled back)
    float dFinL=sdCapsule(p,vec2(-0.14,0.18),vec2(-0.50,0.36),0.035);
    float dFinR=sdCapsule(p,vec2(-0.14,-0.18),vec2(-0.50,-0.36),0.035);
    float dFins=min(dFinL,dFinR);

    // Union all
    float dBody=smin(dHull,dShield,0.07);
    dBody=smin(dBody,dFins,0.04);

    // 4. Energy conduit channels (hull→shield, cutout grooves)
    float dCondL=sdRoundedBox(p-vec2(0.02,0.10),vec2(0.18,0.02),0.008);
    float dCondR=sdRoundedBox(p-vec2(0.02,-0.10),vec2(0.18,0.02),0.008);
    dBody=max(dBody,-min(dCondL,dCondR));

    // 5. Diagonal panel cuts at ±30deg (faceted armor look)
    float cs30=0.866; float sn30=0.5;
    vec2 pr1=vec2(p.x*cs30-p.y*sn30,p.x*sn30+p.y*cs30);
    dBody=max(dBody,-sdRoundedBox(pr1-vec2(-0.12,0.0),vec2(0.28,0.012),0.005));
    vec2 pr2=vec2(p.x*cs30+p.y*sn30,-p.x*sn30+p.y*cs30);
    dBody=max(dBody,-sdRoundedBox(pr2-vec2(-0.12,0.0),vec2(0.28,0.012),0.005));

    float aa=fwidth(dBody)*1.4;
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(0.018,0.018+aa,abs(dBody)))*hf;

    // 6. Shield surface hex energy grid (interference pattern)
    float sMask=smoothstep(0.08,0.0,dShield)*hf;
    float h1=sin(p.y*20.0+p.x*12.0+t*3.0);
    float h2=sin(p.y*20.0-p.x*12.0-t*2.0);
    float shieldFx=(h1*h2*0.5+0.5)*sMask*0.30;

    // 7. Energy conduit flow (animated glow traveling hull→shield)
    float condFlow=(exp(-abs(dCondL)*20.0)+exp(-abs(dCondR)*20.0))
                   *(0.5+0.5*sin(p.x*10.0-t*5.0))*0.45;

    // 8. Shield edge highlight (bright outline on shield face)
    float shieldEdge=(1.0-smoothstep(0.0,aa*2.5,abs(dShield)))*0.55;

    // 9. Prismatic refraction nodes (shield vertices, phase-staggered)
    float n1=exp(-length(p-vec2(0.11,0.40))*18.0)*(0.5+0.5*sin(t*4.0));
    float n2=exp(-length(p-vec2(0.20,0.0))*18.0)*(0.5+0.5*sin(t*4.0+2.09));
    float n3=exp(-length(p-vec2(0.11,-0.40))*18.0)*(0.5+0.5*sin(t*4.0+4.19));
    float nodes=(n1+n2+n3)*0.55;

    // 10. Central energy core (fast pulse)
    float core=exp(-length(p-vec2(-0.12,0.0))*14.0)*(0.6+0.4*sin(t*5.0));

    // 11. Engine + trail
    float eP=0.65+0.35*sin(t*7.0);
    float eng=exp(-length(p-vec2(-0.52,0.0))*8.0)*eP;
    float trail=0.0;
    if(p.x<-0.52){
      float dy=abs(p.y);
      trail=exp(-dy*14.0)*exp((p.x+0.52)*2.5)*eP*0.5;
    }

    a=hf*0.44+rim*0.38+shieldFx+shieldEdge+condFlow+nodes+core*0.45+eng*0.55+trail;
    a=1.2*tanh(a/1.2); }
  else { a=smoothstep(1.0,0.6,d); }
  fragColor=vec4(vC.rgb*a, vC.a*clamp(a,0.0,1.0));
}
