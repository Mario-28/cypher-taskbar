import { MODULE_ID } from "./utils.js";

/**
 * Combat Bar — per-turn PC automation strip (v4.1.224)
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

/* ── Canvas coordinate helpers ─────────────────────────────────────────
 * ONE choke point for every client ↔ world conversion in this file.
 * v4.1.224: self-calibrating against Foundry's own canvas.mousePosition
 * (guaranteed to live in the same space as token.bounds). Prior revisions
 * trusted renderer.resolution and Foundry's converter return space — both
 * wrong on some V14 setups (hidpi, browser zoom), so targeting and move
 * silently missed every token. The first live pointer event solves the
 * CSS↔scene scale from ground truth; every conversion after that uses the
 * measured value. Foundry's mousePosition is used as the PRIMARY hit-test
 * source wherever possible, since it is definitionally consistent with
 * token.bounds (both are world space). */

let _cbScenePerCssPx = 0; // measured scene units per CSS px; 0 = not calibrated yet

function _cbCanvasView() {
  // V14/PIXI v8 renamed Application#view → Application#canvas.
  return canvas.app?.view ?? canvas.app?.canvas ?? document.getElementById("board") ?? null;
}

function _cbScenePerCss() {
  if (_cbScenePerCssPx > 0) return _cbScenePerCssPx;
  const view = _cbCanvasView();
  const rect = view?.getBoundingClientRect?.();
  if (view?.width && rect?.width) return rect.width / view.width;
  return 1 / (canvas.app?.renderer?.resolution ?? 1);
}

/* Solve scene-per-CSS from ground truth: Foundry reports the pointer's world
 * position (canvas.mousePosition), we project it through the stage transform
 * to scene units, and divide by the event's client offset. Runs once per
 * session; logs the measured factor so future reports come with data. */
function _cbCalibrate(clientX, clientY) {
  if (_cbScenePerCssPx > 0) return;
  try {
    const mp = canvas.mousePosition;
    const view = _cbCanvasView();
    if (!mp || !view) return;
    const rect = view.getBoundingClientRect?.();
    if (!rect?.width) return;
    const m = canvas.stage.worldTransform;
    const sx = m.a * mp.x + m.tx;
    const sy = m.d * mp.y + m.ty;
    const kx = Math.abs(clientX - rect.left) > 0.5 ? sx / (clientX - rect.left) : 0;
    const ky = Math.abs(clientY - rect.top) > 0.5 ? sy / (clientY - rect.top) : 0;
    const k = kx > 0 && ky > 0 ? (kx + ky) / 2 : Math.max(kx, ky);
    if (k > 0.0001) {
      _cbScenePerCssPx = k;
      console.log(`${MODULE_ID} | calibrated scene/CSS=${k.toFixed(4)} (rect/view=${(rect.width / view.width).toFixed(4)}, renderer.res=${canvas.app?.renderer?.resolution})`);
    }
  } catch { /* best-effort */ }
}

function _cbClientToWorld(clientX, clientY) {
  _cbCalibrate(clientX, clientY);
  const m = canvas.stage.worldTransform;
  const r = _cbCanvasView()?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  const s = _cbScenePerCss();
  return { x: (((clientX - r.left) * s) - m.tx) / m.a, y: (((clientY - r.top) * s) - m.ty) / m.d };
}

function _cbWorldToClient(wx, wy) {
  const m = canvas.stage.worldTransform;
  const r = _cbCanvasView()?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
  const s = _cbScenePerCss();
  return { x: r.left + ((m.a * wx + m.tx) / s), y: r.top + ((m.d * wy + m.ty) / s) };
}

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

    /** Stable key used to decide whether an existing bar node is stale.
     *  Includes the spell-menu flag so the bar rebuilds when a spell
     *  category appears/disappears on the actor. */
    _cbKey(st) {
      return st ? `${st.combatId}:${st.combatantId}:${st.needInitiative ? 1 : 0}:${this._hasSpellCategory?.() ? 1 : 0}` : "";
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
          <button class="ct-cb-btn ct-cb-ability" data-cb-action="ability" title="Abilities"><i class="fas fa-bolt"></i></button>
          ${this._hasSpellCategory?.() ? `<button class="ct-cb-btn ct-cb-spell" data-cb-action="spell" title="Spell"><i class="fas fa-wand-magic-sparkles"></i></button>` : ""}
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
      this._syncEquipmentUseButtons?.();
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
      this._cbSyncAbilityBtn();
      this._cbSyncSpellBtn();
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
        case "ability": {
          // Toggle the taskbar's ABILITIES menu — the ACTION-lock rule lives there.
          const btn = this.element?.querySelector?.('.ct-btn[data-panel="abilities"]');
          this._togglePanel("abilities", btn);
          break;
        }
        case "spell": {
          // Toggle the taskbar's SPELLS menu — non-ready spells show greyed.
          const btn = this.element?.querySelector?.('.ct-btn[data-panel="spells"]');
          this._togglePanel("spells", btn);
          break;
        }
        case "skill": {
          // Toggle the taskbar's SKILLS menu — same pattern as ABILITIES.
          const btn = this.element?.querySelector?.('.ct-btn[data-panel="skills"]');
          this._togglePanel("skills", btn);
          break;
        }
        case "item": {
          // Toggle the taskbar's EQUIPMENT menu. Opening it via THIS button is
          // what unlocks item use during the player's combat turn.
          const wasOpen = this.activePanel === "equipment";
          const btn = this.element?.querySelector?.('.ct-btn[data-panel="equipment"]');
          this._togglePanel("equipment", btn);
          if (!wasOpen) {
            const cur = this._cbState();
            this._equipmentUseTurnKey = cur ? cur.combatantId : null;
          }
          this._syncEquipmentUseButtons?.();
          break;
        }
        case "other": {
          // Player-declared miscellaneous action — the GM adjudicates which
          // pips it costs (MOVE/ACTION/UTILITY multi-select, or NONE). The
          // dialog lives on the GM side; resolution spends the pips here.
          try {
            if (!game.user?.isGM) {
              game.socket.emit(`module.${MODULE_ID}`, {
                type: "gmOtherPipsRequest",
                userId: game.user.id,
                actorId: this.actor?.id ?? null,
                actorName: this.actor?.name ?? "",
                actorImg: this.actor?.img ?? ""
              });
              ui.notifications?.info?.("Other action sent to the GM — wait for the pip ruling.");
            }
          } catch (err) {
            console.warn(`${MODULE_ID} | gmOtherPipsRequest emit failed`, err);
          }
          break;
        }
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
      if (!canvas?.ready) {
        console.warn(`${MODULE_ID} | targeting: canvas not ready — cannot start`);
        ui.notifications?.warn?.("Targeting: canvas not ready yet — try again in a moment.");
        return;
      }
      console.log(`${MODULE_ID} | TARGETING mode ON`);
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

    _cbTokenAtWorld(world) {
      if (!canvas?.ready) return null;
      return canvas.tokens.placeables.find(tok => tok.visible && tok.bounds.contains(world.x, world.y)) ?? null;
    },

    _cbTargetingDown(e) {
      const t = this._targeting;
      if (!t?.active) return;
      // pointerdown + mousedown both fire for mouse input — process once
      if (e.type === "mousedown" && t.lastDownAt && Date.now() - t.lastDownAt < 500) return;
      if (e.type === "pointerdown") t.lastDownAt = Date.now();
      if (e.target.closest?.(".ct-targeting-overlay")) return; // let FINISH work
      const view = _cbCanvasView();
      if (!view || !view.contains(e.target)) return;          // other UI: pass through
      e.preventDefault();
      e.stopPropagation();
      // Foundry's own mouse tracker lives in token.bounds space by definition —
      // primary hit-test source. Manual conversion is the fallback for the edge
      // case where mousePosition hasn't updated for this event yet.
      _cbCalibrate(e.clientX, e.clientY);
      const world = canvas.mousePosition ?? _cbClientToWorld(e.clientX, e.clientY);
      const token = this._cbTokenAtWorld(world);
      try { console.log(`${MODULE_ID} | targeting @ world(${world.x.toFixed(0)},${world.y.toFixed(0)}) → ${token ? "HIT " + token.name : "miss"}`); } catch { }
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
      // ACTION pool spent — only IMMEDIATE MOVE survives; the rest grey out.
      if (this._cbActionPipsLeft() <= 0) {
        menu.querySelectorAll("[data-cb-cost]").forEach(opt => {
          if (opt.dataset.mmTip === "imm") return;
          opt.classList.add("ct-mm-disabled");
          opt.setAttribute("disabled", "");
        });
      }
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
          if (opt.classList.contains("ct-mm-disabled")) return;
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

    /** Grey out / re-enable the MOVE button from the current move-pip count.
     *  Also fades the tile to dark blue when the ACTION pool is spent — an
     *  immediate move is still possible, so the button itself stays live. */
    _cbSyncMoveBtn() {
      const left = this._cbMovePipsLeft();
      const btn = this.element?.querySelector?.(".ct-cb-move");
      if (!btn) return;
      const noMove = left <= 0;
      const noAction = this._cbActionPipsLeft() <= 0;
      btn.classList.toggle("ct-cb-disabled", noMove);
      btn.classList.toggle("ct-cb-move-dim", !noMove && noAction);
      btn.title = noMove ? "No move remaining" : (noAction ? "Move — immediate only (no action left)" : "Move");
    },

    /** Yellow-flag the ABILITY button while the action pool is spent.
     *  Unlike ATTACK it stays clickable — the menu opens and non-action
     *  abilities (enablers, reactions…) remain usable. */
    _cbSyncAbilityBtn() {
      const btn = this.element?.querySelector?.(".ct-cb-ability");
      if (!btn) return;
      const spent = this._cbActionPipsLeft() <= 0;
      btn.classList.toggle("ct-cb-ability-yellow", spent);
      btn.title = spent ? "No action remaining — enablers still usable" : "Abilities";
    },

    /** Grey out the SPELL button while the action pool is spent.
     *  Stays clickable — the menu opens and the READY spells reveal what
     *  (if anything) can still be attempted. */
    _cbSyncSpellBtn() {
      const btn = this.element?.querySelector?.(".ct-cb-spell");
      if (!btn) return;
      const spent = this._cbActionPipsLeft() <= 0;
      btn.classList.toggle("ct-cb-spell-dim", spent);
      btn.title = spent ? "No action remaining" : "Spells";
    },

    /** True when the combat bar is live AND its action pool is empty
     *  (false when there is no bar — outside combat nothing is locked). */
    _cbNoActionLeft() {
      const pip = this.element?.querySelector?.('.ct-cb-res[data-cb-res="action"] .ct-cb-res-val');
      if (!pip) return false;
      const n = parseInt(pip.textContent, 10);
      return !Number.isNaN(n) && n <= 0;
    },

    /** Grey out the roll-attack buttons in the (open) combat menu while the
     *  combat bar's ACTION pool is spent. No-op without a live combat bar —
     *  outside combat attacking stays unrestricted. Mirrors the spell-cast
     *  lock; _ctApplyRangeLocks keeps the disabled state in sync afterwards. */
    _syncAttackRollButtons(root) {
      const bar = root || this.element?.querySelector?.("#ct-panel-container");
      if (!bar) return;
      const spent = !!this._cbState?.() && this._cbNoActionLeft();
      bar.querySelectorAll("[data-attack-burst]").forEach(btn => {
        if (btn.dataset.origTitle === undefined) btn.dataset.origTitle = btn.title || "";
        btn.classList.toggle("ct-atk-btn-dim", spent);
        const noAmmo = btn.classList.contains("ct-noammo-locked");
        btn.disabled = spent || btn.classList.contains("ct-range-locked") || noAmmo;
        if (!btn.classList.contains("ct-range-locked") && !noAmmo) btn.title = spent ? "No action remaining" : btn.dataset.origTitle;
      });
    },

    /** True during an active combat when it is NOT the tracked PC's turn.
     *  The combat bar itself only renders on your turn, so "combat active +
     *  no bar state" means somebody else's turn. Outside combat: false. */
    _cbTurnLocked() {
      const combat = game.combat;
      if (!combat || !combat.started) return false;
      return !this._cbState?.();
    },

    /** Apply/remove the turn-lock class on the open taskbar menu. CSS greys
     *  and pointer-events-locks every action button while it is present. */
    _syncTurnLock() {
      const c = this.element?.querySelector?.("#ct-panel-container");
      if (!c) return;
      c.classList.toggle("ct-turn-locked", this._cbTurnLocked());
    },

    /** Expended-pip flourish: the pip grows large and burns red for 3s,
     *  then settles back — the empty grey (ct-cb-res-empty) is waiting
     *  underneath if the value hit 0. Class is removed on completion. */
    _cbPipSpentAnim(pip) {
      const cls = "ct-cb-pip-anim";
      pip.classList.remove(cls);
      void pip.offsetWidth; // restart the animation if one is already running
      pip.classList.add(cls);
      clearTimeout(pip._ctPipAnimTimer);
      pip._ctPipAnimTimer = setTimeout(() => pip.classList.remove(cls), 3100);
    },

    /** Read an ability's ACTIVATION (cypher-cool-items flag, fallback to the
     *  Cypher 2 system field). Unset defaults to "action" — same default as
     *  cypher-cool-items' ability panel. Values: action | enabler | permanent. */
    _cbAbilityActivation(item) {
      const flag = item?.getFlag?.("cypher-cool-items", "data")?.activation;
      return flag ?? item?.system?.activation ?? "action";
    },

    /** After a confirmed ability use: spend 1 ACTION pip when the ability's
     *  ACTIVATION is "action" (cypher-cool-items dropdown). Enablers/permanent
     *  don't consume the action. No-op without a live combat bar. */
    _cbExpendAbilityAction(itemId) {
      const item = this.actor?.items?.get?.(itemId);
      if (!item) return;
      if (this._cbAbilityActivation(item) !== "action") return;
      if (!this._cbExpendResource("action")) return;
      // Pip count changed — re-apply the ACTION-lock to an open ABILITIES menu.
      try { this._refreshActivePanel?.(); } catch { /* panel not open */ }
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
      this._cbPipSpentAnim(pip);
      if (kind === "move") this._cbSyncMoveBtn();
      if (kind === "action") { this._cbSyncAttackBtn(); this._cbSyncAbilityBtn(); this._cbSyncMoveBtn(); this._cbSyncSpellBtn(); this._syncSpellCastButtons?.(); this._syncAttackRollButtons?.(); }
      if (kind === "utility") this._syncEquipmentUseButtons?.();
      return next < cur;
    },

    /** Current value of a combat-bar resource pip (move/action/utility), read
     *  from the bar DOM. 0 when the bar is absent. */
    _cbResCount(kind) {
      const val = this.element?.querySelector?.(`.ct-cb-res[data-cb-res="${kind}"] .ct-cb-res-val`);
      const n = parseInt(val?.textContent, 10);
      return Number.isNaN(n) ? 0 : n;
    },

    /* ── Range bands: targeting-line colors + combat range locks ─────────
       Cypher distances: immediate ≈ 3 m (melee/adjacent), short ≈ 15 m,
       long ≈ 30 m, very long ≈ 100 m. The targeting-line overlay draws for
       every user target; the action-button greying only applies while the
       combat bar is live (combat mode) with a target on the canvas.      */

    /** cypher-cool-items flag data on an item ({} when the module is absent). */
    _ctCool(item) {
      return item?.getFlag?.("cypher-cool-items", "data") ?? {};
    },

    /** Tracked PC's token on the active canvas. */
    _ctPCToken() {
      const actor = this.actor;
      if (!actor || !canvas?.ready) return null;
      return canvas.tokens?.placeables?.find(t => t.actor?.id === actor.id) ?? null;
    },

    /** True when at least one targeted token belongs to an NPC actor. */
    _ctHasNPCTarget() {
      if (!(game.user?.targets?.size > 0)) return false;
      for (const t of game.user.targets) {
        const a = t.actor;
        if (a && !(a.type === "pc" || a.hasPlayerOwner)) return true;
      }
      return false;
    },

    /** Center distance between two token placeables → {meters, spaces}. */
    _ctMeasureTokens(a, b) {
      const units = canvas.scene?.grid?.units ?? "m";
      try {
        const m = canvas.grid.measurePath([{ x: a.center.x, y: a.center.y }, { x: b.center.x, y: b.center.y }]);
        const distance = Number(m?.distance) || 0;
        let meters = distance;
        if (units === "ft" || units === "feet") meters *= 0.3048;
        return { meters, distance, units, spaces: Number(m?.spaces) || 0 };
      } catch (err) {
        const size = canvas.scene?.grid?.sizeX || canvas.scene?.grid?.size || 100;
        const per = canvas.scene?.grid?.distance || 1.5;
        const distance = (Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) / size) * per;
        let meters = distance;
        if (units === "ft" || units === "feet") meters *= 0.3048;
        return { meters, distance, units, spaces: Math.round(meters / per) };
      }
    },

    /** Range band from a measure object. Feet scenes use the canonical Cypher
     *  imperial distances (10/50/100 ft) so 10 ft reads immediate and 50 ft
     *  reads short, instead of tripping over the 0.3048 conversion at the
     *  metric boundaries. */
    _ctBand(m) {
      const u = String(m?.units ?? "m").toLowerCase();
      if (u === "ft" || u === "feet") {
        const d = Number(m?.distance) || 0;
        if (d <= 10) return "imm";
        if (d <= 50) return "short";
        if (d <= 100) return "long";
        return "vlong";
      }
      const meters = Number(m?.meters) || 0;
      if (meters <= 3) return "imm";
      if (meters <= 15) return "short";
      if (meters <= 30) return "long";
      return "vlong";
    },

    _ctBandLabel(band) {
      return { imm: "immediate", short: "short", long: "long", vlong: "very long" }[band] ?? band;
    },

    /** Free-text attack range ("immediate", "short", "30 m", "50ft", …) → max meters, or null. */
    _ctParseRangeText(str) {
      const s = String(str ?? "").trim().toLowerCase();
      if (!s) return null;
      if (/very\s*long/.test(s)) return 100;
      if (/\blong\b/.test(s)) return 30;
      if (/\bshort\b/.test(s)) return 15;
      if (/immediate|melee|adjacent|touch/.test(s)) return 3;
      const n = parseFloat(s.replace(",", "."));
      if (!Number.isNaN(n)) return /ft|feet/.test(s) ? n * 0.3048 : n;
      return null;
    },

    /** Range rule for an item: null = unrestricted, else {melee:true} or {maxMeters:n}. */
    _ctRangeSpec(item, kind) {
      if (!item) return null;
      if (kind === "attack") {
        // cypher-cool-items attack config (its ATTACK panel) wins when present.
        const cd = this._ctCool(item);
        if (cd.attack) {
          const coolMax = { short: 15, long: 30, veryLong: 100 }[cd.attackRange];
          return coolMax ? { maxMeters: coolMax } : { melee: true };
        }
        // Melee weapons are adjacent-only. Anything else (ranged, thrown, or a
        // weapon with a parseable range text) uses that range.
        if ((item.system?.basic?.type ?? "") === "melee weapon") return { melee: true };
        const max = this._ctParseRangeText(item.system?.basic?.range);
        return max == null ? { melee: true } : { maxMeters: max };
      }
      if (kind === "ability" || kind === "spell") {
        const d = this._ctCool(item);
        if (!d.attack) return null;
        const maxMeters = { short: 15, long: 30, veryLong: 100 }[d.attackRange];
        return maxMeters ? { maxMeters } : { melee: true };
      }
      return null;
    },

    /** Live {meters, spaces} from the PC token to the first target, or null. */
    _ctRangeCtx() {
      if (!canvas?.ready || !(game.user?.targets?.size > 0)) return null;
      const pc = this._ctPCToken();
      const target = [...game.user.targets][0];
      if (!pc || !target) return null;
      return this._ctMeasureTokens(pc, target);
    },

    /** True when the item's range forbids use right now (combat mode + target + out of range).
     *  Attack-mode spells are also locked until an NPC token is targeted. */
    _ctRangeLocked(item, kind) {
      if (!this._cbState?.()) return false;
      if (kind === "spell" && this._ctCool(item).attack && !this._ctHasNPCTarget()) return true;
      const spec = this._ctRangeSpec(item, kind);
      if (!spec) return false;
      const ctx = this._ctRangeCtx();
      if (!ctx) return false;
      if (spec.melee) return ctx.spaces > 0 ? ctx.spaces > 1.5 : ctx.meters > 3;
      return ctx.meters > spec.maxMeters;
    },

    /** Re-evaluate every per-item action button against the current range and
     *  redraw the targeting lines. Covers roll-attack (combat HOME tab),
     *  use-ability (abilities menu) and cast-spell (spells READY rows).     */
    _ctApplyRangeLocks() {
      const root = this.element?.querySelector?.("#ct-panel-container");
      if (root) {
        const inCombat = !!this._cbState?.();
        if (!inCombat) {
          // Outside combat no range/target/action lock applies — clear any
          // stale combat-era state left on the open panel's buttons.
          root.querySelectorAll("[data-attack-burst], [data-use-ability], [data-cast-spell]").forEach(btn => {
            btn.classList.remove("ct-range-locked", "ct-sp-cast-btn-dim", "ct-atk-btn-dim");
            btn.disabled = false;
            if (btn.dataset.ctRangeOrig !== undefined) btn.title = btn.dataset.ctRangeOrig;
          });
        } else {
        const ctx = this._ctRangeCtx();
        const apply = (btn, id, kind) => {
          const item = this.actor?.items?.get?.(id);
          if (!item) return;
          const spec = this._ctRangeSpec(item, kind);
          let locked = false;
          let label = "";
          if (spec && ctx) {
            locked = spec.melee ? (ctx.spaces > 0 ? ctx.spaces > 1.5 : ctx.meters > 3) : ctx.meters > spec.maxMeters;
            if (locked) label = spec.melee ? "melee" : this._ctBandLabel(this._ctBand(ctx));
          }
          // Attack-mode spells require an NPC target in combat mode.
          let targetLocked = false;
          if (kind === "spell" && inCombat && !locked && !this._ctHasNPCTarget()) {
            if (this._ctCool(item).attack) targetLocked = true;
          }
          // Ranged weapons with no usable linked ammo stay unrollable until reloaded.
          const noAmmo = kind === "attack" && !!(this._weaponAmmoMissing?.(item));
          const isLocked = locked || targetLocked || noAmmo;
          if (btn.dataset.ctRangeOrig === undefined) btn.dataset.ctRangeOrig = btn.title || "";
          btn.classList.toggle("ct-range-locked", locked || targetLocked);
          btn.classList.toggle("ct-noammo-locked", noAmmo);
          if (kind === "spell") {
            const spent = btn.classList.contains("ct-sp-cast-btn-dim");
            btn.disabled = spent || isLocked;
            btn.title = targetLocked ? "Select an NPC target to cast"
                      : locked ? `Out of range — target at ${label}`
                      : (spent ? "No action remaining" : btn.dataset.ctRangeOrig);
          } else {
            const spent = btn.classList.contains("ct-atk-btn-dim");
            btn.disabled = spent || isLocked;
            btn.title = noAmmo ? "No ammo — reload"
                      : locked ? `Out of range — target at ${label}`
                      : (spent ? "No action remaining" : btn.dataset.ctRangeOrig);
          }
        };
        root.querySelectorAll("[data-attack-burst]").forEach(b => apply(b, b.dataset.attackBurst, "attack"));
        root.querySelectorAll("[data-use-ability]").forEach(b => apply(b, b.dataset.useAbility, "ability"));
        root.querySelectorAll("[data-cast-spell]").forEach(b => apply(b, b.dataset.castSpell, "spell"));
        }
      }
      this._cbDrawTargLines?.();
    },

    /* ── Targeting-line overlay: PC token → each target, colored by range ── */

    _cbEnsureTargLine() {
      if (!canvas?.ready || !canvas.scene) return null;
      const layer = canvas.interface ?? canvas.tokens ?? null;
      if (!layer) return null;
      if (this._targLineGfx && !this._targLineGfx.destroyed && this._targLineGfx.parent === layer) return this._targLineGfx;
      try { this._targLineGfx?.destroy?.(); } catch { /* ignore */ }
      const gfx = new PIXI.Graphics();
      gfx.eventMode = "none";
      layer.addChild(gfx);
      this._targLineGfx = gfx;
      return gfx;
    },

    _cbDrawTargLines() {
      const gfx = this._cbEnsureTargLine?.();
      if (!gfx) return;
      gfx.clear();
      if (!canvas?.ready) return;
      const pc = this._ctPCToken();
      if (!pc || !(game.user?.targets?.size > 0)) return;
      const colors = { imm: 0x3b82f6, short: 0x22c55e, long: 0xeab308, vlong: 0xef4444 };
      for (const t of game.user.targets) {
        const m = this._ctMeasureTokens(pc, t);
        const color = colors[this._ctBand(m)] ?? colors.imm;
        if (typeof gfx.stroke === "function") {
          // PIXI v8 (Foundry V13+): lineStyle/beginFill removed — stroke/fill.
          gfx.moveTo(pc.center.x, pc.center.y)
             .lineTo(t.center.x, t.center.y)
             .stroke({ width: 4, color, alpha: 0.9 });
          gfx.circle(t.center.x, t.center.y, 5).fill({ color, alpha: 0.95 });
        } else {
          // PIXI v7 fallback
          gfx.lineStyle(4, color, 0.9);
          gfx.moveTo(pc.center.x, pc.center.y);
          gfx.lineTo(t.center.x, t.center.y);
          gfx.beginFill(color, 0.95);
          gfx.drawCircle(t.center.x, t.center.y, 5);
          gfx.endFill();
        }
      }
    },

    _cbDestroyTargLines() {
      try { this._targLineGfx?.destroy?.(); } catch { /* ignore */ }
      this._targLineGfx = null;
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
        console.log(`${MODULE_ID} | MOVE mode entered: ${key}`);
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
        mode.gridSize = canvas.grid.size || canvas.scene?.grid?.size || 50;
        // V13/14: the per-cell distance lives on the SCENE grid config, not on
        // canvas.grid (which only exposes pixel sizes) — was silently 1, making
        // the allowed radius ~5× too big on 5-ft grids.
        mode.gridDist = canvas.scene?.grid?.distance ?? canvas.grid?.distance ?? 1;
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
      const view = _cbCanvasView();
      if (!view) {
        console.error(`${MODULE_ID} | move mode: no canvas element found (app.view/app.canvas/#board all missing)`);
        return;
      }
      mode.dragView = view;
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
      // Client → world: Foundry's own mousePosition is the primary source (it
      // lives in token.bounds space by definition); the self-calibrating manual
      // conversion is the fallback. v4.1.224.
      const toWorld = (e) => {
        _cbCalibrate(e.clientX, e.clientY);
        return canvas.mousePosition ?? _cbClientToWorld(e.clientX, e.clientY);
      };
      // One-time self-check: round-trip the token centre through both conversions
      // so future "can't grab" reports come with data (resolution, grid, Δ).
      try {
        const cc = { x: mode.start.x + mode.tw / 2, y: mode.start.y + mode.th / 2 };
        const fwd = _cbWorldToClient(cc.x, cc.y);
        const back = _cbClientToWorld(fwd.x, fwd.y);
        const err = Math.hypot(back.x - cc.x, back.y - cc.y);
        if (err > 1.5) console.warn(`${MODULE_ID} | move mode: client↔world round-trip off by ${err.toFixed(1)}px`, { resolution: canvas.app?.renderer?.resolution, view: !!view });
        else console.log(`${MODULE_ID} | move mode armed (resolution=${canvas.app?.renderer?.resolution}, grid=${mode.gridSize}px / ${mode.gridDist}${canvas.scene?.grid?.units ?? ""}, round-trip Δ=${err.toFixed(2)}px)`);
      } catch { /* diagnostic only */ }
      const onDown = (e) => {
        // Only canvas presses — the DOM chrome (UNDO/EXIT/FINISH, menu) keeps working.
        if (e.target !== view && !view.contains?.(e.target)) return;
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
      // The SVG overlay is position:fixed (VIEWPORT coords) — the shared helper
      // yields exactly that (resolution-aware; v4.1.222 ruler math missed the
      // resolution factor, drawing the ruler at half / double the real spot).
      const px = (wx, wy) => _cbWorldToClient(wx, wy);
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
