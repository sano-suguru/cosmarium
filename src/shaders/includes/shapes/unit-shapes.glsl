  // [SHAPE:0 Drone] ————————————————————————————
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
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);

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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:1 Fighter] ————————————————————————————
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

    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);

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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:2 Bomber] ————————————————————————————
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

    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);

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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:3 Cruiser] ————————————————————————————
  else if(sh==3){ vec2 p=vU*0.62; float t=vA+uTime;
    // Cruiser: Nebulon-B style dumbbell — hammerhead command + spine + engine block
    // Y-axis mirror fold — symmetric hull geometry
    vec2 pm=vec2(p.x,abs(p.y));
    // 1. Forward command section (hammerhead)
    float dCmd=sdRoundedBox(p-vec2(0.30,0.0),vec2(0.18,0.22),0.03);
    // 2. Forward antenna prongs (folded to 1 via abs(p.y))
    float dProngs=sdCapsule(pm,vec2(0.42,0.18),vec2(0.54,0.10),0.020);
    // 3. Thin spine/keel connecting sections
    float dSpine=sdCapsule(p,vec2(0.14,0.0),vec2(-0.16,0.0),0.030);
    // 4. Rear engine block (compact, taller)
    float dEngine=sdRoundedBox(p-vec2(-0.30,0.0),vec2(0.14,0.20),0.04);
    // 5. Dorsal + ventral fins (folded to 1 via abs(p.y))
    float dFin=sdCapsule(pm,vec2(0.02,0.05),vec2(0.02,0.26),0.020);
    // 6. Rear stabilizer wings (folded to 1 via abs(p.y))
    float dStabs=sdCapsule(pm,vec2(-0.28,0.18),vec2(-0.58,0.34),0.020);
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
    // 9. Engine exhaust port cutouts (folded to 1 via abs(p.y))
    float dNoz=sdRoundedBox(pm-vec2(-0.44,0.08),vec2(0.02,0.03),0.008);
    dBody=max(dBody,-dNoz);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // 10. Turret glow
    float turretGlow=(1.0-smoothstep(0.0,aa*2.0,abs(dTurret)))*(0.4+0.6*sin(t*2.0))*0.45;
    // 11. Spine energy flow (rear→forward animation)
    float spineFlow=(1.0-smoothstep(0.0,aa*2.0,abs(dConduit)))
                    *(0.3+0.7*(0.5+0.5*sin(p.x*8.0-t*5.0)))*0.40;
    // 12. Bridge window lights (forward command section)
    float bridgeGlow=exp(-length(p-vec2(0.42,0.0))*16.0)*(0.5+0.5*sin(t*1.5));
    // 13. Antenna tip sensors (alternating blink — phase offset, cannot fold)
    float sensorL=exp(-length(p-vec2(0.56,0.10))*18.0)*(0.5+0.5*sin(t*4.0));
    float sensorR=exp(-length(p-vec2(0.56,-0.10))*18.0)*(0.5+0.5*sin(t*4.0+3.14));
    float sensors=(sensorL+sensorR)*0.45;
    // 14. Engine block reactor core glow
    float reactor=exp(-length(p-vec2(-0.30,0.0))*12.0)*(0.5+0.5*sin(t*3.5));
    // 15. Twin engines + trail (folded via abs(p.y))
    float eP=0.65+0.35*sin(t*5.0);
    float eng=exp(-length(pm-vec2(-0.46,0.08))*9.0)*eP;
    float trail=0.0;
    if(p.x<-0.46){float dy=abs(pm.y-0.08);
      trail=exp(-dy*10.0)*exp((p.x+0.46)*2.2)*eP*0.55;}
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+turretGlow+spineFlow+bridgeGlow*0.35+sensors+reactor*0.30+eng*0.50+trail;
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:4 Flagship] ————————————————————————————
  else if(sh==4){ vec2 p=vU*0.84; float t=vA+uTime;
    // Flagship: Sleek catamaran battleship — tapered twin hulls
    // Y-axis mirror fold — symmetric twin hull geometry
    vec2 pm=vec2(p.x,abs(p.y));
    // 1. Tapered twin hulls (folded to 1 via abs(p.y))
    float dHull=sdTrapezoid(pm.yx-vec2(0.28,-0.05),0.20,0.05,0.58);
    // 2. Bow turret bridge (connects twin hulls at front)
    float dBow=sdRoundedBox(p-vec2(0.46,0.0),vec2(0.12,0.22),0.05);
    // 3. Stern engineering section (wide rear connection)
    float dStern=sdRoundedBox(p-vec2(-0.68,0.0),vec2(0.10,0.38),0.06);
    // 4. Union hulls + bridge + stern
    float dBody=smin(dHull,dBow,0.06);
    dBody=smin(dBody,dStern,0.05);
    // 5. Center channel cutout (gap between twin hulls)
    dBody=max(dBody,-sdRoundedBox(p-vec2(-0.06,0.0),vec2(0.52,0.13),0.05));
    // 6. Stern engine bay cutout
    dBody=max(dBody,-sdRoundedBox(p-vec2(-0.68,0.0),vec2(0.14,0.14),0.04));
    // 7. Hull notches (folded to 1 via abs(p.y))
    dBody=max(dBody,-sdRoundedBox(pm-vec2(-0.10,0.28),vec2(0.22,0.05),0.02));
    // 8. Dorsal keel ridges (folded to 1 via abs(p.y))
    float dKeel=sdRoundedBox(pm-vec2(0.05,0.28),vec2(0.30,0.015),0.005);
    dBody=max(dBody,-dKeel+0.008);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    float xSeg=p.x*7.0+0.2;
    float rib=(1.0-smoothstep(0.42,0.50,abs(fract(xSeg)-0.5)+fwidth(xSeg)*0.6))
              *smoothstep(-0.60,-0.10,p.x)*hf*0.16;
    float lane=1.0-smoothstep(0.055,0.055+aa,abs(pm.y-0.28));
    float wx=p.x*14.0+t*0.8;
    float win=(1.0-smoothstep(0.34,0.48,abs(fract(wx)-0.5)+fwidth(wx)*0.8))
              *smoothstep(-0.55,0.45,p.x)*lane*hf;
    float dCh=sdRoundedBox(p-vec2(-0.06,0.0),vec2(0.52,0.13),0.05);
    float reactor=exp(-18.0*max(length(p-vec2(0.08,0.0))-0.10,0.0))
                  *(0.72+0.28*sin(t*2.4))*(1.0-smoothstep(0.0,aa,dCh))*hf;
    float engP=0.70+0.30*sin(t*7.0+p.y*4.0);
    float eR=0.07; float eF=24.0; float pF=150.0; float pD=10.0;
    // Quad engines (folded to 2 via abs(p.y))
    float e1=length(pm-vec2(-0.80,0.18))-eR; float e2=length(pm-vec2(-0.80,0.38))-eR;
    float engC=exp(-eF*max(min(e1,e2),0.0))*engP;
    float plm=exp(-pD*max(-p.x-0.78,0.0))*(
      exp(-pF*(pm.y-0.18)*(pm.y-0.18))+exp(-pF*(pm.y-0.38)*(pm.y-0.38)));
    float eng=(engC*0.85+plm*(0.55+0.45*engP)*0.45)*smoothstep(-0.85,-0.35,p.x);
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rib+win*0.22+reactor*0.55+eng*0.60;
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:5 Healer] ————————————————————————————
  else if(sh==5){ vec2 p=vU*0.55; float t=vA+uTime;
    // Medical Frigate: wide hull, nacelle wings, cross channel, healing rings
    // Y-axis mirror fold — symmetric nacelle/arm/engine geometry
    vec2 pm=vec2(p.x,abs(p.y));

    // 1. Wide oval hull (distinctly rounder/wider than combat ships)
    float dHull=sdRoundedBox(p,vec2(0.38,0.26),0.16);

    // 2. Nacelle booms + pods (folded to 1 via abs(p.y))
    float dBoom=sdCapsule(pm,vec2(-0.08,0.22),vec2(-0.08,0.52),0.06);
    float dPod=sdRoundedBox(pm-vec2(-0.08,0.52),vec2(0.13,0.07),0.04);
    float dNac=min(dBoom,dPod);

    // 3. Forward emitter dish (folded to 1 via abs(p.y))
    float dDish=sdCapsule(pm,vec2(0.22,0.18),vec2(0.48,0.04),0.05);

    // Union all structure
    float dBody=smin(dHull,dNac,0.08);
    dBody=smin(dBody,dDish,0.06);

    // 4. Cross channel cutout (actual negative space — medical cross)
    float dCH=sdRoundedBox(p,vec2(0.30,0.04),0.02);
    float dCV=sdRoundedBox(p,vec2(0.04,0.20),0.02);
    dBody=max(dBody,-min(dCH,dCV));

    // 5. Dish concavity cutout
    dBody=max(dBody,-(length(p-vec2(0.52,0.0))-0.12));

    // 6. Nacelle bay cutouts (folded to 1 via abs(p.y))
    float dBay=sdRoundedBox(pm-vec2(-0.08,0.52),vec2(0.06,0.03),0.01);
    dBody=max(dBody,-dBay);

    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);

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

    // 10. Nacelle tip glows (folded via abs(p.y))
    float nP=0.5+0.5*sin(t*3.0);
    float nacGlow=exp(-length(pm-vec2(-0.08,0.52))*14.0)*nP;

    // 11. Dish focus glow (phase offset from cross for alternating pulse)
    float dFocus=exp(-length(p-vec2(0.46,0.0))*10.0)*(0.5+0.5*sin(t*2.5+1.57));

    // 12. Twin engines + trails (folded via abs(p.y))
    float eP=0.65+0.35*sin(t*5.0);
    float eng=exp(-length(pm-vec2(-0.40,0.15))*9.0)*eP;
    float trail=0.0;
    if(p.x<-0.40){
      float dy=abs(pm.y-0.15);
      trail=exp(-dy*12.0)*exp((p.x+0.40)*2.2)*eP*0.35;
    }

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+crossGlow+reactor*0.50+rings+nacGlow*0.50+dFocus*0.40+eng*0.55+trail;
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:6 Reflector] ————————————————————————————
  else if(sh==6){ vec2 p=vU*0.54; float t=vA+uTime;
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

    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);

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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:7 Carrier] ————————————————————————————
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
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:8 Sniper] ————————————————————————————
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
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:9 Lancer] ————————————————————————————
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
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:10 Launcher] ————————————————————————————
  else if(sh==10){
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

    float aa, hf, rim; shapeAA(dShape, sh, aa, hf, rim);

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
    a=shapeSoftClamp(a, sh);
  }
  // [SHAPE:11 Disruptor] ————————————————————————————
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
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:12 Scorcher] ————————————————————————————
  else if(sh==12){ vec2 p=vU*0.68; float t=vA+uTime;
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
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:13 Teleporter] ————————————————————————————
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
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:14 Arcer] ————————————————————————————
  else if(sh==14){ vec2 p=vU*0.69; float t=vA+uTime;
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
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
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
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:15 Bastion] ————————————————————————————
  else if(sh==15){ vec2 p=vU*0.62; float t=vA+uTime;
    // Bastion: Type-10 Defender-style armored block — inverted trapezoid, angular fins, quad engines
    // Y-axis mirror fold — symmetric fin/skirt/engine geometry
    vec2 pm=vec2(p.x,abs(p.y));

    // 1. Main hull — inverted trapezoid (rear wide 0.26, front narrow 0.18)
    float dHull=sdTrapezoid(p.yx,0.26,0.18,0.38);

    // 2. Front armor plate (blunt angular wedge)
    float dProw=sdRoundedBox(p-vec2(0.36,0.0),vec2(0.10,0.20),0.02);

    // 3. Rear angle fins (folded to 1 via abs(p.y))
    float dFins=sdCapsule(pm,vec2(-0.36,0.26),vec2(-0.48,0.36),0.025);

    // 4. Rear engine block (wide, spans hull rear width)
    float dEngine=sdRoundedBox(p-vec2(-0.40,0.0),vec2(0.08,0.26),0.02);

    // 5. Side armor skirts (folded to 1 via abs(p.y))
    float dSkirts=sdRoundedBox(pm-vec2(-0.02,0.28),vec2(0.28,0.04),0.01);

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

    // Diagonal panel cuts at ±25° (X-cross — cannot fold: both rotations cross y=0)
    float cs25=0.906; float sn25=0.423;
    vec2 pr1=vec2(p.x*cs25-p.y*sn25,p.x*sn25+p.y*cs25);
    vec2 pr2=vec2(p.x*cs25+p.y*sn25,-p.x*sn25+p.y*cs25);
    dBody=max(dBody,-sdRoundedBox(pr1-vec2(0.04,0.0),vec2(0.26,0.010),0.004));
    dBody=max(dBody,-sdRoundedBox(pr2-vec2(0.04,0.0),vec2(0.26,0.010),0.004));

    // 7. Engine nozzle cutouts (folded to 2 via abs(p.y))
    float dN1=sdRoundedBox(pm-vec2(-0.49,0.14),vec2(0.02,0.035),0.008);
    float dN2=sdRoundedBox(pm-vec2(-0.49,0.05),vec2(0.02,0.035),0.008);
    dBody=max(dBody,-min(dN1,dN2));

    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);

    // 8. Tether nodes (4, embedded in skirts, phase-staggered — cannot fold)
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

    // 12. Quad engines + trails (folded to 2 via abs(p.y))
    float eP=0.65+0.35*sin(t*4.0);
    float dE1=length(pm-vec2(-0.50,0.14)); float dE2=length(pm-vec2(-0.50,0.05));
    float eng=exp(-min(dE1,dE2)*9.0)*eP;
    float trail=0.0;
    if(p.x<-0.50){float dy=min(abs(pm.y-0.14),abs(pm.y-0.05));
      trail=exp(-dy*16.0)*exp((p.x+0.50)*3.0)*eP*0.25;}

    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+nodes+plateGlowH+plateGlowV+core*0.35+prowGlow+eng*0.35+trail;
    a=shapeSoftClamp(a, sh); }
  // [SHAPE:16 Amplifier] ————————————————————————————
  else if(sh==16){ vec2 p=vU*0.58; float t=vA+uTime;
    // Y-axis mirror fold — symmetric wing/conduit/engine geometry
    vec2 pm=vec2(p.x,abs(p.y));
    // 1. Wedge hull (trapezoid: wide stern → sharp bow)
    float dHull=sdTrapezoid(p.yx-vec2(0.0,0.04),0.24,0.03,0.46);
    // 2. Large forward-swept main wings (folded to 1 via abs(p.y))
    float dWingM=sdCapsule(pm,vec2(-0.08,0.12),vec2(0.28,0.42),0.045);
    // 3. Secondary forward-swept wings (folded to 1 via abs(p.y))
    float dWingS=sdCapsule(pm,vec2(-0.14,0.10),vec2(0.16,0.30),0.030);
    float dWings=min(dWingM,dWingS);
    // 4. Aggressive wing tips (folded to 1 via abs(p.y))
    float dTip=sdTriangle(pm,vec2(0.24,0.40),vec2(0.36,0.50),vec2(0.22,0.46));
    dWings=min(dWings,dTip);
    // 5. Bow spike (amplifier focal point)
    float dSpike=sdCapsule(p,vec2(0.38,0.0),vec2(0.56,0.0),0.018);
    float dBody=smin(dHull,dWings,0.05);
    dBody=smin(dBody,dSpike,0.03);
    // 6. Panel grooves — horizontal centre line
    float dGH=sdRoundedBox(p,vec2(0.36,0.012),0.003);
    dBody=max(dBody,-dGH+0.008);
    // 7. Wing conduit grooves (folded to 1 via abs(p.y))
    float dCond=sdCapsule(pm,vec2(-0.10,0.13),vec2(0.24,0.38),0.008);
    dBody=max(dBody,-dCond+0.006);
    // 8. Diagonal armor cuts at ±20° (X-cross — cannot fold: both rotations cross y=0)
    float cs20=0.940; float sn20=0.342;
    vec2 pr1=vec2(p.x*cs20-p.y*sn20,p.x*sn20+p.y*cs20);
    vec2 pr2=vec2(p.x*cs20+p.y*sn20,-p.x*sn20+p.y*cs20);
    dBody=max(dBody,-sdRoundedBox(pr1-vec2(0.02,0.0),vec2(0.28,0.008),0.003));
    dBody=max(dBody,-sdRoundedBox(pr2-vec2(0.02,0.0),vec2(0.28,0.008),0.003));
    // 9. Engine nozzle cutouts (folded to 1 via abs(p.y))
    float dN=sdRoundedBox(pm-vec2(-0.48,0.10),vec2(0.02,0.032),0.008);
    dBody=max(dBody,-dN);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // 10. EM concentric rings (3-ring pulse from hull centre)
    float rd=length(p-vec2(0.04,0.0));
    float ring1=exp(-pow(rd-mod(t*0.8,1.2),2.0)*80.0)*0.35;
    float ring2=exp(-pow(rd-mod(t*0.8+0.4,1.2),2.0)*80.0)*0.28;
    float ring3=exp(-pow(rd-mod(t*0.8+0.8,1.2),2.0)*80.0)*0.20;
    float rings=(ring1+ring2+ring3)*smoothstep(0.7,0.2,rd);
    // 11. Bow focal point glow
    float focalD=length(p-vec2(0.56,0.0));
    float focalGlow=exp(-focalD*14.0)*(0.5+0.4*sin(t*6.0));
    // 12. Wing conduit energy flow (folded via abs(p.y))
    float condMask=1.0-smoothstep(0.0,aa*3.0,abs(dCond));
    float condFlow=condMask*(0.3+0.7*(0.5+0.5*sin(p.x*12.0-t*6.0)))*0.35;
    // 13. Twin engines + exhaust trail (engines additive — keep unfolded; trail folded)
    float eP=0.65+0.35*sin(t*8.0);
    float eL=exp(-length(p-vec2(-0.50,0.10))*10.0);
    float eR=exp(-length(p-vec2(-0.50,-0.10))*10.0);
    float eng=(eL+eR)*eP;
    float dy=abs(pm.y-0.10);
    float trail=step(p.x,-0.50)*exp(-dy*16.0)*exp((p.x+0.50)*3.0)*eP*0.30;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rings+focalGlow*0.50+condFlow+eng*0.45+trail;
    col=mix(col,vec3(0.7,0.95,1.0),condMask*0.30);
    col=mix(col,vec3(1.0,0.95,0.85),exp(-focalD*10.0)*0.45);
    col=mix(col,vec3(1.0,0.75,0.4),rings*0.30);
    a=shapeSoftClamp(a, sh);
    }
  // [SHAPE:17 Scrambler] ————————————————————————————
  else if(sh==17){ vec2 p=vU*0.60; float t=vA+uTime;
    // 1. Central hub (disk)
    float dHub=length(p)-0.12;
    // 2. Three asymmetric booms at 120° intervals (different lengths)
    float dB1=sdCapsule(p,vec2(0.0),vec2(0.42,0.0),0.035);
    const float A120=2.0943951; float c120=cos(A120); float s120=sin(A120);
    vec2 b2=vec2(c120*0.38, s120*0.38);
    vec2 b3=vec2(c120*0.34,-s120*0.34);
    float dB2=sdCapsule(p,vec2(0.0),b2,0.032);
    float dB3=sdCapsule(p,vec2(0.0),b3,0.032);
    float dBooms=min(min(dB1,dB2),dB3);
    // 3. Tip pods (sensor/jammer pods at boom ends)
    float dP1=length(p-vec2(0.42,0.0))-0.055;
    float dP2=length(p-b2)-0.050;
    float dP3=length(p-b3)-0.050;
    float dPods=min(min(dP1,dP2),dP3);
    // 4. Union
    float dBody=smin(dHub,dBooms,0.04);
    dBody=smin(dBody,dPods,0.03);
    // 5. Panel grooves along booms
    float dGr1=sdCapsule(p,vec2(0.08,0.0),vec2(0.36,0.0),0.006);
    float dGr2=sdCapsule(p,vec2(c120*0.08,s120*0.08),b2*0.9,0.006);
    float dGr3=sdCapsule(p,vec2(c120*0.08,-s120*0.08),b3*0.9,0.006);
    dBody=max(dBody,-min(min(dGr1,dGr2),dGr3)+0.005);
    // 5b. EM conduit flow along booms
    float cF1=exp(-abs(dGr1)*25.0)*(0.3+0.7*(0.5+0.5*sin(p.x*15.0-t*5.0)));
    float cF2=exp(-abs(dGr2)*25.0)*(0.3+0.7*(0.5+0.5*sin(dot(p,normalize(b2))*15.0-t*5.0)));
    float cF3=exp(-abs(dGr3)*25.0)*(0.3+0.7*(0.5+0.5*sin(dot(p,normalize(b3))*15.0-t*5.0)));
    float condFlow=(cF1+cF2+cF3)*0.30;
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // 6. Jamming pulse rings (triple irregular-speed ripple with fade-out)
    float rd=length(p);
    float rp1=mod(t*0.6,1.0); float rp2=mod(t*0.45+0.5,1.0); float rp3=mod(t*0.35+0.25,1.0);
    float ring1=exp(-pow(rd-rp1,2.0)*70.0)*0.30*smoothstep(0.0,0.15,rp1)*smoothstep(1.0,0.5,rp1);
    float ring2=exp(-pow(rd-rp2,2.0)*70.0)*0.25*smoothstep(0.0,0.15,rp2)*smoothstep(1.0,0.5,rp2);
    float ring3=exp(-pow(rd-rp3,2.0)*55.0)*0.18*smoothstep(0.0,0.15,rp3)*smoothstep(1.0,0.5,rp3);
    float rings=(ring1+ring2+ring3)*smoothstep(0.65,0.12,rd);
    // 7. Pod tip rapid flicker (phase-shifted sin)
    float fl1=exp(-length(p-vec2(0.42,0.0))*12.0)*(0.4+0.5*sin(t*9.0));
    float fl2=exp(-length(p-b2)*12.0)*(0.4+0.5*sin(t*9.0+2.1));
    float fl3=exp(-length(p-b3)*12.0)*(0.4+0.5*sin(t*9.0+4.2));
    float flicker=fl1+fl2+fl3;
    // 8. Noise static (fract-sin pseudo random)
    float nv=fract(sin(dot(p*40.0+vec2(t*3.0),vec2(12.9898,78.233)))*43758.5453);
    float noise=nv*0.10*(hf*smoothstep(0.3,0.0,rd)+rings*0.5);
    // 9. Central hub glow
    float hubGlow=exp(-length(p)*8.0)*(0.3+0.3*sin(t*5.0));
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rings+flicker*0.40+noise+hubGlow+condFlow;
    col=mix(col,vec3(0.9,0.3,0.7),rings*0.35);
    col=mix(col,vec3(1.0,0.5,0.8),flicker*0.30);
    col=mix(col,vec3(0.8,0.2,0.6),noise*0.5);
    col=mix(col,vec3(0.6,0.15,0.9),condFlow*0.40);
    a=shapeSoftClamp(a, sh);
    }
  // [SHAPE:18 Catalyst] ————————————————————————————
  else if(sh==18){ vec2 p=vU*0.58; float t=vA+uTime;
    // X-axis mirror fold — symmetric wing/conduit geometry
    vec2 pm=vec2(abs(p.x),p.y);
    // 1. Wedge fuselage (narrow nose → wide rear)
    float dFuse=sdTrapezoid(p,0.03,0.10,0.22);
    // 2. Nose emitter spike
    float dNose=sdCapsule(p,vec2(0.0,0.22),vec2(0.0,0.30),0.012);
    // 3. Cockpit bulge
    float dCock=sdRoundedBox(p-vec2(0.0,0.12),vec2(0.028,0.04),0.015);
    // 4. Swept delta wings (folded to 1 via abs(p.x))
    float dWings=sdCapsule(pm,vec2(0.03,0.06),vec2(0.32,-0.12),0.022);
    // 5. Secondary inner wings (folded to 1 via abs(p.x))
    float dIW=sdCapsule(pm,vec2(0.02,0.02),vec2(0.18,-0.06),0.014);
    // 6. Wingtip energy node pods (folded to 1 via abs(p.x))
    float dNodePod=sdTriangle(pm-vec2(0.33,-0.13),vec2(0.0,0.025),vec2(-0.02,-0.02),vec2(0.02,-0.02));
    // 7. Dorsal spine ridge
    float dSpine=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.012,0.14),0.006);
    // 8. Union
    float dBody=smin(dFuse,dNose,0.03);
    dBody=smin(dBody,dCock,0.02);
    dBody=smin(dBody,dWings,0.025);
    dBody=smin(dBody,dIW,0.02);
    dBody=smin(dBody,dNodePod,0.015);
    dBody=smin(dBody,dSpine,0.02);
    // 9. Panel grooves (folded via abs(p.x))
    float seam=exp(-pm.x*50.0)*smoothstep(0.18,-0.10,p.y)*0.12;
    float wGroove=exp(-abs(dot(pm-vec2(0.04,0.04),normalize(vec2(0.30,-0.18))))*40.0)*0.08;
    float diag=exp(-abs(dot(pm-vec2(0.08,0.0),normalize(vec2(1.0,-0.6))))*35.0)*0.06;
    float grooves=seam+wGroove+diag;
    float aa, hf; shapeBase(dBody, sh, aa, hf);
    hf -= grooves * hf;
    float rim = shapeRim(dBody, hf, aa, sh);
    // Effects: pulse rings (inherited, radial expand)
    float rd=length(p);
    float rp1=mod(t*0.5,1.0); float rp2=mod(t*0.5+0.5,1.0);
    float ring1=exp(-pow(rd-rp1,2.0)*60.0)*0.28*smoothstep(0.0,0.12,rp1)*smoothstep(1.0,0.5,rp1);
    float ring2=exp(-pow(rd-rp2,2.0)*60.0)*0.22*smoothstep(0.0,0.12,rp2)*smoothstep(1.0,0.5,rp2);
    float rings=(ring1+ring2)*smoothstep(0.6,0.12,rd);
    // Nose emitter glow (green beacon)
    float noseGlow=exp(-length(p-vec2(0.0,0.30))*12.0)*(0.40+0.35*sin(t*7.0));
    // Wing conduit energy flow (folded via abs(p.x))
    float cDist=exp(-abs(dot(pm-vec2(0.04,0.04),normalize(vec2(0.30,-0.18))))*25.0);
    float cFlow=cDist*0.20*(0.5+0.5*sin(dot(pm,normalize(vec2(0.30,-0.18)))*25.0-t*6.0));
    // Wingtip node pulse (phase offset — cannot fold)
    float nodeL=exp(-length(p-vec2(-0.33,-0.13))*16.0)*(0.30+0.25*sin(t*5.0+1.5));
    float nodeR=exp(-length(p-vec2(0.33,-0.13))*16.0)*(0.30+0.25*sin(t*5.0));
    float nodePulse=nodeL+nodeR;
    // Twin engines + exhaust trail (additive sum — keep unfolded)
    float engL=exp(-length(p-vec2(-0.06,-0.24))*10.0)*0.30;
    float engR=exp(-length(p-vec2(0.06,-0.24))*10.0)*0.30;
    float exhaust=(engL+engR)*(0.7+0.3*sin(t*12.0));
    float exTrail=exp(-abs(p.x-(-0.06))*20.0)*smoothstep(-0.24,-0.50,p.y)*0.15;
    exTrail+=exp(-abs(p.x-0.06)*20.0)*smoothstep(-0.24,-0.50,p.y)*0.15;
    exTrail*=(0.6+0.4*sin(p.y*30.0+t*8.0));
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rings+noseGlow*0.50+cFlow+nodePulse*0.45+exhaust+exTrail;
    col=mix(col,vec3(0.3,1.0,0.5),rings*0.40);
    col=mix(col,vec3(0.4,1.0,0.6),noseGlow*0.35);
    col=mix(col,vec3(0.2,0.9,0.4),(cFlow+nodePulse)*0.45);
    col=mix(col,vec3(0.3,1.0,0.5),(exhaust+exTrail)*0.30);
    a=shapeSoftClamp(a, sh);
    }
  // [SHAPE:19 Hive] ————————————————————————————
  else if(sh==19){ vec2 p=vU*0.88; float t=vA+uTime;
    vec2 pm=vec2(p.x,abs(p.y));
    float dHull=sdTrapezoid(pm.yx-vec2(0.0,-0.08),0.32,0.12,0.62);
    float dBow=sdRoundedBox(p-vec2(0.52,0.0),vec2(0.16,0.28),0.10);
    float dStern=sdRoundedBox(p-vec2(-0.72,0.0),vec2(0.14,0.42),0.08);
    float dBody=smin(dHull,dBow,0.08);
    dBody=smin(dBody,dStern,0.06);
    float dDeck=sdRoundedBox(pm-vec2(0.10,0.22),vec2(0.35,0.04),0.02);
    dBody=smin(dBody,dDeck,0.04);
    float dHangarCut=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.30,0.10),0.04);
    dBody=max(dBody,-dHangarCut);
    float dEngineCut=sdRoundedBox(p-vec2(-0.72,0.0),vec2(0.16,0.18),0.05);
    dBody=max(dBody,-dEngineCut);
    float dGroove=sdRoundedBox(pm-vec2(-0.15,0.24),vec2(0.25,0.03),0.01);
    dBody=max(dBody,-dGroove);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    float xSeg=p.x*5.0+0.3;
    float rib=(1.0-smoothstep(0.40,0.50,abs(fract(xSeg)-0.5)+fwidth(xSeg)*0.6))
              *smoothstep(-0.65,-0.10,p.x)*hf*0.12;
    float lane=1.0-smoothstep(0.060,0.060+aa,abs(pm.y-0.22));
    float wx=p.x*10.0+t*0.5;
    float win=(1.0-smoothstep(0.32,0.48,abs(fract(wx)-0.5)+fwidth(wx)*0.8))
              *smoothstep(-0.60,0.40,p.x)*lane*hf;
    float dHangar=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.30,0.10),0.04);
    float rct=exp(-14.0*max(length(p-vec2(0.05,0.0))-0.14,0.0))
                  *(0.65+0.35*sin(t*1.8))*(1.0-smoothstep(0.0,aa,dHangar))*hf;
    float engP=0.60+0.40*sin(t*5.0+p.y*3.0);
    float eR=0.06; float eF=22.0; float pF=120.0; float pD=8.0;
    float e1=length(pm-vec2(-0.86,0.12))-eR;
    float e2=length(pm-vec2(-0.86,0.28))-eR;
    float e3=length(pm-vec2(-0.86,0.42))-eR;
    float engC=exp(-eF*max(min(min(e1,e2),e3),0.0))*engP;
    float plm=exp(-pD*max(-p.x-0.84,0.0))*(
      exp(-pF*(pm.y-0.12)*(pm.y-0.12))
      +exp(-pF*(pm.y-0.28)*(pm.y-0.28))
      +exp(-pF*(pm.y-0.42)*(pm.y-0.42)));
    float eng=(engC*0.80+plm*(0.50+0.50*engP)*0.40)*smoothstep(-0.90,-0.40,p.x);
    float shimmer=exp(-abs(dBody)*8.0)*0.08*(0.5+0.5*sin(t*2.0+p.x*6.0));
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rib+win*0.20+rct*0.50+eng*0.55+shimmer;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:20 Dreadnought] ————————————————————————————
  else if(sh==20){ vec2 p=vU*0.85; float t=vA+uTime;
    // Dreadnought: heavy armored mothership with forward cannon turret
    vec2 pm=vec2(p.x,abs(p.y));
    // Main hull — broad, angular wedge
    float dHull=sdTrapezoid(pm.yx-vec2(0.0,-0.05),0.38,0.18,0.58);
    float dBow=sdRoundedBox(p-vec2(0.48,0.0),vec2(0.20,0.22),0.06);
    float dStern=sdRoundedBox(p-vec2(-0.68,0.0),vec2(0.16,0.48),0.10);
    float dBody=smin(dHull,dBow,0.06);
    dBody=smin(dBody,dStern,0.05);
    // Armor plates
    float dPlate=sdRoundedBox(pm-vec2(0.0,0.30),vec2(0.40,0.06),0.03);
    dBody=smin(dBody,dPlate,0.04);
    // Cannon turret (forward)
    float dTurret=sdRoundedBox(p-vec2(0.55,0.0),vec2(0.12,0.08),0.02);
    float dBarrel=sdRoundedBox(p-vec2(0.72,0.0),vec2(0.14,0.025),0.01);
    dBody=smin(dBody,dTurret,0.03);
    dBody=smin(dBody,dBarrel,0.02);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // Armor grooves
    float xSeg=p.x*6.0;
    float rib=(1.0-smoothstep(0.38,0.48,abs(fract(xSeg)-0.5)+fwidth(xSeg)*0.6))
              *smoothstep(-0.60,-0.05,p.x)*hf*0.15;
    // Engine glow (4 large engines)
    float engP=0.55+0.45*sin(t*4.0+p.y*2.0);
    float eR=0.07;
    float e1=length(pm-vec2(-0.84,0.14))-eR;
    float e2=length(pm-vec2(-0.84,0.32))-eR;
    float engC=exp(-20.0*max(min(e1,e2),0.0))*engP;
    float plm=exp(-7.0*max(-p.x-0.80,0.0))*(
      exp(-100.0*(pm.y-0.14)*(pm.y-0.14))
      +exp(-100.0*(pm.y-0.32)*(pm.y-0.32)));
    float eng=(engC*0.85+plm*(0.50+0.50*engP)*0.45)*smoothstep(-0.88,-0.35,p.x);
    // Turret glow
    float turretGlow=exp(-length(p-vec2(0.72,0.0))*18.0)*(0.5+0.5*sin(t*3.0));
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+rib+eng*0.55+turretGlow*0.4;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:21 Reactor] ————————————————————————————
  else if(sh==21){ vec2 p=vU*0.90; float t=vA+uTime;
    // Reactor: energy-focused mothership with central reactor core
    vec2 pm=vec2(p.x,abs(p.y));
    // Sleek hull
    float dHull=sdTrapezoid(pm.yx-vec2(0.0,-0.06),0.28,0.10,0.55);
    float dBow=sdRoundedBox(p-vec2(0.46,0.0),vec2(0.14,0.22),0.08);
    float dStern=sdRoundedBox(p-vec2(-0.65,0.0),vec2(0.12,0.36),0.06);
    float dBody=smin(dHull,dBow,0.07);
    dBody=smin(dBody,dStern,0.05);
    // Energy conduits (side rails)
    float dRail=sdRoundedBox(pm-vec2(-0.05,0.26),vec2(0.38,0.03),0.015);
    dBody=smin(dBody,dRail,0.03);
    // Central reactor chamber
    float dChamber=length(p-vec2(0.05,0.0))-0.16;
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // Reactor core glow (pulsing energy)
    float coreGlow=exp(-12.0*max(dChamber,0.0))*(0.70+0.30*sin(t*2.5));
    // Energy conduit shimmer
    float conduit=exp(-abs(pm.y-0.26)*30.0)*smoothstep(-0.40,0.30,p.x)*hf
                  *(0.5+0.5*sin(t*4.0+p.x*8.0));
    // Engines (compact, efficient)
    float engP=0.65+0.35*sin(t*6.0+p.y*4.0);
    float e1=length(pm-vec2(-0.77,0.10))-0.05;
    float e2=length(pm-vec2(-0.77,0.24))-0.05;
    float engC=exp(-22.0*max(min(e1,e2),0.0))*engP;
    float plm=exp(-8.0*max(-p.x-0.74,0.0))*(
      exp(-130.0*(pm.y-0.10)*(pm.y-0.10))
      +exp(-130.0*(pm.y-0.24)*(pm.y-0.24)));
    float eng=(engC*0.75+plm*(0.50+0.50*engP)*0.35)*smoothstep(-0.82,-0.30,p.x);
    // Body shimmer
    float shimmer=exp(-abs(dBody)*8.0)*0.06*(0.5+0.5*sin(t*3.0+p.x*5.0));
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+coreGlow*0.65+conduit*0.3+eng*0.50+shimmer;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:22 Asteroid] ————————————————————————————
  else if(sh==22){ vec2 p=vU*0.58; float t=vA+uTime;
    // Irregular rocky asteroid — circle + noise deformation
    float r=length(p);
    float ang=atan(p.y,p.x);
    // Noise deformation for irregular silhouette
    float noise=0.08*sin(ang*3.0+1.2)+0.06*sin(ang*5.0-0.8)+0.04*sin(ang*7.0+2.5);
    float dRock=r-(0.55+noise);
    // Crater indentations
    float c1=length(p-vec2(0.15,0.2))-0.12;
    float c2=length(p-vec2(-0.2,-0.1))-0.10;
    float c3=length(p-vec2(0.05,-0.25))-0.08;
    dRock=max(dRock,-0.02+min(min(c1,c2),c3)*0.3);
    float aa, hf, rim; shapeAA(dRock, sh, aa, hf, rim);
    // Subtle surface detail
    float detail=0.15*sin(ang*11.0+t*0.3)*exp(-r*2.0);
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+detail*0.3;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:23 AsteroidCore] ————————————————————————————
  else if(sh==23){ vec2 p=vU*0.55; float t=vA+uTime;
    // Larger rock with inner glow
    float r=length(p);
    float ang=atan(p.y,p.x);
    float noise=0.10*sin(ang*3.0+0.7)+0.07*sin(ang*5.0-1.3)+0.05*sin(ang*7.0+1.8)+0.03*sin(ang*11.0);
    float dRock=r-(0.58+noise);
    // Larger craters
    float c1=length(p-vec2(0.20,0.22))-0.14;
    float c2=length(p-vec2(-0.25,-0.15))-0.12;
    float c3=length(p-vec2(0.08,-0.30))-0.10;
    float c4=length(p-vec2(-0.10,0.30))-0.09;
    dRock=max(dRock,-0.02+min(min(c1,c2),min(c3,c4))*0.25);
    float aa, hf, rim; shapeAA(dRock, sh, aa, hf, rim);
    // Inner core glow — pulsing energy
    float coreGlow=exp(-r*4.0)*(0.6+0.4*sin(t*2.5));
    // Surface cracks revealing inner light
    float crack1=abs(sin(ang*4.0+p.x*3.0))*exp(-r*1.5);
    float crackGlow=smoothstep(0.7,1.0,crack1)*exp(-max(dRock,0.0)*15.0)*0.4;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+coreGlow*0.7+crackGlow;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:24 Colossus] ————————————————————————————
  else if(sh==24){ vec2 p=vU*0.82; float t=vA+uTime;
    // Colossus: massive hexagonal heavy-armor mothership
    vec2 pm=vec2(p.x,abs(p.y));
    // Hexagonal hull
    float dHex=sdHexagon(p*0.9,0.55);
    // Thick armor bands
    float dArmor1=sdRoundedBox(pm-vec2(0.0,0.36),vec2(0.45,0.05),0.02);
    float dArmor2=sdRoundedBox(pm-vec2(0.0,0.18),vec2(0.50,0.04),0.02);
    float dBody=smin(dHex,dArmor1,0.04);
    dBody=smin(dBody,dArmor2,0.04);
    // Internal armor line cuts
    float dCut1=sdRoundedBox(p-vec2(0.0,0.0),vec2(0.30,0.08),0.03);
    dBody=max(dBody,-dCut1+0.01);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // Heavy engine banks
    float engP=0.50+0.50*sin(t*3.0+p.y*2.0);
    float e1=length(pm-vec2(-0.58,0.15))-0.08;
    float e2=length(pm-vec2(-0.58,0.30))-0.06;
    float engC=exp(-16.0*max(min(e1,e2),0.0))*engP;
    // Armor plate shimmer
    float shimmer=exp(-abs(dBody)*6.0)*0.10*(0.5+0.5*sin(t*1.5+p.x*4.0));
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+engC*0.50+shimmer;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:25 CarrierBay] ————————————————————————————
  else if(sh==25){ vec2 p=vU*0.86; float t=vA+uTime;
    // Carrier Bay: wide hangar-shaped mothership with open bays
    vec2 pm=vec2(p.x,abs(p.y));
    // Wide rectangular hull
    float dHull=sdRoundedBox(p,vec2(0.60,0.35),0.06);
    // Forward taper
    float dBow=sdRoundedBox(p-vec2(0.52,0.0),vec2(0.18,0.28),0.08);
    float dBody=smin(dHull,dBow,0.06);
    // Hangar bay openings (2 side bays)
    float dBay=sdRoundedBox(pm-vec2(0.10,0.20),vec2(0.28,0.08),0.03);
    dBody=max(dBody,-dBay);
    // Central spine
    float dSpine=sdRoundedBox(p-vec2(-0.10,0.0),vec2(0.50,0.04),0.02);
    dBody=smin(dBody,dSpine,0.03);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // Bay interior glow
    float bayGlow=exp(-18.0*max(dBay,0.0))*(0.4+0.3*sin(t*2.0))*hf;
    // Side engine arrays
    float engP=0.55+0.45*sin(t*4.5+p.y*3.0);
    float e1=length(pm-vec2(-0.68,0.12))-0.05;
    float e2=length(pm-vec2(-0.68,0.24))-0.05;
    float engC=exp(-20.0*max(min(e1,e2),0.0))*engP;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+bayGlow*0.45+engC*0.50;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:26 Accelerator] ————————————————————————————
  else if(sh==26){ vec2 p=vU*0.84; float t=vA+uTime;
    // Accelerator: pointed arrow/booster-shaped mothership
    vec2 pm=vec2(p.x,abs(p.y));
    // Arrow-shaped hull
    float dHull=sdTrapezoid(pm.yx-vec2(0.0,-0.10),0.15,0.08,0.55);
    // Sharp nose
    float dNose=sdCapsule(p,vec2(0.45,0.0),vec2(0.70,0.0),0.04);
    float dBody=smin(dHull,dNose,0.05);
    // Booster nacelles (wide rear)
    float dBoost=sdRoundedBox(pm-vec2(-0.45,0.22),vec2(0.18,0.10),0.04);
    dBody=smin(dBody,dBoost,0.04);
    // Internal detail
    float dSeam=sdCapsule(p,vec2(0.30,0.0),vec2(-0.30,0.0),0.003);
    dBody=max(dBody,-dSeam+0.005);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // Booster afterburner glow
    float engP=0.60+0.40*sin(t*7.0);
    float e1=length(pm-vec2(-0.65,0.22))-0.07;
    float eMain=length(p-vec2(-0.62,0.0))-0.08;
    float engC=exp(-18.0*max(min(e1,eMain),0.0))*engP;
    // Speed lines shimmer
    float speedLine=exp(-pm.y*8.0)*smoothstep(-0.50,0.40,p.x)*hf
                    *(0.4+0.6*sin(t*5.0+p.x*10.0))*0.15;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+engC*0.60+speedLine;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:27 Syndicate] ————————————————————————————
  else if(sh==27){ vec2 p=vU*0.88; float t=vA+uTime;
    // Syndicate: circular mothership with currency-symbol-like pattern
    float r=length(p);
    float ang=atan(p.y,p.x);
    // Circular hull
    float dCircle=r-0.48;
    // Inner ring detail
    float dInner=abs(r-0.32)-0.02;
    float dBody=min(dCircle,dInner);
    // Vertical bar (currency symbol)
    float dBar=sdRoundedBox(p,vec2(0.03,0.52),0.015);
    dBody=min(dBody,dBar);
    // Horizontal slashes
    float dSlash1=sdRoundedBox(p-vec2(0.0,0.12),vec2(0.22,0.02),0.01);
    float dSlash2=sdRoundedBox(p-vec2(0.0,-0.12),vec2(0.22,0.02),0.01);
    dBody=min(dBody,min(dSlash1,dSlash2));
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // Rotating ring glow
    float ringGlow=exp(-abs(r-0.32)*20.0)*(0.4+0.3*sin(t*2.0+ang*4.0));
    // Center pulse
    float centerPulse=exp(-r*10.0)*(0.5+0.5*sin(t*3.0))*0.4;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+ringGlow*0.35+centerPulse;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:28 Bloodborne] ————————————————————————————
  else if(sh==28){ vec2 p=vU*0.85; float t=vA+uTime;
    // Bloodborne: distorted organic-looking mothership
    float r=length(p);
    float ang=atan(p.y,p.x);
    vec2 pm=vec2(p.x,abs(p.y));
    // Organic warped hull
    float warp=0.06*sin(ang*3.0+t*0.8)+0.04*sin(ang*5.0-t*0.5)+0.03*sin(ang*7.0+t*1.2);
    float dHull=r-(0.50+warp);
    // Spine ridges
    float dSpine=sdCapsule(p,vec2(-0.40,0.0),vec2(0.45,0.0),0.06);
    float dBody=smin(dHull,dSpine,0.06);
    // Organic tendrils
    float dTendril=sdCapsule(pm,vec2(0.20,0.10),vec2(-0.10,0.45),0.025);
    dBody=smin(dBody,dTendril,0.04);
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // Pulsing veins
    float vein=abs(sin(ang*6.0+t*2.0))*exp(-abs(r-0.35)*10.0)*hf*0.25;
    // Dark core energy
    float coreGlow=exp(-r*6.0)*(0.6+0.4*sin(t*3.5))*0.5;
    // Engine-like organic exhaust
    float exhaust=exp(-length(p-vec2(-0.52,0.0))*10.0)*(0.5+0.5*sin(t*4.0));
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+vein+coreGlow+exhaust*0.40;
    a=shapeSoftClamp(a, sh); }

  // [SHAPE:29 Ascension] ————————————————————————————
  else if(sh==29){ vec2 p=vU*0.85; float t=vA+uTime;
    // Ascension: crystalline evolving mothership
    float r=length(p);
    float ang=atan(p.y,p.x);
    // Diamond hull with slight rotation
    vec2 rp=vec2(p.x*0.707-p.y*0.707, p.x*0.707+p.y*0.707);
    float dDiamond=max(abs(rp.x),abs(rp.y))-0.42;
    // Circular inner ring
    float dRing=abs(r-0.28)-0.02;
    float dBody=min(dDiamond,dRing);
    // Radiating facets (6-fold symmetry)
    float facetAng=mod(ang+PI/6.0, PI/3.0)-PI/6.0;
    float dFacet=abs(r*sin(facetAng))-0.015;
    float facetMask=step(0.18,r)*step(r,0.40);
    dBody=min(dBody,dFacet+0.02*(1.0-facetMask));
    float aa, hf, rim; shapeAA(dBody, sh, aa, hf, rim);
    // Pulsing core (awakening energy)
    float pulse=0.5+0.5*sin(t*2.5);
    float coreGlow=exp(-r*8.0)*pulse*0.6;
    // Facet shimmer
    float shimmer=exp(-abs(r-0.35)*12.0)*(0.3+0.2*sin(ang*6.0+t*3.0));
    // Outer aura
    float aura=exp(-max(0.0,r-0.42)*6.0)*pulse*0.25;
    a=hf*HF_WEIGHT[sh]+rim*RIM_WEIGHT[sh]+coreGlow+shimmer*0.4+aura;
    a=shapeSoftClamp(a, sh); }
