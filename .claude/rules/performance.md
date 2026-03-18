---
paths:
  - "src/**/*.ts"
---

# Performance Patterns & Critical Gotchas

## Object Pooling

Pre-allocated arrays + `.alive` flag. Unit/Projectile: linear scan for first dead slot. Particle: LIFO free stack (Uint16Array) for fast allocation. All kill functions have double-kill guard.

## Instanced Rendering

`drawArraysInstanced()` + VAO. Instance buffer: 9 floats `[x,y,size,r,g,b,alpha,angle,shapeID]` (stride 36B)

## Spatial Hash

`buildHash()` rebuilds every frame. `getNeighbors()` results in shared `neighborBuffer` — use immediately, do not copy. Only valid after `buildHash()`.

## Critical Gotchas

| Issue | Details |
|-------|---------|
| particle/projectile kill | Save values to locals **before** `kill()` — kill may reuse the slot immediately. |
