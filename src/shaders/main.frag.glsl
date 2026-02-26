#version 300 es
precision mediump float;
#include includes/sdf.glsl;
#include includes/shape-count.glsl;
in vec4 vC; in vec2 vU; in float vSh,vA;
uniform float uTime;
out vec4 fragColor;
// Per-unit rendering parameters indexed by shape ID (0..NUM_SHAPES-1)
// Non-unit shapes (3,4,10,12,14,17-23,27) have default values
const float RIM_THRESH[NUM_SHAPES]=float[NUM_SHAPES](
  0.035,0.045,0.032,0.020,0.020, // 0-4  sh0=Drone,sh1=Fighter,sh2=Bomber
  0.008,0.025,0.025,0.006,0.035, // 5-9  sh5=Scorcher,sh6=Launcher,sh7=Carrier,sh8=Sniper,sh9=Lancer
  0.020,0.060,0.020,0.008,0.020, // 10-14 sh11=Disruptor,sh13=Teleporter
  0.040,0.022,0.020,0.020,0.020, // 15-19 sh15=Arcer
  0.015,0.020,0.020,0.020,0.025, // 20-24 sh20=Bastion,sh24=Flagship
  0.028,0.030,0.020,             // 25-27 sh25=Healer,sh26=Reflector
  0.028,                          // 28    sh28=Amplifier
  0.030                           // 29    sh29=Scrambler
);
const float RIM_WEIGHT[NUM_SHAPES]=float[NUM_SHAPES](
  0.65,0.72,0.55,0.38,0.38, // 0-4
  0.35,0.55,0.45,0.32,0.60, // 5-9
  0.38,0.70,0.38,0.18,0.38, // 10-14 sh11=Disruptor,sh13=Teleporter
  0.75,0.45,0.38,0.38,0.38, // 15-19 sh15=Arcer
  0.25,0.38,0.38,0.38,0.50, // 20-24 sh20=Bastion,sh24=Flagship
  0.28,0.30,0.38,            // 25-27 sh25=Healer,sh26=Reflector
  0.45,                        // 28    sh28=Amplifier
  0.50                         // 29    sh29=Scrambler
);
const float HF_WEIGHT[NUM_SHAPES]=float[NUM_SHAPES](
  0.65,0.70,0.50,0.48,0.48, // 0-4
  0.70,0.50,0.35,0.75,0.50, // 5-9
  0.48,0.25,0.48,0.70,0.48, // 10-14 sh11=Disruptor,sh13=Teleporter
  0.35,0.30,0.48,0.48,0.48, // 15-19 sh15=Arcer
  0.22,0.48,0.48,0.48,0.32, // 20-24 sh20=Bastion,sh24=Flagship
  0.35,0.40,0.48,            // 25-27 sh25=Healer,sh26=Reflector
  0.38,                        // 28    sh28=Amplifier
  0.42                         // 29    sh29=Scrambler
);
const float FWIDTH_MULT[NUM_SHAPES]=float[NUM_SHAPES](
  2.4,2.2,1.4,1.5,1.5, // 0-4
  0.9,1.4,1.1,0.85,1.3, // 5-9
  1.5,2.5,1.5,2.8,1.5, // 10-14 sh11=Disruptor,sh13=Teleporter
  0.9,1.1,1.5,1.5,1.5, // 15-19 sh15=Arcer
  0.85,1.5,1.5,1.5,1.1,// 20-24 sh20=Bastion,sh24=Flagship
  2.2,2.5,1.5,           // 25-27 sh25=Healer,sh26=Reflector
  1.3,                     // 28    sh28=Amplifier
  1.4                      // 29    sh29=Scrambler
);
void main(){
  float d=length(vU), a=0.0;
  int sh=int(vSh+0.5);
  sh=clamp(sh,0,NUM_SHAPES-1);
  if(sh==0){ vec2 p=vU*0.74; float t=vA+uTime;
    // Drone: SF UCAV — angular stealth drone with energy glow
    // 1. Fuselage (angular, faceted)
    float dFuse=sdRoundedBox(p-vec2(0.02,0.0),vec2(0.36,0.07),0.015);
    // 2. Forward sensor pod (sharper)
    float dCam=sdRoundedBox(p-vec2(0.34,0.0),vec2(0.05,0.035),0.01);
    // Y-axis mirror fold — all wing/tail geometry is symmetric
    vec2 pm=vec2(p.x,abs(p.y));
    // 3. Main wings (cranked arrow — inner swept back, tips forward-angled)
    float dW=sdCapsule(pm, vec2(0.10,0.0), vec2(-0.12,0.48), 0.04);
    // Cranked wingtips (forward kick — gives SF angular silhouette)
    float dTip=sdCapsule(pm, vec2(-0.12,0.48), vec2(0.02,0.58), 0.025);
    float dWings=min(dW,dTip);
    // 4. V-Tail (compact, angular)
    float dTail=sdCapsule(pm,vec2(-0.26,0.0),vec2(-0.42,0.18),0.022);
    // 5. Union
    float dBody=smin(dFuse,dCam,0.02);
    dBody=smin(dBody,dWings,0.04);
    dBody=smin(dBody,dTail,0.025);
    // 6. Dorsal engine ridge
    float dRidge=sdRoundedBox(p-vec2(-0.14,0.0),vec2(0.16,0.04),0.02);
    dBody=smin(dBody,dRidge,0.03);
    // 7. Panel grooves (fuselage seams — angular detail)
    float dSeam=sdCapsule(p,vec2(0.20,0.0),vec2(-0.20,0.0),0.003);
    dBody=max(dBody,-dSeam+0.005);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;

    // 8. Twin engine glow (split thrusters — symmetric, ×2 approx)
    float pulse=0.6+0.4*sin(t*12.0);
    float gSide=exp(-length(pm-vec2(-0.40,0.06))*16.0);
    float glow=gSide*2.0*pulse;
    // 9. Sensor sweep (forward scanning pulse)
    float scan=exp(-length(p-vec2(0.38,0.0))*20.0)*(0.4+0.6*abs(sin(t*3.0)));
    // 10. Wingtip energy nodes (fast SF blink)
    float tipL=exp(-length(p-vec2(0.02,0.58))*24.0)*(0.5+0.5*sin(t*8.0));
    float tipR=exp(-length(p-vec2(0.02,-0.58))*24.0)*(0.5+0.5*sin(t*8.0+3.14));
    // 11. Trail (twin exhaust — pm.y folds naturally)
    float trail=0.0;
    if(p.x<-0.40){
      float dy=abs(pm.y-0.06);
      trail=exp(-dy*28.0)*exp((p.x+0.40)*4.5)*pulse*0.25;
    }

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+glow*0.65+scan*0.45+(tipL+tipR)*0.55+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==1){ vec2 p=vU*0.64; float t=vA+uTime;
    // Fighter: X-Wing blueprint — long fuselage, 4 splayed wings, 4 laser cannons, 4 engine pods
    // +X = forward (nose), -X = rear (engines)

    // 1. Fuselage — long narrow nose cone (X-Wing blueprint style)
    //    Nose: long pointed wedge extending far forward
    float dNose=sdTrapezoid(p.yx-vec2(0.0,0.34), 0.06, 0.008, 0.28);
    //    Sensor cone tip (small rounded point at very front)
    float dSensor=sdCapsule(p, vec2(0.56,0.0), vec2(0.66,0.0), 0.010);
    //    Mid body (wider section behind cockpit)
    float dMid=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.22,0.072),0.025);
    //    Rear hull (engine mounting block)
    float dRear=sdRoundedBox(p-vec2(-0.28,0.0),vec2(0.14,0.09),0.03);
    float dFuse=smin(smin(dNose,dMid,0.04),dRear,0.04);
    dFuse=smin(dFuse,dSensor,0.008);

    // Y-axis mirror fold — all wing/cannon/engine geometry is symmetric
    vec2 pm=vec2(p.x,abs(p.y));
    // 2. Four wings in X-formation (folded to 2 via abs(p.y))
    float dWF=sdCapsule(pm, vec2(0.02,0.07), vec2(-0.14,0.46), 0.038);  // front pair
    float dWR=sdCapsule(pm, vec2(-0.06,0.07), vec2(-0.22,0.42), 0.034);  // rear pair
    float dWings=min(dWF,dWR);

    // 3. Laser cannons (folded to 2 via abs(p.y))
    float dCF=sdCapsule(pm, vec2(-0.14,0.46), vec2(0.52,0.46), 0.014);  // front cannon
    float dCR=sdCapsule(pm, vec2(-0.22,0.42), vec2(0.46,0.42), 0.012);  // rear cannon
    float dCannons=min(dCF,dCR);

    // 4. Cockpit canopy (oval, forward on fuselage)
    float dCock=sdRoundedBox(p-vec2(0.20,0.0),vec2(0.09,0.038),0.022);

    // 5. R2 astromech dome (behind cockpit)
    float dR2=length(p-vec2(0.08,0.0))-0.032;

    // 6. Engine pods (folded to 2 via abs(p.y))
    float dEP1=sdCapsule(pm, vec2(-0.08,0.18), vec2(-0.22,0.24), 0.032);
    float dEP2=sdCapsule(pm, vec2(-0.12,0.16), vec2(-0.26,0.22), 0.028);
    float dEngPods=min(dEP1,dEP2);

    // 7. Union — tight blend for mechanical look, cannons very sharp join
    float dBody=smin(dFuse,dWings,0.035);
    dBody=smin(dBody,dCannons,0.005);
    dBody=smin(dBody,dCock,0.025);
    dBody=smin(dBody,dR2,0.015);
    dBody=smin(dBody,dEngPods,0.025);

    // 8. Panel seams — center line + wing panel lines
    float dSeam=sdCapsule(p,vec2(0.50,0.0),vec2(-0.38,0.0),0.003);
    dBody=max(dBody,-dSeam+0.005);
    // Wing panel line (folded to 1 via abs(p.y))
    float dWP=sdCapsule(pm,vec2(0.0,0.08),vec2(-0.18,0.44),0.003);
    dBody=max(dBody,-dWP+0.005);

    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;

    // 9. Engine exhaust glows (symmetric ×2 approx via pm)
    float pulse=0.6+0.4*sin(t*14.0);
    float eF=exp(-length(pm-vec2(-0.26,0.26))*15.0);
    float eR=exp(-length(pm-vec2(-0.30,0.22))*15.0);
    float eng=(eF+eR)*2.0*pulse;

    // 10. Cannon muzzle flash (symmetric ×2 approx via pm)
    float mFF=exp(-length(pm-vec2(0.52,0.46))*22.0);
    float mFR=exp(-length(pm-vec2(0.46,0.42))*22.0);
    float mFlash=(mFF+mFR)*2.0*(0.3+0.7*step(0.85,sin(t*20.0)));

    // 11. R2 dome glow (blue-white pulse)
    float r2Glow=exp(-length(p-vec2(0.08,0.0))*22.0)*(0.4+0.6*sin(t*3.0));

    // 12. Cockpit canopy highlight
    float cockGlow=exp(-length(p-vec2(0.22,0.0))*14.0)*0.25;

    // 13. Engine trails (symmetric — pm.y folds naturally)
    float trail=0.0;
    if(p.x<-0.26){
      float dy=min(abs(pm.y-0.26),abs(pm.y-0.22));
      trail=exp(-dy*18.0)*exp((p.x+0.26)*3.5)*pulse*0.30;
    }

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+eng*0.85+mFlash*0.25+r2Glow*0.45+cockGlow+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==2){ vec2 p=vU*0.82; float t=vA+uTime;
    // B2 Spirit: Flying wing — sharp swept leading edge, W trailing edge
    // +X forward. Wingspan ~1.4, chord ~0.6

    // Y-axis mirror fold — flying wing is fully symmetric
    vec2 pm=vec2(p.x,abs(p.y));
    // 1. Inner wing (folded to 1 via abs(p.y))
    float dInner=sdTrapezoid(pm.yx-vec2(0.30, 0.05), 0.32, 0.20, 0.32);

    // 2. Outer wing (folded to 1 via abs(p.y))
    float dOuter=sdCapsule(pm, vec2(-0.02,0.42), vec2(-0.32,0.72), 0.055);

    // 3. Union wings with tight blending (no round center body)
    float dBody=smin(dInner, dOuter, 0.06);

    // 4. Hard swept leading edge cut — forces knife-edge front
    //    Line: x = 0.38 - |y|*0.55  (sweepback angle ~29deg)
    float leadEdge = p.x - 0.38 + abs(p.y)*0.55;
    dBody = max(dBody, leadEdge);

    // 5. Cockpit — tiny forward bump, hard blend so it stays sharp
    float dCock=sdRoundedBox(p-vec2(0.34,0.0), vec2(0.06,0.04), 0.02);
    dBody=smin(dBody, dCock, 0.02);

    // 6. Engine nacelle ridge (folded to 1 via abs(p.y))
    float dNac=sdRoundedBox(pm-vec2(0.02,0.22), vec2(0.12,0.045), 0.02);
    dBody=smin(dBody, dNac, 0.03);

    // 7. W-shaped trailing edge — carve notches from rear
    float dCutC=sdTriangle(p, vec2(-0.18,0.0), vec2(-0.42,0.18), vec2(-0.42,-0.18));
    dBody=max(dBody, -dCutC);
    float dCutS=sdTriangle(pm, vec2(-0.28,0.38), vec2(-0.50,0.28), vec2(-0.50,0.55));
    dBody=max(dBody, -dCutS);

    // 8. Panel line groove (folded to 1 via abs(p.y))
    float dPanel=sdCapsule(pm, vec2(0.22,0.10), vec2(-0.12,0.42), 0.004);
    dBody=max(dBody, -dPanel+0.006);

    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;

    // 9. Engine glow (symmetric ×2 approx via pm)
    float pulse=0.55+0.45*sin(t*6.0);
    float eOuter=exp(-length(pm-vec2(-0.16,0.18))*14.0);
    float eInner=exp(-length(pm-vec2(-0.20,0.10))*14.0);
    float eng=(eOuter+eInner)*2.0*pulse;

    // 10. Trail (symmetric — pm.y folds naturally)
    float trail=0.0;
    if(p.x<-0.22){
      float dy=min(abs(pm.y-0.18),abs(pm.y-0.10));
      trail=exp(-dy*14.0)*exp((p.x+0.22)*2.8)*pulse*0.30;
    }

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+eng*0.75+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==3){ // Circle (particles, AOE projectiles)
    a=smoothstep(1.0,0.6,d)+exp(-d*2.0)*0.4; }
  else if(sh==4){ // Diamond (projectiles)
    float dd=abs(vU.x)+abs(vU.y);
    a=smoothstep(1.0,0.6,dd)+exp(-dd*2.0)*0.4; }
  else if(sh==5){ vec2 p=vU*0.68; float t=vA+uTime;
    // Scorcher: Forward focusing dish, beam emitter spine, charging anim
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
    float pulse=0.65+0.35*sin(t*3.5);
    float eng=exp(-length(p-vec2(-0.46,0.0))*8.0)*pulse;
    // 9. Trail
    float trail=0.0;
    if(p.x<-0.46){float dy=abs(p.y);trail=exp(-dy*20.0)*exp((p.x+0.46)*4.5)*pulse*0.25;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+chanGlow+focus*0.65+eng*0.40+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==6){
    vec2 p=vU*0.67; float t=vA+uTime;
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
    float dPodL=sdRoundedBox(p-vec2(0.0,0.24),vec2(0.16,0.07),0.02);
    float dPodR=sdRoundedBox(p-vec2(0.0,-0.24),vec2(0.16,0.07),0.02);
    float dPods=min(dPodL,dPodR);
    
    // 3. Bridge / Superstructure (Small bump on top/rear)
    float dBridge=sdRoundedBox(p-vec2(-0.25,0.0),vec2(0.08,0.14),0.02);
    
    // Smooth Union for organic but mechanical feel
    float dShape=smin(dHull,dPods,0.05);
    dShape=smin(dShape,dBridge,0.04);
    
    // 4. Details: Missile Tubes (Indentation on pods)
    // Repeating pattern or just a slit
    float dTubeL=sdRoundedBox(p-vec2(0.05,0.24),vec2(0.08,0.02),0.01);
    float dTubeR=sdRoundedBox(p-vec2(0.05,-0.24),vec2(0.08,0.02),0.01);
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
    float pulse=0.7+0.3*sin(t*14.0);
    float glow=exp(-dEng*6.0)*pulse;
    
    // Engine Trail (Single narrow stream)
    float trail=0.0;
    if(p.x < -0.6) {
       float dy=abs(p.y);
       trail=exp(-dy*18.0) * exp((p.x+0.6)*3.0) * pulse * 0.4;
    }
    
    // Missile Pod Glow (Subtle status lights)
    float podGlow=(1.0-smoothstep(0.0,0.02,abs(dTubes)))*0.5*(0.5+0.5*sin(t*3.0));

    a=hf*HF_WEIGHT[sh] + rim*RIM_WEIGHT[sh] + glow + trail + podGlow;
    a=1.1*tanh(a/1.1);
  }
  else if(sh==7){ vec2 p=vU*0.56; float t=vA+uTime;
    // Carrier: Lucrehulk-style crescent — drone bay arc with central core
    // 1. Main crescent hull (arc wraps around back, gap faces +X forward)
    vec2 aq=vec2(p.y,-p.x+0.04);
    float dArc=sdArc(aq,vec2(sin(2.3),cos(2.3)),0.34,0.09);
    // 2. Rear central core/reactor
    float dCore=length(p-vec2(-0.04,0.0))-0.13;
    // 3. Horn tips (hangar emitters at crescent endpoints)
    vec2 hornL=vec2(0.27,0.25);
    vec2 hornR=vec2(0.27,-0.25);
    float dHornL=sdRoundedBox(p-hornL,vec2(0.07,0.05),0.025);
    float dHornR=sdRoundedBox(p-hornR,vec2(0.07,0.05),0.025);
    float dHorns=min(dHornL,dHornR);
    // 4. Internal connection struts (core to arc)
    float dStrutL=sdCapsule(p,vec2(-0.02,0.10),vec2(-0.10,0.24),0.03);
    float dStrutR=sdCapsule(p,vec2(-0.02,-0.10),vec2(-0.10,-0.24),0.03);
    float dStruts=min(dStrutL,dStrutR);
    // Union
    float dBody=smin(dArc,dCore,0.06);
    dBody=smin(dBody,dHorns,0.04);
    dBody=smin(dBody,dStruts,0.05);
    // 5. Hangar groove cutouts at horn tips
    float dSlotL=sdRoundedBox(p-hornL,vec2(0.045,0.018),0.006);
    float dSlotR=sdRoundedBox(p-hornR,vec2(0.045,0.018),0.006);
    dBody=max(dBody,-min(dSlotL,dSlotR));
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 6. Hangar glow at horn tips
    float bayPulse=0.5+0.5*sin(t*2.5);
    float hangarGlow=(exp(-length(p-hornL)*14.0)+exp(-length(p-hornR)*14.0))*bayPulse*0.50;
    // 7. Core reactor glow
    float coreGlow=exp(-length(p-vec2(-0.04,0.0))*10.0)*(0.6+0.4*sin(t*3.0));
    // 8. Inner bay illumination (along inner edge of arc)
    float innerRd=length(p-vec2(0.04,0.0));
    float innerGlow=exp(-abs(innerRd-0.22)*14.0)*(1.0-smoothstep(0.18,0.34,innerRd))*0.30
                    *(0.5+0.5*sin(t*1.5+p.y*6.0));
    // 9. Drone launch flash (sporadic at horn tips)
    float flash=step(0.93,fract(t*0.7+0.3));
    float launchFlash=(exp(-length(p-hornL)*18.0)+exp(-length(p-hornR)*18.0))*flash*0.55;
    // 10. Triple engines (rear of core) + trail
    float eP=0.6+0.4*sin(t*6.0);
    float dE1=length(p-vec2(-0.40,0.0));
    float dE2=length(p-vec2(-0.38,0.10));
    float dE3=length(p-vec2(-0.38,-0.10));
    float eng=(exp(-dE1*9.0)+exp(-dE2*10.0)+exp(-dE3*10.0))*eP;
    float trail=0.0;
    if(p.x<-0.40){float dy=abs(p.y);
      trail=exp(-dy*8.0)*exp((p.x+0.40)*1.8)*eP*0.5;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+hangarGlow+coreGlow*0.50+innerGlow+launchFlash+eng*0.50+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==8){ vec2 p=vU*0.72; float t=vA+uTime;
    // Sniper: Ultra-long railgun barrel, compact rear body, charge glow at tip
    // 1. Compact rear body (engine + power plant)
    float dRear=sdRoundedBox(p-vec2(-0.28,0.0),vec2(0.20,0.16),0.05);
    // 2. Long railgun barrel (extends far forward)
    float dBarrel=sdCapsule(p,vec2(-0.12,0.0),vec2(0.58,0.0),0.025);
    // 3. Barrel shroud (wider mid-section for cooling)
    float dShroud=sdRoundedBox(p-vec2(0.08,0.0),vec2(0.12,0.06),0.02);
    // 4. Small stabilizer wings
    float dFinL=sdCapsule(p,vec2(-0.30,0.12),vec2(-0.44,0.26),0.025);
    float dFinR=sdCapsule(p,vec2(-0.30,-0.12),vec2(-0.44,-0.26),0.025);
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
    float pulse=0.6+0.4*sin(t*3.0);
    float eng=exp(-length(p-vec2(-0.48,0.0))*9.0)*pulse;
    float trail=0.0;
    if(p.x<-0.48){float dy=abs(p.y);trail=exp(-dy*22.0)*exp((p.x+0.48)*5.0)*pulse*0.2;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+muzzle*0.70+railFlow+scope+eng*0.35+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==9){ vec2 p=vU*0.74; float t=vA+uTime;
    // Lancer: Star Destroyer wedge — heavy dagger silhouette
    // 1. Main wedge hull (trapezoid: wide stern → sharp bow)
    //    sdTrapezoid is Y-axis oriented, so pass p.yx to align +X = forward
    //    r1=stern half-width, r2=bow half-width, he=half-length
    //    0.06 Y-offset shifts hull centre-of-mass forward for a sleeker silhouette
    float dHull=sdTrapezoid(p.yx-vec2(0.0,0.06),0.28,0.02,0.50);
    // 2. Stern deck (blocky rear to avoid pure triangle)
    float dAft=sdRoundedBox(p-vec2(-0.30,0.0),vec2(0.12,0.22),0.02);
    // 3. Bridge tower (raised superstructure on dorsal stern)
    float dBridge=sdRoundedBox(p-vec2(-0.22,0.0),vec2(0.08,0.06),0.015);
    // 4. Side armor plates (subtle shoulders)
    float dPlateL=sdRoundedBox(p-vec2(-0.04,0.20),vec2(0.10,0.05),0.012);
    float dPlateR=sdRoundedBox(p-vec2(-0.04,-0.20),vec2(0.10,0.05),0.012);
    // 5. Union hull + plates + bridge + aft
    float dBody=smin(dHull,dAft,0.04);
    dBody=smin(dBody,dBridge,0.03);
    float dPlates=min(dPlateL,dPlateR);
    dBody=smin(dBody,dPlates,0.02);
    // 6. Side cutouts (notches to break triangle silhouette)
    float dCutL=sdRoundedBox(p-vec2(0.10,0.26),vec2(0.08,0.05),0.01);
    float dCutR=sdRoundedBox(p-vec2(0.10,-0.26),vec2(0.08,0.05),0.01);
    float dCuts=min(dCutL,dCutR);
    dBody=max(dBody,-dCuts+0.02);
    // 7. Panel lines (armor plating detail)
    float groove1=sdRoundedBox(p-vec2(-0.02,0.0),vec2(0.34,0.008),0.002);
    float groove2=sdRoundedBox(p-vec2(-0.08,0.0),vec2(0.008,0.18),0.002);
    dBody=max(dBody,-groove1+0.01);
    dBody=max(dBody,-groove2+0.01);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 8. Ram tip glow (pulsing forward energy)
    float tipGlow=exp(-length(p-vec2(0.56,0.0))*12.0)*(0.5+0.5*sin(t*6.0));
    // 9. Triple heavy engines (wide spread across stern)
    float pulse=0.7+0.3*sin(t*10.0+p.y*4.0);
    float eC=exp(-length(p-vec2(-0.48,0.0))*8.0);
    float eL=exp(-length(p-vec2(-0.46,0.17))*9.0);
    float eR=exp(-length(p-vec2(-0.46,-0.17))*9.0);
    float eng=(eC+eL+eR)*pulse;
    // 10. Heavy exhaust trail (wide, bright — Lancer signature)
    float trail=0.0;
    if(p.x<-0.46){float dy=abs(p.y);
      trail=exp(-dy*4.0)*exp((p.x+0.46)*1.4)*pulse*0.95;}
    // 11. Bridge window glow
    float bridgeGlow=exp(-length(p-vec2(-0.22,0.0))*18.0)*0.25;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+tipGlow*0.50+eng*0.75+trail+bridgeGlow;
    a=1.2*tanh(a/1.2); }
  else if(sh==10){ float ring=abs(d-0.75);
    a=exp(-ring*8.0)*0.6+exp(-d*1.0)*0.08; }
  else if(sh==11){ vec2 p=vU*0.64; float t=vA+uTime;
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
    float rT1=fract(t*0.6)*0.8;
    float rT2=fract(t*0.4+0.5)*0.8;
    float rA1=smoothstep(0.0,0.12,rT1)*smoothstep(0.8,0.35,rT1);
    float rA2=smoothstep(0.0,0.12,rT2)*smoothstep(0.8,0.35,rT2);
    float rings=(exp(-abs(rd-rT1)*16.0)*rA1+exp(-abs(rd-rT2)*16.0)*rA2)*0.30;
    // 4. Antenna tip nodes (pulsing phase-stagger)
    float n0=exp(-length(p-vec2(0.42,0.0))*16.0)*(0.5+0.5*sin(t*12.0));
    float n1=exp(-length(p-vec2(0.21,0.36))*16.0)*(0.5+0.5*sin(t*5.0+1.05));
    float n2=exp(-length(p-vec2(-0.21,0.36))*16.0)*(0.5+0.5*sin(t*5.0+2.09));
    float n3=exp(-length(p-vec2(-0.42,0.0))*16.0)*(0.5+0.5*sin(t*5.0+3.14));
    float n4=exp(-length(p-vec2(-0.21,-0.36))*16.0)*(0.5+0.5*sin(t*5.0+4.19));
    float n5=exp(-length(p-vec2(0.21,-0.36))*16.0)*(0.5+0.5*sin(t*5.0+5.24));
    float nodes=(n0+n1+n2+n3+n4+n5)*0.40;
    // 5. Core reactor glow
    float coreGlow=exp(-rd*10.0)*(0.6+0.4*sin(t*4.0));
    // 6. Engine (rear prong doubles as thruster)
    float pulse=0.6+0.4*sin(t*15.0);
    float eng=exp(-length(p-vec2(-0.44,0.0))*8.0)*pulse;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rings+nodes+coreGlow*0.50+eng*0.30;
    a=1.2*tanh(a/1.2); }
  else if(sh==12){ float by=abs(vU.y),bx=abs(vU.x);
    float xf=smoothstep(1.0,0.4,bx);
    a=(exp(-by*6.0)*1.0+exp(-by*2.5)*0.4)*xf+exp(-d*1.5)*0.2; }
  else if(sh==13){ vec2 p=vU*0.66; float t=vA+uTime;
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
    float phase=sin(rd*28.0-t*12.0)*0.5+0.5;
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
    float pulse=0.6+0.4*sin(t*20.0);
    float eng=exp(-length(p-vec2(-0.44,0.0))*8.0)*pulse;
    float trail=0.0;
    if(p.x<-0.44){float dy=abs(p.y);trail=exp(-dy*22.0)*exp((p.x+0.44)*4.0)*pulse*0.15;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+distortion+frameEdge+nodes+eng*0.25+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==14){ // Homing missile (elongated diamond / arrowhead)
    float dd=abs(vU.x)*0.6+abs(vU.y);
    a=smoothstep(1.0,0.5,dd)+exp(-dd*2.5)*0.4; }
  else if(sh==15){ vec2 p=vU*0.69; float t=vA+uTime;
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
    float pulse=0.6+0.4*sin(t*12.0);
    float eng=exp(-length(p-vec2(-0.34,0.0))*8.0)*pulse;
    float trail=0.0;
    if(p.x<-0.34){float dy=abs(p.y);trail=exp(-dy*6.0)*exp((p.x+0.34)*2.0)*pulse*0.6;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+nodes+arcGlow+coreGlow*0.45+eng*0.80+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==16){ vec2 p=vU*0.62; float t=vA+uTime;
    // Cruiser: Nebulon-B style dumbbell — hammerhead command + spine + engine block
    // 1. Forward command section (hammerhead)
    float dCmd=sdRoundedBox(p-vec2(0.30,0.0),vec2(0.18,0.22),0.03);
    // 2. Forward antenna prongs (aggressive forward sweep from command edges)
    float dProngL=sdCapsule(p,vec2(0.42,0.18),vec2(0.54,0.10),0.020);
    float dProngR=sdCapsule(p,vec2(0.42,-0.18),vec2(0.54,-0.10),0.020);
    float dProngs=min(dProngL,dProngR);
    // 3. Thin spine/keel connecting sections
    float dSpine=sdCapsule(p,vec2(0.14,0.0),vec2(-0.16,0.0),0.030);
    // 4. Rear engine block (compact, taller)
    float dEngine=sdRoundedBox(p-vec2(-0.30,0.0),vec2(0.14,0.20),0.04);
    // 5. Dorsal + ventral fins (symmetric pair at spine midpoint)
    float dFinU=sdCapsule(p,vec2(0.02,0.05),vec2(0.02,0.26),0.020);
    float dFinD=sdCapsule(p,vec2(0.02,-0.05),vec2(0.02,-0.26),0.020);
    float dFin=min(dFinU,dFinD);
    // 6. Rear stabilizer wings (swept far back past engines)
    float dStabL=sdCapsule(p,vec2(-0.28,0.18),vec2(-0.58,0.34),0.020);
    float dStabR=sdCapsule(p,vec2(-0.28,-0.18),vec2(-0.58,-0.34),0.020);
    float dStabs=min(dStabL,dStabR);
    // Union
    float dBody=smin(dCmd,dProngs,0.03);
    dBody=smin(dBody,dSpine,0.04);
    dBody=smin(dBody,dEngine,0.04);
    dBody=smin(dBody,dFin,0.03);
    dBody=smin(dBody,dStabs,0.03);
    // 7. Beam turret slit (command section)
    float dTurret=sdRoundedBox(p-vec2(0.30,0.0),vec2(0.12,0.018),0.005);
    dBody=max(dBody,-dTurret);
    // 8. Spine conduit groove
    float dConduit=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.16,0.012),0.004);
    dBody=max(dBody,-dConduit);
    // 9. Engine exhaust port cutouts (visible nozzles)
    float dNozL=sdRoundedBox(p-vec2(-0.44,0.08),vec2(0.02,0.03),0.008);
    float dNozR=sdRoundedBox(p-vec2(-0.44,-0.08),vec2(0.02,0.03),0.008);
    dBody=max(dBody,-min(dNozL,dNozR));
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 10. Turret glow
    float turretGlow=(1.0-smoothstep(0.0,aa*2.0,abs(dTurret)))*(0.4+0.6*sin(t*2.0))*0.45;
    // 11. Spine energy flow (rear→forward animation)
    float spineFlow=(1.0-smoothstep(0.0,aa*2.0,abs(dConduit)))
                    *(0.3+0.7*(0.5+0.5*sin(p.x*8.0-t*5.0)))*0.40;
    // 12. Bridge window lights (forward command section)
    float bridgeGlow=exp(-length(p-vec2(0.42,0.0))*16.0)*(0.5+0.5*sin(t*1.5));
    // 13. Antenna tip sensors (alternating blink)
    float sensorL=exp(-length(p-vec2(0.56,0.10))*18.0)*(0.5+0.5*sin(t*4.0));
    float sensorR=exp(-length(p-vec2(0.56,-0.10))*18.0)*(0.5+0.5*sin(t*4.0+3.14));
    float sensors=(sensorL+sensorR)*0.45;
    // 14. Engine block reactor core glow
    float reactor=exp(-length(p-vec2(-0.30,0.0))*12.0)*(0.5+0.5*sin(t*3.5));
    // 15. Twin engines + trail
    float eP=0.65+0.35*sin(t*5.0);
    float dE1=length(p-vec2(-0.46,0.08)); float dE2=length(p-vec2(-0.46,-0.08));
    float eng=exp(-min(dE1,dE2)*9.0)*eP;
    float trail=0.0;
    if(p.x<-0.46){float dy=min(abs(p.y-0.08),abs(p.y+0.08));
      trail=exp(-dy*10.0)*exp((p.x+0.46)*2.2)*eP*0.55;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+turretGlow+spineFlow+bridgeGlow*0.35+sensors+reactor*0.30+eng*0.50+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==17){ float dd=manDist(vU); float ring=abs(dd-0.65);
    a=exp(-ring*10.0)*0.7+exp(-dd*1.2)*0.1; }
  else if(sh==20){ vec2 p=vU*0.62; float t=vA+uTime;
    // Bastion: Type-10 Defender-style armored block — inverted trapezoid, angular fins, quad engines

    // 1. Main hull — inverted trapezoid (rear wide 0.26, front narrow 0.18)
    float dHull=sdTrapezoid(p.yx,0.26,0.18,0.38);

    // 2. Front armor plate (blunt angular wedge)
    float dProw=sdRoundedBox(p-vec2(0.36,0.0),vec2(0.10,0.20),0.02);

    // 3. Rear angle fins (Type-10 stabilizers — diagonal outward from stern)
    float dFinL=sdCapsule(p,vec2(-0.36,0.26),vec2(-0.48,0.36),0.025);
    float dFinR=sdCapsule(p,vec2(-0.36,-0.26),vec2(-0.48,-0.36),0.025);
    float dFins=min(dFinL,dFinR);

    // 4. Rear engine block (wide, spans hull rear width)
    float dEngine=sdRoundedBox(p-vec2(-0.40,0.0),vec2(0.08,0.26),0.02);

    // 5. Side armor skirts (flush extensions along hull flanks)
    float dSkirtL=sdRoundedBox(p-vec2(-0.02,0.28),vec2(0.28,0.04),0.01);
    float dSkirtR=sdRoundedBox(p-vec2(-0.02,-0.28),vec2(0.28,0.04),0.01);
    float dSkirts=min(dSkirtL,dSkirtR);

    // Union with tight smin for angular look
    float dBody=smin(dHull,dProw,0.03);
    dBody=smin(dBody,dFins,0.025);
    dBody=smin(dBody,dEngine,0.03);
    dBody=smin(dBody,dSkirts,0.025);

    // 6. Armor panel grooves — grid (1 horizontal + 2 vertical)
    float dGH=sdRoundedBox(p-vec2(-0.02,0.0),vec2(0.34,0.020),0.004);
    float dGV1=sdRoundedBox(p-vec2(0.12,0.0),vec2(0.018,0.22),0.004);
    float dGV2=sdRoundedBox(p-vec2(-0.16,0.0),vec2(0.018,0.22),0.004);
    dBody=max(dBody,-dGH+0.008);
    dBody=max(dBody,-min(dGV1,dGV2)+0.008);

    // Diagonal panel cuts at ±25deg (faceted armor, same technique as Reflector sh26)
    float cs25=0.906; float sn25=0.423;
    vec2 pr1=vec2(p.x*cs25-p.y*sn25,p.x*sn25+p.y*cs25);
    dBody=max(dBody,-sdRoundedBox(pr1-vec2(0.04,0.0),vec2(0.26,0.010),0.004));
    vec2 pr2=vec2(p.x*cs25+p.y*sn25,-p.x*sn25+p.y*cs25);
    dBody=max(dBody,-sdRoundedBox(pr2-vec2(0.04,0.0),vec2(0.26,0.010),0.004));

    // 7. Engine nozzle cutouts (4 thrusters at Y = ±0.14, ±0.05)
    float dN1=sdRoundedBox(p-vec2(-0.49,0.14),vec2(0.02,0.035),0.008);
    float dN2=sdRoundedBox(p-vec2(-0.49,-0.14),vec2(0.02,0.035),0.008);
    float dN3=sdRoundedBox(p-vec2(-0.49,0.05),vec2(0.02,0.035),0.008);
    float dN4=sdRoundedBox(p-vec2(-0.49,-0.05),vec2(0.02,0.035),0.008);
    dBody=max(dBody,-min(min(dN1,dN2),min(dN3,dN4)));

    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;

    // 8. Tether nodes (4, embedded in skirts, phase-staggered)
    float n0=exp(-length(p-vec2(0.14,0.30))*16.0)*(0.4+0.3*sin(t*3.0));
    float n1=exp(-length(p-vec2(0.14,-0.30))*16.0)*(0.4+0.3*sin(t*3.0+1.57));
    float n2=exp(-length(p-vec2(-0.18,0.30))*16.0)*(0.4+0.3*sin(t*3.0+3.14));
    float n3=exp(-length(p-vec2(-0.18,-0.30))*16.0)*(0.4+0.3*sin(t*3.0+4.71));
    float nodes=(n0+n1+n2+n3)*0.50;

    // 9. Armor groove glow (horizontal + vertical energy flow)
    float plateGlowH=(1.0-smoothstep(0.0,aa*3.0,abs(dGH)))
                     *(0.3+0.7*(0.5+0.5*sin(p.x*8.0-t*4.0)))*0.45;
    float plateGlowV=(1.0-smoothstep(0.0,aa*3.0,min(abs(dGV1),abs(dGV2))))
                     *(0.3+0.7*(0.5+0.5*sin(p.y*8.0+t*3.0)))*0.35;

    // 10. Reactor core (central, subdued pulse)
    float core=exp(-length(p-vec2(-0.04,0.0))*12.0)*(0.4+0.4*sin(t*2.5));

    // 11. Front armor glow (vertical stripe pattern — distinct from Healer cross)
    float prowMask=smoothstep(0.06,0.0,dProw)*hf;
    float prowGlow=prowMask*(0.3+0.2*sin(p.y*18.0+t*2.0))*0.25;

    // 12. Quad engines + trails
    float eP=0.65+0.35*sin(t*4.0);
    float dE1=length(p-vec2(-0.50,0.14)); float dE2=length(p-vec2(-0.50,-0.14));
    float dE3=length(p-vec2(-0.50,0.05)); float dE4=length(p-vec2(-0.50,-0.05));
    float eng=exp(-min(min(dE1,dE2),min(dE3,dE4))*9.0)*eP;
    float trail=0.0;
    if(p.x<-0.50){float dy=min(min(abs(p.y-0.14),abs(p.y+0.14)),min(abs(p.y-0.05),abs(p.y+0.05)));
      trail=exp(-dy*16.0)*exp((p.x+0.50)*3.0)*eP*0.25;}

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+nodes+plateGlowH+plateGlowV+core*0.35+prowGlow+eng*0.35+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==21){ float bx=abs(vU.x),by=abs(vU.y);
    a=smoothstep(1.0,0.95,bx)*smoothstep(0.18,0.1,by)+exp(-by*14.0)*0.06; }
  else if(sh==22){ float od=octDist(vU);
    float edge=abs(od-0.75);
    a=smoothstep(0.06,0.01,edge)*0.7;
    float t=vA*4.0+uTime;
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
  else if(sh==24){ vec2 p=vU*0.84; float t=vA+uTime;
    // Flagship: Sleek catamaran battleship — tapered twin hulls
    // 1. Tapered twin hulls (sdTrapezoid via p.yx: stern wide, bow narrow)
    float dTop=sdTrapezoid(p.yx-vec2(0.28,-0.05),0.20,0.05,0.58);
    float dBot=sdTrapezoid(p.yx-vec2(-0.28,-0.05),0.20,0.05,0.58);
    // 2. Bow turret bridge (connects twin hulls at front)
    float dBow=sdRoundedBox(p-vec2(0.46,0.0),vec2(0.12,0.22),0.05);
    // 3. Stern engineering section (wide rear connection)
    float dStern=sdRoundedBox(p-vec2(-0.68,0.0),vec2(0.10,0.38),0.06);
    // 4. Union hulls + bridge + stern
    float dBody=smin(min(dTop,dBot),dBow,0.06);
    dBody=smin(dBody,dStern,0.05);
    // 5. Center channel cutout (gap between twin hulls)
    dBody=max(dBody,-sdRoundedBox(p-vec2(-0.06,0.0),vec2(0.52,0.13),0.05));
    // 6. Stern engine bay cutout
    dBody=max(dBody,-sdRoundedBox(p-vec2(-0.68,0.0),vec2(0.14,0.14),0.04));
    // 7. Hull notches (break smooth hull surface on each hull)
    dBody=max(dBody,-min(sdRoundedBox(p-vec2(-0.10,0.28),vec2(0.22,0.05),0.02),
                        sdRoundedBox(p-vec2(-0.10,-0.28),vec2(0.22,0.05),0.02)));
    // 8. Dorsal keel ridges (armor plates along each hull)
    float dKeelT=sdRoundedBox(p-vec2(0.05,0.28),vec2(0.30,0.015),0.005);
    float dKeelB=sdRoundedBox(p-vec2(0.05,-0.28),vec2(0.30,0.015),0.005);
    dBody=max(dBody,-min(dKeelT,dKeelB)+0.008);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    float xSeg=p.x*7.0+0.2;
    float rib=(1.0-smoothstep(0.42,0.50,abs(fract(xSeg)-0.5)+fwidth(xSeg)*0.6))
              *smoothstep(-0.60,-0.10,p.x)*hf*0.16;
    float lane=max(1.0-smoothstep(0.055,0.055+aa,abs(p.y-0.28)),
                   1.0-smoothstep(0.055,0.055+aa,abs(p.y+0.28)));
    float wx=p.x*14.0+t*0.8;
    float win=(1.0-smoothstep(0.34,0.48,abs(fract(wx)-0.5)+fwidth(wx)*0.8))
              *smoothstep(-0.55,0.45,p.x)*lane*hf;
    float dCh=sdRoundedBox(p-vec2(-0.06,0.0),vec2(0.52,0.13),0.05);
    float reactor=exp(-18.0*max(length(p-vec2(0.08,0.0))-0.10,0.0))
                  *(0.72+0.28*sin(t*2.4))*(1.0-smoothstep(0.0,aa,dCh))*hf;
    float engP=0.70+0.30*sin(t*7.0+p.y*4.0);
    float eR=0.07; float eF=24.0; float pF=150.0; float pD=10.0;
    float e1=length(p-vec2(-0.80,0.18))-eR; float e2=length(p-vec2(-0.80,0.38))-eR;
    float e3=length(p-vec2(-0.80,-0.18))-eR; float e4=length(p-vec2(-0.80,-0.38))-eR;
    float engC=exp(-eF*max(min(min(min(e1,e2),e3),e4),0.0))*engP;
    float plm=exp(-pD*max(-p.x-0.78,0.0))*(
      exp(-pF*(p.y-0.18)*(p.y-0.18))+exp(-pF*(p.y-0.38)*(p.y-0.38))+
      exp(-pF*(p.y+0.18)*(p.y+0.18))+exp(-pF*(p.y+0.38)*(p.y+0.38)));
    float eng=(engC*0.85+plm*(0.55+0.45*engP)*0.45)*smoothstep(-0.85,-0.35,p.x);
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rib+win*0.22+reactor*0.55+eng*0.60;
    a=1.2*tanh(a/1.2); }
  else if(sh==25){ vec2 p=vU*0.55; float t=vA+uTime;
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
    float eP=0.65+0.35*sin(t*5.0);
    float dE1=length(p-vec2(-0.40,0.15)); float dE2=length(p-vec2(-0.40,-0.15));
    float eng=exp(-min(dE1,dE2)*9.0)*eP;
    float trail=0.0;
    if(p.x<-0.40){
      float dy=min(abs(p.y-0.15),abs(p.y+0.15));
      trail=exp(-dy*12.0)*exp((p.x+0.40)*2.2)*eP*0.35;
    }

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+crossGlow+reactor*0.50+rings+nacGlow*0.50+dFocus*0.40+eng*0.55+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==26){ vec2 p=vU*0.54; float t=vA+uTime;
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
    float eP=0.65+0.35*sin(t*6.0);
    float eng=exp(-length(p-vec2(-0.52,0.0))*8.0)*eP;
    float trail=0.0;
    if(p.x<-0.52){
      float dy=abs(p.y);
      trail=exp(-dy*14.0)*exp((p.x+0.52)*2.5)*eP*0.4;
    }

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+shieldFx+shieldEdge+condFlow+nodes+core*0.45+eng*0.50+trail;
    a=1.2*tanh(a/1.2); }
  else if(sh==27){ float hd=hexDist(vU);
    float edge=abs(hd-0.70);
    // Bright core ring + soft neon glow halo
    a=smoothstep(0.06,0.005,edge)*0.85+exp(-edge*12.0)*0.45;
    float t=vA*3.5+uTime;
    // Prismatic angular rainbow on ring — cosine palette
    float ang=atan(vU.y,vU.x);
    vec3 prism=0.55+0.45*cos(ang+t*0.8+vec3(0.0,2.094,4.189));
    vec3 col=mix(vC.rgb,prism,exp(-edge*8.0)*0.5);
    // 6 hex vertices — spectrally colored prism nodes
    vec2 v0=vec2(0.70,0.0);       vec2 v1=vec2(0.35,0.606);
    vec2 v2=vec2(-0.35,0.606);    vec2 v3=vec2(-0.70,0.0);
    vec2 v4=vec2(-0.35,-0.606);   vec2 v5=vec2(0.35,-0.606);
    float n0=exp(-length(vU-v0)*16.0)*(0.4+0.6*(0.5+0.5*sin(t)));
    float n1=exp(-length(vU-v1)*16.0)*(0.4+0.6*(0.5+0.5*sin(t+1.047)));
    float n2=exp(-length(vU-v2)*16.0)*(0.4+0.6*(0.5+0.5*sin(t+2.094)));
    float n3=exp(-length(vU-v3)*16.0)*(0.4+0.6*(0.5+0.5*sin(t+3.142)));
    float n4=exp(-length(vU-v4)*16.0)*(0.4+0.6*(0.5+0.5*sin(t+4.189)));
    float n5=exp(-length(vU-v5)*16.0)*(0.4+0.6*(0.5+0.5*sin(t+5.236)));
    a+=n0+n1+n2+n3+n4+n5;
    // Each node emits its own spectral hue
    vec3 nc=n0*vec3(1.0,0.35,0.4)+n1*vec3(1.0,0.85,0.3)
           +n2*vec3(0.35,1.0,0.4)+n3*vec3(0.3,0.9,1.0)
           +n4*vec3(0.45,0.35,1.0)+n5*vec3(0.9,0.35,1.0);
    float nSum=n0+n1+n2+n3+n4+n5;
    col=mix(col,nc/max(nSum,0.001),clamp(nSum*0.55,0.0,0.65));
    // Prismatic interference ripple
    float rd=length(vU);
    float ripple=sin(rd*18.0-uTime*4.0+hd*8.0)*0.5+0.5;
    float innerMask=smoothstep(0.70,0.25,hd);
    a+=ripple*innerMask*0.25;
    // Ripple chromatic shift
    vec3 ripC=0.55+0.45*cos(rd*10.0-uTime*3.0+vec3(0.0,2.094,4.189));
    col=mix(col,ripC,innerMask*ripple*0.25);
    // Soft inner ambient glow
    a+=exp(-hd*2.8)*0.18;
    fragColor=vec4(col*a, vC.a*clamp(a,0.0,1.0)); return; }
  // ── sh28: Amplifier — 前進翼・増幅戦闘艦 ──
  else if(sh==28){ vec2 p=vU*0.58; float t=vA+uTime;
    // 1. Wedge hull (trapezoid: wide stern → sharp bow)
    float dHull=sdTrapezoid(p.yx-vec2(0.0,0.04),0.24,0.03,0.46);
    // 2. Large forward-swept main wings (shoulder → front-outward)
    float dWingM=sdCapsule(p,vec2(-0.08,0.12),vec2(0.28,0.42),0.045);
    float dWingMR=sdCapsule(p,vec2(-0.08,-0.12),vec2(0.28,-0.42),0.045);
    // 3. Secondary forward-swept wings (inner, shorter)
    float dWingS=sdCapsule(p,vec2(-0.14,0.10),vec2(0.16,0.30),0.030);
    float dWingSR=sdCapsule(p,vec2(-0.14,-0.10),vec2(0.16,-0.30),0.030);
    float dWings=min(min(dWingM,dWingMR),min(dWingS,dWingSR));
    // 4. Aggressive wing tips (forward-swept triangular ends)
    float dTipL=sdTriangle(p,vec2(0.24,0.40),vec2(0.36,0.50),vec2(0.22,0.46));
    float dTipR=sdTriangle(p,vec2(0.24,-0.40),vec2(0.36,-0.50),vec2(0.22,-0.46));
    dWings=min(dWings,min(dTipL,dTipR));
    // 5. Bow spike (amplifier focal point)
    float dSpike=sdCapsule(p,vec2(0.38,0.0),vec2(0.56,0.0),0.018);
    float dBody=smin(dHull,dWings,0.05);
    dBody=smin(dBody,dSpike,0.03);
    // 6. Panel grooves — horizontal centre line
    float dGH=sdRoundedBox(p,vec2(0.36,0.012),0.003);
    dBody=max(dBody,-dGH+0.008);
    // 7. Wing conduit grooves (energy conduits along wings)
    float dCondL=sdCapsule(p,vec2(-0.10,0.13),vec2(0.24,0.38),0.008);
    float dCondR=sdCapsule(p,vec2(-0.10,-0.13),vec2(0.24,-0.38),0.008);
    dBody=max(dBody,-min(dCondL,dCondR)+0.006);
    // 8. Diagonal armor cuts at ±20deg
    float cs20=0.940; float sn20=0.342;
    vec2 pr1=vec2(p.x*cs20-p.y*sn20,p.x*sn20+p.y*cs20);
    dBody=max(dBody,-sdRoundedBox(pr1-vec2(0.02,0.0),vec2(0.28,0.008),0.003));
    vec2 pr2=vec2(p.x*cs20+p.y*sn20,-p.x*sn20+p.y*cs20);
    dBody=max(dBody,-sdRoundedBox(pr2-vec2(0.02,0.0),vec2(0.28,0.008),0.003));
    // 9. Engine nozzle cutouts (twin)
    float dN1=sdRoundedBox(p-vec2(-0.48,0.10),vec2(0.02,0.032),0.008);
    float dN2=sdRoundedBox(p-vec2(-0.48,-0.10),vec2(0.02,0.032),0.008);
    dBody=max(dBody,-min(dN1,dN2));
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 10. EM concentric rings (3-ring pulse from hull centre)
    float rd=length(p-vec2(0.04,0.0));
    float ring1=exp(-pow(rd-mod(t*0.8,1.2),2.0)*80.0)*0.35;
    float ring2=exp(-pow(rd-mod(t*0.8+0.4,1.2),2.0)*80.0)*0.28;
    float ring3=exp(-pow(rd-mod(t*0.8+0.8,1.2),2.0)*80.0)*0.20;
    float rings=(ring1+ring2+ring3)*smoothstep(0.7,0.2,rd);
    // 11. Bow focal point glow
    float focalD=length(p-vec2(0.56,0.0));
    float focalGlow=exp(-focalD*14.0)*(0.5+0.4*sin(t*6.0));
    // 12. Wing conduit energy flow
    float condMaskL=1.0-smoothstep(0.0,aa*3.0,abs(dCondL));
    float condMaskR=1.0-smoothstep(0.0,aa*3.0,abs(dCondR));
    float condFlow=(condMaskL+condMaskR)*(0.3+0.7*(0.5+0.5*sin(p.x*12.0-t*6.0)))*0.35;
    // 13. Twin engines + exhaust trail
    float eP=0.65+0.35*sin(t*8.0);
    float eL=exp(-length(p-vec2(-0.50,0.10))*10.0);
    float eR=exp(-length(p-vec2(-0.50,-0.10))*10.0);
    float eng=(eL+eR)*eP;
    float dy=min(abs(p.y-0.10),abs(p.y+0.10));
    float trail=step(p.x,-0.50)*exp(-dy*16.0)*exp((p.x+0.50)*3.0)*eP*0.30;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rings+focalGlow*0.50+condFlow+eng*0.45+trail;
    vec3 col=vC.rgb;
    col=mix(col,vec3(0.7,0.95,1.0),(condMaskL+condMaskR)*0.30);
    col=mix(col,vec3(1.0,0.95,0.85),exp(-focalD*10.0)*0.45);
    col=mix(col,vec3(1.0,0.75,0.4),rings*0.30);
    a=1.2*tanh(a/1.2);
    fragColor=vec4(col*a, vC.a*clamp(a,0.0,1.0)); return; }
  // ── sh29: Scrambler — ジャミングポッド型電子戦艦 ──
  else if(sh==29){ vec2 p=vU*0.60; float t=vA+uTime;
    // 1. Central hexagonal hub
    float dHub=sdRoundedBox(p,vec2(0.12,0.10),0.04);
    // 2. Three boom arms at 120deg intervals (asymmetric lengths)
    float cs120=cos(2.094); float sn120=sin(2.094);
    vec2 p2=vec2(p.x*cs120-p.y*sn120, p.x*sn120+p.y*cs120);
    vec2 p3=vec2(p.x*cs120+p.y*sn120,-p.x*sn120+p.y*cs120);
    float dArm1=sdCapsule(p,vec2(0.12,0.0),vec2(0.44,0.06),0.022);
    float dArm2=sdCapsule(p2,vec2(0.12,0.0),vec2(0.38,-0.04),0.020);
    float dArm3=sdCapsule(p3,vec2(0.12,0.0),vec2(0.40,0.02),0.018);
    float dArms=min(min(dArm1,dArm2),dArm3);
    // 3. Tip pods (emitter arrays)
    float dPod1=sdRoundedBox(p-vec2(0.44,0.06),vec2(0.05,0.035),0.015);
    float dPod2=sdRoundedBox(p2-vec2(0.38,-0.04),vec2(0.045,0.030),0.012);
    float dPod3=sdRoundedBox(p3-vec2(0.40,0.02),vec2(0.048,0.032),0.013);
    float dPods=min(min(dPod1,dPod2),dPod3);
    // 4. Union body
    float dBody=smin(dHub,dArms,0.03);
    dBody=smin(dBody,dPods,0.02);
    // 5. Panel grooves (radial seams)
    float dSeam1=sdCapsule(p,vec2(0.0,0.0),vec2(0.42,0.06),0.003);
    float dSeam2=sdCapsule(p2,vec2(0.0,0.0),vec2(0.36,-0.04),0.003);
    float dSeam3=sdCapsule(p3,vec2(0.0,0.0),vec2(0.38,0.02),0.003);
    dBody=max(dBody,-min(min(dSeam1,dSeam2),dSeam3)+0.005);
    float aa=fwidth(dBody)*FWIDTH_MULT[sh];
    float hf=1.0-smoothstep(0.0,aa,dBody);
    float rim=(1.0-smoothstep(RIM_THRESH[sh],RIM_THRESH[sh]+aa,abs(dBody)))*hf;
    // 6. Double ripple rings (irregular speed)
    float rd=length(p);
    float ring1=exp(-pow(rd-mod(t*0.7,1.0),2.0)*90.0)*0.30;
    float ring2=exp(-pow(rd-mod(t*0.55+0.5,1.0),2.0)*90.0)*0.22;
    float rings=(ring1+ring2)*smoothstep(0.6,0.15,rd);
    // 7. Pod tip flicker (high-speed random noise per pod)
    float fl1=exp(-length(p-vec2(0.44,0.06))*16.0)*(0.3+0.7*abs(sin(t*11.0+1.0)));
    float fl2=exp(-length(p2-vec2(0.38,-0.04))*16.0)*(0.3+0.7*abs(sin(t*13.0+2.5)));
    float fl3=exp(-length(p3-vec2(0.40,0.02))*16.0)*(0.3+0.7*abs(sin(t*9.0+4.2)));
    float flicker=(fl1+fl2+fl3);
    // 8. Central engine pulse
    float ePulse=0.6+0.4*sin(t*7.0);
    float eGlow=exp(-length(p)*8.0)*ePulse*0.4;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rings+flicker*0.55+eGlow;
    vec3 col=vC.rgb;
    col=mix(col,vec3(1.0,0.3,0.4),rings*0.25);
    col=mix(col,vec3(1.0,0.5,0.6),flicker*0.20);
    a=1.2*tanh(a/1.2);
    fragColor=vec4(col*a, vC.a*clamp(a,0.0,1.0)); return; }
  else { a=smoothstep(1.0,0.6,d); }
  fragColor=vec4(vC.rgb*a, vC.a*clamp(a,0.0,1.0));
}
