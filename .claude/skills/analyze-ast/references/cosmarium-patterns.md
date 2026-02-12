# COSMARIUM AST-grep Patterns Reference

## Pool Operations

```yaml
# Unit spawn
pattern: spU($$$)
lang: typescript

# Particle spawn
pattern: spP($$$)
lang: typescript

# Projectile spawn
pattern: spPr($$$)
lang: typescript

# Unit kill
pattern: killU($$$)
lang: typescript
```

## State Management

```yaml
# Setter function calls (state.ts pattern)
pattern: set$NAME($$$)
lang: typescript

# poolCounts property access
pattern: poolCounts.$PROP
lang: typescript

# gameState checks
pattern: gameState === $VALUE
lang: typescript
```

## WebGL API Calls

```yaml
# All gl method calls
pattern: gl.$METHOD($$$)
lang: typescript

# drawArraysInstanced specifically
pattern: gl.drawArraysInstanced($$$)
lang: typescript

# bindFramebuffer calls
pattern: gl.bindFramebuffer($$$)
lang: typescript
```

## Spatial Hash

```yaml
# Neighbor lookup
pattern: gN($$$)
lang: typescript

# Hash rebuild
pattern: bHash()
lang: typescript

# Knockback
pattern: kb($$$)
lang: typescript
```

## Camera Operations

```yaml
# Camera property access
pattern: cam.$PROP
lang: typescript

# Screen shake
pattern: addShake($$$)
lang: typescript
```

## Effect Spawning

```yaml
# Explosion effect
pattern: explosion($$$)
lang: typescript

# Trail effect
pattern: trail($$$)
lang: typescript

# Chain lightning
pattern: chainLightning($$$)
lang: typescript

# Beam creation
pattern: addBeam($$$)
lang: typescript
```

## Import Patterns

```yaml
# Relative imports with .ts extension
rule:
  kind: import_statement
  pattern: import $$$  from '$PATH'
  constraints:
    PATH:
      regex: '\.ts$'
lang: typescript
```

## Type Patterns

```yaml
# Unit type references
pattern: "Unit"
kind: type_identifier
lang: typescript

# any type usage (lint check)
pattern: "any"
kind: predefined_type
lang: typescript
```

## Advanced: Finding Functions by Structure

```yaml
# Functions with more than 3 parameters
rule:
  kind: function_declaration
  has:
    kind: formal_parameters
    has:
      kind: required_parameter
      # Use stopBy to limit depth
lang: typescript

# Arrow functions assigned to exports
rule:
  kind: export_statement
  has:
    kind: variable_declaration
    has:
      kind: arrow_function
lang: typescript
```
