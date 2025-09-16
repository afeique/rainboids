# Rainboids - Supercharged Asteroids

Royalty-free background music ["Legend"](https://www.youtube.com/watch?v=mxygNM3b95M&ab_channel=WhiteBatAudio) 
graciously provided by [Karl Casey @ White Bat Audio](https://karlcasey.bandcamp.com/).

Support White Bat Audio on [Bandcamp](https://karlcasey.bandcamp.com/) and 
[YouTube](https://www.youtube.com/@WhiteBatAudio)!

<img width="928" alt="image" src="https://github.com/user-attachments/assets/f85765c7-a5ab-43eb-b239-cb8b67c861a1" />
<img width="1609" height="865" alt="Screenshot 2025-08-13 at 22 25 26" src="https://github.com/user-attachments/assets/d6c98752-0d1e-4ae3-b5ce-8794610b3ecd" />

## Synopsis

This mobile-friendly game can be played at: https://rainboids.cat.computer

This is an asteroids clone with its own interesting mechanics and visual aesthetics.

It features countless enhancements and tweaks over the original 
[Monolithic Rainboids](https://github.com/afeique/rainboids-monolithic).

Most importantly, the underlying JavaScript code has been modularized for easier maintenance.

---

## 🚀 Gameplay Overview

<!-- - 🌟 Starfield Depth Batching Active
-   gameEngine.debugStarfieldPerformance() - Show performance stats
-   gameEngine.showDepthBatchStats() - Show depth batching details -->
- 🤖 Enemy System Ready:
-   🔴 HUNTER (Triangle) - 10 HP - Fast aggressive chaser
-   🟢 GUARDIAN (Square) - 20 HP - Defensive spread shooter
-   🟡 WASP (Diamond) - 8 HP - Fast swarm enemy
-   🟣 TITAN (Hexagon) - 30 HP - Heavy orbital enemy
-   🔵 STALKER (Cross) - 10 HP - Stealth approach enemy
-   🟠 BOMBER (Spiked Circle) - 15 HP - Explosive projectiles
- 💥 Combat System: Player bullets = 1 dmg, Enemy bullets = 2 dmg
- 💚 Health System: Health orbs heal! Configurable drop rates and counts!
- 🪨 Asteroid Interactions: Enemy bullets deal damage to asteroids, enemies bounce off (no damage)
- 💥 Player Damage Feedback: Screen shake, red damage numbers, and colored explosions when hit
- 🎆 Bullet Impact Effects: Colored particle explosions for all enemy bullet impacts
- 🟠 Player Bullet Effects: Satisfying orange explosions on all player bullet hits
- ♻️  Enemy Bullet Lifecycle: No fade decay, recycled when off-screen for efficiency
- 👻 Enemy Phase-Through: Enemies pass through each other and enemy bullets
- 🕶️ Enemy Dodging: Enemies actively dodge each other\'s bullets with predictive AI
- 💊 Tunable Healing: Health orb heal amount now configurable in constants
- 🌊 Enhanced Waves: Multi-phase waves with asteroids first, then enemy sub-waves
- ⚡ Performance Optimizations Active:
-   🔧 Reduced particle counts for explosions and effects
-   🧹 Automatic particle cleanup and limits
-   📊 gameEngine.showPerformanceStats() - View current object counts
- 🎁 Powerup System Active:
-   💨 Rapid Fire - Faster shooting (stacks up to 5x)
-   🎯 Homing Bullets - Track enemies automatically
-   💥 Multi-Shot & Spread Shot - More bullets per shot
-   🔸 Big Bullets - Easier to hit agile enemies
-   ⚡ Speed Boost - Enhanced movement speed
-   🏹 Piercing Shots - Bullets go through enemies
-   💣 Explosive Rounds - Area damage on impact
-   🛡️ Shield Boost - +15% damage reduction per stack
- ✨ Enhanced Star System:
-   ⭐ Larger stars to showcase beautiful geometric shapes
-   🎭 15% chance for spectacular big stars
-   🔶 Complex shapes: stars, hexagons, diamonds, sparkles & bursts
-   💫 Enhanced animations: rotation, pulsing, and glow effects
- 🚀 Enhanced WASD + Mouse Controls:
-   ⬆️ WASD = Move in 8 directions with tight control
-   🖱️ Mouse = Aim direction (ship faces mouse cursor)
-   🔫 Auto-fire = Ship continuously fires (no fire button!)
-   📱 Mobile = Joystick: WASD movement, touch for aiming
- 🎁 Enhanced Powerup System:
-   ✨ Spectacular gradient visual effects and distinctive shapes
-   🎯 Unique icons: ⚡💨🎯●💥🛡 etc. for each powerup type
-   🔊 Magical treasure pickup sound with pitch variations
-   📊 Console shows powerup drop rolls and spawns
-   🎮 Beautiful gradient UI indicators at bottom of screen
-   ⏱️ Timer bars show remaining duration (1 minute each)
-   📺 Powerup names display at top in Silkscreen font with smooth fade
-   🎨 Bullets change shape/color based on active powerups
-   🧪 Press "P" key to test spawn a powerup near player

---

## 🎮 Controls

### Desktop
- **Rotate**: Left/Right Arrow or A/D
- **Thrust**: Up Arrow or W
- **Brake**: Down Arrow or S
- **Fire**: Z
- **Tractor Beam**: Spacebar
- **Pause**: Escape

### Mobile
- **Joystick**: Rotate
- **↑**: Thrust
- **⌖**: Fire
- **⊙**: Tractor Beam
- **||**: Pause

---

## 🏆 Scoring
- **Hit Asteroid**: 50 points
- **Destroy Asteroid**: 100 points
- **Collect Star**: 7 points (normal), 4 points (burst)
- **Energy Use**: 1 point per unit of energy used for thrust

---

## ⚡ Energy System
- **Thrusting** drains your energy bar (configurable in `game-engine.js`)
- **Collecting stars** restores energy
- **No firing allowed** when in CRITICAL state (energy depleted)

---

## Project Structure

```
├── index.html              # Original monolithic version
├── index-modular.html      # New modular version
├── js/
│   ├── main.js            # Main entry point
│   └── modules/
│       ├── constants.js   # Game constants and configuration
│       ├── utils.js       # Utility functions
│       ├── pool-manager.js # Object pooling system
│       ├── audio-manager.js # Audio management
│       ├── input-handler.js # Input handling (keyboard/touch)
│       ├── ui-manager.js  # UI management and overlays
│       ├── game-engine.js # Main game engine
│       └── entities/      # Game entity classes
│           ├── player.js  # Player ship
│           ├── bullet.js  # Bullet projectiles
│           ├── asteroid.js # Asteroid entities
│           ├── particle.js # Particle effects
│           ├── star.js    # Star entities
│           └── line-debris.js # Line debris effects
└── bgm.mp3               # Background music
```

---

## Module Overview

### Core Modules
- **`main.js`**: Entry point that initializes all modules and starts the game
- **`constants.js`**: All game configuration values and constants
- **`utils.js`**: Helper functions like collision detection, random number generation, etc.
- **`pool-manager.js`**: Object pooling system for efficient memory management

### Management Modules
- **`audio-manager.js`**: Handles sound effects and background music
- **`input-handler.js`**: Manages keyboard and touch input
- **`ui-manager.js`**: Handles all UI elements, overlays, and messages
- **`game-engine.js`**: Main game loop, state management, and collision detection

### Entity Modules
- **`player.js`**: Player ship with movement, shooting, and collision
- **`bullet.js`**: Bullet projectiles with wave motion effects
- **`asteroid.js`**: 3D wireframe asteroids with physics
- **`particle.js`**: Particle effects system (explosions, thrust, etc.)
- **`star.js`**: Star entities with various shapes and behaviors
- **`line-debris.js`**: Line debris from destroyed asteroids

---

## Usage

### Running the Modular Version
1. Open `index-modular.html` in a web browser
2. The game will automatically initialize and show the title screen
3. Click or press any key to start playing

### Development
The modular structure makes it easy to:
- **Modify game mechanics**: Edit `constants.js` for game balance
- **Add new entities**: Create new classes in the `entities/` folder
- **Change UI behavior**: Modify `ui-manager.js`
- **Add new input methods**: Extend `input-handler.js`
- **Modify audio**: Update `audio-manager.js`

---

## Key Features
- **Object Pooling**: Efficient memory management for particles and entities
- **Modular Architecture**: Clean separation of concerns
- **ES6 Modules**: Modern JavaScript with import/export
- **Mobile Support**: Touch controls and responsive design
- **Audio Integration**: Sound effects and background music
- **State Management**: Clean game state handling
- **Visual Direction/Thruster/Wing Triangles**: Enhanced player orientation
- **Asteroid Border Impulse**: Keeps gameplay dynamic and fair
- **Energy System**: Adds challenge and strategy

---

## Browser Compatibility
The modular version uses ES6 modules, which require:
- Modern browsers with ES6 module support
- HTTPS or localhost (modules don't work with `file://` protocol)

---

## Migration from Monolithic Version
The original `index.html` contains all code in a single file. The modular version:
1. Separates concerns into logical modules
2. Makes the codebase more maintainable
3. Enables easier testing and debugging
4. Provides better organization for future development

---

## Building for Production
For production deployment, you may want to:
1. Bundle all modules into a single file using a tool like Webpack or Rollup
2. Minify the JavaScript code
3. Optimize assets (images, audio)

---

## Contributing
When adding new features:
1. Create new modules in the appropriate directory
2. Follow the existing naming conventions
3. Use ES6 modules for imports/exports
4. Update this README if adding new modules 
