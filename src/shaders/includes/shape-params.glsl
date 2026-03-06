// Per-unit rendering parameters indexed by shape ID (0..NUM_SHAPES-1)
// Units 0-18 で使用。Effects 19-29 はこれらの配列を参照しない（パディング値）
const float RIM_THRESH[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  0.035, 0.045, 0.032, 0.022, 0.025,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  0.028, 0.030, 0.025, 0.006, 0.035,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  0.025, 0.060, 0.008, 0.008, 0.040,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst]
  0.015, 0.028, 0.030, 0.038,
  // [19:Circle] [20:Diamond] [21:Homing] [22:Beam] [23:Lightning]
  0.020, 0.020, 0.020, 0.020, 0.020,
  // [24:ExplosionRing] [25:DiamondRing] [26:OctShield] [27:ReflectField] [28:Bar]
  0.020, 0.020, 0.020, 0.020, 0.020,
  // [29:Trail]
  0.020
);
const float RIM_WEIGHT[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  0.65, 0.72, 0.55, 0.45, 0.50,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  0.28, 0.30, 0.45, 0.32, 0.60,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  0.55, 0.70, 0.35, 0.18, 0.75,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst]
  0.25, 0.45, 0.48, 0.62,
  // [19:Circle] [20:Diamond] [21:Homing] [22:Beam] [23:Lightning]
  0.38, 0.38, 0.38, 0.38, 0.38,
  // [24:ExplosionRing] [25:DiamondRing] [26:OctShield] [27:ReflectField] [28:Bar]
  0.38, 0.38, 0.38, 0.38, 0.38,
  // [29:Trail]
  0.38
);
const float HF_WEIGHT[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  0.65, 0.70, 0.50, 0.30, 0.32,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  0.35, 0.40, 0.35, 0.75, 0.50,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  0.50, 0.25, 0.70, 0.70, 0.35,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst]
  0.22, 0.38, 0.38, 0.60,
  // [19:Circle] [20:Diamond] [21:Homing] [22:Beam] [23:Lightning]
  0.48, 0.48, 0.48, 0.48, 0.48,
  // [24:ExplosionRing] [25:DiamondRing] [26:OctShield] [27:ReflectField] [28:Bar]
  0.48, 0.48, 0.48, 0.48, 0.48,
  // [29:Trail]
  0.48
);
const float FWIDTH_MULT[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  2.4, 2.2, 1.4, 1.1, 1.1,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  2.2, 2.5, 1.1, 0.85, 1.3,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  1.4, 2.5, 0.9, 2.8, 0.9,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst]
  0.85, 1.3, 1.5, 2.0,
  // [19:Circle] [20:Diamond] [21:Homing] [22:Beam] [23:Lightning]
  1.5, 1.5, 1.5, 1.5, 1.5,
  // [24:ExplosionRing] [25:DiamondRing] [26:OctShield] [27:ReflectField] [28:Bar]
  1.5, 1.5, 1.5, 1.5, 1.5,
  // [29:Trail]
  1.5
);
const float SOFT_LIMIT[NUM_SHAPES]=float[NUM_SHAPES](
  // [0:Drone] [1:Fighter] [2:Bomber] [3:Cruiser] [4:Flagship]
  1.2, 1.2, 1.2, 1.2, 1.2,
  // [5:Healer] [6:Reflector] [7:Carrier] [8:Sniper] [9:Lancer]
  1.2, 1.2, 1.2, 1.2, 1.2,
  // [10:Launcher] [11:Disruptor] [12:Scorcher] [13:Teleporter] [14:Arcer]
  1.1, 1.2, 1.2, 1.2, 1.2,
  // [15:Bastion] [16:Amplifier] [17:Scrambler] [18:Catalyst]
  1.2, 1.2, 1.2, 1.2,
  // [19:Circle] [20:Diamond] [21:Homing] [22:Beam] [23:Lightning]
  1.0, 1.0, 1.0, 1.0, 1.0,
  // [24:ExplosionRing] [25:DiamondRing] [26:OctShield] [27:ReflectField] [28:Bar]
  1.0, 1.0, 1.0, 1.0, 1.0,
  // [29:Trail]
  1.0
);
