import { MODULE_ID } from "./utils.js";

/**
 * Combat Bar — per-turn PC automation strip (v4.1.86)
 *
 * Separated from cypher-taskbar.js on purpose: all combat-bar logic lives here
 * so future bar changes never touch the main file beyond the thin wiring
 * (import/apply, one template line in _buildFloating, combat hook lines,
 * one socket case, one _updateCombatBar() call inside refresh()).
 *
 * The bar renders inside .ct-portrait-wrap, right of the recovery drops, and
 * only while an active combat's current combatant is the tracked PC (or any
 * PC owned by this user when no actor is tracked).
 */

const _CB_MM_TIPS = {
  short:  { title: "SHORT MOVE",        dist: "~15 m",  max: 15, cost: "1 move + 1 action",          body: "Cover short ground as your entire action — no room left for attacks." },
  imm:    { title: "IMMEDIATE MOVE",    dist: "~3 m",   max: 3,  cost: "1 move",                     body: "Shuffle to an adjacent spot or grab something within reach, action untouched." },
  long:   { title: "LONG",              dist: "~15–30 m", max: 30, cost: "1 move + 1 action + 1 utility", body: "Full sprint — beat a Speed roll vs difficulty 4: success runs 30 m, a failed roll still carries you 15 m." },
  shorta: { title: "SHORT MOVE ACTION", dist: "~15 m",  max: 15, cost: "1 move (success) · 1 move + 1 action (failure)", body: "Dash 15 m and keep your action — beat a Speed roll vs difficulty 4, or the stumble costs you the action too." },
};

/* Roll-gated move options: LONG and SHORT MOVE ACTION open the taskbar's Speed
 * attribute roll (difficulty 4) before MOVE MODE. The outcome picks the cap and
 * the pip cost — pips spend on FINISH via mode.cost, like every other option. */
const _CB_ROLL_MOVES = {
  long: {
    title: "LONG MOVE — SPEED ROLL",
    success: { cap: 30, cost: "move,action,utility", label: "1 move + 1 action + 1 utility" },
    failure: { cap: 15, cost: "move,action,utility", label: "1 move + 1 action + 1 utility" },
    toastSuccess: "Speed roll succeeded — LONG MOVE up to 30 m.",
    toastFailure: "Speed roll failed — LONG MOVE limited to 15 m.",
  },
  shorta: {
    title: "SHORT MOVE ACTION — SPEED ROLL",
    success: { cap: 15, cost: "move", label: "1 move — action preserved" },
    failure: { cap: 15, cost: "move,action", label: "1 move + 1 action" },
    toastSuccess: "Speed roll succeeded — move 15 m, action preserved.",
    toastFailure: "Speed roll failed — still 15 m, but the action is spent.",
  },
};

export function applyCombatBar(CypherTaskbar) {
  Object.assign(CypherTaskbar.prototype, {

    /* ── State ──────────────────────────────────────────────────────────── */

    /** Current bar state, or null when the bar should not exist. */
    _cbState() {
      const combat = game.combat;
      if (!combat || !combat.started) return null;
      const combatant = combat.combatant ?? null;
      if (!combatant || combatant.isDefeated) return null;
      const actor = combatant.actor ?? null;
      if (!actor || actor.type !== "pc") return null;
      const tracked = this.actor;
      const mine = tracked ? actor.id === tracked.id
                           : (actor.isOwner || actor.testUserPermission?.(game.user, "OWNER"));
      if (!mine) return null;
      return {
        combatId: combat.id,
        combatantId: combatant.id,
        needInitiative: combatant.initiative == null
      };
    },

    /** Stable key used to decide whether an existing bar node is stale. */
    _cbKey(st) {
      return st ? `${st.combatId}:${st.combatantId}:${st.needInitiative ? 1 : 0}` : "";
    },

    /* ── Markup ─────────────────────────────────────────────────────────── */

    /** Returns "" when hidden — callers splice it straight into the template. */
    _buildCombatBar(actor) {
      const st = this._cbState();
      if (!st) return "";
      // 30px gap from the recovery drops: recovery bar is at left:calc(50% + space),
      // 4 drops × 22px + 3×2px gap + 16px padding = 110px wide.
      const space = this._gs("recoverySpace") ?? 98;
      const off = space + 110 + 30;
      return `
        <div class="ct-combat-bar" data-cb-key="${this._cbKey(st)}" style="--ct-cb-off:${off}px">
          <button class="ct-cb-btn ct-cb-target" data-cb-action="target" title="Target"><i class="fas fa-crosshairs"></i></button>
          <button class="ct-cb-btn ct-cb-move" data-cb-action="move" title="Move"><i class="fas fa-person-running"></i></button>
          <span class="ct-cb-spacer"></span>
          <button class="ct-cb-btn ct-cb-attack" data-cb-action="attack" title="Attack"><i class="fas fa-sword"></i></button>
          <button class="ct-cb-btn" data-cb-action="ability" title="Ability"><i class="fas fa-bolt"></i></button>
          <button class="ct-cb-btn" data-cb-action="spell" title="Spell"><i class="fas fa-wand-magic-sparkles"></i></button>
          <button class="ct-cb-btn" data-cb-action="skill" title="Skill"><i class="fas fa-brain"></i></button>
          <button class="ct-cb-btn" data-cb-action="item" title="Item"><i class="fas fa-backpack"></i></button>
          <button class="ct-cb-btn" data-cb-action="other" title="Other"><i class="fas fa-ellipsis"></i></button>
          <span class="ct-cb-sep"></span>
          <div class="ct-cb-res-row">
            <span class="ct-cb-res" data-cb-res="move" title="Move resource"><i class="fas fa-shoe-prints"></i><span class="ct-cb-res-val">1</span></span>
            <span class="ct-cb-res" data-cb-res="action" title="Action resource"><i class="fas fa-hand-fist"></i><span class="ct-cb-res-val">1</span></span>
            <span class="ct-cb-res" data-cb-res="utility" title="Utility resource"><i class="fas fa-screwdriver-wrench"></i><span class="ct-cb-res-val">1</span></span>
          </div>
          <button class="ct-cb-btn ct-cb-end" data-cb-action="end" title="End Turn"><i class="fas fa-forward-step"></i><span>END</span></button>
        </div>`;
    },

    /* ── In-place DOM update (called from combat hooks + refresh) ───────── */

    /** Inserts / refreshes / removes the bar without a full re-render. */
    _updateCombatBar() {
      this._cbReapMoveMode?.();
      const wrap = this.element?.querySelector?.(".ct-portrait-wrap");
      if (!wrap) return;
      const existing = wrap.querySelector(":scope > .ct-combat-bar");
      const html = this._buildCombatBar(this.actor ?? null);
      if (!html) { this._cbCloseMoveMenu(); existing?.remove(); return; }
      if (existing && existing.dataset.cbKey === this._cbKey(this._cbState())) return;
      this._cbCloseMoveMenu();
      const tpl = document.createElement("template");
      tpl.innerHTML = html.trim();
      const node = tpl.content.firstElementChild;
      if (existing) existing.replaceWith(node); else wrap.appendChild(node);
      this._bindCombatBar(node);
    },

    _bindCombatBar(node) {
      node.querySelectorAll("[data-cb-action]").forEach(btn => {
        if (btn.dataset.cbAction === "move") {
          btn.onclick = async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            this._cbToggleMoveMenu(btn);
          };
          return;
        }
        btn.onclick = async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          await this._cbDispatch(btn.dataset.cbAction);
        };
      });
      this._cbSyncMoveBtn();
      this._cbSyncAttackBtn();
    },

    /* ── Actions ────────────────────────────────────────────────────────── */

    async _cbDispatch(action) {
      const st = this._cbState();
      if (!st && action !== "end") return;
      switch (action) {
        // TODO(combat-bar): wire behaviors + resource costs in the automation pass.
        case "target":  this._cbEnterTargeting(); break;
        case "attack": {
          // Greyed out (no target / no action pip) — the click is a no-op.
          const atkBtn = this.element?.querySelector?.(".ct-cb-attack");
          if (atkBtn && !atkBtn.classList.contains("ct-cb-disabled")) {
            this._togglePanel("combat", this.element?.querySelector('.ct-btn[data-panel="combat"]'));
          }
          break;
        }
        case "move":    /* movement */ break;
        case "ability": /* ability use */ break;
        case "spell":   /* spell use */ break;
        case "skill":   /* skill roll */ break;
        case "item":    /* item use */ break;
        case "other":   /* misc action */ break;
        case "end":     await this._cbEndTurn(st); break;
      }
    },

    /* ── Targeting mode ───────────────────────────────────────────
       Full-screen acquire: hide taskbar/sidebars, blur the edges,
       crosshair cursor. Left-click a token = single target + exit.
       Ctrl+Left-click = stack targets; FINISH TARGETING slides in
       once two are marked. ESC cancels and releases this session's
       picks. Clicks are intercepted at document capture phase so
       Foundry's canvas handlers never see them. ──────────────── */
    _cbEnterTargeting() {
      if (this._targeting?.active) return;
      if (!canvas?.ready) return;
      const t = this._targeting = { active: true, acquired: [] };
      document.body.classList.add("ct-targeting");

      const el = document.createElement("div");
      el.className = "ct-targeting-overlay";
      el.innerHTML = `
        <div class="ct-targeting-vignette"></div>
        <div class="ct-targeting-window">
          <div class="ct-targeting-title">TARGETING MODE</div>
          <div class="ct-targeting-hint">Hover a token and Left-click to target it &nbsp;·&nbsp; hold Ctrl and Left-click to add multiple targets &nbsp;·&nbsp; ESC to cancel</div>
          <button class="ct-targeting-finish" type="button"><i class="fas fa-crosshairs"></i> FINISH TARGETING</button>
        </div>`;
      document.body.appendChild(el);
      t.el = el;
      el.querySelector(".ct-targeting-finish").addEventListener("click", () => this._cbExitTargeting(false));

      t.onDown = (e) => this._cbTargetingDown(e);
      t.onCtx  = (e) => { if (this._targeting?.active) e.preventDefault(); };
      t.onKey  = (e) => { if (e.key === "Escape" && this._targeting?.active) this._cbExitTargeting(true); };
      document.addEventListener("pointerdown", t.onDown, true);
      document.addEventListener("mousedown", t.onDown, true);
      document.addEventListener("contextmenu", t.onCtx, true);
      document.addEventListener("keydown", t.onKey, true);
    },

    _cbTokenAt(clientX, clientY) {
      const view = canvas.app?.view;
      if (!view) return null;
      const rect = view.getBoundingClientRect();
      const pt = PIXI?.Point ? new PIXI.Point(clientX - rect.left, clientY - rect.top)
                             : { x: clientX - rect.left, y: clientY - rect.top };
      const world = canvas.app.stage.worldTransform.applyInverse(pt);
      return canvas.tokens.placeables.find(tok => tok.visible && tok.bounds.contains(world.x, world.y)) ?? null;
    },

    _cbTargetingDown(e) {
      const t = this._targeting;
      if (!t?.active) return;
      // pointerdown + mousedown both fire for mouse input — process once
      if (e.type === "mousedown" && t.lastDownAt && Date.now() - t.lastDownAt < 500) return;
      if (e.type === "pointerdown") t.lastDownAt = Date.now();
      if (e.target.closest?.(".ct-targeting-overlay")) return; // let FINISH work
      const view = canvas.app?.view;
      if (!view || !view.contains(e.target)) return;          // other UI: pass through
      e.preventDefault();
      e.stopPropagation();
      const token = this._cbTokenAt(e.clientX, e.clientY);
      if (!token) return;

      if (e.button === 0) {
        if (e.ctrlKey) {
          // Ctrl+Left-click: stack (or unstack) a target, stay in acquire mode
          try {
            const already = typeof token.isTargeted === "function"
              ? !!token.isTargeted(game.user)
              : !!(game.user.targets?.has?.(token.document));
            token.setTarget(!already, { user: game.user, releaseOthers: false });
            if (!already) t.acquired.push(token.document.id);
            this._cbSyncFinish();
          } catch (err) {
            console.error(`${MODULE_ID} | multi-target failed`, err);
            ui.notifications?.error?.("Targeting failed — check console (F12).");
          }
          return;
        }
        try {
          token.setTarget(true, { user: game.user, releaseOthers: true });
        } catch (err) {
          console.error(`${MODULE_ID} | setTarget failed`, err);
          ui.notifications?.error?.("Targeting failed — check console (F12).");
        }
        this._cbExitTargeting(false);
      }
      // Right-click is not a targeting gesture — the contextmenu capture
      // listener still suppresses the browser menu while acquiring.
    },

    _cbSyncFinish() {
      const t = this._targeting;
      if (!t?.active) return;
      const size = game.user.targets?.size ?? 0;
      t.el?.querySelector(".ct-targeting-window")?.classList.toggle("has-multi", size >= 2);
    },

    _cbExitTargeting(cancelled) {
      const t = this._targeting;
      if (!t?.active) return;
      t.active = false;
      document.removeEventListener("pointerdown", t.onDown, true);
      document.removeEventListener("mousedown", t.onDown, true);
      document.removeEventListener("contextmenu", t.onCtx, true);
      document.removeEventListener("keydown", t.onKey, true);
      document.body.classList.remove("ct-targeting");
      t.el?.remove();
      if (cancelled && t.acquired.length) {
        for (const tok of canvas.tokens.placeables) {
          if (t.acquired.includes(tok.document.id) && game.user.targets.has(tok.document)) {
            try { tok.setTarget(false, { user: game.user, releaseOthers: false }); } catch { /* ignore */ }
          }
        }
      }
      this._targeting = null;
    },

    /* ── MOVE popup: two-column expenditure menu ─────────────────────────
       Columns: MOVE (short/immediate) and CHECK MOVE (long/short action).
       Each option decrements the matching resource pips on the bar.
       Pips reset to the template defaults whenever the bar rebuilds
       (combatant/initiative change) — real per-turn persistence lands with
       the combat automation pass. ────────────────────────────────────── */
    _cbToggleMoveMenu(anchor) {
      if (this._cbMoveMenu) { this._cbCloseMoveMenu(); return; }
      // No move pips left — the button is greyed out; never open the menu.
      if (this._cbMovePipsLeft() <= 0) return;
      const menu = document.createElement("div");
      menu.className = "ct-cb-move-menu";
      menu.innerHTML = `
        <div class="ct-cb-mm-col">
          <div class="ct-cb-mm-title">MOVE</div>
          <button type="button" class="ct-cb-mm-opt ct-mm-blue" data-cb-cost="move,action" data-mm-tip="short">
            <span class="ct-cb-mm-name">SHORT MOVE</span>
          </button>
          <button type="button" class="ct-cb-mm-opt ct-mm-green" data-cb-cost="move" data-mm-tip="imm">
            <span class="ct-cb-mm-name">IMMEDIATE MOVE</span>
          </button>
        </div>
        <div class="ct-cb-mm-col">
          <div class="ct-cb-mm-title">CHECK MOVE</div>
          <button type="button" class="ct-cb-mm-opt ct-mm-amber" data-cb-cost="move,action,utility" data-mm-tip="long">
            <span class="ct-cb-mm-name">LONG</span>
          </button>
          <button type="button" class="ct-cb-mm-opt ct-mm-teal" data-cb-cost="move" data-mm-tip="shorta">
            <span class="ct-cb-mm-name">SHORT MOVE ACTION</span>
          </button>
        </div>`;
      document.body.appendChild(menu);
      // Bottom-left corner of the menu sits just above the MOVE button.
      const r = anchor.getBoundingClientRect();
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      const left = Math.min(Math.max(8, r.left), window.innerWidth - mw - 8);
      menu.style.left = `${left}px`;
      menu.style.top = `${Math.max(8, r.top - mh - 10)}px`;

      menu.querySelectorAll("[data-cb-cost]").forEach(opt => {
        opt.onclick = (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const key = opt.dataset.mmTip, cost = opt.dataset.cbCost;
          this._cbCloseMoveMenu();
          if (_CB_ROLL_MOVES[key]) { this._cbRollMove(key); return; }
          this._cbEnterMoveMode(key, cost);
        };
      });

      // Shared tooltip element, tinted per-tile via the --acc CSS variable.
      const tip = document.createElement("div");
      tip.className = "ct-mm-tip";
      document.body.appendChild(tip);
      this._cbMmTip = tip;
      menu.querySelectorAll("[data-mm-tip]").forEach(opt => {
        const show = () => this._cbMmShowTip(opt, tip);
        opt.addEventListener("mouseenter", show);
        opt.addEventListener("mouseleave", () => tip.classList.remove("show"));
        opt.addEventListener("focus", show);
        opt.addEventListener("blur", () => tip.classList.remove("show"));
      });

      this._cbMoveMenu = menu;
      this._cbMoveMenuClose = (e) => {
        if (menu.contains(e.target) || anchor.contains(e.target)) return;
        this._cbCloseMoveMenu();
      };
      this._cbMoveMenuEsc = (e) => { if (e.key === "Escape") this._cbCloseMoveMenu(); };
      setTimeout(() => {
        document.addEventListener("pointerdown", this._cbMoveMenuClose, true);
        document.addEventListener("keydown", this._cbMoveMenuEsc, true);
      }, 0);
    },

    _cbCloseMoveMenu() {
      if (!this._cbMoveMenu) return;
      document.removeEventListener("pointerdown", this._cbMoveMenuClose, true);
      document.removeEventListener("keydown", this._cbMoveMenuEsc, true);
      this._cbMoveMenu.remove();
      this._cbMoveMenu = null;
      this._cbMoveMenuClose = null;
      this._cbMoveMenuEsc = null;
      this._cbMmTip?.remove();
      this._cbMmTip = null;
    },

    /** Position + fill the shared tooltip for one option tile. */
    _cbMmShowTip(opt, tip) {
      const info = _CB_MM_TIPS[opt.dataset.mmTip];
      if (!info) return;
      const acc = getComputedStyle(opt).getPropertyValue("--acc").trim() || "150, 180, 220";
      tip.style.setProperty("--acc", acc);
      tip.innerHTML = `
        <div class="ct-mm-tip-title">${info.title}<span class="ct-mm-tip-dist">${info.dist}</span></div>
        <div class="ct-mm-tip-body">${info.body}</div>
        <div class="ct-mm-tip-cost">${info.cost}</div>`;
      tip.classList.add("show");
      const r = opt.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      const left = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(8, r.top - th - 12)}px`;
      tip.style.setProperty("--tip-x", `${r.left + r.width / 2 - left}px`);
    },

    /** Current move-pip count on the bar (0 when the bar/pip is absent). */
    _cbMovePipsLeft() {
      const val = this.element?.querySelector?.('.ct-cb-res[data-cb-res="move"] .ct-cb-res-val');
      const n = parseInt(val?.textContent, 10);
      return Number.isNaN(n) ? 0 : n;
    },

    /** Grey out / re-enable the ATTACK button from targets + action pips. */
    _cbSyncAttackBtn() {
      const btn = this.element?.querySelector?.(".ct-cb-attack");
      if (!btn) return;
      const noTarget = !(game.user?.targets?.size > 0);
      const noAction = this._cbActionPipsLeft() <= 0;
      const blocked = noTarget || noAction;
      btn.classList.toggle("ct-cb-disabled", blocked);
      btn.title = blocked
        ? (noTarget ? "Target a token first (TARGET button)" : "No action remaining")
        : "Attack";
    },

    /** Current action-pip count on the bar (0 when the bar/pip is absent). */
    _cbActionPipsLeft() {
      const val = this.element?.querySelector?.('.ct-cb-res[data-cb-res="action"] .ct-cb-res-val');
      const n = parseInt(val?.textContent, 10);
      return Number.isNaN(n) ? 0 : n;
    },

    /** Grey out / re-enable the MOVE button from the current move-pip count. */
    _cbSyncMoveBtn() {
      const left = this._cbMovePipsLeft();
      const btn = this.element?.querySelector?.(".ct-cb-move");
      if (!btn) return;
      btn.classList.toggle("ct-cb-disabled", left <= 0);
      btn.title = left > 0 ? "Move" : "No move remaining";
    },

    /** Decrement one resource pip (move/action/utility), floor at 0. Returns true if a pip was spent. */
    _cbExpendResource(kind) {
      const pip = this.element?.querySelector?.(`.ct-cb-res[data-cb-res="${kind}"]`);
      const val = pip?.querySelector?.(".ct-cb-res-val");
      if (!pip || !val) return false;
      const cur = parseInt(val.textContent, 10);
      if (Number.isNaN(cur)) return false;
      const next = Math.max(0, cur - 1);
      val.textContent = String(next);
      pip.classList.toggle("ct-cb-res-empty", next <= 0);
      if (kind === "move") this._cbSyncMoveBtn();
      if (kind === "action") this._cbSyncAttackBtn();
      return next < cur;
    },

    /** Roll-gated move (LONG, SHORT MOVE ACTION): the taskbar's own Speed attribute
     *  roll dialog at difficulty 4 — the same one clicking Speed on the taskbar opens.
     *  Success/failure pick the distance cap AND the pip cost; pips spend on FINISH. */
    _cbRollMove(key) {
      const cfg = _CB_ROLL_MOVES[key];
      if (!cfg) return;
      this._cbCloseMoveMenu();
      const actor = this.actor;
      if (!actor) {
        ui.notifications?.warn?.(`${cfg.title.split(" — ")[0]} needs your character tracked on the taskbar.`);
        return;
      }
      // Resolves with the achieved total (die + ease modifiers); null when cancelled
      // or when the roll itself threw. Effort is paid + chat card posted inside.
      (async () => {
        const achieved = await this._openNativeAttributeRollDialog(actor, "Speed", {
          title: cfg.title,
          presetDifficulty: 4
        });
        if (achieved == null) {
          console.log(`${MODULE_ID} | ${cfg.title} cancelled or failed — no move mode`);
          return; // cancelled — nothing spent, no move mode
        }
        // Achieved total vs the ORIGINAL difficulty×3 is exactly die vs the
        // eased target (the +3 per ease level lands on both sides).
        const success = Number(achieved) >= 12;
        const out = success ? cfg.success : cfg.failure;
        console.log(`${MODULE_ID} | ${cfg.title}: achieved ${achieved} — ${success ? "SUCCESS" : "FAILURE"} — ${out.cap} m, costs ${out.cost}`);
        ui.notifications?.info?.(success ? cfg.toastSuccess : cfg.toastFailure);
        this._cbEnterMoveMode(key, out.cost, { max: out.cap, costLabel: out.label });
      })();
    },

    /** Enter MOVE MODE: hide the UI, show instruction window + blue vignette, arm token drag.
     *  `cost` is the EFFECTIVE pip spend (may differ from the menu tile on roll failure).
     *  `overrides.max` replaces the option's default distance; `overrides.costLabel`
     *  replaces the cost line shown in the window. */
    _cbEnterMoveMode(key, cost, overrides = {}) {
      try {
        if (this._cbMoveMode) return;
        const base = _CB_MM_TIPS[key];
        if (!base) return;
        const info = { ...base,
          ...(overrides.max ? { max: overrides.max, dist: `~${overrides.max} m` } : {}),
          ...(overrides.costLabel ? { cost: overrides.costLabel } : {}) };
        document.body.classList.add("ct-move-mode");
        const overlay = document.createElement("div");
        overlay.className = "ct-move-overlay";
        overlay.innerHTML = `
          <div class="ct-move-vignette"></div>
          <div class="ct-move-window">
            <div class="ct-move-head">
              <span class="ct-move-title">${info.title}</span>
              <span class="ct-move-dist">${info.dist}</span>
            </div>
            <div class="ct-move-body">${info.body}</div>
            <div class="ct-move-cost">${info.cost}</div>
            <div class="ct-move-live">0 / ${info.max} m</div>
            <div class="ct-move-actions">
              <button type="button" class="ct-move-undo"><i class="fas fa-rotate-left"></i> UNDO MOVE</button>
              <button type="button" class="ct-move-exit"><i class="fas fa-xmark"></i> EXIT MOVE</button>
              <button type="button" class="ct-move-finish"><i class="fas fa-check"></i> FINISH MOVE</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const win = overlay.querySelector(".ct-move-window");
        const mode = {
          key, cost, info, overlay,
          token: null, start: null, cur: null, docStart: null, tw: 0, th: 0,
          dragging: false, grab: null,
          maxMeters: info.max, maxPx: 0, thresholdMeters: 1,
          gridSize: 50, gridDist: 1,
          undoBtn: win.querySelector(".ct-move-undo"),
          exitBtn: win.querySelector(".ct-move-exit"),
          finishBtn: win.querySelector(".ct-move-finish"),
          liveEl: win.querySelector(".ct-move-live"),
          prevInteractive: [],
          prevStageEventMode: null,
          dragHandlers: null,
          esc: (e) => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            e.preventDefault();
            this._cbExitMoveMode(true);
          },
        };
        // Resolve the PC token to move. Priority: a PC the CURRENT user controls,
        // else the current user's own PC on the scene (for the GM: any player-owned
        // PC). Never silently drive an NPC or another player's PC — that left the
        // token the player actually wanted at eventMode "none" ("unselectable").
        let tok = null;
        if (game.canvas?.ready) {
          const isGM = game.user?.isGM;
          const ownedPCs = canvas.tokens.placeables.filter(t =>
            t.actor?.type === "pc" && (isGM ? t.actor.hasPlayerOwner : t.actor.isOwner));
          tok = canvas.tokens.controlled.find(t => ownedPCs.includes(t)) ?? ownedPCs[0] ?? null;
        }
        if (!tok) {
          ui.notifications?.warn?.("No PC token to move — select your token on the canvas, then use MOVE.");
          this._cbExitMoveMode(true); // mode is registered by now; this also removes the overlay
          return;
        }
        mode.token = tok;
        mode.gridSize = canvas.grid.size || 50;
        mode.gridDist = canvas.grid.distance || 1;
        // Convert scene units to meters (foot-grid scenes would otherwise read as "meters").
        const units = canvas.scene?.grid?.units ?? canvas.scene?.data?.grid?.units ?? "";
        mode.mPerUnit = /^(ft|feet|foot)$/i.test(units) ? 0.3048 : 1;
        mode.maxPx = (info.max / (mode.gridDist * mode.mPerUnit)) * mode.gridSize;
        // Geometry snapshot taken BEFORE we touch anything: document == sprite at
        // this instant, so token.bounds is the truthful rendered footprint. All
        // later hit tests / clamp math / commits run off this snapshot (mode.cur
        // tracks the visual top-left; we own every change to it) so the drag never
        // depends on what token.position / t.w / t.h happen to mean in this version.
        const b = tok.bounds ?? {
          x: tok.document.x, y: tok.document.y,
          width: (tok.document.width || 1) * mode.gridSize,
          height: (tok.document.height || 1) * mode.gridSize
        };
        mode.tw = b.width;
        mode.th = b.height;
        mode.start = { x: b.x, y: b.y };       // visual top-left at entry
        mode.cur = { x: b.x, y: b.y };         // current visual top-left (we own it)
        mode.docStart = { x: tok.document.x, y: tok.document.y };
        // Register the mode BEFORE arming the drag: if anything below throws, the
        // catch runs _cbExitMoveMode and token interactivity is restored.
        this._cbMoveMode = mode;
        mode.exitBtn.addEventListener("click", () => this._cbExitMoveMode(true));
        mode.undoBtn.addEventListener("click", () => this._cbUndoMove(mode));
        mode.finishBtn.addEventListener("click", () => this._cbFinishMove(mode));
        document.addEventListener("keydown", mode.esc, true);
        this._cbArmMoveDrag(mode);
      } catch (err) {
        console.error(`${MODULE_ID} | move mode failed`, err);
        ui.notifications?.error(`Move mode failed: ${err.message}`);
        try { this._cbExitMoveMode(true); } catch { /* best-effort cleanup */ }
      }
    },

    /** Disable Foundry's token interactivity and arm our own grid-snapped, clamped drag. */
    _cbArmMoveDrag(mode) {
      const view = canvas.app.view;
      // Keep Foundry's own drag/click handlers off every token while we drive.
      for (const t of canvas.tokens.placeables) {
        mode.prevInteractive.push([t, t.eventMode, t.interactive]);
        if ("eventMode" in t) t.eventMode = "none";
        else t.interactive = false;
      }
      // Kill switch: with the stage non-interactive, Foundry's canvas-level mouse
      // interaction manager (rubber-band selection box, native drags) receives no
      // PIXI events at all while we drive. Our drag is DOM-based and unaffected.
      mode.prevStageEventMode = "eventMode" in canvas.stage ? canvas.stage.eventMode : null;
      if (mode.prevStageEventMode !== null) canvas.stage.eventMode = "none";
      // Drag ruler: an SVG layer in SCREEN space (same worldTransform math the drag
      // itself relies on). Deliberately no PIXI objects — the V14 render-flag system
      // stays out of the ruler's way.
      const ruler = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      ruler.setAttribute("class", "ct-move-ruler");
      ruler.innerHTML = `<line class="ct-mr-line"/><g class="ct-mr-ticks"></g><circle class="ct-mr-origin" r="5"/><circle class="ct-mr-dest" r="7"/><rect class="ct-mr-pill" rx="9"/><text class="ct-mr-label"></text>`;
      mode.overlay.insertBefore(ruler, mode.overlay.querySelector(".ct-move-window"));
      mode.rulerEl = ruler;
      const toWorld = (e) => {
        const m = canvas.stage.worldTransform;
        return { x: (e.clientX - m.tx) / m.a, y: (e.clientY - m.ty) / m.d };
      };
      const onDown = (e) => {
        // Only canvas presses — the DOM chrome (UNDO/EXIT/FINISH, menu) keeps working.
        if (e.target !== view) return;
        if (e.button !== 0) return; // middle/right: let Foundry pan/zoom
        // We own the left button on the canvas for the whole mode. Swallow the
        // event in the WINDOW CAPTURE phase, before it descends to the canvas, so
        // Foundry's own handlers never see it and no rubber-band selection box
        // appears next to our drag.
        e.preventDefault();
        e.stopImmediatePropagation();
        if (mode.dragging || !mode.token) return;
        const p = toWorld(e);
        const c = mode.cur;
        if (p.x < c.x || p.x > c.x + mode.tw || p.y < c.y || p.y > c.y + mode.th) {
          // Diagnostic: log near-misses (pointer within a grid of the rect) so future
          // "can't grab the token" reports come with data.
          const gs = mode.gridSize || 50;
          const near = p.x > c.x - gs && p.x < c.x + mode.tw + gs && p.y > c.y - gs && p.y < c.y + mode.th + gs;
          if (near) console.debug(`${MODULE_ID} | move grab missed`, { p, cur: c, tw: mode.tw, th: mode.th, token: mode.token.id });
          return;
        }
        mode.dragging = true;
        mode.grab = { dx: p.x - c.x, dy: p.y - c.y };
        try { view.setPointerCapture(e.pointerId); } catch { /* no-op */ }
        this._cbMoveRulerUpdate(mode);
      };
      const onMove = (e) => {
        if (!mode.dragging || !mode.token) return;
        const p = toWorld(e);
        const s = mode.start, gs = mode.gridSize;
        const tw = mode.tw, th = mode.th;
        const scx = s.x + tw / 2, scy = s.y + th / 2;
        // Clamp a candidate top-left so the token centre stays within maxPx of the start centre.
        const clampPoint = (x, y) => {
          const dx = x + tw / 2 - scx, dy = y + th / 2 - scy;
          const d = Math.hypot(dx, dy);
          if (d <= mode.maxPx) return [x, y];
          const k = mode.maxPx / d;
          return [scx + dx * k - tw / 2, scy + dy * k - th / 2];
        };
        // Prefer the grid-snapped point; if the snapped cell falls outside the radius
        // (cell larger than the move), fall back to the clamped raw cursor position so
        // the token can always be placed anywhere within range.
        const sx = Math.round((p.x - mode.grab.dx) / gs) * gs;
        const sy = Math.round((p.y - mode.grab.dy) / gs) * gs;
        let [nx, ny] = clampPoint(sx, sy);
        if (nx !== sx || ny !== sy) {
          [nx, ny] = clampPoint(p.x - mode.grab.dx, p.y - mode.grab.dy).map(Math.round);
        }
        // Move the sprite by the WORLD DELTA — never assumes what token.position
        // "means" (top-left vs centre vs mesh offset); a delta is convention-free.
        // V14 note: do NOT call token.refresh() here — the deprecated shim sets the
        // "refresh" render flag and Token#_refreshPosition() snaps the sprite back.
        if (nx !== mode.cur.x || ny !== mode.cur.y) {
          const t = mode.token;
          t.position.set(t.position.x + (nx - mode.cur.x), t.position.y + (ny - mode.cur.y));
          mode.cur = { x: nx, y: ny };
          this._cbMoveHudState(mode);
          this._cbMoveRulerUpdate(mode);
        }
      };
      const onUp = (e) => {
        if (!mode.dragging) return;
        mode.dragging = false;
        try { view.releasePointerCapture(e.pointerId); } catch { /* no-op */ }
      };
      window.addEventListener("pointerdown", onDown, true);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      mode.dragHandlers = { view, onDown, onMove, onUp };
    },

    /** Refresh the live distance readout + UNDO/FINISH visibility after a drag step. */
    _cbMoveHudState(mode) {
      const s = mode.start;
      if (!mode.token || !s) return;
      const d = Math.hypot(mode.cur.x - s.x, mode.cur.y - s.y);
      const meters = (d / mode.gridSize) * mode.gridDist * (mode.mPerUnit || 1);
      mode.liveEl.textContent = `${meters.toFixed(1)} / ${mode.maxMeters} m`;
      const moved = meters >= mode.thresholdMeters - 0.001;
      mode.undoBtn.classList.toggle("show", moved);
      mode.finishBtn.classList.toggle("show", moved);
      mode.liveEl.classList.toggle("hot", moved);
    },

    /** Draw (or hide) the drag ruler: origin → destination line, grid ticks, distance pill. */
    _cbMoveRulerUpdate(mode) {
      const svg = mode.rulerEl;
      if (!svg || !mode.token || !mode.start) return;
      const s = mode.start, c = mode.cur;
      const active = mode.dragging && (c.x !== s.x || c.y !== s.y);
      svg.classList.toggle("on", active);
      if (!active) return;
      const m = canvas.stage.worldTransform;
      const px = (wx, wy) => ({ x: m.a * wx + m.tx, y: m.d * wy + m.ty });
      const gs = mode.gridSize || 50;
      const o = px(s.x + mode.tw / 2, s.y + mode.th / 2);   // origin centre (screen)
      const d = px(c.x + mode.tw / 2, c.y + mode.th / 2);   // destination centre (screen)
      const line = svg.querySelector(".ct-mr-line");
      line.setAttribute("x1", o.x); line.setAttribute("y1", o.y);
      line.setAttribute("x2", d.x); line.setAttribute("y2", d.y);
      // Grid ticks every gridSize along the WORLD-space line.
      const distW = Math.hypot(c.x - s.x, c.y - s.y);
      const n = Math.min(30, Math.floor(distW / gs));
      const ticks = svg.querySelector(".ct-mr-ticks");
      if (n > 0) {
        const ux = (c.x - s.x) / distW, uy = (c.y - s.y) / distW;
        const len = Math.hypot(d.x - o.x, d.y - o.y) || 1;
        const qx = -(d.y - o.y) / len, qy = (d.x - o.x) / len;   // perpendicular (screen)
        let html = "";
        for (let i = 1; i <= n; i++) {
          const p = px(s.x + mode.tw / 2 + ux * i * gs, s.y + mode.th / 2 + uy * i * gs);
          html += `<line x1="${(p.x + qx * 5).toFixed(1)}" y1="${(p.y + qy * 5).toFixed(1)}" x2="${(p.x - qx * 5).toFixed(1)}" y2="${(p.y - qy * 5).toFixed(1)}"/>`;
        }
        ticks.innerHTML = html;
      } else ticks.innerHTML = "";
      // Rings.
      svg.querySelector(".ct-mr-origin").setAttribute("cx", o.x);
      svg.querySelector(".ct-mr-origin").setAttribute("cy", o.y);
      svg.querySelector(".ct-mr-dest").setAttribute("cx", d.x);
      svg.querySelector(".ct-mr-dest").setAttribute("cy", d.y);
      // Distance + budget colour.
      const meters = (distW / gs) * mode.gridDist * (mode.mPerUnit || 1);
      const frac = Math.min(1, distW / mode.maxPx);
      svg.dataset.state = frac >= 0.98 ? "max" : frac >= 0.75 ? "warn" : "ok";
      const label = svg.querySelector(".ct-mr-label");
      label.textContent = `${meters.toFixed(1)} m`;
      const ang = Math.atan2(d.y - o.y, d.x - o.x);
      const lx = d.x - Math.sin(ang) * 24;
      const ly = d.y + Math.cos(ang) * 24;
      label.setAttribute("x", lx);
      label.setAttribute("y", ly);
      const pill = svg.querySelector(".ct-mr-pill");
      const bb = label.getBBox();
      pill.setAttribute("x", lx - bb.width / 2 - 7);
      pill.setAttribute("y", ly - bb.height / 2 - 3.5);
      pill.setAttribute("width", bb.width + 14);
      pill.setAttribute("height", bb.height + 7);
    },

    /** Reset the token to its pre-move position and hide UNDO/FINISH. */
    _cbUndoMove(mode) {
      if (!mode.token) return;
      const t = mode.token;
      t.position.set(t.position.x + (mode.start.x - mode.cur.x), t.position.y + (mode.start.y - mode.cur.y));
      mode.cur = { x: mode.start.x, y: mode.start.y };
      mode.liveEl.textContent = `0 / ${mode.maxMeters} m`;
      mode.undoBtn.classList.remove("show");
      mode.finishBtn.classList.remove("show");
      mode.liveEl.classList.remove("hot");
      this._cbMoveRulerUpdate(mode);
    },

    /** Commit the token's new position, spend the move cost, exit the mode. */
    async _cbFinishMove(mode) {
      try {
        if (mode.token) {
          CypherTaskbar._cbInternalMove = true;
          try {
            // Commit as a document-space delta from entry — mirrors exactly what the
            // sprite did, independent of token.position conventions.
            await mode.token.document.update({
              x: Math.round(mode.docStart.x + (mode.cur.x - mode.start.x)),
              y: Math.round(mode.docStart.y + (mode.cur.y - mode.start.y))
            });
          } finally {
            CypherTaskbar._cbInternalMove = false;
          }
        }
        for (const kind of mode.cost.split(",")) this._cbExpendResource(kind.trim());
        this._cbExitMoveMode(false);
      } catch (err) {
        console.error(`${MODULE_ID} | finish move failed`, err);
        ui.notifications?.error(`Finish move failed: ${err.message}`);
      }
    },

    /** Safety net: force-clean a move mode whose overlay or token is gone (scene switch, canvas reset). */
    _cbReapMoveMode() {
      const m = this._cbMoveMode;
      if (!m) return;
      const overlayGone = !m.overlay || !m.overlay.isConnected;
      // Only reap on POSITIVE evidence (undefined "detached" must not count).
      const tokenGone = !!(m.token?.document && m.token.document.detached === true);
      if (overlayGone || tokenGone) this._cbExitMoveMode(true);
    },

    /** Exit MOVE MODE. `abort` re-syncs the token sprite from the (unmodified) document. */
    _cbExitMoveMode(abort = true) {
      const m = this._cbMoveMode;
      if (!m) return;
      document.removeEventListener("keydown", m.esc, true);
      if (m.dragHandlers) {
        const { onDown, onMove, onUp } = m.dragHandlers;
        window.removeEventListener("pointerdown", onDown, true);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      for (const [t, em, inter] of m.prevInteractive) {
        if ("eventMode" in t) t.eventMode = em;
        else t.interactive = inter;
      }
      if (m.prevStageEventMode !== null && m.prevStageEventMode !== undefined && canvas.stage) {
        canvas.stage.eventMode = m.prevStageEventMode;
      }
      if (abort && m.token) {
        // Sprite-only resync by inverse delta (no refresh() — see _cbArmMoveDrag note).
        const t = m.token;
        t.position.set(t.position.x + (m.start.x - m.cur.x), t.position.y + (m.start.y - m.cur.y));
      }
      document.body.classList.remove("ct-move-mode");
      m.overlay.remove();
      this._cbMoveMode = null;
    },

    async _cbEndTurn(st) {
      const combat = game.combat;
      if (!combat || !st) return;
      // No GM round-trip: END advances the turn directly from this client.
      try { await combat.nextTurn(); } catch (err) { console.error(`${MODULE_ID} | nextTurn failed`, err); }
    }

  });
}
