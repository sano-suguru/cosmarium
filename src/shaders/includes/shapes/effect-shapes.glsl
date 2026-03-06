  // [SHAPE:19 Circle] ————————————————————————————
  else if(sh==19){ // Circle (particles, AOE projectiles)
    a=smoothstep(1.0,0.6,d)+exp(-d*2.0)*0.4; }
  // [SHAPE:20 Diamond] ————————————————————————————
  else if(sh==20){ // Diamond (projectiles)
    float dd=abs(vU.x)+abs(vU.y);
    a=smoothstep(1.0,0.6,dd)+exp(-dd*2.0)*0.4; }
  // [SHAPE:21 Homing] ————————————————————————————
  else if(sh==21){ // Homing missile (elongated diamond / arrowhead)
    float dd=abs(vU.x)*0.6+abs(vU.y);
    a=smoothstep(1.0,0.5,dd)+exp(-dd*2.5)*0.4; }
  // [SHAPE:22 Beam] ————————————————————————————
  else if(sh==22){ float by=abs(vU.y),bx=abs(vU.x);
    float xf=smoothstep(1.0,0.4,bx);
    a=(exp(-by*6.0)*1.0+exp(-by*2.5)*0.4)*xf+exp(-d*1.5)*0.2; }
  // [SHAPE:23 Lightning] ————————————————————————————
  else if(sh==23){ float by=abs(vU.y);
    float core=exp(-by*8.0)*1.3;
    float glow=exp(-by*2.5)*0.4;
    a=core+glow; }
  // [SHAPE:24 ExplosionRing] ————————————————————————————
  else if(sh==24){ float ring=abs(d-0.75);
    a=exp(-ring*8.0)*0.6+exp(-d*1.0)*0.08; }
  // [SHAPE:25 DiamondRing] ————————————————————————————
  else if(sh==25){ float dd=manDist(vU); float ring=abs(dd-0.65);
    a=exp(-ring*10.0)*0.7+exp(-dd*1.2)*0.1; }
  // [SHAPE:26 OctShield] ————————————————————————————
  else if(sh==26){ float od=octDist(vU);
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
  // [SHAPE:27 ReflectField] ————————————————————————————
  else if(sh==27){ float hd=hexDist(vU);
    float edge=abs(hd-0.70);
    // Bright core ring + soft neon glow halo
    a=smoothstep(0.06,0.005,edge)*0.85+exp(-edge*12.0)*0.45;
    float t=vA*3.5+uTime;
    // Prismatic angular rainbow on ring — cosine palette
    float ang=atan(vU.y,vU.x);
    vec3 prism=0.55+0.45*cos(ang+t*0.8+vec3(0.0,2.094,4.189));
    col=mix(col,prism,exp(-edge*8.0)*0.5);
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
    }
  // [SHAPE:28 Bar] ————————————————————————————
  else if(sh==28){ float bx=abs(vU.x),by=abs(vU.y);
    a=smoothstep(1.0,0.95,bx)*smoothstep(0.18,0.1,by)+exp(-by*14.0)*0.06; }
  // [SHAPE:29 Trail] ————————————————————————————
  else if(sh==29){
    // Elongated capsule along vU.x with soft gradient (bright head → dim tail)
    float bx=vU.x*0.4, by=vU.y;
    float cd=length(vec2(max(abs(bx)-0.3,0.0),by));
    float grad=smoothstep(-1.0,0.8,vU.x)*0.6+0.4;
    a=(smoothstep(0.5,0.1,cd)+exp(-cd*4.0)*0.3)*grad; }
