// Per-unit rendering parameters indexed by shape ID (0..NUM_SHAPES-1)
// Units 0-23 で使用。[24-31: reserved] はパディング。Effects 32-42 はこれらの配列を参照しない（パディング値）
const float RIM_THRESH[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  0.035, 0.045, 0.032, 0.022, 0.025,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  0.028, 0.030, 0.025, 0.006, 0.035,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  0.025, 0.060, 0.008, 0.008, 0.040,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst] [19:Hive]
  0.015, 0.028, 0.030, 0.038, 0.022,
  // [20:Dreadnought] [21:Reactor] [22:Asteroid] [23:Asteroid Core] [24-31: reserved]
  0.020, 0.024, 0.022, 0.020, 0.020, 0.020, 0.020, 0.020, 0.020, 0.020, 0.020, 0.020,
  // [32:Circle] [33:Diamond] [34:Homing] [35:Beam] [36:Lightning]
  0.020, 0.020, 0.020, 0.020, 0.020,
  // [37:ExplosionRing] [38:DiamondRing] [39:OctShield] [40:ReflectField] [41:Bar]
  0.020, 0.020, 0.020, 0.020, 0.020,
  // [42:Trail]
  0.020
);
const float RIM_WEIGHT[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  0.65, 0.72, 0.55, 0.45, 0.50,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  0.28, 0.30, 0.45, 0.32, 0.60,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  0.55, 0.70, 0.35, 0.18, 0.75,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst] [19:Hive]
  0.25, 0.45, 0.48, 0.62, 0.42,
  // [20:Dreadnought] [21:Reactor] [22:Asteroid] [23:Asteroid Core] [24-31: reserved]
  0.40, 0.38, 0.45, 0.42, 0.38, 0.38, 0.38, 0.38, 0.38, 0.38, 0.38, 0.38,
  // [32:Circle] [33:Diamond] [34:Homing] [35:Beam] [36:Lightning]
  0.38, 0.38, 0.38, 0.38, 0.38,
  // [37:ExplosionRing] [38:DiamondRing] [39:OctShield] [40:ReflectField] [41:Bar]
  0.38, 0.38, 0.38, 0.38, 0.38,
  // [42:Trail]
  0.38
);
const float HF_WEIGHT[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  0.65, 0.70, 0.50, 0.30, 0.32,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  0.35, 0.40, 0.35, 0.75, 0.50,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  0.50, 0.25, 0.70, 0.70, 0.35,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst] [19:Hive]
  0.22, 0.38, 0.38, 0.60, 0.28,
  // [20:Dreadnought] [21:Reactor] [22:Asteroid] [23:Asteroid Core] [24-31: reserved]
  0.26, 0.32, 0.30, 0.28, 0.48, 0.48, 0.48, 0.48, 0.48, 0.48, 0.48, 0.48,
  // [32:Circle] [33:Diamond] [34:Homing] [35:Beam] [36:Lightning]
  0.48, 0.48, 0.48, 0.48, 0.48,
  // [37:ExplosionRing] [38:DiamondRing] [39:OctShield] [40:ReflectField] [41:Bar]
  0.48, 0.48, 0.48, 0.48, 0.48,
  // [42:Trail]
  0.48
);
const float FWIDTH_MULT[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  2.4, 2.2, 1.4, 1.1, 1.1,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  2.2, 2.5, 1.1, 0.85, 1.3,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  1.4, 2.5, 0.9, 2.8, 0.9,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst] [19:Hive]
  0.85, 1.3, 1.5, 2.0, 1.0,
  // [20:Dreadnought] [21:Reactor] [22:Asteroid] [23:Asteroid Core] [24-31: reserved]
  0.95, 1.1, 1.1, 1.1, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5,
  // [32:Circle] [33:Diamond] [34:Homing] [35:Beam] [36:Lightning]
  1.5, 1.5, 1.5, 1.5, 1.5,
  // [37:ExplosionRing] [38:DiamondRing] [39:OctShield] [40:ReflectField] [41:Bar]
  1.5, 1.5, 1.5, 1.5, 1.5,
  // [42:Trail]
  1.5
);
const float SOFT_LIMIT[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  1.2, 1.2, 1.2, 1.2, 1.2,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  1.2, 1.2, 1.2, 1.2, 1.2,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  1.1, 1.2, 1.2, 1.2, 1.2,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst] [19:Hive]
  1.2, 1.2, 1.2, 1.2, 1.2,
  // [20:Dreadnought] [21:Reactor] [22:Asteroid] [23:Asteroid Core] [24-31: reserved]
  1.2, 1.2, 1.2, 1.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
  // [32:Circle] [33:Diamond] [34:Homing] [35:Beam] [36:Lightning]
  1.0, 1.0, 1.0, 1.0, 1.0,
  // [37:ExplosionRing] [38:DiamondRing] [39:OctShield] [40:ReflectField] [41:Bar]
  1.0, 1.0, 1.0, 1.0, 1.0,
  // [42:Trail]
  1.0
);
