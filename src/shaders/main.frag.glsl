#version 300 es
precision mediump float;
#include includes/sdf.glsl;
in vec4 vC; in vec2 vU; in float vSh,vA;
uniform float uTime;
out vec4 fragColor;
// Per-unit rendering parameters indexed by shape ID (0-26)
// Non-unit shapes (3,4,10,12,14,17-23) have default values
const float RIM_THRESH[27]=float[27](
  0.015,0.015,0.028,0.020,0.020, // 0-4  sh0=Drone,sh1=Fighter,sh2=Bomber,sh3=N/A,sh4=N/A
  0.025,0.028,0.028,0.012,0.032, // 5-9  sh5=BeamFrig,sh6=Launcher,sh7=Carrier,sh8=Sniper,sh9=Lancer
  0.020,0.022,0.020,0.015,0.020, // 10-14 sh11=Disruptor
  0.022,0.030,0.020,0.020,0.020, // 15-19
  0.020,0.020,0.020,0.020,0.035, // 20-24 sh24=Flagship
  0.025,0.038                    // 25-26 sh25=Healer,sh26=Reflector
);
const float RIM_WEIGHT[27]=float[27](
  0.33,0.45,0.42,0.38,0.38, // 0-4
  0.43,0.52,0.45,0.40,0.48, // 5-9
  0.38,0.42,0.38,0.35,0.38, // 10-14 sh11=Disruptor
  0.40,0.48,0.38,0.38,0.38, // 15-19
  0.38,0.38,0.38,0.38,0.50, // 20-24 sh24=Flagship
  0.35,0.52                  // 25-26 sh25=Healer,sh26=Reflector
);
const float HF_WEIGHT[27]=float[27](
  0.52,0.55,0.52,0.48,0.48, // 0-4
  0.50,0.58,0.50,0.55,0.50, // 5-9
  0.48,0.43,0.48,0.42,0.48, // 10-14 sh11=Disruptor,sh13=Teleporter
  0.48,0.52,0.48,0.48,0.48, // 15-19 sh15=Arcer,sh16=Cruiser
  0.48,0.48,0.48,0.48,0.55, // 20-24 sh24=Flagship
  0.48,0.45                  // 25-26 sh25=Healer,sh26=Reflector
);
const float FWIDTH_MULT[27]=float[27](
  1.8,1.8,1.3,1.5,1.5, // 0-4
  1.4,1.3,1.25,2.0,1.2, // 5-9
  1.5,1.6,1.5,1.7,1.5, // 10-14 sh11=Disruptor
  1.5,1.3,1.5,1.5,1.5, // 15-19
  1.5,1.5,1.5,1.5,1.2,// 20-24 sh24=Flagship
  1.8,1.2               // 25-26 sh25=Healer,sh26=Reflector
);
void main(){
  float d=length(vU), a=0.0;
  int sh=int(vSh+0.5);
  if(sh==0){ vec2 p=vU*0.66; float t=vA;
    // Drone: Small insect-like triangular body, micro-wings with flutter
    // 1. Compact triangular fuselage
    float dFuse=sdRoundedBox(p-vec2(0.05,0.0),vec2(0.22,0.12),0.06);
    // 2. Forward nose taper
    float noseCut=p.x*0.7-0.18;
    dFuse=max(dFuse,abs(p.y)-max(0.14-noseCut,0.0));
    // 3. Micro-wings with flutter animation
    float flutter=sin(t*12.0+p.x*4.0)*0.03;
    float dWingL=sdCapsule(p,vec2(-0.02,0.10),vec2(-0.18,0.32+flutter),0.04);
    float dWingR=sdCapsule(p,vec2(-0.02,-0.10),vec2(-0.18,-0.32-flutter),0.04);
    float dWings=min(dWingL,dWingR);
    // 4. Tail fin
    float dTail=sdCapsule(p,vec2(-0.18,0.0),vec2(-0.30,0.0),0.03);
    // Union
    float dBody=smin(dFuse,dWings,0.06);
    dBody=smin(dBody,dTail,0.04);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 5. Engine glow (tiny, rear)
    float pulse=0.5+0.5*sin(t*14.0);
    float eng=exp(-length(p-vec2(-0.30,0.0))*12.0)*pulse;
    // 6. Wing-tip lights (alternating blink)
    float tipL=exp(-length(p-vec2(-0.18,0.32+flutter))*18.0)*(0.5+0.5*sin(t*8.0));
    float tipR=exp(-length(p-vec2(-0.18,-0.32-flutter))*18.0)*(0.5+0.5*sin(t*8.0+3.14));
    // 7. Trail
    float trail=0.0;
    if(p.x<-0.30){float dy=abs(p.y);trail=exp(-dy*16.0)*exp((p.x+0.30)*3.0)*pulse*0.4;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+eng*0.70+(tipL+tipR)*0.40+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==1){ vec2 p=vU*0.70; float t=vA;
    // Fighter: X-wing style, forward-swept wings, gun mounts
    // 1. Sleek central fuselage
    float dFuse=sdRoundedBox(p-vec2(0.08,0.0),vec2(0.38,0.08),0.04);
    // 2. Forward-swept wings (4 wings, X-pattern)
    float dW1=sdCapsule(p,vec2(0.05,0.08),vec2(0.28,0.38),0.04);
    float dW2=sdCapsule(p,vec2(0.05,-0.08),vec2(0.28,-0.38),0.04);
    float dW3=sdCapsule(p,vec2(-0.10,0.08),vec2(-0.28,0.32),0.035);
    float dW4=sdCapsule(p,vec2(-0.10,-0.08),vec2(-0.28,-0.32),0.035);
    float dWings=min(min(dW1,dW2),min(dW3,dW4));
    // 3. Cockpit bump
    float dCock=sdRoundedBox(p-vec2(0.28,0.0),vec2(0.08,0.05),0.03);
    // Union
    float dBody=smin(dFuse,dWings,0.06);
    dBody=smin(dBody,dCock,0.04);
    // 4. Gun channels (wing tips, engraved)
    float dGun1=sdRoundedBox(p-vec2(0.30,0.36),vec2(0.10,0.015),0.005);
    float dGun2=sdRoundedBox(p-vec2(0.30,-0.36),vec2(0.10,0.015),0.005);
    dBody=max(dBody,-min(dGun1,dGun2));
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 5. Quad engines (rear of each wing root)
    float pulse=0.6+0.4*sin(t*10.0);
    float eUp=exp(-length(p-vec2(-0.34,0.12))*10.0);
    float eDn=exp(-length(p-vec2(-0.34,-0.12))*10.0);
    float eng=(eUp+eDn)*pulse;
    // 6. Gun muzzle flash (subtle, fast pulse)
    float mFlash=(exp(-length(p-vec2(0.42,0.36))*16.0)+exp(-length(p-vec2(0.42,-0.36))*16.0))
                 *(0.3+0.7*step(0.85,sin(t*18.0)));
    // 7. Trail
    float trail=0.0;
    if(p.x<-0.34){float dy=min(abs(p.y-0.12),abs(p.y+0.12));
      trail=exp(-dy*12.0)*exp((p.x+0.34)*2.5)*pulse*0.5;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+eng*0.65+mFlash*0.30+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==2){
    vec2 p=vU*0.82; float t=vA;
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
    float aa=fwidth(dShapeCarved)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dShapeCarved);
    
    // 4. Details
    // Rim lighting
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dShapeCarved)))*hf;
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

    a=hf*HF_WEIGHT[sh] + rim*RIM_WEIGHT[sh] + cargoGlow*0.3 + glow + trail;
    a=1.2*tanh(a/1.2); // Tone map
  }
  else if(sh==3){ float dd=hexDist(vU);
    a=smoothstep(1.0,0.8,dd)+exp(-dd*2.5)*0.5; }
  else if(sh==4){ float cx=step(abs(vU.x),0.2)+step(abs(vU.y),0.2);
    a=min(cx,1.0)*smoothstep(1.0,0.6,d)+exp(-d*2.0)*0.4; }
  else if(sh==5){ vec2 p=vU*0.68; float t=vA;
    // Beam Frigate: Forward focusing dish, beam emitter spine, charging anim
    // 1. Rear hull (compact engine block)
    float dHull=sdRoundedBox(p-vec2(-0.20,0.0),vec2(0.25,0.16),0.06);
    // 2. Central spine (beam conduit running forward)
    float dSpine=sdCapsule(p,vec2(-0.18,0.0),vec2(0.40,0.0),0.05);
    // 3. Focusing dish (parabolic arc at front)
    float dDishL=sdCapsule(p,vec2(0.32,0.0),vec2(0.20,0.30),0.045);
    float dDishR=sdCapsule(p,vec2(0.32,0.0),vec2(0.20,-0.30),0.045);
    float dDish=smin(dDishL,dDishR,0.06);
    // 4. Side stabilizers
    float dStabL=sdCapsule(p,vec2(-0.22,0.14),vec2(-0.38,0.26),0.03);
    float dStabR=sdCapsule(p,vec2(-0.22,-0.14),vec2(-0.38,-0.26),0.03);
    float dStabs=min(dStabL,dStabR);
    // Union
    float dBody=smin(dHull,dSpine,0.08);
    dBody=smin(dBody,dDish,0.05);
    dBody=smin(dBody,dStabs,0.04);
    // 5. Spine channel cut (energy conduit groove)
    float dChan=sdRoundedBox(p-vec2(0.10,0.0),vec2(0.28,0.018),0.005);
    dBody=max(dBody,-dChan);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 6. Charging glow (energy flows from hull to dish tip)
    float charge=0.5+0.5*sin(t*3.0);
    float chanGlow=(1.0-smoothstep(0.0,aa*2.0,abs(dChan)))*(0.4+0.6*sin(p.x*8.0-t*6.0))*0.5;
    // 7. Dish focus point (bright convergence at front)
    float focus=exp(-length(p-vec2(0.36,0.0))*12.0)*charge;
    // 8. Engine glow
    float pulse=0.65+0.35*sin(t*6.0);
    float eng=exp(-length(p-vec2(-0.46,0.0))*8.0)*pulse;
    // 9. Trail
    float trail=0.0;
    if(p.x<-0.46){float dy=abs(p.y);trail=exp(-dy*14.0)*exp((p.x+0.46)*2.5)*pulse*0.4;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+chanGlow+focus*0.65+eng*0.55+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==6){
    vec2 p=vU*0.67; float t=vA;
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
    float aa=fwidth(dShape)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dShape);
    
    // 5. Visuals
    // Rim lighting (Sharp edge)
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dShape)))*hf;
    
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

    a=hf*HF_WEIGHT[sh] + rim*RIM_WEIGHT[sh] + glow + trail + podGlow;
    a=1.1*tanh(a/1.1);
  }
  else if(sh==7){ vec2 p=vU*0.62; float t=vA;
    // Carrier: Flat flight deck, central catapult, side hangars, drone bay glow
    // 1. Main deck (wide flat body)
    float dDeck=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.52,0.22),0.06);
    // 2. Bridge tower (offset superstructure)
    float dBridge=sdRoundedBox(p-vec2(-0.18,0.20),vec2(0.10,0.10),0.03);
    // 3. Side hangar bays (protruding)
    float dHanL=sdRoundedBox(p-vec2(0.10,0.30),vec2(0.16,0.06),0.02);
    float dHanR=sdRoundedBox(p-vec2(0.10,-0.30),vec2(0.16,0.06),0.02);
    float dHangars=min(dHanL,dHanR);
    // Union
    float dBody=smin(dDeck,dBridge,0.05);
    dBody=smin(dBody,dHangars,0.04);
    // 4. Flight deck groove (catapult runway)
    float dRunway=sdRoundedBox(p-vec2(0.10,0.0),vec2(0.38,0.03),0.01);
    dBody=max(dBody,-dRunway);
    // 5. Hangar bay cutouts
    float dBayL=sdRoundedBox(p-vec2(0.10,0.30),vec2(0.10,0.025),0.008);
    float dBayR=sdRoundedBox(p-vec2(0.10,-0.30),vec2(0.10,0.025),0.008);
    dBody=max(dBody,-min(dBayL,dBayR));
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 6. Catapult runway lights (animated forward)
    float rwGlow=(1.0-smoothstep(0.0,aa*2.0,abs(dRunway)))
                 *(0.4+0.6*(0.5+0.5*sin(p.x*12.0-t*8.0)))*0.45;
    // 7. Hangar bay glow (pulsing drone readiness)
    float bayPulse=0.5+0.5*sin(t*2.5);
    float bayGlow=(exp(-abs(dBayL)*18.0)+exp(-abs(dBayR)*18.0))*bayPulse*0.5;
    // 8. Bridge window lights
    float bridgeGlow=exp(-length(p-vec2(-0.18,0.24))*16.0)*(0.6+0.4*sin(t*1.5));
    // 9. Twin engines + trail
    float eP=0.6+0.4*sin(t*5.0);
    float dE1=length(p-vec2(-0.54,0.10)); float dE2=length(p-vec2(-0.54,-0.10));
    float eng=exp(-min(dE1,dE2)*8.0)*eP;
    float trail=0.0;
    if(p.x<-0.54){float dy=min(abs(p.y-0.10),abs(p.y+0.10));
      trail=exp(-dy*10.0)*exp((p.x+0.54)*2.0)*eP*0.4;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rwGlow+bayGlow+bridgeGlow*0.35+eng*0.55+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==8){ vec2 p=vU*0.72; float t=vA;
    // Sniper: Ultra-long railgun barrel, compact rear body, charge glow at tip
    // 1. Compact rear body (engine + power plant)
    float dRear=sdRoundedBox(p-vec2(-0.28,0.0),vec2(0.18,0.14),0.05);
    // 2. Long railgun barrel (extends far forward)
    float dBarrel=sdCapsule(p,vec2(-0.12,0.0),vec2(0.58,0.0),0.035);
    // 3. Barrel shroud (wider mid-section for cooling)
    float dShroud=sdRoundedBox(p-vec2(0.08,0.0),vec2(0.12,0.06),0.02);
    // 4. Small stabilizer wings
    float dFinL=sdCapsule(p,vec2(-0.30,0.12),vec2(-0.42,0.22),0.025);
    float dFinR=sdCapsule(p,vec2(-0.30,-0.12),vec2(-0.42,-0.22),0.025);
    float dFins=min(dFinL,dFinR);
    // Union
    float dBody=smin(dRear,dBarrel,0.06);
    dBody=smin(dBody,dShroud,0.04);
    dBody=smin(dBody,dFins,0.03);
    // 5. Barrel rail grooves
    float dGroove1=sdRoundedBox(p-vec2(0.24,0.0),vec2(0.30,0.012),0.003);
    dBody=max(dBody,-dGroove1);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 6. Muzzle charge (cycling charge-up at barrel tip)
    float charge=0.4+0.6*smoothstep(-1.0,1.0,sin(t*2.5));
    float muzzle=exp(-length(p-vec2(0.60,0.0))*14.0)*charge;
    // 7. Rail energy flow (animated along barrel)
    float railFlow=(1.0-smoothstep(0.0,aa*2.0,abs(dGroove1)))
                   *(0.3+0.7*(0.5+0.5*sin(p.x*10.0-t*8.0)))*0.4;
    // 8. Scope lens glow
    float scope=exp(-length(p-vec2(0.08,0.07))*20.0)*0.5;
    // 9. Engine + trail (single, focused)
    float pulse=0.6+0.4*sin(t*5.0);
    float eng=exp(-length(p-vec2(-0.48,0.0))*9.0)*pulse;
    float trail=0.0;
    if(p.x<-0.48){float dy=abs(p.y);trail=exp(-dy*16.0)*exp((p.x+0.48)*3.0)*pulse*0.35;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+muzzle*0.70+railFlow+scope+eng*0.50+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==9){ vec2 p=vU*0.74; float t=vA;
    // Lancer: Arrowhead/spear shape, extreme forward point, heavy boost trail
    // 1. Central spear body (very pointed nose)
    float dSpear=sdRoundedBox(p-vec2(0.12,0.0),vec2(0.42,0.10),0.03);
    // Sharp nose taper (aggressive forward cut)
    float noseCut=max(0.0,(p.x-0.15)*0.35);
    dSpear=max(dSpear,abs(p.y)-max(0.12-noseCut,0.0));
    // 2. Swept-back delta wings
    float dWingL=sdCapsule(p,vec2(-0.08,0.10),vec2(-0.38,0.36),0.05);
    float dWingR=sdCapsule(p,vec2(-0.08,-0.10),vec2(-0.38,-0.36),0.05);
    float dWings=min(dWingL,dWingR);
    // 3. Rear thruster block (wide)
    float dThrust=sdRoundedBox(p-vec2(-0.32,0.0),vec2(0.10,0.20),0.04);
    // Union
    float dBody=smin(dSpear,dWings,0.07);
    dBody=smin(dBody,dThrust,0.05);
    // 4. Central spine groove
    float dGroove=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.30,0.015),0.003);
    dBody=max(dBody,-dGroove);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 5. Spear tip glow (ram energy)
    float tipGlow=exp(-length(p-vec2(0.56,0.0))*14.0)*(0.5+0.5*sin(t*6.0));
    // 6. Heavy boost engines (triple, wide spread)
    float pulse=0.7+0.3*sin(t*8.0+p.y*3.0);
    float eC=exp(-length(p-vec2(-0.44,0.0))*8.0);
    float eL=exp(-length(p-vec2(-0.42,0.16))*9.0);
    float eR=exp(-length(p-vec2(-0.42,-0.16))*9.0);
    float eng=(eC+eL+eR)*pulse;
    // 7. Heavy trail (wide, bright — signature of Lancer)
    float trail=0.0;
    if(p.x<-0.42){float dy=abs(p.y);
      trail=exp(-dy*6.0)*exp((p.x+0.42)*1.8)*pulse*0.7;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+tipGlow*0.55+eng*0.60+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==10){ float ring=abs(d-0.75);
    a=exp(-ring*8.0)*0.6+exp(-d*1.0)*0.08; }
  else if(sh==11){ vec2 p=vU*0.64; float t=vA;
    // Disruptor: Radial antenna array, circular core, EMP ring emission
    // 1. Circular core body
    float dCore=length(p)-0.18;
    // 2. Radial antenna prongs (6 directions)
    float dA0=sdCapsule(p,vec2(0.16,0.0),vec2(0.42,0.0),0.03);
    float dA1=sdCapsule(p,vec2(0.08,0.14),vec2(0.21,0.36),0.03);
    float dA2=sdCapsule(p,vec2(-0.08,0.14),vec2(-0.21,0.36),0.03);
    float dA3=sdCapsule(p,vec2(-0.16,0.0),vec2(-0.42,0.0),0.03);
    float dA4=sdCapsule(p,vec2(-0.08,-0.14),vec2(-0.21,-0.36),0.03);
    float dA5=sdCapsule(p,vec2(0.08,-0.14),vec2(0.21,-0.36),0.03);
    float dAnts=min(min(min(dA0,dA1),min(dA2,dA3)),min(dA4,dA5));
    // Union
    float dBody=smin(dCore,dAnts,0.05);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 3. EMP pulse rings (expanding outward)
    float rd=length(p);
    float rT1=fract(t*0.4)*0.8;
    float rT2=fract(t*0.4+0.5)*0.8;
    float rA1=smoothstep(0.0,0.12,rT1)*smoothstep(0.8,0.35,rT1);
    float rA2=smoothstep(0.0,0.12,rT2)*smoothstep(0.8,0.35,rT2);
    float rings=(exp(-abs(rd-rT1)*16.0)*rA1+exp(-abs(rd-rT2)*16.0)*rA2)*0.30;
    // 4. Antenna tip nodes (pulsing phase-stagger)
    float n0=exp(-length(p-vec2(0.42,0.0))*16.0)*(0.5+0.5*sin(t*5.0));
    float n1=exp(-length(p-vec2(0.21,0.36))*16.0)*(0.5+0.5*sin(t*5.0+1.05));
    float n2=exp(-length(p-vec2(-0.21,0.36))*16.0)*(0.5+0.5*sin(t*5.0+2.09));
    float n3=exp(-length(p-vec2(-0.42,0.0))*16.0)*(0.5+0.5*sin(t*5.0+3.14));
    float n4=exp(-length(p-vec2(-0.21,-0.36))*16.0)*(0.5+0.5*sin(t*5.0+4.19));
    float n5=exp(-length(p-vec2(0.21,-0.36))*16.0)*(0.5+0.5*sin(t*5.0+5.24));
    float nodes=(n0+n1+n2+n3+n4+n5)*0.40;
    // 5. Core reactor glow
    float coreGlow=exp(-rd*10.0)*(0.6+0.4*sin(t*4.0));
    // 6. Engine (rear prong doubles as thruster)
    float pulse=0.6+0.4*sin(t*7.0);
    float eng=exp(-length(p-vec2(-0.44,0.0))*8.0)*pulse;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rings+nodes+coreGlow*0.50+eng*0.40;
    a=1.2*tanh(a/1.2); }
  else if(sh==12){ float by=abs(vU.y),bx=abs(vU.x);
    float xf=smoothstep(1.0,0.4,bx);
    a=(exp(-by*6.0)*1.0+exp(-by*2.5)*0.4)*xf+exp(-d*1.5)*0.2; }
  else if(sh==13){ vec2 p=vU*0.66; float t=vA;
    // Teleporter: Octagonal frame, hollow center, phase distortion ripple
    // 1. Outer octagonal frame (ring shape)
    float dOuter=octDist(p)-0.38;
    float dInner=octDist(p)-0.22;
    float dFrame=max(dOuter,-dInner);
    // 2. Four anchor pylons (cardinal directions, thicker)
    float dPylR=sdRoundedBox(p-vec2(0.30,0.0),vec2(0.12,0.04),0.015);
    float dPylL=sdRoundedBox(p-vec2(-0.30,0.0),vec2(0.12,0.04),0.015);
    float dPylU=sdRoundedBox(p-vec2(0.0,0.30),vec2(0.04,0.12),0.015);
    float dPylD=sdRoundedBox(p-vec2(0.0,-0.30),vec2(0.04,0.12),0.015);
    float dPylons=min(min(dPylR,dPylL),min(dPylU,dPylD));
    // Union
    float dBody=min(dFrame,dPylons);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 3. Phase distortion in hollow center (ripple pattern)
    float rd=length(p);
    float phase=sin(rd*28.0-t*6.0)*0.5+0.5;
    float centerMask=smoothstep(0.22,0.12,rd);
    float distortion=phase*centerMask*0.35;
    // 4. Frame edge energy (octagonal glow cycling)
    float frameEdge=(1.0-smoothstep(0.0,aa*2.0,abs(dOuter)))*0.4*(0.5+0.5*sin(t*3.0));
    // 5. Pylon tip nodes
    float nR=exp(-length(p-vec2(0.42,0.0))*16.0)*(0.5+0.5*sin(t*4.0));
    float nL=exp(-length(p-vec2(-0.42,0.0))*16.0)*(0.5+0.5*sin(t*4.0+1.57));
    float nU=exp(-length(p-vec2(0.0,0.42))*16.0)*(0.5+0.5*sin(t*4.0+3.14));
    float nD=exp(-length(p-vec2(0.0,-0.42))*16.0)*(0.5+0.5*sin(t*4.0+4.71));
    float nodes=(nR+nL+nU+nD)*0.45;
    // 6. Engine (rear pylon acts as thruster)
    float pulse=0.6+0.4*sin(t*6.0);
    float eng=exp(-length(p-vec2(-0.44,0.0))*8.0)*pulse;
    float trail=0.0;
    if(p.x<-0.44){float dy=abs(p.y);trail=exp(-dy*14.0)*exp((p.x+0.44)*2.5)*pulse*0.35;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+distortion+frameEdge+nodes+eng*0.45+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==14){ float r=polarR(vU,3.0,0.55,0.3);
    a=smoothstep(r+0.15,r-0.1,d)+exp(-d*2.0)*0.3; }
  else if(sh==15){ vec2 p=vU*0.69; float t=vA;
    // Arcer: Tesla coil Y-shape, triple prongs, electrical arc discharge
    // 1. Central body (power generator)
    float dCore=sdRoundedBox(p-vec2(-0.10,0.0),vec2(0.20,0.14),0.06);
    // 2. Y-shaped prongs (forward triple fork)
    float dProngC=sdCapsule(p,vec2(0.08,0.0),vec2(0.46,0.0),0.035);
    float dProngL=sdCapsule(p,vec2(0.08,0.06),vec2(0.38,0.32),0.03);
    float dProngR=sdCapsule(p,vec2(0.08,-0.06),vec2(0.38,-0.32),0.03);
    float dProngs=min(min(dProngC,dProngL),dProngR);
    // 3. Rear stabilizers
    float dFinL=sdCapsule(p,vec2(-0.24,0.12),vec2(-0.38,0.24),0.025);
    float dFinR=sdCapsule(p,vec2(-0.24,-0.12),vec2(-0.38,-0.24),0.025);
    float dFins=min(dFinL,dFinR);
    // Union
    float dBody=smin(dCore,dProngs,0.06);
    dBody=smin(dBody,dFins,0.04);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 4. Prong tip tesla nodes (bright, flickering)
    float flicker=0.3+0.7*step(0.6,fract(t*3.7+sin(t*11.0)*0.3));
    float nC=exp(-length(p-vec2(0.48,0.0))*16.0)*flicker;
    float nL=exp(-length(p-vec2(0.40,0.34))*16.0)*flicker;
    float nR=exp(-length(p-vec2(0.40,-0.34))*16.0)*flicker;
    float nodes=(nC+nL+nR)*0.55;
    // 5. Arc discharge between prongs (animated lightning lines)
    // Simulate arcs as thin bright bands between prong tips
    float arcPhase=fract(t*1.2);
    float arcT=smoothstep(0.0,0.15,arcPhase)*smoothstep(0.5,0.2,arcPhase);
    float dArc1=sdCapsule(p,vec2(0.46,0.0),vec2(0.38,0.32),0.012);
    float dArc2=sdCapsule(p,vec2(0.46,0.0),vec2(0.38,-0.32),0.012);
    float dArc3=sdCapsule(p,vec2(0.38,0.32),vec2(0.38,-0.32),0.012);
    float arcGlow=(exp(-dArc1*22.0)+exp(-dArc2*22.0)+exp(-dArc3*22.0))*arcT*0.45;
    // 6. Core energy glow
    float coreGlow=exp(-length(p-vec2(-0.06,0.0))*10.0)*(0.5+0.5*sin(t*4.0));
    // 7. Engine + trail
    float pulse=0.6+0.4*sin(t*6.0);
    float eng=exp(-length(p-vec2(-0.34,0.0))*8.0)*pulse;
    float trail=0.0;
    if(p.x<-0.34){float dy=abs(p.y);trail=exp(-dy*14.0)*exp((p.x+0.34)*2.5)*pulse*0.4;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+nodes+arcGlow+coreGlow*0.45+eng*0.50+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==16){ vec2 p=vU*0.66; float t=vA;
    // Cruiser: Pentagon-based heavy armored hull, beam turret slit, armored panels
    // 1. Pentagon-ish main hull (wide, angular, heavy)
    float dHull=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.40,0.24),0.08);
    // 2. Forward prow (armored wedge)
    float dProw=sdCapsule(p,vec2(0.38,0.16),vec2(0.52,0.0),0.06);
    float dProw2=sdCapsule(p,vec2(0.38,-0.16),vec2(0.52,0.0),0.06);
    float dProwU=smin(dProw,dProw2,0.04);
    // 3. Side armor plates
    float dPlateL=sdRoundedBox(p-vec2(-0.06,0.28),vec2(0.22,0.04),0.02);
    float dPlateR=sdRoundedBox(p-vec2(-0.06,-0.28),vec2(0.22,0.04),0.02);
    float dPlates=min(dPlateL,dPlateR);
    // Union
    float dBody=smin(dHull,dProwU,0.06);
    dBody=smin(dBody,dPlates,0.04);
    // 4. Beam turret slit (top, long groove)
    float dTurret=sdRoundedBox(p-vec2(0.10,0.0),vec2(0.22,0.025),0.008);
    dBody=max(dBody,-dTurret);
    // 5. Armor panel lines (diagonal cuts for faceted look)
    float cs25=0.906; float sn25=0.423;
    vec2 pr1=vec2(p.x*cs25-p.y*sn25,p.x*sn25+p.y*cs25);
    dBody=max(dBody,-sdRoundedBox(pr1-vec2(0.05,0.0),vec2(0.30,0.010),0.003));
    vec2 pr2=vec2(p.x*cs25+p.y*sn25,-p.x*sn25+p.y*cs25);
    dBody=max(dBody,-sdRoundedBox(pr2-vec2(0.05,0.0),vec2(0.30,0.010),0.003));
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 6. Turret glow (beam readiness, slow pulse)
    float turretGlow=(1.0-smoothstep(0.0,aa*2.0,abs(dTurret)))*(0.4+0.6*sin(t*2.0))*0.45;
    // 7. Prow tip armor glow
    float prowGlow=exp(-length(p-vec2(0.54,0.0))*12.0)*(0.4+0.3*sin(t*3.0));
    // 8. Heavy twin engines + trail
    float eP=0.6+0.4*sin(t*5.0);
    float dE1=length(p-vec2(-0.44,0.12)); float dE2=length(p-vec2(-0.44,-0.12));
    float eng=exp(-min(dE1,dE2)*8.0)*eP;
    float trail=0.0;
    if(p.x<-0.44){float dy=min(abs(p.y-0.12),abs(p.y+0.12));
      trail=exp(-dy*10.0)*exp((p.x+0.44)*2.0)*eP*0.45;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+turretGlow+prowGlow*0.40+eng*0.55+trail;
    a=1.2*tanh(a/1.2); }
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
  else if(sh==24){ vec2 p=vU*0.84; float t=vA;
    float dTop=sdCapsule(p,vec2(-0.72,0.24),vec2(0.62,0.24),0.18);
    float dBot=sdCapsule(p,vec2(-0.72,-0.24),vec2(0.62,-0.24),0.18);
    float dBody=smin(min(dTop,dBot),sdRoundedBox(p-vec2(0.66,0.0),vec2(0.18,0.30),0.08),0.08);
    dBody=smin(dBody,sdRoundedBox(p-vec2(-0.84,0.0),vec2(0.11,0.36),0.07),0.07);
    dBody=max(dBody,-sdRoundedBox(p-vec2(-0.06,0.0),vec2(0.74,0.11),0.06));
    dBody=max(dBody,-sdRoundedBox(p-vec2(-0.84,0.0),vec2(0.18,0.12),0.06));
    dBody=max(dBody,-min(sdRoundedBox(p-vec2(-0.18,0.24),vec2(0.26,0.06),0.03),
                        sdRoundedBox(p-vec2(-0.18,-0.24),vec2(0.26,0.06),0.03)));
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
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
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rib+win*0.22+reactor*0.55+eng*0.70;
    a=1.2*tanh(a/1.2); }
  else if(sh==25){ vec2 p=vU*0.55; float t=vA;
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

    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;

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

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+crossGlow+reactor*0.50+rings+nacGlow*0.50+dFocus*0.40+eng*0.60+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==26){ vec2 p=vU*0.54; float t=vA;
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

    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;

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

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+shieldFx+shieldEdge+condFlow+nodes+core*0.45+eng*0.55+trail;
    a=1.2*tanh(a/1.2); }
  else { a=smoothstep(1.0,0.6,d); }
  fragColor=vec4(vC.rgb*a, vC.a*clamp(a,0.0,1.0));
}
