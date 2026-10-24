# Beach Defence

🎮 **Play Online**:
- **Vercel**: [https://beach-defence-1944.vercel.app](https://beach-defence-1944.vercel.app)
- **GitHub Pages**: [https://o1egkl.github.io/beach-defence-1944/](https://o1egkl.github.io/beach-defence-1944/)

An action-packed 3D first-person coastal defense arcade game, built with Three.js, Tailwind CSS, and WebGL.

## 🎮 Gameplay Overview

Defend the bunker and coastline from waves of incoming enemy invasion forces:
- **Infantry & Paratroopers**: Infiltrating troop squads landing on the beach and dropping from the skies.
- **Armored Units**: Enemy tanks, amphibious landing craft, and support vehicles.
- **Aviation**: Fighter planes and bombers carrying out strafing runs and air raids.
- **Arsenal**: Switch between heavy machine guns, coastal artillery cannons, rocket launchers, and call in tactical air support.
- **Audio & Visual Effects**: Realistic muzzle flashes, bullet tracers, explosions, screen shake, atmospheric battlefield sounds, and day/night transitions.

## 🚀 How to Run

1. Clone this repository:
   ```bash
   git clone https://github.com/o1egkl/beach-defence-1944.git
   cd beach-defence-1944
   ```
2. Open `index.html` directly in any modern web browser (Chrome, Firefox, Edge, Safari). No build steps or server required!

## 💻 Windows Desktop App (PWA & Offline Play)

You can run Beach Defence 1944 as a native standalone Windows application:

- **1-Click Windows Launcher**: Double-click [`Launch-Beach-Defence.bat`](file:///d:/agravity/beach%20defence/Launch-Beach-Defence.bat) to launch the game directly in borderless fullscreen app mode on Windows.
- **Install from Browser**: In Microsoft Edge or Google Chrome, click the **"Install" icon (➕ / computer)** in the address bar or click **"💻 INSTALL WINDOWS APP"** inside the main game menu.
- **Offline Support**: Once loaded, the game caches its core engine, audio synthesizer, and 3D assets via Service Worker for offline play without an internet connection.

## 🕹️ Controls

- **Mouse**: Aim bunker turret / look around
- **Left Click**: Fire primary weapon
- **Right Click / Space**: Zoom / Iron sights
- **1 - 4 Keys**: Switch weapons (Machine Gun, Anti-Tank Cannon, Rocket Launcher, Air Strike)
- **R**: Reload weapon
- **Esc / P**: Pause game

## 🛠️ Tech Stack

- **Three.js** (3D rendering & WebGL scene graph)
- **Web Audio API** (Procedural & dynamic sound synthesis/audio management)
- **Tailwind CSS** (HUD & military-themed tactical UI)
- **Vanilla JavaScript** (Game loop, physics simulation, enemy AI wave management)
