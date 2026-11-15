# Cypher Taskbar

Cypher Taskbar adds a configurable character HUD for the Cypher System in Foundry VTT. It provides pool and XP controls, recovery rolls, native item/attribute rolls, combat and movement tools, equipment and ammunition management, persona notes, galleries, mini containers, and player/GM task lists.

## Compatibility

- Foundry VTT: 14–15; version 14 is the verified generation.
- Cypher System: 3.5.2 or later; the compatibility adapter targets the 3.5.2 schema.
- Optional integrations: Cypher XP, Cypher GM Taskbar, Cypher Cool Items, Cypher Gallery Tabs, Image Hover, and Cypher PC Combat. The taskbar detects unavailable companions and retains its standalone behavior where supported.

## Installation

1. In Foundry, open **Add-on Modules** → **Install Module**.
2. Use the release manifest:
   `https://github.com/Mario-28/cypher-taskbar/releases/latest/download/module.json`
3. Alternatively, unzip `cypher-taskbar-5.1.1.zip` into Foundry's `Data/modules` directory. The archive must produce `Data/modules/cypher-taskbar/module.json`.
4. Enable **Cypher Taskbar** in a Cypher System world and refresh the clients.

Back up the world before upgrading. See [MIGRATION.md](MIGRATION.md) for persistence and upgrade notes.

## Permissions and approval workflows

Actor preferences are stored under `flags.cypher-taskbar.taskbarPrefs`. Writes re-check current ownership, and individual preference leaves are updated instead of replacing the whole object.

Routine owner-controlled actions such as ordinary pool adjustments and linked-ammunition use remain local gameplay operations. Shared-world actions that reset rest state, spend XP through the approval workflow, destroy/expend equipment or valuables, or spend currency use GM review. Review handlers re-fetch documents after confirmation and revalidate actor/item state and requester ownership before mutation.

New chat review cards carry request metadata in `flags.cypher-taskbar`; their visible markup is presentation only. Cash approval recalculates funds from the current actor rather than trusting a client-submitted balance or replacement total. Equipment denial does not consume a utility pip, and an approved same-combat-turn expenditure reconciles the pip state.

A request's designated GM should resolve its review card. If that GM is unavailable, the lowest-ID active GM is the deterministic fallback. This coordination reduces duplicate resolution, but it is not an atomic cross-client transaction. Legacy unflagged cards have weaker coordination than current cards.

Raw Foundry socket payloads do not authenticate their sender. Socket messages are treated as requests or notifications, not authority. Request IDs provide replay/idempotency checks, while local GM confirmation and current document state authorize reviewed shared-world mutations. Gallery sharing accepts bounded, suitably shaped share notifications for local lightboxes; GM chat creation still requires confirmation.

The combat bar's **END TURN** is intentionally automatic rather than a GM-reviewed action. A GM advances directly; a player instruction is executed only by the designated active GM after checking that the claimed requester still owns the current combatant's PC. Stale turns, unowned actors, duplicate request IDs, and immediate repeated clicks do not advance additional turns. The GM socket listener remains active when **Load Only For Players** disables the GM's visual taskbar.

## Combat bar appearance

Open **Taskbar Settings → Combat Bar** to choose one of six complete appearance presets:

- **Classic Gold** — the original dark-glass and gold appearance.
- **Aurora Glass** — cyan glass, crisp lines, and luminous blue accents.
- **Ember Edge** — sharp graphite tiles with orange and crimson energy.
- **Nebula Pulse** — violet depth, orchid highlights, and cosmic iconography.
- **Verdant Circuit** — emerald glass, botanical accents, and clean geometry.
- **Mono Carbon** — minimal carbon panels with silver and white details.

Each preset changes the action and resource icons, icon colors, tile and bar backgrounds, borders, separators, and resource pips. Combat costs, permissions, movement, targeting, and END TURN behavior are unchanged. The selection is stored per character in `flags.cypher-taskbar.taskbarPrefs.combatBarPreset`, is included in settings exports, and rebuilds the visible bar immediately. Invalid or unavailable values fall back to Classic Gold. Preset cards support keyboard use, visible focus, text selection state, `aria-pressed`, in-flight save protection, failed-save rollback, and reduced motion.

## Data and companion compatibility

Cypher Taskbar's own persistent data uses `flags.cypher-taskbar` and registered module settings. Native Actor and embedded Item documents remain authoritative.

Deliberate compatibility integrations read or write these foreign namespaces:

- `cypher-gallery-tabs`: gallery tabs, images, layouts, and related actor data.
- `cypher-cool-items`: item activation, attack, spell, and linked-ammunition configuration.
- `image-hover`: token/prototype artwork used by Image Hover.
- `cypher-gm-taskbar`: difficulty, task, and persona compatibility data.

These writes are intentional interoperability behavior, not modifications to another package's code. Disable the relevant integration or companion module if a different ownership model is preferred.

## Accessibility and troubleshooting

Controls use labels, keyboard interactions, visible focus states, tooltips, narrow-window layouts, and reduced-motion rules. Module selectors and custom properties use `cypher-taskbar`, `ct-`, or companion-specific prefixes. Styles are not placed in a new cascade layer because doing so would lower their priority against Foundry's unlayered styles and could break popups.

For diagnostics, enable `CONFIG.debug.cypherTaskbar` in the browser console and reproduce the issue. Routine operational logging is suppressed unless debug mode is enabled. Error notifications are player-safe; technical details remain in the console for GM troubleshooting.

## Development verification

Install development dependencies with `npm install`, then run:

```sh
npm run check
```

The suite covers the compatibility adapter, recovery and roll rules, Effort, GM request replay checks, preference migration and permissions, settings normalization, sanitization, gallery payload bounds, equipment expenditure, mini-container validation, reroll behavior, current-state document checks, MOVE-mode coordinate conversion/token dragging, automatic END TURN advancement, and combat-bar preset rendering/persistence/rollback.

Static and mocked regression verification is not a substitute for a live Foundry world. See [VERIFICATION.md](VERIFICATION.md) for the exact release verification boundary and the remaining live test checklist.
