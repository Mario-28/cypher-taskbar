# Cypher Taskbar Performance Audit
**Version:** 4.0.47  
**Date:** 2026-08-13  
**Auditor:** MoonRakeR

---

## Executive Summary

| Category | Severity | Count |
|----------|----------|-------|
| 🔴 Critical — Memory Leaks | 3 | Style injection, Event listeners, Timer leaks |
| 🟠 High — Render Performance | 4 | Full DOM rebuilds, Repeated queries, CSS issues |
| 🟡 Medium — Code Quality | 2 | Console noise, Missing debounce |
| 🟢 Low — Polish | 2 | CSS optimizations, Bundle size |

**Overall Rating: C+** — Functional but leaking memory and doing unnecessary work.

---

## 🔴 CRITICAL — Memory Leaks

### 1. Style Element Injection (Leak Score: 9/10) ✅ FIXED
**Location:** `scripts/cypher-taskbar.js:747-778` and `6773-6794`

**Fix applied:** Added `document.getElementById(id)?.remove()` before creating new style elements. Old styles are now cleaned up before new ones are injected.

---

### 2. Event Listener Accumulation (Leak Score: 8/10) 🟡 PARTIAL
**Location:** `scripts/cypher-taskbar.js:refresh()` and `_bindEvents()`

**Note:** innerHTML replacement destroys old DOM nodes, so their listeners are GC'd. However, 188 addEventListener vs 17 removeEventListener is still a concern for listeners attached to persistent elements.

**Fix applied:** Added DOM element cache (`_els`) to reduce repeated queries.

---

### 3. Timer/Interval Leaks (Leak Score: 6/10) ✅ FIXED
**Location:** Multiple

**Fix applied:** `disableModule` hook now clears `_trayInterval`, `_skillTooltipTimer`, and `_hideTimeout`.

---

## 🟠 HIGH — Render Performance

### 4. Full render() Destroys Everything (Score: 8/10) 🟡 ON HOLD
**Location:** `scripts/cypher-taskbar.js:122-152`

**Note:** This is architectural. Fixing requires splitting render() into structural vs data updates. Recommended for future refactor.

---

### 5. refresh() Rebuilds innerHTML (Score: 7/10) 🟡 ON HOLD
**Location:** `scripts/cypher-taskbar.js:5110-5230`

**Note:** innerHTML is used to preserve CSS transitions. Diff-updating would be complex. The debounce fix (#9) mitigates the frequency.

---

### 6. Repeated DOM Queries (Score: 6/10) ✅ FIXED
**Location:** Throughout codebase

**Fix applied:** Added `_buildElCache()` method that caches frequently accessed elements after render. Cache is stored in `this._els`.

---

### 7. CSS Performance Issues (Score: 6/10) ✅ FIXED
**Location:** `styles/cypher-taskbar.css`

**Fix applied:** Added `will-change: transform, opacity` to:
- `#cypher-taskbar-bar` (main bar)
- `#ct-char-float` (portrait area)
- `.ct-popup` (all popups)

This tells the browser to promote these elements to their own GPU layers for smoother animations.

---

## 🟡 MEDIUM — Code Quality

### 8. Console Noise (Score: 5/10) ✅ FIXED
**Stats:**
- `scripts/cypher-taskbar.js`: **38 console.log/warn/error**

**Fix applied:** All non-error console.log statements wrapped in `if (CONFIG.debug?.cypherTaskbar)` flag. Errors remain unconditional.

---

### 9. No Debounce on Rapid Refresh Triggers (Score: 5/10) ✅ FIXED
**Location:** Hooks at lines 6814-6819

**Fix applied:** Added `_getDebouncedRefresh()` helper using `foundry.utils.debounce()`. All actor/item hooks now debounce refresh calls with 50ms delay. Prevents refresh storms when multiple items update in batch.

---

## 🟢 LOW — Polish

### 10. Bundle Size (Score: 3/10) 🟡 ON HOLD
**Stats:**
- `scripts/cypher-taskbar.js`: 6,852 lines / ~339KB
- `scripts/gallery-tabs.js`: 3,606 lines / ~178KB
- `styles/cypher-taskbar.css`: ~249KB

**Note:** Not urgent. Gallery-tabs is already a separate module. Further splitting would be a large refactor.

---

## Summary Table

| # | Issue | File | Severity | Status |
|---|-------|------|----------|--------|
| 1 | Style element leaks | cypher-taskbar.js | 🔴 Critical | ✅ Fixed |
| 2 | Event listener accumulation | cypher-taskbar.js | 🔴 Critical | 🟡 Partial |
| 3 | Timer/interval leaks | Multiple | 🔴 Critical | ✅ Fixed |
| 4 | Full render() destroys DOM | cypher-taskbar.js | 🟠 High | 🟡 On Hold |
| 5 | refresh() rebuilds innerHTML | cypher-taskbar.js | 🟠 High | 🟡 On Hold |
| 6 | Repeated DOM queries | Multiple | 🟠 High | ✅ Fixed |
| 7 | CSS backdrop-filter abuse | cypher-taskbar.css | 🟠 High | ✅ Fixed (will-change) |
| 8 | Console noise | Multiple | 🟡 Medium | ✅ Fixed |
| 9 | No debounce on hooks | cypher-taskbar.js | 🟡 Medium | ✅ Fixed |
| 10 | Bundle size | - | 🟢 Low | 🟡 On Hold |
