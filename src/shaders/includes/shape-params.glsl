// Per-unit rendering parameters indexed by shape ID (0..NUM_SHAPES-1)
// Units 0-23 で使用。[24-31: reserved] はパディング。Effects 32-42 はこれらの配列を参照しない（パディング値）
//
// Shape ID index:
//   0:Drone  1:Fighter  2:Bomber  3:Cruiser  4:Flagship
//   5:Healer  6:Reflector  7:Carrier  8:Sniper  9:Lancer
//   10:Launcher  11:Disruptor  12:Scorcher  13:Teleporter  14:Arcer
//   15:Bastion  16:Amplifier  17:Scrambler  18:Catalyst  19:Hive
//   20:Dreadnought  21:Reactor  22:Asteroid  23:AsteroidCore
//   24:Colossus  25:CarrierBay  26:Accelerator  27:Syndicate  28:Bloodborne  29:Ascension  30-31:reserved
//   32:Circle  33:Diamond  34:Homing  35:Beam  36:Lightning
//   37:ExplosionRing  38:DiamondRing  39:OctShield  40:ReflectField  41:Bar
//   42:Trail
const float RIM_THRESH[NUM_SHAPES]=float[NUM_SHAPES](
  // 0-4: Drone Fighter Bomber Cruiser Flagship
  0.035, 0.045, 0.032, 0.022, 0.025,
  // 5-9: Healer Reflector Carrier Sniper Lancer
  0.028, 0.030, 0.025, 0.006, 0.035,
  // 10-14: Launcher Disruptor Scorcher Teleporter Arcer
  0.025, 0.060, 0.008, 0.008, 0.040,
  // 15-18: Bastion Amplifier Scrambler Catalyst  19: Hive
  0.015, 0.028, 0.030, 0.038, 0.022,
  // 20-23: Dreadnought Reactor Asteroid AsteroidCore
  0.020, 0.024, 0.025, 0.023,
  // 24-28: Colossus CarrierBay Accelerator Syndicate Bloodborne  29: Ascension  30-31: reserved
  0.018, 0.022, 0.025, 0.024, 0.020, 0.024, 0.020, 0.020,
  // 32-36: Circle Diamond Homing Beam Lightning
  0.020, 0.020, 0.020, 0.020, 0.020,
  // 37-41: ExpRing DiamondRing OctShield ReflectField Bar  42: Trail
  0.020, 0.020, 0.020, 0.020, 0.020,
  0.020
);
const float RIM_WEIGHT[NUM_SHAPES]=float[NUM_SHAPES](
  // 0-4: Drone Fighter Bomber Cruiser Flagship
  0.65, 0.72, 0.55, 0.45, 0.50,
  // 5-9: Healer Reflector Carrier Sniper Lancer
  0.28, 0.30, 0.45, 0.32, 0.60,
  // 10-14: Launcher Disruptor Scorcher Teleporter Arcer
  0.55, 0.70, 0.35, 0.18, 0.75,
  // 15-18: Bastion Amplifier Scrambler Catalyst  19: Hive
  0.25, 0.45, 0.48, 0.62, 0.42,
  // 20-23: Dreadnought Reactor Asteroid AsteroidCore
  0.40, 0.38, 0.52, 0.48,
  // 24-28: Colossus CarrierBay Accelerator Syndicate Bloodborne  29: Ascension  30-31: reserved
  0.35, 0.40, 0.42, 0.38, 0.45, 0.42, 0.38, 0.38,
  // 32-36: Circle Diamond Homing Beam Lightning
  0.38, 0.38, 0.38, 0.38, 0.38,
  // 37-41: ExpRing DiamondRing OctShield ReflectField Bar  42: Trail
  0.38, 0.38, 0.38, 0.38, 0.38,
  0.38
);
const float HF_WEIGHT[NUM_SHAPES]=float[NUM_SHAPES](
  // 0-4: Drone Fighter Bomber Cruiser Flagship
  0.65, 0.70, 0.50, 0.30, 0.32,
  // 5-9: Healer Reflector Carrier Sniper Lancer
  0.35, 0.40, 0.35, 0.75, 0.50,
  // 10-14: Launcher Disruptor Scorcher Teleporter Arcer
  0.50, 0.25, 0.70, 0.70, 0.35,
  // 15-18: Bastion Amplifier Scrambler Catalyst  19: Hive
  0.22, 0.38, 0.38, 0.60, 0.28,
  // 20-23: Dreadnought Reactor Asteroid AsteroidCore
  0.26, 0.32, 0.35, 0.32,
  // 24-28: Colossus CarrierBay Accelerator Syndicate Bloodborne  29: Ascension  30-31: reserved
  0.25, 0.30, 0.35, 0.32, 0.28, 0.35, 0.48, 0.48,
  // 32-36: Circle Diamond Homing Beam Lightning
  0.48, 0.48, 0.48, 0.48, 0.48,
  // 37-41: ExpRing DiamondRing OctShield ReflectField Bar  42: Trail
  0.48, 0.48, 0.48, 0.48, 0.48,
  0.48
);
const float FWIDTH_MULT[NUM_SHAPES]=float[NUM_SHAPES](
  // 0-4: Drone Fighter Bomber Cruiser Flagship
  2.4, 2.2, 1.4, 1.1, 1.1,
  // 5-9: Healer Reflector Carrier Sniper Lancer
  2.2, 2.5, 1.1, 0.85, 1.3,
  // 10-14: Launcher Disruptor Scorcher Teleporter Arcer
  1.4, 2.5, 0.9, 2.8, 0.9,
  // 15-18: Bastion Amplifier Scrambler Catalyst  19: Hive
  0.85, 1.3, 1.5, 2.0, 1.0,
  // 20-23: Dreadnought Reactor Asteroid AsteroidCore
  0.95, 1.1, 1.1, 1.1,
  // 24-28: Colossus CarrierBay Accelerator Syndicate Bloodborne  29: Ascension  30-31: reserved
  0.90, 1.0, 1.1, 1.0, 0.95, 1.1, 1.5, 1.5,
  // 32-36: Circle Diamond Homing Beam Lightning
  1.5, 1.5, 1.5, 1.5, 1.5,
  // 37-41: ExpRing DiamondRing OctShield ReflectField Bar  42: Trail
  1.5, 1.5, 1.5, 1.5, 1.5,
  1.5
);
const float SOFT_LIMIT[NUM_SHAPES]=float[NUM_SHAPES](
  // 0-4: Drone Fighter Bomber Cruiser Flagship
  1.2, 1.2, 1.2, 1.2, 1.2,
  // 5-9: Healer Reflector Carrier Sniper Lancer
  1.2, 1.2, 1.2, 1.2, 1.2,
  // 10-14: Launcher Disruptor Scorcher Teleporter Arcer
  1.1, 1.2, 1.2, 1.2, 1.2,
  // 15-18: Bastion Amplifier Scrambler Catalyst  19: Hive
  1.2, 1.2, 1.2, 1.2, 1.2,
  // 20-23: Dreadnought Reactor Asteroid AsteroidCore
  1.2, 1.2, 1.2, 1.2,
  // 24-28: Colossus CarrierBay Accelerator Syndicate Bloodborne  29: Ascension  30-31: reserved
  1.2, 1.2, 1.2, 1.2, 1.2, 1.2, 1.0, 1.0,
  // 32-36: Circle Diamond Homing Beam Lightning
  1.0, 1.0, 1.0, 1.0, 1.0,
  // 37-41: ExpRing DiamondRing OctShield ReflectField Bar  42: Trail
  1.0, 1.0, 1.0, 1.0, 1.0,
  1.0
);
