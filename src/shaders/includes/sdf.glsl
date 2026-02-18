// hexDist — hexagon distance (sh==3, sh==20)
float hexDist(vec2 uv) {
  vec2 av = abs(uv);
  return max(av.x * 0.866 + av.y * 0.5, av.y);
}

// octDist — octagon distance (sh==22)
float octDist(vec2 uv) {
  vec2 av = abs(uv);
  // 0.7071 = 1/(1+tan(pi/8))
  return max(max(av.x, av.y), (av.x + av.y) * 0.7071);
}

// manDist — manhattan distance (sh==1, sh==13)
float manDist(vec2 uv) {
  return abs(uv.x) + abs(uv.y);
}

// polarR — polar radius for star/petal shapes (sh==7, sh==14)
float polarR(vec2 uv, float n, float r0, float amp) {
  float an = atan(uv.y, uv.x);
  return r0 + amp * cos(an * n);
}

// sdRoundedBox — signed distance to rounded rectangle (sh==24)
float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 dd = abs(p) - b;
  return length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - r;
}

// sdCapsule — signed distance to line-segment capsule (sh==24)
float sdCapsule(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// smin — smooth minimum / smooth union (sh==24). k must be > 0
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
