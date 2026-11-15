# Upgrading to 5.x

## 5.1.1 patch

This patch repairs END TURN processing when **Load Only For Players** is enabled. The GM client now registers the combat-turn socket even though its visual taskbar is disabled. Refresh all player and GM clients after upgrading. No data-format or settings migration is required.

## 5.1.0 feature release

This release adds six combat-bar appearance presets and a dedicated Combat Bar settings tab. It introduces no data-format migration. The new optional `combatBarPreset` leaf is stored beneath the existing `flags.cypher-taskbar.taskbarPrefs` object; missing or invalid values automatically use Classic Gold. Existing actor preferences are preserved, and the new leaf is included in taskbar settings exports.

No combat state is changed when selecting an appearance. The 5.0.0 upgrade notes below still apply.

## 5.0.2 patch

This patch makes END TURN automatic without a GM approval dialog. It introduces no data-format or settings migration; the 5.0.0 upgrade notes below still apply.

## 5.0.1 patch

This patch repairs MOVE-mode pointer acquisition and coordinate conversion. It introduces no data-format or settings migration.

## Before upgrading

1. Back up the Foundry world.
2. Note the current Cypher System version; 5.0.0 targets schema 3.5.2 and declares that as its minimum.
3. Install the new archive without renaming its top-level `cypher-taskbar` directory.
4. Test the upgrade on a copy of the world before using it in a live session.

## Actor preferences

Current actor preferences are stored in `flags.cypher-taskbar.taskbarPrefs`. The existing one-time migration reads the legacy client-scoped `actorPreferences` setting for actors the current user owns, merges safe legacy values beneath existing actor flags, and clears the legacy setting only after at least one successful migration.

Unsafe preference keys, including dotted paths and prototype-related keys, are excluded. Existing actor-flag values win over legacy values. The migration does not intentionally delete characters, items, gallery images, or task content.

## Global defaults

Global defaults remain in the world settings `globalTaskbarDefaultsActive` and `globalTaskbarDefaultsData`.

Earlier apply-to-all code wrote an unused `flags.cypher-taskbar.settings` object. Version 5.0.0 instead writes each imported value to `flags.cypher-taskbar.taskbarPrefs.<key>`, which is the location read by the taskbar. No automatic deletion of the obsolete `settings` flag is performed. If an earlier apply-to-all operation appeared to do nothing, open **Global Taskbar Defaults** and apply the imported defaults again.

## GM review and requests

Current review cards include request metadata under `flags.cypher-taskbar`. Legacy cards retain compatibility fallbacks, but older unflagged cards cannot provide the same requester/reviewer coordination. Discard stale pre-upgrade review cards and create fresh requests if their actor or item state changed.

A designated active GM should resolve a request. If that GM is unavailable, the lowest-ID active GM is the fallback. After an uncertain post-mutation failure, inspect the actor before unlocking or recreating a request.

## Optional companions

No companion module is required for the base taskbar. Integrations with Cypher XP, Cypher GM Taskbar, Cypher Cool Items, Cypher Gallery Tabs, Image Hover, and Cypher PC Combat remain feature-detected. Test the exact companion versions in a copied world before upgrading a live game.

## Rollback

Keep the prior release archive and the world backup. Restore both together if rollback is necessary. Rolling back only the module while continuing to edit the world can mix old and new flag formats or request states.
