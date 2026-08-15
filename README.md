# 🎭 Cypher Taskbar

> *"Your character's soul, rendered in pixels and gold."*

A sleek, automated, and obsessively customizable taskbar for [Foundry VTT](https://foundryvtt.com/) running the [Cypher System](https://foundryvtt.com/packages/cyphersystem/).

Transform your players' screen real estate from a chaotic mess of windows into a gorgeous, persistent HUD that puts their character front and center — pools, edge, effort, XP, and everything that makes them *them*.

---

## ✨ What You Get

### 🎨 **Living Portrait**
A floating character portrait that breathes on your screen. Complete with:
- Real-time **Might / Speed / Intellect** pools and edge
- **XP wheel** that tracks your journey to the next tier
- **Tier badge** — wear your level with pride
- **Damage track** — because sometimes you get hurt
- **Effort indicator** — show the table how hard you're trying
- Animated **hover effects** and customizable shadows

### 🧠 **Persona System**
Your character is more than numbers.
- **Personality traits** with descriptions, levels, and custom art
- **Story Arcs** with step progression: Opening → Steps → Climax → Resolution
- Track narrative XP right in the taskbar

### 📋 **Smart Panels**
Five fully-featured panels that slide out from the taskbar:
- **Skills** — Categorized, drag-and-drop, custom icons & colors
- **Abilities** — Your powers, organized and beautiful
- **Equipment** — Your stuff, where you can actually find it
- **Spells** — Intelligent spell detection, memorization ("Ready"), casting
- **Combat** — One-click combat entry, initiative, GM approval workflow

### 🎛️ **Visual Customization**
If you can see it, you can tweak it. Per-panel controls for:
- Colors, shadows, opacity, background images
- Font sizes, families, and effects
- Layout, positioning, and scaling
- Grid vs list view modes
- Custom category icons (50+ choices)

### 📐 **Taskbar Settings**
Deep customization for the bar itself:
- **Height, colors, transparency** — make it yours
- **Portrait width & collapse** — show/hide on demand
- **Mini menu** — People, Places, Assets, Secrets
- **Gallery tabs** — Customizable tab strip above the bar
- **Menu icons** — Per-icon size, color, label, and background
- **Auto-hide & lock** — Behave however you want

### 🖼️ **Portrait Space Settings**
Your character's visual home, fully customizable:
- **Shadow effects** — Blur, color, opacity, offset, direction
- **Identity panel** — Name, descriptor, type, focus, with custom fonts
- **Attribute bars** — Bar colors, text colors, gradients
- **ARC widget** — Custom position, scale, and glow
- **XP circle** — Color, size, and offset
- **Opacity & transparency** — Fade when you want focus elsewhere

### 🌍 **Global Defaults (GM Feature)**
Set the visual standard for your entire table:
1. Export settings from any actor
2. Import as **Global Defaults** in Module Settings
3. Check **"Use Global Defaults"**
4. Every actor uses your chosen defaults
5. Players can still override individual settings

Perfect for maintaining visual consistency across your campaign!

### 💾 **Export / Import**
Save and share your perfect setup:
- Export all settings to a JSON file
- Import settings onto any character
- Share configurations with your party
- Backup before experimenting

---

## 🚀 Installation

### Method 1: Manual
1. Download the latest release
2. Copy the `cypher-taskbar` folder to your Foundry VTT `Data/modules/` directory
3. Restart Foundry VTT
4. Enable **Cypher Taskbar** in Module Management

### Method 2: Manifest URL
Coming soon to Foundry's package manager!

---

## 📋 Requirements

| Requirement | Version |
|-------------|---------|
| Foundry VTT | v14+ |
| Cypher System | v3.0.0+ |

---

## 🎮 Quick Start

1. **Select your character** — Click the portrait area or use the character selector
2. **Right-click the taskbar** — Access Taskbar Settings
3. **Right-click your portrait** — Access Portrait Space Settings
4. **Click any panel icon** — Open Skills, Abilities, Equipment, Spells, or Combat
5. **Drag items** — Reorganize skills, abilities, and equipment
6. **Customize everything** — Make it *yours*

---

## 🗂️ Module Structure

```
cypher-taskbar/
├── module.json                     # Module manifest
├── README.md                       # This file
├── scripts/
│   ├── cypher-taskbar.js           # Main entry point & core class
│   ├── utils.js                    # Shared utilities
│   ├── settings.js                 # Settings registration
│   ├── global-defaults-config.js   # GM global defaults dialog
│   ├── persona-panel.js            # Persona panel mixin
│   ├── skills-panel.js             # Skills panel mixin
│   ├── abilities-panel.js          # Abilities panel mixin
│   ├── spells-panel.js             # Spells panel mixin
│   ├── equipment-panel.js          # Equipment panel mixin
│   ├── combat-panel.js             # Combat panel mixin
│   └── gallery-tabs.js             # Gallery tabs mixin
├── styles/
│   └── cypher-taskbar.css          # Complete stylesheet
├── templates/
│   └── global-defaults-config.html # Global defaults dialog template
└── languages/
    └── en.json                     # English translations
```

---

## 🛠️ For Developers

### Hot Reload
The module supports hot-reload for CSS and language files during development. Modify `cypher-taskbar.css` or `en.json` and see changes instantly — no restart needed.

### Socket Communication
Combat entry and initiative reroll requests use Foundry's socket system for GM approval workflows.

---

## 📝 Changelog

### v4.0.49 — Icon Settings Fix
- **Fixed**: ICONS tab settings now properly apply to taskbar buttons immediately
- **Root cause**: `applySettings()` only updated bar-level CSS variables, but buttons had old inline styles that took precedence
- **Fix**: After saving icon settings (global or per-icon), `_applyMenuIconStyles()` is now called on affected buttons to update their inline styles
- **Fixed**: Per-icon reset-to-defaults button now also reapplies styles correctly

### v4.0.48 — Performance Audit
- **Fixed**: Memory leaks from style element injection (recovery dialog & global UI styles)
- **Fixed**: Hook refresh storms — debounced `updateActor`/`createItem`/`updateItem`/`deleteItem` hooks
- **Fixed**: Timer leaks — `disableModule` hook now clears all intervals/timeouts
- **Fixed**: Console noise — all debug logs now behind `CONFIG.debug.cypherTaskbar` flag
- **Added**: DOM element cache (`_els`) to reduce repeated querySelector calls
- **Added**: GPU acceleration (`will-change: transform, opacity`) for bar, portrait, and popups
- **Added**: Performance audit document (`PERFORMANCE_AUDIT.md`)

### v4.0.46 — Global Defaults
- **Added**: Global Taskbar Defaults system for GMs
- Import settings once, apply to all actors
- Players can override individual settings
- GM-only configuration dialog

### v4.0.45 — Export Fix
- Fixed export opening in new tab
- Switched to data URL approach

### v4.0.44 — All Settings Captured
- Export now captures ALL settings (including unknown future ones)
- Added `otherSettings` bucket for forward compatibility

### v4.0.43 — Local Export/Import
- Export downloads to local file
- Import uses native file picker
- Unified file contains both taskbar and portrait settings

### v4.0.40 — Icon Settings Fix
- Icon settings now apply on initial taskbar load
- Extracted `_applyMenuIconStyles()` helper

### v4.0.39 — Export/Import Settings
- Added export/import buttons to Taskbar Settings
- JSON export with metadata
- Merge import with existing settings

### v4.0.35+ — Mini Menu, Portrait Settings, Recovery
- Mini menu positioned above icon
- Portrait Space Settings with drag positioning
- Recovery drop order enforcement
- Per-icon individual settings
- And much more...

---

## 🙏 Credits

Built with love for the Cypher System community. Special thanks to the Foundry VTT and Cypher System teams for making modules like this possible.

---

## 📜 License

This module is licensed under the MIT License.

---

> *"In the Cypher System, your character is defined by what they can do, not by their equipment. The taskbar just makes sure you never forget how awesome you are."*

**Made with 🔥 and 🎲**
