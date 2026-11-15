# Changelog

## 5.1.1 — 2026-11-15

### END TURN availability repair

- Fixed player END TURN doing nothing when **Load Only For Players** disabled the GM client's visual taskbar. The GM-only early return previously occurred before the socket listener was registered, leaving player instructions unhandled.
- Registered the combat-turn socket independently of taskbar rendering so a headless GM client can validate and advance the encounter while its taskbar remains disabled.
- Removed the duplicate END TURN branch from the general UI socket handler; only the dedicated listener processes these instructions.
- Cached the headless GM handler so replay history survives between socket messages. Ownership, current-combatant, stale-turn, designated-GM, and duplicate-click checks are unchanged.
- Added regression coverage for the END button's dispatch, headless-GM socket advancement, next-combatant updates, stale-turn rejection, replay protection, and registration order before the GM-only rendering return.

### Verification boundary

All 47 automated regression tests and ESLint checks pass. No live Foundry VTT world was available; actual player-to-GM socket delivery and visible tracker advancement still require live verification.

## 5.1.0 — 2026-11-15

### Combat bar appearance presets

- Added **Taskbar Settings → Combat Bar** with six presets: Classic Gold, Aurora Glass, Ember Edge, Nebula Pulse, Verdant Circuit, and Mono Carbon.
- Classic Gold preserves the existing appearance. The five additional presets provide distinct modern action/resource icons, icon colors, tile and bar backgrounds, borders, separators, and resource pips.
- Presets are fixed allowlisted presentation definitions; they do not accept arbitrary icon classes or CSS and do not change combat rules, costs, permissions, movement, targeting, or END TURN behavior.
- The selected preset persists per character through `flags.cypher-taskbar.taskbarPrefs.combatBarPreset`, participates in settings export/import, and falls back safely to Classic Gold when invalid.
- Appearance changes rebuild the combat bar immediately through its render key without advancing or otherwise changing combat state.
- Added selected/unselected text, `aria-pressed`, visible keyboard focus, reduced-motion support, narrow-window card layout, duplicate-click protection, and failed-save rollback with a player-safe error notification.
- Preserved depleted, disabled, movement-dimmed, spell-dimmed, and ability-warning functional states in every theme.

### END TURN tracker verification

- Retained automatic END TURN through Foundry's `Combat#nextTurn()` with no GM approval dialog.
- Added explicit mocked verification that a valid GM action advances the current tracker combatant exactly once; existing player ownership, stale-turn, replay, and duplicate-click checks remain unchanged.

### Verification boundary

All 44 automated regression tests, ESLint, script syntax checks, and JSON checks pass. No live Foundry VTT world was available; actual preset rendering, settings persistence, multiplayer socket delivery, and combat-tracker advancement still require live verification.

## 5.0.2 — 2026-11-15

### Automatic END TURN

- Removed the GM approval dialog from the combat bar's END TURN action.
- GM users advance the encounter directly. Player clicks send an automatic instruction to the designated active GM client because players normally cannot update the Combat document themselves.
- The GM handler revalidates the current encounter, current combatant, and requester's OWNER permission before calling `nextTurn()`; stale, unowned, and replayed instructions do not advance the turn.
- Only the designated active GM processes the instruction, with deterministic lowest-ID active-GM fallback. Immediate duplicate player clicks are suppressed.
- Legacy `gmEndTurnRequest` socket messages use the same automatic behavior during mixed-version transitions.

### Verification boundary

All 40 automated lint/test checks pass, including no-modal player/GM end-turn behavior, ownership, stale-turn, replay, and duplicate-click coverage. No live Foundry VTT world was available; actual multiplayer socket delivery and turn advancement still require live verification.

## 5.0.1 — 2026-11-15

### Combat movement repair

- Fixed MOVE-mode token acquisition and dragging by converting each intercepted pointer event through Foundry V14's documented client/canvas coordinate APIs instead of reading a potentially stale `canvas.mousePosition`.
- Corrected the manual coordinate fallback for renderer/CSS scaling and the full 2D stage transform; applied the same event-specific conversion to TARGETING mode.
- Added pointer-cancellation and lost-pointer-capture cleanup, plus safe handling for unavailable coordinate conversions.
- Added regressions for high-DPI coordinate round trips, stale pointer-tracker state, token acquisition, snapped dragging, and interaction restoration. Movement limits, ownership checks, snapping, costs, and commit rules are unchanged.

### Verification boundary

All 36 automated lint/test checks and script syntax checks pass. The new MOVE coverage uses mocked Foundry/PIXI objects and a lightweight DOM; a live Foundry VTT world was not available, so actual browser/canvas interaction still requires live verification.

## 5.0.0 — 2026-11-15

This is a major debugging, safety, and compatibility release for Foundry VTT v14+ and Cypher System 3.5.2.

### Gameplay and rules repairs

- Centralized Cypher System field access and rules calculations in one compatibility adapter.
- Corrected recovery ordering, additional one-action/ten-minute recoveries, spent-state handling, and native boolean resets.
- Corrected roll success math: natural d20 plus flat bonus is compared with final difficulty × 3 once; natural 1 always fails.
- Corrected aggregate Effort costs, including first-level discounts, impairment, and Speed armor.
- Routed native item rolls through the public Cypher System API and corrected all-in-one dialog invocation.
- Prevented rerolls from repeating pool, ammunition, or action costs and from automatically stacking target damage.
- Hardened recovery allocation, combat joining, movement commits, pool/XP adjustments, and linked-ammunition expenditure against stale state.

### Permissions and shared-world actions

- Added or repaired GM-reviewed rest, combat, XP, attack outcome, cash, valuable, equipment-expenditure, and equipment-removal workflows.
- Chat controls now require recognized module request flags rather than trusting button markup.
- Added requester/reviewer metadata, request replay checks, pending-request freshness checks, and deterministic unavailable-reviewer fallback.
- Cash approval recomputes current funds; insufficient funds and changed requester ownership cancel the mutation.
- Equipment expenditure re-fetches the current actor/item and decrements quantity or removes the item only after approval.
- Review cards remain locked after uncertain post-mutation failures to reduce duplicate spending or deletion.
- Re-fetched and revalidated ownership/state for item drops, valuables, assets, persona, gallery, token, and combatant writes.

### Security and data integrity

- Replaced unsafe rich-text handling with bounded sanitization and escaped user/document text in affected panels.
- Removed a Foundry core logger monkey-patch and retained guarded legacy compatibility behavior.
- Added bounded gallery socket payload validation; payload shape checks are not represented as sender authentication.
- Added prototype-key rejection to global-default and actor-preference writes and migrations.
- Limited settings imports to 1 MB and filtered unknown, nonserializable, or unsafe setting paths.
- Prevented stale asynchronous dialogs from overwriting deleted or reordered tasks, persona entries, and mini-container data.
- Added duplicate-submit and in-flight drop guards, plus rollback/error reporting for failed mini-container persistence.

### UI, optimization, and accessibility

- Repaired mini-menu external refreshes, empty-state transitions, event-handler rebinding, reordering, editing, and tooltip cleanup.
- Removed duplicate STUFF handlers, nested interactive controls, stale tooltip writes, and detached-element refresh issues.
- Deduplicated applications/listeners, reduced redundant rendering/DOM writes, and disconnected observers during cleanup.
- Preserved scoped selectors and custom properties without introducing a cascade layer that could reduce compatibility with Foundry and popup styles.
- Improved keyboard behavior, visible focus, labels, reduced-motion handling, and narrow-window layouts.
- Gated routine console logging behind `CONFIG.debug.cypherTaskbar` while retaining actionable error diagnostics.

### Configuration, localization, and release

- Restored the Global Defaults menu with ApplicationV2/DialogV2 and GM-only confirmation for apply/clear operations.
- Fixed **Apply to All Actors** to write `taskbarPrefs` leaves—the same preferences consumed by the taskbar—rather than an unused `settings` flag.
- Expanded English localization for global defaults, GM review, cash, tasks, mini containers, and errors.
- Corrected repository, manifest, documentation, issue, and release-download URLs.
- Added regression tests, upgrade notes, verification documentation, and reproducible development commands.

### Verification boundary

JavaScript syntax, JSON parsing, ESLint, mocked regression tests, and archive-structure checks are automated. No live Foundry VTT/Cypher System world was available for this release process; live installation, multiplayer sockets, actual document permissions, gameplay, persistence across live reloads, upgrades, and optional-module compatibility still require the checklist in [VERIFICATION.md](VERIFICATION.md).
