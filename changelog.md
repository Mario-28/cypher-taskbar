# Changelog

## v4.1.78 — Gallery feature sync (Phase 2)

Synced the taskbar's embedded gallery fork with `cypher-gallery-tabs` v1.13.x features and fixed a phase-1 styling regression.

### Added
- **Tokens tab** (`__cgt_tokens__`) in the taskbar gallery — same actor flag (`tokensImages`) as the module, so art added in either place shows in both:
  - Strip button between Wardrobe and Videos (configurable background/icon color + icon via right-click → Tokens Tab Settings; fixed tab, never deletable — mirrors module).
  - Full panel support: add via URL/browse, edit, favorite, remove, drag-to-reorder, columns/gap/fit layout options, per-item context menu.
  - "Change Current Token Art" context action available from Tokens (and Wardrobe).
- **Module-faithful strip styling**: special buttons now match the module look — Wardrobe = black plate + white shirt + count tooltip (`Wardrobe (N)`), Tokens = configured colors + pawn, Videos = navy/purple + count, Favorites = crimson gradient + pink heart. Button order matches the module: tabs → favorites → (+) → wardrobe → tokens → videos.

### Changed
- **Favorites tab now mirrors the module**: lists regular-tab favorites only (wardrobe favorites no longer aggregated — they were invisible in the module's own favorites tab).
- **Token art fallback**: changing current token art with no token selected now updates the actor's prototype token AND all placed tokens of that actor (module v1.13.1 behavior), instead of warning and doing nothing.
- **Tokens notifications**: adding art from the Tokens panel reports "Token art added to gallery."

### Fixed
- **Phase-1 styling regression**: with the gallery module active, the fork injected zero CSS → unstyled taskbar strip/panel chrome. The fork now always injects its CSS minus the 25 rules the module owns (filtered at injection time), so the strip, dialogs, and panel chrome stay styled without fighting the module's sheet.

## v4.1.77 — Gallery integration hardening (Phase 1)

Integration audit between the taskbar's embedded gallery fork (`gallery-tabs.js`) and the real `cypher-gallery-tabs` module. Phase 1 = crashers, socket ownership, CSS pollution.

### Fixed
- **Add-Tab crash on the gallery strip**: `taskbar.renderGallery()` did not exist → TypeError. Added a real `renderGallery()` method to the taskbar class (rebuilds the strip above the bar) and routed the refresh path through it.
- **Dead gallery refresh**: `_refreshGallery()` looked for `window.cypherTaskbar.instances` which was never registered. The ready hook now registers `window.cypherTaskbar = CypherTaskbar` and the refresh uses `CypherTaskbar.instance`.
- **Listener stacking**: `bindGalleryStripEvents()` re-attached its listeners to the same persistent bar element on every partial refresh → multiplied handlers (suspected cause of the Sep-6 flicker / menus-stopping bug). Now bound once per element (idempotent guard); handlers delegate via `closest()`.
- **Triple socket handling**: the taskbar registered two `module.cypher-gallery-tabs` showImage listeners on top of the gallery module's own → stacked lightboxes and duplicate GM chat, all fighting over one `#cgt-lightbox` element. The taskbar now keeps a single handler and it no-ops entirely when the gallery module is active (module owns shares then). The second listener (`initGallerySocket`) no longer registers.
- **Invalid share mode**: the forked panel sent `shareMode: "select"` which every validator rejects → "show to selected players" from the taskbar panel silently did nothing. Now sends `"selected"`.
- **CSS pollution**: the fork injected its replica `.cgt-*` stylesheet globally whenever the strip built, colliding with 25 classes of the real module's panel/lightbox/context menu. The fork CSS now injects only when the gallery module is NOT active.
- **Cross-panel kills**: taskbar render/refresh and strip clicks did global `document.querySelector(".cgt-panel")` — could close or raw-remove the gallery module's sheet panel (orphaning its ApplicationV2 instance). All lookups are now scoped to `[data-cgt-owner="taskbar"]`; the fork panel marks itself with that attribute.

### Test checklist
- Add a tab from the taskbar gallery strip → strip refreshes, no console error.
- Right-click a tab → settings → save/cancel → strip updates.
- Share an image to selected players from the taskbar panel → only chosen users get the lightbox.
- With gallery module active: share from either side → exactly one lightbox, one GM chat line; visuals unchanged.
