# Cypher Taskbar v4.0.0

A comprehensive, automated, and highly customizable taskbar for [Foundry VTT](https://foundryvtt.com/) running the [Cypher System](https://foundryvtt.com/packages/cyphersystem/).

## Features

- **Persistent Character HUD** — Floating portrait with real-time Might/Speed/Intellect pools, edge, effort, tier, XP wheel, and damage track
- **Persona System** — Personality traits with descriptions/levels/art, and story arcs with step progression (Opening/Steps/Climax/Resolution)
- **Skills Panel** — Categorized skill listing with drag-and-drop reordering, custom categories with icons/colors, and per-category appearance settings
- **Abilities Panel** — Categorized abilities with visibility toggles, custom categories, and drag-and-drop management
- **Spells Panel** — Intelligent spell detection across skill/ability/spell items, memorization ("Ready") system, casting integration
- **Equipment Panel** — Categorized inventory with custom categories and drag-and-drop organization
- **Combat System** — One-click combat entry, initiative rolling, GM approval workflow via sockets, action picker (Attack/Move/Guard/Ability/Item/Cypher/Spell)
- **Visual Customization** — Per-panel color, shadow, background image, opacity, font size, and layout controls
- **Auto-Hide** — Taskbar hides when not in use, configurable lock to keep visible
- **Modern Dark Theme** — Gold-accented dark aesthetic with smooth animations and glow effects

## Requirements

- Foundry VTT v14+
- Cypher System v3.0.0+

## Installation

1. Copy the `cypher-taskbar` folder into your Foundry VTT `Data/modules/` directory
2. Restart Foundry VTT
3. Enable "Cypher Taskbar" in the Module Management screen

## Module Structure

```
cypher-taskbar/
  module.json              # Module manifest
  scripts/
    cypher-taskbar.js      # Main entry point & core class
    utils.js               # Shared utilities
    settings.js            # Settings registration
    persona-panel.js       # Persona panel mixin
    skills-panel.js        # Skills panel mixin
    equipment-panel.js     # Equipment panel mixin
    abilities-panel.js     # Abilities panel mixin
    spells-panel.js        # Spells panel mixin
    combat-panel.js        # Combat panel mixin
  styles/
    cypher-taskbar.css     # Complete stylesheet
  languages/
    en.json                # English translations
```

## Changelog

### v3.1.0
- Removed MOOD tab from Persona panel (mood tracking and gauges feature removed)
- Moved portrait hide/show toggle from portrait area to taskbar eye button
- Added smooth slide animation for portrait show/hide
- Fixed Portrait Space Settings popup (complete rewrite with 5 tabs)
- Fixed TDZ and event listener bugs in settings popup
- Fixed premature popup close on click-outside behavior

### v2.5.4
- Fixed malformed DOM (extra closing div) in floating portrait
- Fixed undefined MODULEID reference
- Fixed minimize button injection for Foundry v13 ApplicationV2
- Fixed canvas padding selector for v13 (#game-canvas fallback)
- Replaced non-standard CSS zoom with transform:scale
- Unified version numbering across all files
- Restructured module with proper `scripts/`, `styles/`, `languages/` directories
- Modularized JavaScript: split monolithic file into ES module mixins (one per panel)
- Added hot-reload support for CSS and language files during development
