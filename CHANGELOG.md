# Changelog

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
