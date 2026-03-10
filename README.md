# Rainboids - Supercharged Asteroids

A modern, feature-rich asteroids game with enhanced combat, powerups, enemies, and progression systems.

**Play now at: https://rainboids.cat.computer**

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/afbf1039-b46c-4717-9aa2-1a8bc4083354" />
<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/f1bfe140-5e6b-43df-969d-d1f49427aa02" />


---

## 🚀 Game Overview

Rainboids is a supercharged asteroids clone featuring:
- **10 unique enemy types** with distinct behaviors and attack patterns
- **12 different powerups** with visual effects and stacking mechanics
- **Comprehensive upgrade system** with offensive and defensive improvements
- **Wave-based progression** with increasing difficulty
- **Mobile-friendly controls** with touch support
- **Rich audio system** with customizable sound effects and music
- **Modern ES6 modular architecture** for maintainability

---

## 🎮 Controls

### Desktop
- **Movement**: WASD or Arrow Keys
- **Aim & Fire**: Mouse (ship automatically fires toward cursor)
- **Tractor Beam**: Spacebar (attracts collectibles)
- **Pause**: Escape
- **Shop**: Click shop button or use pause menu

### Mobile
- **Movement**: Touch and drag anywhere on screen
- **Aim**: Touch to aim, ship fires automatically
- **Tractor Beam**: Dedicated touch button
- **Pause**: Touch pause button

---

## 👾 Enemy Types

### 🔴 Hunter (Triangle)
- **Behavior**: Aggressive hunter that surges at the player in sharp directional bursts
- **Attack**: 3-round burst of **red triangle** projectiles pointing in their travel direction; 2s cooldown between bursts
- **Movement**: Triangular burst-and-wait — darts a random direction at high speed, decelerates, waits, then bursts again
- **Health**: Medium
- **Threat Level**: High mobility, moderate burst damage

### 🟢 Guardian (Square)
- **Behavior**: Armored patrol enemy that holds territory with axis-aligned movement
- **Attack**: 3-round burst of **spinning green squares**; long 4s cooldown between volleys
- **Movement**: Square burst-and-wait — moves in strict horizontal or vertical bursts, then pauses
- **Health**: High
- **Threat Level**: Moderate mobility, sustained suppressive fire

### 🟡 Wasp (Wasp Ship)
- **Behavior**: Agile harasser that darts back and forth in tight zigzag patterns
- **Attack**: Fast **yellow needle/dart** projectiles — long and thin, fired at the player between zigzag runs
- **Movement**: Zigzags perpendicular to the player 3–5 times at high speed, then hovers for a ~2s cooldown before repeating
- **Health**: Low
- **Threat Level**: Very high mobility, difficult to track

### 🟣 Titan (Hexagon)
- **Behavior**: Lumbering juggernaut that builds momentum like a boulder
- **Attack**: **Sweeping purple laser beam** — a 1.8s dashed warning arc telegraphs the sweep, then a glowing beam rotates ±60° over 1.6s, damaging anything in its path; 8s cooldown
- **Movement**: Locks onto the player's direction, slowly accelerates to top speed, brakes past the player, comes to a full stop, then repeats
- **Health**: Very high
- **Threat Level**: Low agility but devastating area laser; must be respected at all ranges

### 🔵 Stalker (Cross)
- **Behavior**: Stealthy predator that positions itself through wide swooping arcs
- **Attack**: Charged laser beams — a charging ball builds at its tip before firing a close-range cyan beam slice
- **Movement**: Wide arc swoops around the player, stopping to fire then arcing away
- **Health**: Medium-high
- **Threat Level**: High mobility, high burst damage on approach

### 🟠 Bomber (Spiked Circle)
- **Behavior**: Slow, relentless pursuer that litters the arena with hazards
- **Attack**: Lays **spiky orange proximity mines** — stationary, pulsing mines that detonate on contact and persist for 18 seconds
- **Movement**: Slowly but steadily chases the player at low speed, leaving a trail of mines in its path
- **Health**: High
- **Threat Level**: Low speed, but mines deny space and stack up quickly

### 🔵 Drifter (Laser Turret)
- **Behavior**: Methodical crystal turret that slowly patrols while charging and firing precision lasers
- **Attack**: Charges a growing energy ball before releasing a cyan close-range laser beam slice
- **Movement**: Slow patrol with occasional direction changes; stops to fire
- **Health**: Medium-high
- **Threat Level**: Moderate — predictable but hits hard if not dodged

### 🟣 Prowler (Missile Turret)
- **Behavior**: Armored missile platform that keeps its distance and peppers the player with exploding warheads
- **Attack**: Missiles that launch fast and decelerate to a stop before exploding — dangerous area denial
- **Movement**: Maintains a fixed distance from the player; retreats if approached
- **Health**: High
- **Threat Level**: Long-range, high damage, forces constant movement

### 🟡 Weaver (Spinning Wheel)
- **Behavior**: Three-phase spinning turbine that charges up, then unleashes a spiral laser barrage while zooming in an arc
- **Attack**: **Spiral yellow lasers** — fires continuously during the arc phase while rotating at full speed, sending beams radiating outward in a circular spiral pattern
- **Movement**: ① **Spin-up**: holds position while spinning faster and faster (2.4s charge, sparks fly); ② **Arc dash**: zooms in a tight circular orbit around the player at high speed while spraying lasers (3.6s); ③ **Cooldown**: decelerates and spin winds down (2.6s), then repeats
- **Health**: Medium
- **Threat Level**: Moderate normally, extremely dangerous during the arc — lasers cover all directions

### 🟢 Sentinel (Shield Turret)
- **Behavior**: Slow orbital fortress that sweeps the battlefield with a 360° shield burst
- **Attack**: 8 bullets fired simultaneously in a full circle when it stops — unavoidable in close range
- **Movement**: Slow orbital arc around the player; decelerates to fire, then resumes
- **Health**: High
- **Threat Level**: Low speed but the omni-directional burst punishes close-range fighting

---

## ⭐ Powerup System

Powerups drop from destroyed enemies and provide temporary or permanent enhancements. Each powerup can stack multiple times for increased effectiveness.

### Offensive Powerups
- **⚡ Rapid Fire**: Increases firing rate by 25% per stack (max 5 stacks)
- **※ Multi-Shot**: Adds +1 bullet per shot per stack (max 3 stacks)
- **🎯 Homing Bullets**: Makes bullets track and follow enemies
- **● Big Bullets**: Increases bullet size by 30% per stack for easier hits
- **💨 Speed Boost**: Enhances movement speed for better maneuverability
- **➤ Piercing Shots**: Bullets penetrate through multiple enemies
- **⇶ Spread Shot**: Fires +2 bullets in a wide spread pattern
- **💥 Explosive Rounds**: Bullets explode on impact for area damage

### Defensive Powerups
- **🛡 Shield Boost**: Provides temporary damage reduction
- **💊 Medpack**: Increases health orb healing effectiveness
- **🎯 Critical Chance**: +5% critical hit chance per stack
- **💥 Critical Damage**: +10% critical hit damage per stack

---

## 🛒 Shop & Upgrade System

The shop offers permanent upgrades using two currencies:

### Currencies
- **Coins**: Earned by destroying enemies and collecting money orbs
- **Skill Points (SP)**: Gained by leveling up through experience

### Offensive Upgrades
- **Rapid Fire**: Permanent firing rate increases
- **Multi-Shot**: Additional bullets per shot
- **Homing**: Bullet tracking capabilities
- **Big Bullets**: Larger bullet size for easier hits
- **Speed Boost**: Enhanced movement speed
- **Piercing**: Bullets go through enemies
- **Explosive**: Bullets explode on impact
- **Critical Chance**: Increased critical hit probability
- **Critical Damage**: Higher critical hit damage
- **Charge Speed**: Faster charge shot charging
- **Charge Power**: Increased charge shot damage
- **Spare Ship**: Extra lives (maximum 3 total)

### Defensive Upgrades
- **Health Orb Luck**: Increases health orb drop chance
- **Money Orb Luck**: Increases money orb drop chance  
- **Health Orb Bounty**: More health orbs per drop
- **Money Orb Bounty**: More money orbs per drop

---

## 🌊 Wave System

### Wave Structure
Each wave consists of multiple phases:
1. **Asteroid Phase**: Fixed number of asteroids spawn
2. **Enemy Sub-Waves**: Multiple waves of 2 enemies each
3. **Wave Break**: Shop access and preparation time

### Progression
- Enemy health and damage scale with wave number
- New enemy types introduced in later waves
- Increased enemy spawn rates and variety
- Asteroid count remains consistent for balanced gameplay

---

## 💫 Visual & Audio Features

### Visual Effects
- **Particle Systems**: Explosions, thrust trails, and impact effects
- **Powerup Indicators**: Bottom-screen display showing active powerups
- **Screen Shake**: Dynamic feedback for damage and impacts
- **Gradient Backgrounds**: Beautiful starfield with depth layers
- **Geometric Shapes**: Distinctive visual design for all entities

### Audio System
- **Dynamic Sound Effects**: Procedurally generated using SFXR
- **Customizable Audio**: Individual sound effect toggles and volume control
- **Music Player**: Built-in music player with playlist support
- **Spatial Audio**: Positional audio effects for immersion

---

## 🎯 Scoring & Progression

### Point Values
- **Asteroid Hit**: Points for damaging asteroids
- **Asteroid Destruction**: Bonus points for complete destruction
- **Enemy Elimination**: Points based on enemy type and difficulty
- **Star Collection**: Small point rewards for energy restoration

### Experience System
- Gain experience by destroying enemies and asteroids
- Level up to earn skill points for permanent upgrades
- Higher levels require exponentially more experience
- Level-up effects include particle displays and temporary bonuses

---

## 🔧 Technical Features

### Performance Optimizations
- **Object Pooling**: Efficient memory management for bullets and particles
- **Depth Batching**: Optimized rendering for starfield backgrounds
- **Frustum Culling**: Only render visible objects
- **Particle Limits**: Automatic cleanup and count management
- **Web Workers**: Offloaded physics calculations for smooth gameplay

### Modern Architecture
- **ES6 Modules**: Clean, maintainable code structure
- **Responsive Design**: Adapts to different screen sizes
- **Touch Support**: Full mobile compatibility
- **Local Storage**: Persistent settings and progress
- **Error Handling**: Robust error recovery and logging

---

## 🎵 Music Credits

Royalty-free background music graciously provided by [Karl Casey @ White Bat Audio](https://karlcasey.bandcamp.com/).

Support White Bat Audio:
- [Bandcamp](https://karlcasey.bandcamp.com/)
- [YouTube](https://www.youtube.com/@WhiteBatAudio)

---

## 🚀 Getting Started

### Playing Online
Simply visit https://rainboids.cat.computer in any modern web browser.

### Local Development
1. Clone this repository
2. Serve the files using a local web server (required for ES6 modules)
3. Open `index.html` in your browser
4. Start playing and modifying!

### Browser Requirements
- Modern browser with ES6 module support
- WebGL for optimal performance
- Audio API support for sound effects

---

## 📁 Project Structure

```
├── index.html              # Main game entry point
├── js/
│   ├── main.js            # Game initialization
│   ├── playlist-data.js   # Music playlist configuration
│   └── modules/
│       ├── constants.js   # Game configuration
│       ├── utils.js       # Utility functions
│       ├── game-engine.js # Core game logic
│       ├── entities/      # Game object classes
│       └── performance/   # Optimization modules
├── css/
│   └── styles.css         # Game styling
├── music/                 # Background music files
└── assets/               # Game assets
```

---

## 🤝 Contributing

This project welcomes contributions! Areas for enhancement:
- New enemy types and behaviors
- Additional powerup effects
- Visual effect improvements
- Performance optimizations
- Mobile UX enhancements
- New music tracks

---

## 📜 License

This project builds upon the original [Monolithic Rainboids](https://github.com/afeique/rainboids-monolithic) with extensive enhancements and modularization.

Music provided by Karl Casey @ White Bat Audio under royalty-free license.
