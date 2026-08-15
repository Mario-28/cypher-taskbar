# Cypher Taskbar — Project Overview

**Source:** https://github.com/Mario-28/cypher-taskbar  
**Version:** 4.0.27  
**Module ID:** `cypher-taskbar`  
**Location:** `/root/.openclaw/workspace/cypher-taskbar/`

---

## What Is This?

**Cypher Taskbar** is a **player-facing** HUD module for Foundry VTT + Cypher System. It shows a persistent floating portrait with real-time character stats (Might/Speed/Intellect pools, edge, effort, tier, XP), plus panels for skills, abilities, spells, equipment, persona, and combat.

This is **different** from Cypher GM Taskbar (which is GM-only).

---

## File Structure

```
cypher-taskbar/
  module.json              # Manifest
  README.md
  scripts/
    cypher-taskbar.js      # Main entry (~339KB) — imports all mixins
    utils.js               # Shared utilities
    settings.js            # Settings registration
    persona-panel.js       # Persona panel mixin
    skills-panel.js        # Skills panel mixin
    equipment-panel.js     # Equipment panel mixin
    abilities-panel.js     # Abilities panel mixin
    spells-panel.js        # Spells panel mixin
    combat-panel.js        # Combat panel mixin
    gallery-tabs.js        # Gallery strip / tabs
  styles/
    cypher-taskbar.css     # Complete stylesheet (~249KB)
  languages/
    en.json                # English translations
```

---

## Architecture

**Main class:** `CypherTaskbar` (in `cypher-taskbar.js`)

**Panel mixins applied via functions:**
- `applyPersonaPanel(CypherTaskbar)` — Personality traits, story arcs
- `applySkillsPanel(CypherTaskbar)` — Skill listing with categories
- `applyEquipmentPanel(CypherTaskbar)` — Inventory with sub-tabs
- `applyAbilitiesPanel(CypherTaskbar)` — Abilities with visibility toggles
- `applySpellsPanel(CypherTaskbar)` — Spell detection, memorization
- `applyCombatPanel(CypherTaskbar)` — Combat entry, initiative, GM approval

**Gallery strip:** `buildGalleryStrip()` — Tab navigation at top

---

## Key Features (from README)

| Feature | Description |
|---------|-------------|
| **Character HUD** | Floating portrait with pools, edge, effort, tier, XP wheel, damage track |
| **Persona System** | Personality traits + story arcs with step progression |
| **Skills Panel** | Categorized skills, drag-and-drop reordering, custom categories |
| **Abilities Panel** | Categorized abilities with visibility toggles |
| **Spells Panel** | Intelligent spell detection, memorization ("Ready") system |
| **Equipment Panel** | Categorized inventory with sub-tabs (equip/weapon/armor) |
| **Combat System** | One-click combat entry, initiative rolling, GM approval via sockets |
| **Visual Customization** | Per-panel color, shadow, background image, opacity, font size |
| **Auto-Hide** | Hides when not hovered, configurable lock |
| **Dark Theme** | Gold-accented dark aesthetic |

---

## Compatibility

- Foundry VTT v14+ (verified), up to v15
- Cypher System v3.0.0+
- ES modules (modern JS with import/export)
- Socket support for GM approval workflows

---

## Settings (from en.json)

- Auto Hide
- Selected Character
- Taskbar Height
- Portrait Animation
- Load Only For Players
- Menu Backgrounds (per-panel)

---

## Notes for Development

- Uses **ES modules** — `import`/`export` syntax
- **Hot reload** enabled for CSS and language files
- Per-actor preference store (`getActorPref`/`setActorPref`)
- Socket-based GM approval for combat actions
- Modular panel architecture — each panel is a mixin
