# Rainboids - Supercharged Asteroids

A modern, feature-rich asteroids game with enhanced combat, powerups, enemies, and progression systems.

**Play now at: https://rainboids.cat.computer**

<img width="928" alt="image" src="https://github.com/user-attachments/assets/f85765c7-a5ab-43eb-b239-cb8b67c861a1" />
<img width="1609" height="865" alt="Screenshot 2025-08-13 at 22 25 26" src="https://github.com/user-attachments/assets/d6c98752-0d1e-4ae3-b5ce-8794610b3ecd" />

---

## 🚀 Game Overview

Rainboids is a supercharged asteroids clone featuring:
- **6 unique enemy types** with distinct behaviors and attack patterns
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
- **Behavior**: Fast, aggressive chaser that pursues the player relentlessly
- **Attack**: 3-round burst fire pattern
- **Movement**: Triangular geometric patterns while chasing
- **Health**: Medium durability
- **Threat Level**: High mobility, moderate firepower

### 🟢 Guardian (Square) 
- **Behavior**: Defensive tank that patrols areas and guards territory
- **Attack**: Devastating crescent wave spread shots
- **Movement**: Square geometric patrol patterns
- **Health**: High durability, heavily armored
- **Threat Level**: Low mobility, devastating firepower

### 🟡 Wasp (Diamond)
- **Behavior**: Fast, agile swarm enemy with darting movements
- **Attack**: Quick pulse bursts in rapid succession
- **Movement**: Erratic darting like an angry wasp
- **Health**: Low durability but hard to hit
- **Threat Level**: Very high mobility, moderate firepower

### 🟣 Titan (Hexagon)
- **Behavior**: Massive boss-like enemy with tank characteristics
- **Attack**: Slow but powerful homing missiles
- **Movement**: Deliberate tank-like rotation and positioning
- **Health**: Very high durability
- **Threat Level**: Low mobility, very high firepower

### 🔵 Stalker (Cross)
- **Behavior**: Stealthy enemy that approaches in wide arcs
- **Attack**: Charged laser beams with high damage
- **Movement**: Swooping arc patterns for positioning
- **Health**: Medium-high durability
- **Threat Level**: High mobility, high precision damage

### 🟠 Bomber (Spiked Circle)
- **Behavior**: Slow but dangerous explosive specialist
- **Attack**: Slow-moving but deadly homing projectiles
- **Movement**: Circular patterns, methodical positioning
- **Health**: High durability, heavily armored
- **Threat Level**: Low mobility, extreme firepower

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
