# 5.0.1 Verification

Verification date: 2026-11-15.

## Automated checks

The release source is checked with:

```sh
npm run lint
npm test
```

The regression suite uses Node.js, mocked Foundry documents/services, and a lightweight DOM. It exercises:

- Native recovery mapping, additional recoveries, ordering, spent states, and reset updates.
- Roll thresholds, flat bonuses, natural 1, aggregate Effort, and malformed numeric input.
- GM request-ID validation, replay rejection, bounded replay history, and pending-request freshness.
- Equipment quantity decrement/removal and stale/unowned document rejection.
- Preference leaf writes, migration merge behavior, permission checks, and prototype-key rejection.
- Global-default import normalization and apply-to-all persistence paths.
- Rich-text sanitization, malformed colors, bounded masonry settings, and gallery payload bounds.
- Mini-container malformed data, prototype-like override keys, capacity, duplicate drops, and persistence failure.
- Current-state XP, pool, ammunition, rest, reroll, and task persistence behavior.
- Event-specific V14 canvas coordinate conversion, scaled inverse-transform fallback, MOVE token acquisition with a stale pointer tracker, snapped dragging, and token/stage interaction restoration.
- Static invariants for dynamic execution, core logger patching, v14 chat hooks, request authority, and selector construction.

Separate release checks parse JSON, run `node --check` on every module script, inspect the archive manifest, verify the top-level `cypher-taskbar` directory, reject unwanted development dependencies, and compare archive contents with the intended release files.

Expected test-side error logs from deliberate failure-path tests do not indicate a failed test; the test runner summary is authoritative.

## Not exercised in a live Foundry world

No running Foundry VTT v14/Cypher System 3.5.2 server or connected GM/player clients were available during this process. Therefore, the automated result does **not** prove live installation, rendering, gameplay, socket delivery, document permissions, persistence, upgrades, or optional-module interoperability.

## Required live checklist

Before publishing or using the release in a production game, test on a copied world:

1. Install from the ZIP, enable the module, restart Foundry, and confirm no initialization errors.
2. Upgrade a copied world containing legacy actor preferences and global defaults; verify values before and after reload.
3. Test player and GM accounts, including actors with OWNER, non-owner, and revoked-during-dialog permissions.
4. Exercise pools, XP, recovery order/additional recoveries/rest, native item/attribute rolls, Effort, rerolls, attacks, ammunition, equipment expenditure/removal, valuables, and cash approval/denial.
5. With two GM clients, verify designated-reviewer behavior, unavailable-reviewer fallback, replay rejection, denial, insufficient funds, and uncertain-failure locking.
6. Verify same-turn utility-pip reconciliation and no pip loss after denied equipment requests.
7. Enter each MOVE option, left-drag the intended PC token from its visible footprint, verify its live distance/ruler and range clamp, then test UNDO, EXIT, FINISH, Escape, pointer cancellation, and resource spending. Repeat with browser zoom/high DPI and after panning/zooming the canvas. Verify scene-correct combatant creation, combat approval, attack outcomes, and turn controls.
8. Verify task creation/edit/delete, mini-container add/remove/reorder/edit, persona fields, galleries, artwork, and persistence after reload.
9. Test with every optional companion disabled, then with the exact supported companion versions enabled.
10. Check keyboard-only use, visible focus, reduced motion, and narrow windows; inspect the console for unexpected errors.
11. Confirm no unexpected writes outside `flags.cypher-taskbar`, registered settings, native document fields required by the action, or the documented foreign compatibility namespaces.

Record actual Foundry, Cypher System, browser, and companion versions with the live test results.
