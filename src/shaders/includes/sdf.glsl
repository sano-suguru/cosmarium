// hexDist — hexagon distance (sh==3, sh==20)
float hexDist(vec2 uv) {
  vec2 av = abs(uv);
  return max(av.x * 0.866 + av.y * 0.5, av.y);
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
