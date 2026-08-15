/**
 * Cypher Taskbar v3.0.2
 * Foundry VTT v14+ | Cypher System
 *
 * Main entry point — imports panel mixins and sets up hooks.
 */

import { MODULE_ID, hexToRGBA, readJSONSetting, getActorPref, setActorPref, migrateActorPreferences } from "./utils.js";
import { registerSettings } from "./settings.js";
import { applyPersonaPanel } from "./persona-panel.js";
import { applySkillsPanel } from "./skills-panel.js";
import { applyEquipmentPanel } from "./equipment-panel.js";
import { applyAbilitiesPanel } from "./abilities-panel.js";
import { applySpellsPanel } from "./spells-panel.js";
import { applyCombatPanel } from "./combat-panel.js";
import { buildGalleryStrip, bindGalleryStripEvents, initGallerySocket } from "./gallery-tabs.js";

class CypherTaskbar {
  constructor() {
    this.element     = null;
    this.actor       = null;
    this.activePanel = null;
    this._combatSidebarOpen = false;
    this._combatFloatingOpen = false;
    this._combatFloatingPos = null;
    this._combatFloatingSize = null;
    this._combatDialogPositions = {};
    this._combatSidebarSettings = null;
    this._combatSlotsUnlocked = false;
    this._hideTimeout = null;
    this._els = null; // DOM element cache
    this._boundEnter = this._onMouseEnter.bind(this);
    this._boundLeave = this._onMouseLeave.bind(this);
    this._resolveActor();
    this._equipmentSubTab = "home"; // home | equip | weapon | armor
    this._combatSidebarSettings = this._loadCombatSettings();
    this._suppressRender = false;
    this._cashOpPending = 0;
    this._cashSuppressTimer = null;
    this._cashPanelLocked = false;
  }

  /** Get setting: per-actor preference first, then global fallback */
  _gs(key, fallback = null) {
    const actorVal = getActorPref(this.actor?.id, key);
    if (actorVal !== null) return actorVal;
    try { return game.settings.get(MODULE_ID, key); } catch { return fallback; }
  }

  /** Set setting: always writes to per-actor preference store */
  async _ss(key, value) {
    await setActorPref(this.actor?.id, key, value);
  }

  /** Get JSON setting: per-actor JSON first, then global fallback */
  _gjson(key, fallback = null) {
    const actorVal = getActorPref(this.actor?.id, key);
    if (actorVal !== null) {
      try { return typeof actorVal === 'string' ? JSON.parse(actorVal) : actorVal; }
      catch { return actorVal; }
    }
    return readJSONSetting(key, fallback);
  }

  /** Get menu background CSS variables from global setting */
  _getMenuBackgroundVars(menuKey) {
    try {
      const raw = game.settings.get(MODULE_ID, "menuBackgrounds");
      const data = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
      const cfg = data[menuKey] || {};
      if (!cfg.image) return "";
      const fitMap = {
        cover: { size: "cover", position: "center" },
        contain: { size: "contain", position: "center" },
        fit: { size: "100% 100%", position: "center" },
        "fit-vertical": { size: "auto 100%", position: "center" },
        "fit-horizontal": { size: "100% auto", position: "center" }
      };
      const fit = fitMap[cfg.fit || "cover"] || fitMap.cover;
      const prefixMap = {
        equipment: "ct-equipment",
        skills: "ct-skills",
        abilities: "ct-ab",
        spells: "ct-sp",
        persona: "ct-persona",
        combat: "ct-combat",
        cash: "ct-cash"
      };
      const p = prefixMap[menuKey];
      if (!p) return "";
      const img = String(cfg.image).replace(/'/g, "%27");
      return `--${p}-bg-image:url('${img}');--${p}-bg-size:${fit.size};--${p}-bg-position:${cfg.align || fit.position};--${p}-bg-image-opacity:${Number(cfg.opacity ?? 0.2)};`;
    } catch (e) {
      console.warn("CypherTaskbar | menuBackgrounds parse error:", e);
      return "";
    }
  }

  _getMenuBackgroundValue(menuKey, prop) {
    try {
      const raw = game.settings.get(MODULE_ID, "menuBackgrounds");
      const data = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
      const cfg = data[menuKey] || {};
      return cfg[prop];
    } catch {
      return undefined;
    }
  }

  _resolveActor() {
    try {
      const prevActor = this.actor;
      // Check if user has explicitly selected an actor
      let selectedId = null;
      try { selectedId = game.settings.get(MODULE_ID, "selectedActorId"); } catch { /* setting not registered yet */ }
      if (selectedId) {
        const selected = game.actors?.get(selectedId);
        if (selected && selected.isOwner && selected.type === "pc") {
          this.actor = selected;
          if (this.actor?.id !== prevActor?.id) this._combatSidebarSettings = this._loadCombatSettings();
          return;
        }
      }
      this.actor = game.user?.character ?? null;
      if (!this.actor && game.user?.isGM)
        this.actor = game.actors?.find(a => a.type === "pc" && a.isOwner) ?? null;
      if (this.actor?.id !== prevActor?.id) this._combatSidebarSettings = this._loadCombatSettings();
    } catch (err) {
      console.warn(`${MODULE_ID} | _resolveActor() failed:`, err);
      this.actor = null;
    }
  }

  _getOwnedPCs() {
    return game.actors.filter(a => a.type === "pc" && a.isOwner);
  }

  render() {
    if (this._suppressRender) return;
    try {
      document.querySelector(`#${MODULE_ID}-bar`)?.remove();
      document.querySelector(".cgt-panel")?.remove();

      // Ensure actor is resolved before building DOM
      this._resolveActor();

      const bar = document.createElement("div");
      bar.id = `${MODULE_ID}-bar`;
      bar.classList.add("cypher-taskbar");
      bar.classList.add("ct-pos-bottom");
      bar.innerHTML = this._buildHTML();
      document.body.appendChild(bar);
      this.element = bar;
      if (this._boundDocumentClick) {
        document.removeEventListener("click", this._boundDocumentClick);
        this._boundDocumentClick = null;
      }
      this.applySettings();
      this._bindEvents();
      this._buildElCache(); // Cache frequently accessed DOM elements
      this._bindStatusEffectTooltips();
      bindGalleryStripEvents(this);
      this.updateAutoHide();
      this.updateOnlineStatus();
      this._injectAllMinimizeButtons();
      this.refreshTray();
      this._refreshCombatPlaceholder();
      this._adjustCanvasPadding(
        this._gs("locked") || !this._gs("autoHide")
      );
      // Aggressive re-apply: actor flags may load async, so retry multiple times
      requestAnimationFrame(() => { if (this.element) this.applySettings(); });
      setTimeout(() => { if (this.element) { this._resolveActor(); this.applySettings(); } }, 50);
      setTimeout(() => { if (this.element) { this._resolveActor(); this.applySettings(); } }, 200);
      setTimeout(() => { if (this.element) { this._resolveActor(); this.applySettings(); } }, 500);
    } catch (err) {
      console.error(`${MODULE_ID} | render() failed:`, err);
    }
  }

  // Build DOM element cache for frequently accessed elements
  _buildElCache() {
    const bar = this.element;
    if (!bar) return;
    this._els = {
      bar,
      portrait: bar.querySelector(".ct-portrait"),
      portraitWrap: bar.querySelector(".ct-portrait-wrap"),
      eyeBtn: bar.querySelector("#ct-btn-eye"),
      xpOrb: bar.querySelector(".ct-xp-orb"),
      lockBtn: bar.querySelector("#ct-btn-lock"),
      settingsBtn: bar.querySelector("#ct-btn-settings"),
      section1: bar.querySelector(".ct-section-1"),
      section2: bar.querySelector(".ct-section-2"),
      statBars: () => bar.querySelectorAll(".ct-stat-bar-wrap[data-pool]"),
      rollBtns: () => bar.querySelectorAll(".ct-roll-btn[data-roll-stat]"),
      diceBtns: () => bar.querySelectorAll(".ct-dice-btn"),
      recoveryDrops: () => bar.querySelectorAll(".ct-recovery-drop[data-recovery-index]"),
      panelBtns: () => bar.querySelectorAll(".ct-btn[data-panel]"),
      miniBtns: () => bar.querySelectorAll(".ct-mini-btn[data-mini]"),
    };
  }

  _buildHTML() {
    const actor   = this.actor;
    const noActor = !actor || actor.type !== "pc";

    return `
      <!-- Floating portrait + stats — rendered OUTSIDE the bar visually -->
      ${this._buildFloating(actor, noActor)}

      <!-- Gallery tabs strip — above the bar -->
      ${buildGalleryStrip(this)}

      <!-- The thin bar strip -->
      <div class="ct-inner">
        <!-- S1: name/meta anchor inside bar (compact) -->
        <div class="ct-section ct-section-1${(!noActor && (this._gs("portraitAreaCollapsed") ?? false)) ? ' ct-section-1-collapsed' : ''}">
          ${noActor
            ? `<div class="ct-no-actor"><i class="fas fa-user-slash"></i> No Character</div>`
            : this._buildBarMeta(actor)}
          <button class="ct-btn ct-eye-btn ${(this._gs("portraitAreaCollapsed") ?? false) ? 'ct-eye-collapsed' : ''}" id="ct-btn-eye" title="${(this._gs("portraitAreaCollapsed") ?? false) ? 'Show portrait' : 'Hide portrait'}" ${noActor ? 'disabled' : ''}><i class="fas ${(this._gs("portraitAreaCollapsed") ?? false) ? 'fa-eye-slash' : 'fa-eye'}"></i></button>
        </div>

        <!-- S2: action buttons -->
        <div class="ct-section ct-section-2">
          ${this._buildSection2(noActor)}
        </div>

        <!-- S3: minimized tray -->
        <div class="ct-section ct-section-3" id="ct-tray">
          <div class="ct-tray-inner" id="ct-tray-inner"></div>
        </div>

        <!-- S4: controls -->
        <div class="ct-section ct-section-4">
          ${this._buildSection4()}
        </div>
      </div>

      <!-- Hidden container for minimized window elements -->
      <div id="ct-minimized-windows" style="position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1;"></div>

      <!-- Panel drop-up container -->
      <div class="ct-panel-container" id="ct-panel-container"></div>
    `;
  }

  _buildFloating(actor, noActor) {
    if (noActor) return `<div class="ct-char-float"></div>`;

    const sys = actor.system;
    const might    = sys.pools?.might    ?? sys.basic?.might    ?? {};
    const speed    = sys.pools?.speed    ?? sys.basic?.speed    ?? {};
    const intellect= sys.pools?.intellect?? sys.basic?.intellect?? {};

    const mV = might.value    ?? might.current    ?? 0;
    const mM = might.max      ?? 0;
    const sV = speed.value    ?? speed.current    ?? 0;
    const sM = speed.max      ?? 0;
    const iV = intellect.value?? intellect.current?? 0;
    const iM = intellect.max  ?? 0;
    const mE = might.edge     ?? 0;
    const sE = speed.edge     ?? 0;
    const iE = intellect.edge ?? 0;
    const tier = sys.basic?.tier ?? sys.advancement?.tier ?? 1;
    const effort = sys.basic?.effort ?? sys.advancement?.effort ?? 1;
    const descriptor = sys.basic?.descriptor ?? sys.basic?.descriptorName ?? sys.details?.descriptor ?? sys.details?.descriptorName ?? "";
    const typeName = sys.basic?.type ?? sys.basic?.typeName ?? sys.details?.type ?? sys.details?.typeName ?? "";
    const focus = sys.basic?.focus ?? sys.basic?.focusName ?? sys.details?.focus ?? sys.details?.focusName ?? "";
    const sentence = (descriptor || typeName || focus)
      ? `is a ${descriptor || ""} ${typeName || ""} who ${focus || ""}`.replace(/\s+/g, " ").trim()
      : (sys.basic?.sentence ?? sys.description?.sentence ?? "");
    const xp = Number(sys.basic?.xp ?? sys.advancement?.xp ?? 0);
    const xpDisplay = Math.max(0, Math.min(10, xp));
    const xpSegments = Array.from({length: 10}, (_, idx) => idx < xpDisplay);

    const pct = (v, m) => m > 0 ? Math.round((v/m)*100) : 0;

    const img    = actor.img ?? "icons/svg/mystery-man.svg";
    const portraitAreaCollapsed = this._gs("portraitAreaCollapsed") ?? false;
    const pWidth = this._gs("portraitWidth");
    const shadowEnabled = this._gs("portraitShadow");
    const barScale = this._gs("attributeBarScale") ?? 100;
    const barOffset = this._gs("attributeBarRightOffset") ?? 55;
    const barYOffset = this._gs("attributeBarVerticalOffset") ?? 0;
    const barGap = this._gs("attributeBarGap") ?? 4;
    const barTopPadding = this._gs("attributeBarTopPadding") ?? 0;
    const valueColor = this._gs("attributeValueColor") ?? "#ffffff";
    const valueSize = this._gs("attributeValueSize") ?? 100;
    const titleColor = this._gs("attributeTitleColor") ?? "#ffffff";
    const titleStrokeColor = this._gs("attributeTitleStrokeColor") ?? "#ffffff";
    const titleStrokeThickness = this._gs("attributeTitleStrokeThickness") ?? 0.5;
    const titleBoldness = this._gs("attributeTitleBoldness") ?? 800;
    const titleSize = this._gs("attributeTitleSize") ?? 100;
    const titleSpacing = this._gs("attributeTitleSpacing") ?? 0.5;
    const upperPanelBgColor = this._gs("upperPanelBgColor") ?? "#16121e";
    const upperPanelOpacity = this._gs("upperPanelOpacity") ?? 0.9;
    const upperPanelFontColor = this._gs("upperPanelFontColor") ?? "#f0d68a";
    const upperPanelNameSize = this._gs("upperPanelNameSize") ?? 100;
    const upperPanelScale = this._gs("upperPanelScale") ?? 100;
    const upperPanelOffsetX = this._gs("upperPanelOffsetX") ?? 0;
    const upperPanelOffsetY = this._gs("upperPanelOffsetY") ?? 0;
    const xpCircleOffsetX = this._gs("xpCircleOffsetX") ?? 0;
    const xpCircleOffsetY = this._gs("xpCircleOffsetY") ?? 0;
    const focusedArcIndex = this._getFocusedPersonaArcIndex(actor);
    const focusedArcs = this._getPersonaArcs(actor);
    const focusedArcTitle = focusedArcIndex !== null && focusedArcs[focusedArcIndex]
      ? String(focusedArcs[focusedArcIndex]?.title || `Arc ${focusedArcIndex + 1}`).trim()
      : '';
    const portraitArcWidgetDisabled = !focusedArcTitle;
    const focusedArcWidget = portraitAreaCollapsed
      ? ``
      : `<button type="button" class="ct-portrait-focus-widget${focusedArcTitle ? ' has-arc' : ''}" data-open-focused-arc="1" ${portraitArcWidgetDisabled ? 'disabled' : ''} title="${focusedArcTitle ? 'Open focused ARC details' : 'No focused ARC selected'}" aria-label="${focusedArcTitle ? 'Open focused ARC details' : 'No focused ARC selected'}"><div class="ct-portrait-focus-label" data-open-focused-arc-title="1">FOCUSED ARC</div><div class="ct-portrait-focus-title" data-open-focused-arc-title="1">${foundry.utils.escapeHTML(focusedArcTitle || 'None selected')}</div>${focusedArcTitle ? `<div class="ct-portrait-focus-hint" data-open-focused-arc-title="1"><i class="fas fa-sparkles"></i><span>Open details</span></div>` : ``}</button>`;
    const sBlur  = this._gs("portraitShadowBlur");
    const sColor = this._gs("portraitShadowColor");
    const sOp    = this._gs("portraitShadowOpacity");
    const sDist  = this._gs("portraitShadowDistance");
    const dir = this._gs("portraitShadowDirection") ?? "bottom-right";
    const dirMap = {
      "bottom-right": [ 1,  1],
      "bottom-left":  [-1,  1],
      "top-right":    [ 1, -1],
      "top-left":     [-1, -1],
      "bottom":       [ 0,  1],
      "top":          [ 0, -1],
      "left":         [-1,  0],
      "right":        [ 1,  0]
    };
    const [dx, dy] = dirMap[dir] ?? [1,1];
    const shadowCSS = shadowEnabled
      ? `filter:drop-shadow(${sDist * dx}px ${sDist * dy}px ${sBlur}px ${hexToRGBA(sColor, sOp)});`
      : "";

    return `
      <div class="ct-char-float${portraitAreaCollapsed ? " ct-char-float-collapsed ct-portrait-slide-away" : ""}" id="ct-char-float">
        <div class="ct-float-stack${portraitAreaCollapsed ? " ct-portrait-area-collapsed" : ""}">
          <!-- Stat bars on top -->
          <div class="ct-float-stats" style="--ct-bars-scale:${barScale/100}; --ct-bars-right-offset:${barOffset}px; --ct-bars-y-offset:${barYOffset}px; --ct-bars-gap:${barGap}px; --ct-bars-top-padding:${barTopPadding}px; --ct-stat-value-color:${valueColor}; --ct-stat-value-scale:${valueSize/100}; --ct-stat-title-color:${titleColor}; --ct-stat-title-stroke:${titleStrokeColor}; --ct-stat-title-stroke-width:${titleStrokeThickness}px; --ct-stat-title-boldness:${titleBoldness}; --ct-stat-title-size:${titleSize/100}; --ct-stat-title-spacing:${titleSpacing}px; --ct-upper-panel-bg:${hexToRGBA(upperPanelBgColor, upperPanelOpacity)}; --ct-upper-panel-font:${upperPanelFontColor}; --ct-upper-panel-name-scale:${upperPanelNameSize/100}; --ct-upper-panel-x:${upperPanelOffsetX}%; --ct-upper-panel-y:${upperPanelOffsetY}%;">
            <div class="ct-identity-panel" style="--ct-bars-scale:${upperPanelScale/100};">
              <div class="ct-identity-name-row">
                <div class="ct-identity-name" title="${actor.name}">${actor.name}</div>
              </div>
              ${sentence ? `<div class="ct-identity-sentence" title="${sentence}">${sentence}</div>` : ``}
              <div class="ct-identity-meta">
                <div class="ct-status-effects-placeholder">
                  <span class="ct-status-effects-label"><i class="fas fa-shield-virus"></i> STATUS EFFECTS</span>
                  <div class="ct-status-effects-area" id="ct-status-effects-area">
                    ${this._buildStatusEffects(actor)}
                  </div>
                </div>
              </div>
            </div>
            <div class="ct-stat-row">
              <div class="ct-stat-bar-wrap might" data-pool="might" title="Left click: -1 Might | Right click: +1 Might">
                <div class="ct-stat-bar might" style="width:${pct(mV,mM)}%"></div>
                <span class="ct-stat-label might"><span class="ct-attr-name">Might</span>${mE > 0 ? `<span class="ct-edge-dots">${'<span class="ct-edge-dot"></span>'.repeat(mE)}</span>` : ``}</span>
              </div>
              <span class="ct-stat-value">${mV}</span><button class="ct-roll-btn" data-roll-stat="might" title="Roll Might"><i class="fas fa-dice-d20"></i></button>
            </div>
            <div class="ct-stat-row">
              <div class="ct-stat-bar-wrap speed" data-pool="speed" title="Left click: -1 Speed | Right click: +1 Speed">
                <div class="ct-stat-bar speed" style="width:${pct(sV,sM)}%"></div>
                <span class="ct-stat-label speed"><span class="ct-attr-name">Speed</span>${sE > 0 ? `<span class="ct-edge-dots">${'<span class="ct-edge-dot"></span>'.repeat(sE)}</span>` : ``}</span>
              </div>
              <span class="ct-stat-value">${sV}</span><button class="ct-roll-btn" data-roll-stat="speed" title="Roll Speed"><i class="fas fa-dice-d20"></i></button>
            </div>
            <div class="ct-stat-row">
              <div class="ct-stat-bar-wrap intellect" data-pool="intellect" title="Left click: -1 Intellect | Right click: +1 Intellect">
                <div class="ct-stat-bar intellect" style="width:${pct(iV,iM)}%"></div>
                <span class="ct-stat-label intellect"><span class="ct-attr-name">Intellect</span>${iE > 0 ? `<span class="ct-edge-dots">${'<span class="ct-edge-dot"></span>'.repeat(iE)}</span>` : ``}</span>
              </div>
              <span class="ct-stat-value">${iV}</span><button class="ct-roll-btn" data-roll-stat="intellect" title="Roll Intellect"><i class="fas fa-dice-d20"></i></button>
            </div>
          </div>

          <!-- Portrait below -->
          <div class="ct-portrait-wrap" style="--ct-xp-x:${xpCircleOffsetX}%; --ct-xp-y:${xpCircleOffsetY}%;" title="Left-click: Open Sheet · Right-click: Portrait Settings">
            <img class="ct-portrait"
                 src="${img}"
                 style="width:${pWidth}px;${shadowCSS}"
                 alt="${actor.name}" />
            <!-- Dice bar — floating horizontally at bottom of portrait -->
            <div class="ct-dice-bar">
              <button class="ct-dice-btn" data-die="d100" title="Roll d100">
                <i class="fa-solid fa-percent"></i>
              </button>
              <button class="ct-dice-btn" data-die="d6" title="Roll d6">
                <i class="fa-solid fa-dice-six"></i>
              </button>
              <button class="ct-dice-btn" data-die="d10" title="Roll d10">
                <i class="fa-solid fa-dice-d10"></i>
              </button>
              <button class="ct-dice-btn" data-die="d20" title="Roll d20">
                <i class="fa-solid fa-dice-d20"></i>
              </button>
            </div>
            ${this._buildRecoveryRolls(actor)}
            <div class="ct-xp-panel ct-xp-panel-portrait">
              <div class="ct-xp-orb" title="Click left side to decrease XP · Click right side to increase XP">
                <div class="ct-xp-wheel">
                  ${xpSegments.map((active, idx) => `<span class="ct-xp-seg${active ? ' active' : ''}" style="--seg:${idx}"></span>`).join('')}
                </div>
                <div class="ct-xp-core">
                  <span class="ct-xp-value">${xpDisplay}</span>
                </div>
              </div>
            </div>
          </div>
          ${this._buildFocusedArcWidget(actor)}
        </div>
      </div>`;
  }

  _buildFocusedArcWidget(actor) {
    const focusedArcIndex = this._getFocusedPersonaArcIndex(actor);
    const focusedArcs     = this._getPersonaArcs(actor);
    const focusedArcTitle = focusedArcIndex !== null && focusedArcs[focusedArcIndex]
      ? String(focusedArcs[focusedArcIndex]?.title || `Arc ${focusedArcIndex + 1}`).trim()
      : '';
    const ax  = this._gs("arcWidgetOffsetX")   ?? 82;
    const ay  = this._gs("arcWidgetOffsetY")   ?? 64;
    const asc = Math.max(0.5, Math.min(1.6, (this._gs("arcWidgetScale") ?? 74) / 100));
    const abg = Math.max(0, Math.min(1, this._gs("arcWidgetBgOpacity") ?? 0.28));
    const afc = this._gs("arcWidgetFontColor") ?? "#fff0d0";
    const afs = Math.max(0.6, Math.min(1.6, (this._gs("arcWidgetFontSize") ?? 84) / 100));
    const style = [
      `--ct-arc-wx:${ax}%`,
      `--ct-arc-wy:${ay}%`,
      `--ct-arc-wsc:${asc}`,
      `--ct-arc-wbg:${hexToRGBA('#0b0f16', abg)}`,
      `--ct-arc-wfc:${afc}`,
      `--ct-arc-wfs:${afs}`
    ].join(';');
    return `<div class="ct-portrait-focus-widget${focusedArcTitle ? ' has-arc' : ''}" style="${style}">
      <div class="ct-portrait-focus-label">FOCUSED ARC</div>
      <div class="ct-portrait-focus-title">${foundry.utils.escapeHTML(focusedArcTitle || 'None selected')}</div>
    </div>`;
  }

  _getActorDamageStatus(actor) {
    const sys = actor?.system ?? {};
    const directCandidates = [
      sys.combat?.damageTrack,
      sys.combat?.damage,
      sys.damageTrack,
      sys.damage,
      sys.basic?.damageTrack,
      sys.combat?.state,
      sys.combat?.damageCondition
    ];
    for (const candidate of directCandidates) {
      const normalized = String(candidate ?? '').trim().toLowerCase();
      if (!normalized) continue;
      if (["hale", "healthy", "0", "normal"].includes(normalized)) return 'hale';
      if (["impaired", "impaireded", "1"].includes(normalized)) return 'impaired';
      if (["debilitated", "2", "dead", "3"].includes(normalized)) return 'debilitated';
    }

    const boolImpaired = sys.combat?.impaired ?? sys.impaired ?? sys.damageTrack?.impaired ?? sys.combat?.damageTrack?.impaired;
    const boolDebilitated = sys.combat?.debilitated ?? sys.debilitated ?? sys.damageTrack?.debilitated ?? sys.combat?.damageTrack?.debilitated;
    if (boolDebilitated === true) return 'debilitated';
    if (boolImpaired === true) return 'impaired';

    const damageTrackObject = sys.damageTrack ?? sys.combat?.damageTrack;
    if (damageTrackObject && typeof damageTrackObject === 'object') {
      const activeFlag = damageTrackObject.value ?? damageTrackObject.label ?? damageTrackObject.state ?? damageTrackObject.current ?? null;
      const normalized = String(activeFlag ?? '').trim().toLowerCase();
      if (["hale", "healthy", "0", "normal"].includes(normalized)) return 'hale';
      if (["impaired", "1"].includes(normalized)) return 'impaired';
      if (["debilitated", "2", "dead", "3"].includes(normalized)) return 'debilitated';
      if (damageTrackObject.debilitated === true) return 'debilitated';
      if (damageTrackObject.impaired === true) return 'impaired';
    }

    const damageStep = Number(sys.combat?.damageStep ?? sys.damageStep ?? sys.combat?.damageTrackStep ?? sys.basic?.damageTrackStep ?? sys.combat?.damageTrack?.value ?? sys.damageTrack?.value ?? NaN);
    if (Number.isFinite(damageStep)) {
      if (damageStep >= 2) return 'debilitated';
      if (damageStep >= 1) return 'impaired';
      return 'hale';
    }

    const selectorValue = String(sys.combat?.recoveries?.damageTrack ?? sys.combat?.recoveries?.state ?? '').trim().toLowerCase();
    if (["hale", "healthy", "0", "normal"].includes(selectorValue)) return 'hale';
    if (["impaired", "1"].includes(selectorValue)) return 'impaired';
    if (["debilitated", "2", "dead", "3"].includes(selectorValue)) return 'debilitated';

    const mightPool = Number(sys.pools?.might?.value ?? sys.pools?.might?.current ?? sys.basic?.might?.value ?? sys.basic?.might?.current ?? 0);
    const speedPool = Number(sys.pools?.speed?.value ?? sys.pools?.speed?.current ?? sys.basic?.speed?.value ?? sys.basic?.speed?.current ?? 0);
    const intellectPool = Number(sys.pools?.intellect?.value ?? sys.pools?.intellect?.current ?? sys.basic?.intellect?.value ?? sys.basic?.intellect?.current ?? 0);
    const zeroPools = [mightPool, speedPool, intellectPool].filter(v => v <= 0).length;
    if (zeroPools >= 2) return 'debilitated';
    if (zeroPools >= 1) return 'impaired';
    return 'hale';
  }

  _buildStatusEffects(actor) {
    if (!actor) return `<span class="ct-status-effects-empty">No active effects</span>`;
    const effects = actor.effects?.filter(e => !e.disabled) ?? [];
    if (effects.length === 0) return `<span class="ct-status-effects-empty">No active effects</span>`;
    return effects.map((e, i) => {
      const color = this._effectColor(e);
      const changes = this._formatEffectChanges(e);
      const desc = foundry.utils.escapeHTML(e.description || e.system?.description || "");
      return `
      <div class="ct-status-effect-wrap" data-effect-index="${i}" style="--ct-effect-color:${color};--ct-effect-delay:${i * 0.35}s;"
           data-effect-name="${foundry.utils.escapeHTML(e.name || 'Unknown Effect')}"
           data-effect-desc="${desc}"
           data-effect-changes="${foundry.utils.escapeHTML(changes)}"
           data-effect-icon="${e.img || 'icons/svg/aura.svg'}">
        <img class="ct-status-effect-icon" src="${e.img || 'icons/svg/aura.svg'}" draggable="false" alt="" />
      </div>`;
    }).join('');
  }

  _effectColor(e) {
    if (e.tint) return e.tint;
    // Derive warm hue from effect name hash
    let hash = 0;
    const name = e.name || "";
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 50 + 30; // 30-80 range = warm gold/amber/orange
    return `hsl(${hue}, 70%, 58%)`;
  }

  _formatEffectChanges(e) {
    const changes = e.changes || [];
    if (!changes.length) return "";
    return changes.map(c => {
      const key = (c.key || "").split(".").pop() || "stat";
      const mode = ["+","×","↓","↑","→","⇄"][c.mode] || "→";
      return `${key} ${mode}${c.value}`;
    }).join(", ");
  }

  _refreshStatusEffects() {
    const container = this.element?.querySelector('#ct-status-effects-area');
    if (!container || !this.actor) return;
    container.innerHTML = this._buildStatusEffects(this.actor);
    this._bindStatusEffectTooltips();
  }

  _bindStatusEffectTooltips() {
    const container = this.element?.querySelector('#ct-status-effects-area');
    if (!container) return;
    const bar = this.element;

    container.querySelectorAll('.ct-status-effect-wrap').forEach(wrap => {
      wrap.addEventListener('mouseenter', () => {
        const name = wrap.dataset.effectName;
        const desc = wrap.dataset.effectDesc;
        const changes = wrap.dataset.effectChanges;
        const icon = wrap.dataset.effectIcon;

        let tooltip = document.querySelector('#ct-effect-tooltip');
        if (!tooltip) {
          tooltip = document.createElement('div');
          tooltip.id = 'ct-effect-tooltip';
          document.body.appendChild(tooltip);
        }

        tooltip.innerHTML = `
          <div class="ct-effect-tt-header">
            <img src="${icon}" alt="" draggable="false">
            <span>${name}</span>
          </div>
          ${desc ? `<div class="ct-effect-tt-desc">${desc}</div>` : ''}
          ${changes ? `<div class="ct-effect-tt-changes"><i class="fas fa-sliders-h"></i> ${changes}</div>` : ''}
        `;
        tooltip.classList.add('ct-effect-tt-visible');
      });

      wrap.addEventListener('mouseleave', () => {
        const tooltip = document.querySelector('#ct-effect-tooltip');
        if (tooltip) tooltip.classList.remove('ct-effect-tt-visible');
      });

      wrap.addEventListener('mousemove', (ev) => {
        const tooltip = document.querySelector('#ct-effect-tooltip');
        if (!tooltip) return;
        const x = ev.clientX;
        const y = ev.clientY;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const tw = tooltip.offsetWidth || 220;
        const th = tooltip.offsetHeight || 100;
        let left = x + 14;
        let top = y - th - 10;
        if (left + tw > vw - 8) left = x - tw - 14;
        if (top < 8) top = y + 18;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      });
    });
  }

  _buildSection2(noActor) {
    const btns = [
      { key:"persona",   icon:"fas fa-user-circle",    label:"Persona" },
      { key:"skills",    icon:"fas fa-graduation-cap", label:"Skills" },
      { key:"abilities", icon:"fas fa-magic",          label:"Abilities" },
      { key:"combat",    icon:"fas fa-sword",          label:"Combat" },
      { key:"equipment", icon:"fas fa-backpack",       label:"Equipment" }
    ];
    const hasSpells = !noActor && this._hasSpellCategory();
    if (hasSpells) btns.splice(3, 0, { key:"spells", icon:"fas fa-hat-wizard", label:"Spells" });
    return `<div class="ct-action-buttons">
      ${btns.map(b => `
        <button class="ct-btn${noActor?" ct-btn-disabled":""}" data-panel="${b.key}"
                title="${b.label}" ${noActor?"disabled":""}>
          <i class="${b.icon}"></i><span>${b.label}</span>
        </button>`).join("")}
      <!-- Cash & Values + Assets stacked buttons -->
      <div class="ct-btn-stack" title="Valuables">
        <button class="ct-btn${noActor?" ct-btn-disabled":""}" data-panel="cash"
                title="Cash & Values" ${noActor?"disabled":""}>
          <i class="fas fa-coins"></i>
        </button>
        <button class="ct-btn${noActor?" ct-btn-disabled":""}" data-panel="assets"
                title="Assets" ${noActor?"disabled":""}>
          <i class="fas fa-landmark"></i>
        </button>
      </div>
      <!-- Compact 2x2 category grid -->
      <div class="ct-mini-grid" title="Quick category menus">
        <button class="ct-mini-btn" data-mini="people" title="People"><i class="fas fa-users"></i></button>
        <button class="ct-mini-btn" data-mini="places" title="Places"><i class="fas fa-map-marker-alt"></i></button>
        <button class="ct-mini-btn" data-mini="assets" title="Assets"><i class="fas fa-coins"></i></button>
        <button class="ct-mini-btn" data-mini="secrets" title="Secrets"><i class="fas fa-user-secret"></i></button>
      </div>
    </div>`;
  }

  _buildBarMeta(actor) {
    const statuses = {
      hale: { label: 'HALE', icon: 'fas fa-heart-pulse', cls: 'ct-status-hale' },
      impaired: { label: 'IMPAIRED', icon: 'fas fa-triangle-exclamation', cls: 'ct-status-impaired' },
      debilitated: { label: 'DEBILITATED', icon: 'fas fa-skull-crossbones', cls: 'ct-status-debilitated' }
    };
    const statusKey = this._getActorDamageStatus(actor);
    const status = statuses[statusKey] ?? statuses.hale;
    return `
      <div class="ct-bar-meta ct-bar-status-wrap">
        <div class="ct-bar-status ${status.cls}" aria-label="Character status: ${status.label}">
          <i class="${status.icon}"></i>
          <span class="ct-bar-status-label">${status.label}</span>
        </div>
      </div>`;
  }

  _isSpellName(name) {
    const n = (name ?? "").trim().toLowerCase();
    return ["spell", "spells", "magic"].includes(n);
  }

  _hasSpellCategory() {
    if (!this.actor) return false;
    const skillCats = this._getSkillCategories();
    const abCats    = this._getAbilityCategories();
    const spellCats = this._getSpellCategories();
    return (
      skillCats.some(c => this._isSpellName(c.name)) ||
      abCats.some(c   => this._isSpellName(c.name)) ||
      spellCats.some(c => this._isSpellName(c.name)) ||
      this._isSpellName("uncategorized") // always false, but safe
    );
  }

  /* ── Recovery Rolls — blue drops + candle (separate from dice bar) ── */
  _buildRecoveryRolls(actor) {
    if (!actor) return "";
    const sys = actor.system ?? {};
    // Try all known Cypher System recovery data paths (v2.x through v3.x)
    let rolls = null;
    if (Array.isArray(sys.combat?.recoveries?.recoveryRolls)) rolls = sys.combat.recoveries.recoveryRolls;
    else if (Array.isArray(sys.recoveries?.recoveryRolls)) rolls = sys.recoveries.recoveryRolls;
    else if (Array.isArray(sys.combat?.recoveryRolls)) rolls = sys.combat.recoveryRolls;
    else if (Array.isArray(sys.attributes?.recoveries)) rolls = sys.attributes.recoveries;
    else if (actor.getFlag("cyphersystem", "recoveryRolls")) rolls = actor.getFlag("cyphersystem", "recoveryRolls");
    else rolls = [true, true, true, true]; // default: all available
    const rollArr = Array.isArray(rolls) ? rolls.slice(0, 4) : [true, true, true, true];
    const defs = [
      { label: "Recovery 1 — 1 Action", desc: "Spend: one action" },
      { label: "Recovery 2 — 10 Minutes", desc: "Spend: ten minutes rest" },
      { label: "Recovery 3 — 1 Hour", desc: "Spend: one hour rest" },
      { label: "Recovery 4 — 10 Hours", desc: "Spend: ten hours rest" }
    ];
    const dropColor = this._gs("recoveryDropColor") ?? "#3a8fd4";
    const bgColor = this._gs("recoveryBgColor") ?? "#808080";
    const bgOpacity = this._gs("recoveryBgOpacity") ?? 0.25;
    const space = this._gs("recoverySpace") ?? 98;
    // Convert hex bg color to rgba
    const hexToRgba = (hex, alpha) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    const bgRgba = hexToRgba(bgColor, bgOpacity);
    const drops = rollArr.map((available, idx) => {
      const isAvailable = available === true || Number(available) > 0;
      return `<button class="ct-recovery-drop${isAvailable ? '' : ' spent'}" data-recovery-index="${idx}" type="button" data-tt="${foundry.utils.escapeHTML(defs[idx].label)}" data-tt-desc="${foundry.utils.escapeHTML(defs[idx].desc)}" ${!isAvailable ? 'disabled' : ''}><i class="fas fa-tint"></i></button>`;
    }).join("");
    return `<div class="ct-recovery-bar" style="--ct-rec-drop-color:${dropColor};background:${bgRgba};left:calc(50% + ${space}px);">${drops}</div>`;
  }

  async _spendRecoveryRoll(index) {
    const actor = this.actor;
    if (!actor) return;
    const labels = ["1 Action", "10 Minutes", "1 Hour", "10 Hours"];
    const poolKeys = ["might", "speed", "intellect"];
    const poolMeta = poolKeys.map(k => {
      const p = actor.system?.pools?.[k] ?? { value: 0, max: 0 };
      return { key: k, label: k.charAt(0).toUpperCase() + k.slice(1), orig: p.value, max: p.max };
    });

    // ── 1. All pools full → snarky modal ──
    if (poolMeta.every(p => p.orig >= p.max)) {
      await this._showCustomModal({
        width: 320,
        content: `<div class="ct-snark"><div class="ct-snark-frame"><div class="ct-snark-icon"><i class="fas fa-heart"></i></div><div class="ct-snark-title">Well, well...</div><div class="ct-snark-line">Recovering? From what?</div><div class="ct-snark-line">You are full, <em>fool</em>.</div><div class="ct-snark-ornament">* * *</div></div></div>`,
        buttons: [{ label: "Dismiss", action: "close", className: "ct-modal-btn" }]
      });
      return;
    }

    // ── 2. Re-fetch fresh recovery data from actor ──
    const _getRecoveryData = () => {
      const sys = actor.system ?? {};
      if (Array.isArray(sys.combat?.recoveries?.recoveryRolls)) return { arr: [...sys.combat.recoveries.recoveryRolls], path: "system.combat.recoveries.recoveryRolls" };
      if (Array.isArray(sys.recoveries?.recoveryRolls)) return { arr: [...sys.recoveries.recoveryRolls], path: "system.recoveries.recoveryRolls" };
      if (Array.isArray(sys.combat?.recoveryRolls)) return { arr: [...sys.combat.recoveryRolls], path: "system.combat.recoveryRolls" };
      return { arr: [true, true, true, true], path: "system.combat.recoveries.recoveryRolls" };
    };
    let { arr, path } = _getRecoveryData();
    if (!arr[index] || (typeof arr[index] === "boolean" ? !arr[index] : Number(arr[index]) <= 0)) {
      ui.notifications?.warn?.(`${labels[index]} recovery already spent.`);
      return;
    }

    // ── 2b. Order enforcement: must spend in sequence ──
    if (index > 0) {
      const prevAvailable = arr.slice(0, index).some((v, i) => {
        const available = v === true || Number(v) > 0;
        return available;
      });
      if (prevAvailable) {
        // Show fancy snark toast that auto-fades
        const toast = document.createElement("div");
        toast.className = "ct-recovery-toast";
        toast.innerHTML = `
          <div class="ct-recovery-toast-inner">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Seriously! Did you read the rules!</span>
          </div>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add("ct-show"));
        setTimeout(() => {
          toast.classList.remove("ct-show");
          toast.addEventListener("transitionend", () => toast.remove(), { once: true });
        }, 3000);
        return;
      }
    }

    // ── 3. Spend THIS recovery via Cypher System API or direct update ──
    const spentVal = typeof arr[index] === "boolean" ? false : 0;
    arr[index] = spentVal;
    let spentViaAPI = false;
    if (typeof actor.rollRecovery === "function") {
      try { await actor.rollRecovery(index); spentViaAPI = true; } catch (e) { console.warn(`${MODULE_ID} | rollRecovery failed, falling back to direct update`); }
    }
    if (!spentViaAPI) await actor.update({ [path]: arr });

    // ── 4. Force re-fetch actor data and refresh display ──
    await this._resolveActor();
    this.refresh();

    // ── 5. Roll recovery ──
    const tier = actor.system?.basic?.tier ?? 1;
    const roll = new Roll(`1d6 + ${tier}`);
    await roll.evaluate();
    const total = roll.total;

    // ── 6. Fancy allocation dialog ──
    const poolColors = { might: { hue: '#d94040', glow: 'rgba(217,64,64,0.3)', icon: 'fist-raised' }, speed: { hue: '#3a8fd4', glow: 'rgba(58,143,212,0.3)', icon: 'wind' }, intellect: { hue: '#7a44cc', glow: 'rgba(122,68,204,0.3)', icon: 'brain' } };
    const dlgHTML = `
      <div class="ct-recdlg">
        <div class="ct-recdlg-header">RECOVER</div>
        <div class="ct-recdlg-sub">Rolled 1d6 + ${tier}</div>
        <div class="ct-recdlg-numwrap">
          <div class="ct-recdlg-number${total > 0 ? '' : ' ct-zero'}" id="ct-recover-num">${total}</div>
          <div class="ct-recdlg-glowring${total > 0 ? ' ct-active' : ''}" id="ct-recover-glow"></div>
        </div>
        <div class="ct-recdlg-label">points to allocate</div>
        <div class="ct-recdlg-pools">
          ${poolMeta.map(p => { const c = poolColors[p.key]; const pct = p.max > 0 ? (p.orig / p.max) * 100 : 0;
            return `<div class="ct-recdlg-pool" data-pool="${p.key}" data-orig="${p.orig}" data-max="${p.max}" style="--pool-hue:${c.hue};--pool-glow:${c.glow};">
              <div class="ct-recdlg-pool-top"><i class="fas fa-${c.icon}"></i><span class="ct-recdlg-pool-name">${p.label}</span></div>
              <div class="ct-recdlg-pool-mid"><span class="ct-recdlg-cur" id="ct-cur-${p.key}">${p.orig}</span><span class="ct-recdlg-sep">/</span><span class="ct-recdlg-maxv">${p.max}</span></div>
              <div class="ct-recdlg-track"><div class="ct-recdlg-trackfill" id="ct-fill-${p.key}" style="width:${pct}%;background:${c.hue};"></div></div>
              <div class="ct-recdlg-hint"><span class="ct-recdlg-minus"><i class="fas fa-chevron-left"></i></span><span class="ct-recdlg-plus"><i class="fas fa-chevron-right"></i></span></div>
            </div>`; }).join("") }
        </div>
      </div>`;
    const s = document.createElement("style"); s.id = "ct-recdlg-style";
    // Remove old style if exists (prevent accumulation)
    document.getElementById("ct-recdlg-style")?.remove();
    s.textContent = `
      @keyframes ct-recglow { 0%,100%{opacity:0.35;transform:translate(-50%,-50%) scale(1)}50%{opacity:0.65;transform:translate(-50%,-50%) scale(1.1)} }
      @keyframes ct-reconfetti { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
      .ct-recdlg { text-align:center; padding:4px 8px 6px; user-select:none; }
      .ct-recdlg-header { font-size:1.25em; font-weight:700; color:#c8a96e; letter-spacing:0.18em; margin-bottom:2px; font-family:"Signika","Palatino Linotype",serif; text-shadow:0 0 12px rgba(200,169,110,0.22); }
      .ct-recdlg-sub { font-size:0.62em; color:#5a5a5a; letter-spacing:0.06em; margin-bottom:10px; text-transform:uppercase; }
      .ct-recdlg-numwrap { position:relative; display:inline-block; margin:2px 0 4px; }
      .ct-recdlg-number { font-size:3.6em; font-weight:700; color:#f0d68a; line-height:1; text-shadow:0 0 24px rgba(200,169,110,0.4); font-family:"Modesto Condensed","Signika",serif; transition:all 0.3s cubic-bezier(0.16,1,0.3,1); position:relative; z-index:2; min-width:60px; display:inline-block; }
      .ct-recdlg-number.ct-zero { color:#4a3a1a; text-shadow:none; transform:scale(0.88); }
      .ct-recdlg-glowring { position:absolute; top:50%; left:50%; width:84px; height:84px; border-radius:50%; border:1px solid rgba(200,169,110,0.12); transform:translate(-50%,-50%); pointer-events:none; opacity:0; transition:opacity 0.3s; z-index:1; }
      .ct-recdlg-glowring.ct-active { opacity:1; animation:ct-recglow 2.5s ease infinite; }
      .ct-recdlg-label { font-size:0.65em; color:#6a6a6a; margin-bottom:16px; letter-spacing:0.08em; text-transform:uppercase; }
      .ct-recdlg-pools { display:flex; gap:10px; justify-content:center; }
      .ct-recdlg-pool { background:rgba(15,12,22,0.95); border:1px solid rgba(200,169,110,0.12); border-radius:12px; padding:14px 10px 10px; min-width:92px; cursor:pointer; transition:all 0.2s cubic-bezier(0.16,1,0.3,1); position:relative; overflow:hidden; animation:ct-reconfetti 0.4s ease both; }
      .ct-recdlg-pool:nth-child(1){animation-delay:0.05s} .ct-recdlg-pool:nth-child(2){animation-delay:0.15s} .ct-recdlg-pool:nth-child(3){animation-delay:0.25s}
      .ct-recdlg-pool:hover { border-color:var(--pool-hue); background:rgba(20,16,30,0.98); transform:translateY(-4px); box-shadow:0 8px 24px rgba(0,0,0,0.4), 0 0 16px var(--pool-glow); }
      .ct-recdlg-pool:active { transform:translateY(-1px); }
      .ct-recdlg-pool-top { display:flex; align-items:center; justify-content:center; gap:5px; margin-bottom:6px; font-size:0.72em; color:var(--pool-hue); }
      .ct-recdlg-pool-top i { font-size:0.85em; opacity:0.65; }
      .ct-recdlg-pool-name { font-weight:600; letter-spacing:0.05em; }
      .ct-recdlg-pool-mid { font-size:1.25em; font-weight:700; color:#e8e8e8; margin-bottom:8px; display:flex; align-items:center; justify-content:center; gap:3px; }
      .ct-recdlg-cur { color:#f0d68a; transition:all 0.25s; min-width:22px; display:inline-block; }
      .ct-recdlg-cur.ct-modified { color:#7ec878; text-shadow:0 0 8px rgba(126,200,120,0.45); transform:scale(1.1); }
      .ct-recdlg-sep { color:#3a3a3a; font-weight:400; font-size:0.78em; }
      .ct-recdlg-maxv { color:#5a5a5a; font-weight:400; font-size:0.88em; }
      .ct-recdlg-track { width:100%; height:4px; background:rgba(255,255,255,0.03); border-radius:2px; margin-bottom:8px; overflow:hidden; }
      .ct-recdlg-trackfill { height:100%; border-radius:2px; opacity:0.6; transition:width 0.25s cubic-bezier(0.16,1,0.3,1); box-shadow:0 0 6px currentColor; }
      .ct-recdlg-hint { display:flex; justify-content:space-between; padding:0 4px; font-size:0.55em; color:#3a3a3a; letter-spacing:0.04em; }
      .ct-recdlg-pool:hover .ct-recdlg-minus { color:#d94040; } .ct-recdlg-pool:hover .ct-recdlg-plus { color:#7ec878; }
    `;
    document.head.appendChild(s);

    let remaining = total;
    const allocated = { might: 0, speed: 0, intellect: 0 };

    const result = await this._showCustomModal({
      width: 400,
      title: `Recovery — ${labels[index]}`,
      content: dlgHTML,
      buttons: [{ label: "RECOVER", action: "apply", className: "ct-modal-btn ct-modal-btn-primary" }],
      onRender: (container) => {
        container.querySelectorAll(".ct-recdlg-pool").forEach(el => {
          const key = el.dataset.pool, orig = Number(el.dataset.orig), max = Number(el.dataset.max);
          el.addEventListener("click", (e) => {
            e.preventDefault();
            if (allocated[key] <= 0) return;
            allocated[key]--; remaining++;
            const newVal = orig + allocated[key];
            const elCur = container.querySelector(`#ct-cur-${key}`);
            const elFill = container.querySelector(`#ct-fill-${key}`);
            const elNum = container.querySelector("#ct-recover-num");
            const elGlow = container.querySelector("#ct-recover-glow");
            if (elCur) { elCur.textContent = newVal; elCur.classList.toggle("ct-modified", allocated[key] > 0); }
            if (elFill) elFill.style.width = `${(newVal / max) * 100}%`;
            if (elNum) { elNum.textContent = remaining; elNum.classList.toggle("ct-zero", remaining <= 0); }
            if (elGlow) elGlow.classList.toggle("ct-active", remaining > 0);
          });
          el.addEventListener("contextmenu", (e) => {
            e.preventDefault(); e.stopPropagation();
            if (remaining <= 0) return;
            if (orig + allocated[key] >= max) return;
            allocated[key]++; remaining--;
            const newVal = orig + allocated[key];
            const elCur = container.querySelector(`#ct-cur-${key}`);
            const elFill = container.querySelector(`#ct-fill-${key}`);
            const elNum = container.querySelector("#ct-recover-num");
            const elGlow = container.querySelector("#ct-recover-glow");
            if (elCur) { elCur.textContent = newVal; elCur.classList.toggle("ct-modified", allocated[key] > 0); }
            if (elFill) elFill.style.width = `${(newVal / max) * 100}%`;
            if (elNum) { elNum.textContent = remaining; elNum.classList.toggle("ct-zero", remaining <= 0); }
            if (elGlow) elGlow.classList.toggle("ct-active", remaining > 0);
          });
        });
      }
    });
    document.getElementById("ct-recdlg-style")?.remove();
    if (result !== "apply") return;

    // ── 7. Apply pool updates ──
    const updates = {};
    poolKeys.forEach(k => { if (allocated[k] > 0) { const p = poolMeta.find(m => m.key === k); updates[`system.pools.${k}.value`] = Math.min(p.orig + allocated[k], p.max); } });
    if (Object.keys(updates).length > 0) await actor.update(updates);

    const spent = total - remaining;
    if (spent > 0) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `Recovery (${labels[index]}) — ${spent} points restored` });
  }

  async _resetAllRecoveryRolls() {
    const actor = this.actor;
    if (!actor) return;

    // GM can rest directly — players must request approval
    if (game.user?.isGM) {
      await this._doRest(actor);
      return;
    }

    // Send GM approval request via socket
    const gmUsers = game.users?.filter(u => u.active && u.isGM) ?? [];
    if (gmUsers.length === 0) {
      ui.notifications?.warn?.("No GM online to approve rest.");
      return;
    }
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "gmRestRequest",
      actorId: actor.id,
      actorName: actor.name,
      userId: game.user.id,
      userName: game.user.name
    });
    ui.notifications?.info?.(`Rest request sent to GM for ${actor.name}.`);
  }

  async _doRest(actor) {
    // Perform actual rest — restore all recovery rolls
    try {
      // Try Cypher System native rest() API
      if (typeof actor.rest === "function") {
        await actor.rest();
        this.refresh();
        ui.notifications?.info?.("All recovery rolls restored.");
        return;
      }
      // Fallback: direct update matching the data type
      const sys = actor.system ?? {};
      let currentArr, updatePath;
      if (Array.isArray(sys.combat?.recoveries?.recoveryRolls)) {
        currentArr = sys.combat.recoveries.recoveryRolls;
        updatePath = "system.combat.recoveries.recoveryRolls";
      } else if (Array.isArray(sys.recoveries?.recoveryRolls)) {
        currentArr = sys.recoveries.recoveryRolls;
        updatePath = "system.recoveries.recoveryRolls";
      } else {
        currentArr = [true, true, true, true];
        updatePath = "system.combat.recoveries.recoveryRolls";
      }
      const isBool = typeof currentArr[0] === "boolean";
      await actor.update({ [updatePath]: currentArr.map(() => isBool ? true : 1) });
      await this._resolveActor();
      this.refresh();
      ui.notifications?.info?.("All recovery rolls restored.");
    } catch (err) {
      console.error(`${MODULE_ID} | Rest failed:`, err);
      ui.notifications?.error?.("Rest failed.");
    }
  }

  async _openGMRestRequest(payload) {
    // GM receives rest approval request from player
    if (!game.user?.isGM) return;
    const actor = game.actors?.get(payload.actorId);
    if (!actor) return;
    const result = await this._showCustomModal({
      width: 360,
      title: "Rest Request",
      content: `
        <div class="ct-snark" style="padding:12px 4px 4px;">
          <div class="ct-snark-frame" style="animation:none; padding:20px 16px 16px;">
            <div class="ct-snark-icon" style="font-size:2em; animation:none;"><i class="fas fa-bed"></i></div>
            <div class="ct-snark-title" style="font-size:1.2em;">${foundry.utils.escapeHTML(payload.userName)} requests rest</div>
            <div class="ct-snark-line">Character: <strong style="color:#c8a96e;">${foundry.utils.escapeHTML(payload.actorName)}</strong></div>
            <div class="ct-snark-line" style="font-size:0.85em; color:#7a7a7a; margin-top:8px;">Approve to restore all recovery rolls.</div>
          </div>
        </div>`,
      buttons: [
        { label: "Approve", action: "approve", className: "ct-modal-btn ct-modal-btn-primary" },
        { label: "Deny", action: "deny", className: "ct-modal-btn ct-modal-btn-ghost" }
      ]
    });
    if (result === "approve") {
      await this._doRest(actor);
      // Notify player
      game.socket.emit(`module.${MODULE_ID}`, {
        type: "restApproved",
        targetUserId: payload.userId,
        actorName: payload.actorName
      });
    }
  }

  _onRestApproved(payload) {
    if (game.user.id !== payload.targetUserId) return;
    ui.notifications?.info?.(`GM approved rest for ${payload.actorName}. Recovery rolls restored!`);
  }

  /* ── Custom Modal — replaces Foundry Dialog with fully custom DOM ── */
  _showCustomModal({ width = 360, title = "", content = "", buttons = [], onRender = null }) {
    return new Promise(resolve => {
      // Remove any existing custom modal
      document.querySelectorAll(".ct-modal-overlay").forEach(el => el.remove());

      // Build backdrop
      const overlay = document.createElement("div");
      overlay.className = "ct-modal-overlay";
      overlay.innerHTML = `
        <div class="ct-modal-backdrop"></div>
        <div class="ct-modal-box" style="max-width:${width}px;">
          <button class="ct-modal-close" type="button" aria-label="Close"><i class="fas fa-times"></i></button>
          ${title ? `<div class="ct-modal-title">${foundry.utils.escapeHTML(title)}</div>` : ""}
          <div class="ct-modal-body">${content}</div>
          ${buttons.length > 0 ? `<div class="ct-modal-actions">${buttons.map((b, i) => `<button class="ct-modal-action-btn${b.className ? ' ' + b.className : ''}" data-action="${b.action}" type="button">${b.label}</button>`).join("")}</div>` : ""}
        </div>
      `;
      document.body.appendChild(overlay);

      const box = overlay.querySelector(".ct-modal-box");
      const actions = {};
      buttons.forEach(b => { actions[b.action] = b.action; });

      // Close handler
      const close = (action) => {
        overlay.classList.add("ct-modal-fadeout");
        setTimeout(() => { overlay.remove(); resolve(action); }, 250);
      };

      // Backdrop click
      overlay.querySelector(".ct-modal-backdrop").addEventListener("click", () => close("cancel"));
      // Close button
      overlay.querySelector(".ct-modal-close").addEventListener("click", () => close("cancel"));
      // Action buttons
      overlay.querySelectorAll(".ct-modal-action-btn").forEach(btn => {
        btn.addEventListener("click", () => close(btn.dataset.action));
      });
      // Escape key
      const escHandler = (e) => { if (e.key === "Escape") { document.removeEventListener("keydown", escHandler); close("cancel"); } };
      document.addEventListener("keydown", escHandler);

      // onRender callback
      if (onRender) onRender(box);

      // Animate in
      requestAnimationFrame(() => { overlay.classList.add("ct-modal-visible"); });
    });
  }


  _buildSection4() {
    const locked = this._gs("locked");
    return `
      <div class="ct-controls-group">
        <button class="ct-ctrl-btn" id="ct-btn-settings" title="Taskbar Settings"><i class="fas fa-cog"></i></button>
        <button class="ct-ctrl-btn${locked?" ct-locked":""}" id="ct-btn-lock"
                title="${locked?"Unlock Taskbar":"Lock Taskbar (disable auto-hide)"}">
          <i class="fas fa-${locked?"lock":"lock-open"}"></i>
        </button>
        <div class="ct-online-dot" id="ct-online-dot" title="Connection Status"></div>
      </div>`;
  }

  _bindEvents() {
    const bar = this.element;
    if (!bar) return;
      const actor = this.actor;

    const portrait = bar.querySelector(".ct-portrait");
    const eyeBtn = bar.querySelector("#ct-btn-eye");
    if (eyeBtn) {
      eyeBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._portraitToggleBusy) return;
        this._portraitToggleBusy = true;
        this._suppressRender = true;
        try {
          const collapsed = !!(this._gs("portraitAreaCollapsed") ?? false);
          const newCollapsed = !collapsed;
          // Toggle slide animation class on float FIRST (before save triggers render)
          const floatEl = document.querySelector("#ct-char-float");
          if (floatEl) {
            floatEl.classList.toggle("ct-portrait-slide-away", newCollapsed);
          }
          // Update section-1 collapsed state
          const s1 = bar.querySelector(".ct-section-1");
          if (s1) {
            s1.classList.toggle("ct-section-1-collapsed", newCollapsed);
          }
          // Update eye button appearance
          const icon = eyeBtn.querySelector("i");
          if (icon) {
            icon.className = `fas ${newCollapsed ? 'fa-eye-slash' : 'fa-eye'}`;
          }
          eyeBtn.classList.toggle("ct-eye-collapsed", newCollapsed);
          eyeBtn.title = newCollapsed ? "Show portrait" : "Hide portrait";
          // Save setting LAST (triggers updateActor hook → render, but _suppressRender blocks it)
          await this._ss("portraitAreaCollapsed", newCollapsed);
        } finally {
          this._portraitToggleBusy = false;
          this._suppressRender = false;
        }
      };
    }

    const focusedArcWidgetBtn = bar.querySelector("[data-open-focused-arc]");
    if (focusedArcWidgetBtn) {
      const openFocusedArcDialog = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const targetActor = this.actor ?? actor;
        if (!targetActor) return;
        this._openFocusedArcWidgetDialog(targetActor);
      };
      focusedArcWidgetBtn.onclick = openFocusedArcDialog;
      focusedArcWidgetBtn.addEventListener("pointerdown", openFocusedArcDialog);
      focusedArcWidgetBtn.querySelectorAll("[data-open-focused-arc-title]").forEach((el) => {
        el.addEventListener("click", openFocusedArcDialog);
        el.addEventListener("pointerdown", openFocusedArcDialog);
      });
    }
    const barPortraitRestoreBtn = bar.querySelector(".ct-bar-portrait-restore");
    if (portrait) portrait.onclick = (e) => {
      e.stopPropagation();
      this.actor?.sheet?.render(true);
    };

    if (barPortraitRestoreBtn) {
      barPortraitRestoreBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._portraitToggleBusy) return;
        this._portraitToggleBusy = true;
        try {
          await this._ss("portraitAreaCollapsed", false);
          this._closePanel();
          this.render();
        } finally {
          this._portraitToggleBusy = false;
        }
      };
      barPortraitRestoreBtn.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
      };
    }

    bar.querySelectorAll(".ct-stat-bar-wrap[data-pool]").forEach(el => {
      el.onclick = async (e) => {
        e.stopPropagation();
        await this._adjustPool(el.dataset.pool, -1);
      };
      el.oncontextmenu = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._adjustPool(el.dataset.pool, 1);
      };
    });

    bar.querySelectorAll(".ct-roll-btn[data-roll-stat]").forEach(el => {
      el.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._openStatRoll(el.dataset.rollStat);
      };
    });

    const xpOrb = bar.querySelector(".ct-xp-orb");
    if (xpOrb) {
      xpOrb.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._adjustXP(1);
      };
      xpOrb.oncontextmenu = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._adjustXP(-1);
      };
    }

    const portraitWrap = bar.querySelector(".ct-portrait-wrap");
    if (portraitWrap) portraitWrap.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openPortraitSettings(e);
    };

    // Dice bar click handlers
    bar.querySelectorAll(".ct-dice-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const die = btn.dataset.die;
        if (!die) return;
        try {
          const roll = new Roll(`1${die}`);
          await roll.evaluate();
          await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
        } catch (err) {
          console.error(`${MODULE_ID} | Dice roll failed:`, err);
          ui.notifications.error("Dice roll failed.");
        }
      });
    });
    // Recovery roll drops
    bar.querySelectorAll(".ct-recovery-drop[data-recovery-index]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt(btn.dataset.recoveryIndex);
        if (Number.isNaN(idx)) return;
        await this._spendRecoveryRoll(idx);
      });
    });
    bar.querySelectorAll(".ct-btn[data-panel]").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._suppressNextDocumentClose = true;
        this._togglePanel(btn.dataset.panel, btn);
      };
      // Right-click icon settings when unlocked
      btn.oncontextmenu = (e) => {
        if (!this._gs("menuIconsUnlocked")) return;
        e.preventDefault();
        e.stopPropagation();
        this._openMenuIconSettings(e, btn.dataset.panel);
      };
      // Make panel buttons drop targets for items from sidebar
      const panel = btn.dataset.panel;
      if (["skills","abilities","equipment"].includes(panel)) {
        this._makePanelButtonDropTarget(btn, panel);
      }
      // Apply per-icon settings
      this._applyMenuIconStyles(btn);
    });

    // ── Mini category grid buttons (People / Places / Assets / Secrets) ──
    const miniMap = { people: "_openPeoplePanel", places: "_openPlacesPanel", assets: "_openAssetsPanel", secrets: "_openSecretsPanel" };
    const miniKeyToSetting = { people: "People", places: "Places", assets: "Assets", secrets: "Secrets" };
    bar.querySelectorAll(".ct-mini-btn[data-mini]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const method = miniMap[btn.dataset.mini];
        if (method && typeof this[method] === "function") this[method](btn);
      });
      // Make each mini button a drop target (even when popup is closed)
      this._makeMiniButtonDropTarget(btn, miniKeyToSetting[btn.dataset.mini]);
    });

    const taskbarBtn = bar.querySelector("#ct-btn-settings");
    if (taskbarBtn) taskbarBtn.onclick = () => this._openTaskbarSettings();

    this._bindPanelEvents();

    const lockBtn = bar.querySelector("#ct-btn-lock");
    if (lockBtn) lockBtn.onclick = () => this._toggleLock();

    bar.querySelectorAll("[data-open-item]").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = this.actor?.items.get(e.currentTarget.dataset.openItem);
        item?.sheet?.render(true);
      };
    });

    bar.querySelectorAll("[data-roll-skill]").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._rollSkillItem(e.currentTarget.dataset.rollSkill);
      };
    });

    this._bindSkillDnD(bar);

    bar.querySelectorAll(".ct-skill-draggable[data-skill-id]").forEach(row => {
      row.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._hideSkillTooltip();
        const item = this.actor?.items.get(row.dataset.skillId);
        item?.sheet?.render(true);
      };
      row.onmouseenter = () => {
        this._hideSkillTooltip();
        const item = this.actor?.items.get(row.dataset.skillId);
        const description = this._getSkillDescription(item);
        if (!description) return;
        this._skillTooltipTimer = setTimeout(() => this._showSkillTooltip(row, description), 2000);
      };
      row.onmouseleave = () => this._hideSkillTooltip();
      row.onmousedown = () => this._hideSkillTooltip();
      row.ondragstart = ((orig) => (e) => {
        this._hideSkillTooltip();
        return orig?.call(row, e);
      })(row.ondragstart);
    });

    bar.querySelectorAll("[data-category-header]").forEach(header => {
      header.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSkillCategoryAppearanceSettings(e, header.dataset.categoryHeader);
      };
    });

    this._bindEquipmentRowEvents(bar);
    this._bindEquipmentDnD(bar);
    this._bindEquipmentTabs(bar);

    const abSettingsBtn = bar.querySelector("[data-ab-settings]");
    if (abSettingsBtn) abSettingsBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openAbilitiesMenuSettings(e);
    };

    const abCategoriesBtn = bar.querySelector("[data-ab-categories]");
    if (abCategoriesBtn) abCategoriesBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openAbilityCategoryManager(e);
    };

    const abCloseBtn = bar.querySelector("[data-ab-close]");
    if (abCloseBtn) abCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._closePanel();
    };

    bar.querySelectorAll("[data-use-ability]").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._openAbilityUseDialog(e.currentTarget.dataset.useAbility);
      };
    });



    this._bindAbilitiesDnD(bar);

    bar.querySelectorAll(".ct-ab-draggable[data-ability-id]").forEach(row => {
      row.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._hideSkillTooltip();
        const item = this.actor?.items.get(row.dataset.abilityId);
        item?.sheet?.render(true);
      };
      row.onmouseenter = () => {
        this._hideSkillTooltip();
        const item = this.actor?.items.get(row.dataset.abilityId);
        const description = this._getSkillDescription(item);
        if (!description) return;
        this._skillTooltipTimer = setTimeout(() => this._showSkillTooltip(row, description), 2000);
      };
      row.onmouseleave = () => this._hideSkillTooltip();
      row.onmousedown = () => this._hideSkillTooltip();
    });


    bar.querySelectorAll("[data-ab-category-header]").forEach(header => {
      header.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openAbilityCategoryAppearanceSettings(e, header.dataset.abCategoryHeader);
      };
    });

    // bind spells panel if active
    if (this.activePanel === "spells") this._bindSpellsPanelEvents(bar);

    bar.onmouseenter = this._boundEnter;
    bar.onmouseleave = this._boundLeave;

    if (!this._boundDocumentClick) {
      this._boundDocumentClick = (e) => {
        if (this._suppressNextDocumentClose) { this._suppressNextDocumentClose = false; return; }
        if (document.querySelector("#ct-equipment-settings-popup")) return;
        if (document.querySelector(".ct-popup")) return;
        if (this.element?.contains(e.target)) return;
        // Don't close panel when interacting with the equipment doll
        if (e.target.closest(".ct-combat-floating-panel")) return;
        // Don't close PERSONA panel on outside click — only close button
        if (this.activePanel === "persona") return;
        // Also don't close if clicking inside any open panel container
        if (e.target.closest("#ct-panel-container")) return;
        this._closePanel();
      };
      document.addEventListener("click", this._boundDocumentClick);
    }
  }

  updateAutoHide() {
    const locked   = this._gs("locked");
    const autoHide = this._gs("autoHide");
    const bar = this.element; if (!bar) return;
    if (locked || !autoHide) {
      bar.classList.remove("ct-autohide"); bar.classList.add("ct-visible");
      this._adjustCanvasPadding(true);
    } else {
      bar.classList.add("ct-autohide"); bar.classList.remove("ct-visible");
      this._adjustCanvasPadding(false);
    }
  }

  // ── Portrait Element Dragging ──
  _onMouseEnter() {
    clearTimeout(this._hideTimeout);
    this.element?.classList.add("ct-visible");
    this._adjustCanvasPadding(true);
  }

  _onMouseLeave() {
    const locked   = this._gs("locked");
    const autoHide = this._gs("autoHide");
    if (locked || !autoHide) return;
    this._hideTimeout = setTimeout(() => {
      if (!this.activePanel) {
        this.element?.classList.remove("ct-visible");
        this._adjustCanvasPadding(false);
      }
    }, 800);
  }

  _refreshActivePanel() {
    if (!this.activePanel || !this.element) return;

    const btn = this.element.querySelector(`.ct-btn[data-panel="${this.activePanel}"]`);
    const container = this.element.querySelector("#ct-panel-container");
    if (!container) return;

    this.element.querySelectorAll(".ct-btn").forEach(b => b.classList.remove("ct-btn-active"));
    if (btn) btn.classList.add("ct-btn-active");

    container.innerHTML = this._buildPanel(this.activePanel);
    container.classList.add("ct-panel-open");
    this._positionPanelToButton(this.activePanel, btn, container);
    this._bindPanelEvents();
    this._bindPersonaTabs(this.element);

    // Restore combat floating panel if it was open
    if (this.activePanel === "equipment" && this._combatFloatingOpen) {
      const equipTab = container.querySelector('.ct-equipment-side-tab[data-equipment-tab="equip"]');
      if (equipTab) equipTab.classList.add("active");
      this._openCombatFloatingPanel();
    }
  }

  _positionPanelToButton(key, btnEl, container) {
    if (!container || !btnEl) return;
    const panel = container.querySelector('.ct-panel');
    if (!panel) return;
    const wrapper = panel.closest('.ct-equipment-tabs-wrapper');
    const btnRect = btnEl.getBoundingClientRect();
    const targetEl = wrapper || panel;
    const panelWidth = targetEl.offsetWidth || 320;
    // Position: bottom-left corner above the button
    let left = btnRect.left;
    // Keep on screen
    if (left + panelWidth > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - panelWidth - 8);
    }
    targetEl.style.marginLeft = '0';
    targetEl.style.left = `${left}px`;
    targetEl.style.position = 'relative';
    // Clear panel positioning when wrapper is used so tabs move with the panel
    if (wrapper) {
      panel.style.position = '';
      panel.style.left = '';
    }
  }

  _togglePanel(key, btnEl) {
    const container = this.element?.querySelector("#ct-panel-container");
    if (!container) return;

    // Prevent switching to other panels while equipment doll is open
    if (this._combatFloatingOpen && key !== "equipment") return;

    const isSamePanelOpen = this.activePanel === key && container.classList.contains("ct-panel-open");
    if (isSamePanelOpen) {
      this._closePanel();
      return;
    }

    // Close current panel (force if locked, since we're switching)
    if (this.activePanel) this._closePanel(true);

    if (key === "cash") this._cashPanelLocked = true;

    this.activePanel = key;
    this.element?.querySelectorAll(".ct-btn").forEach(b => b.classList.remove("ct-btn-active"));
    btnEl?.classList.add("ct-btn-active");

    container.innerHTML = this._buildPanel(key);
    container.classList.add("ct-panel-open");
    this._positionPanelToButton(key, btnEl, container);
    this._bindPanelEvents();
    this._bindPersonaTabs(this.element);
    this._suppressNextDocumentClose = true;
  }

  _closePanel(force = false) {
    if (!force && this.activePanel === "cash" && this._cashPanelLocked) return;
    this._suppressNextDocumentClose = false;
    this._hideSkillTooltip();
    this.activePanel = null;
    const c = this.element?.querySelector("#ct-panel-container");
    if (c) { c.innerHTML = ""; c.classList.remove("ct-panel-open"); }
    this._refreshCombatPlaceholder();
    this.element?.querySelectorAll(".ct-btn").forEach(b => b.classList.remove("ct-btn-active"));
    const locked = this._gs("locked");
    const autoHide = this._gs("autoHide");
    if (!locked && autoHide && !this.element?.matches(":hover")) this._adjustCanvasPadding(false);
  }

  /* ═══════════════════════════════════════════════════════════════
     CYPHER LOG SHELF
     ═══════════════════════════════════════════════════════════════ */

  /** Open Cypher Log shelf as a floating panel above the trigger button */
  _openCypherLogShelf(triggerBtn) {
    // Remove existing shelf
    document.querySelector("#ct-log-shelf")?.remove();

    const shelf = document.createElement("div");
    shelf.id = "ct-log-shelf";
    shelf.className = "ct-log-shelf";

    // Build header
    const header = document.createElement("div");
    header.className = "ct-log-shelf-header";
    header.innerHTML = `<span><i class="fas fa-book-open"></i> CYPHER LOG</span><button class="ct-log-shelf-close" title="Close"><i class="fas fa-xmark"></i></button>`;
    shelf.append(header);

    // Build content area
    const body = document.createElement("div");
    body.className = "ct-log-shelf-body";

    // Fetch Cypher Log entries (journal entries with cypher-log flag)
    const entries = this._getCypherLogEntries();
    if (entries.length === 0) {
      body.innerHTML = `<div class="ct-log-shelf-empty"><i class="fas fa-feather-pointed"></i><p>Your log is empty.</p><span>Create entries in the CYPHER LOG module.</span></div>`;
    } else {
      const grid = document.createElement("div");
      grid.className = "ct-log-shelf-grid";
      for (const entry of entries) {
        const card = document.createElement("div");
        card.className = "ct-log-shelf-card";
        const cover = entry.getFlag?.("cypher-log", "cypher-log") || entry.getFlag?.("cypher-log", "cover");
        const coverHtml = cover
          ? `<div class="ct-log-card-cover" style="background-image:url('${cover}')"></div>`
          : `<div class="ct-log-card-cover ct-log-card-no-cover"><i class="fas fa-book"></i></div>`;
        card.innerHTML = `${coverHtml}<span class="ct-log-card-title">${entry.name}</span>`;
        card.addEventListener("click", () => {
          // Open the journal entry
          entry.sheet?.render(true);
          shelf.remove();
        });
        grid.append(card);
      }
      body.append(grid);
    }
    shelf.append(body);

    // Close button
    header.querySelector(".ct-log-shelf-close").addEventListener("click", () => shelf.remove());

    // Click outside to close
    const outsideClick = (e) => {
      if (!shelf.contains(e.target) && e.target !== triggerBtn) {
        shelf.remove();
        document.removeEventListener("click", outsideClick);
      }
    };
    setTimeout(() => document.addEventListener("click", outsideClick), 50);

    // Position centered on screen
    document.body.append(shelf);
    const shelfRect = shelf.getBoundingClientRect();
    const gap = 8;
    let left = (window.innerWidth - shelfRect.width) / 2;
    let top = (window.innerHeight - shelfRect.height) / 2;
    // Keep on screen
    if (left + shelfRect.width > window.innerWidth - 10) {
      left = window.innerWidth - shelfRect.width - 10;
    }
    if (left < 10) left = 10;
    if (top < 10) top = 10;
    shelf.style.left = `${left}px`;
    shelf.style.top = `${top}px`;

    return shelf;
  }

  /** Get all journal entries flagged as Cypher Log entries */
  _getCypherLogEntries() {
    try {
      return (game.journal?.contents ?? []).filter(entry => {
        try { return Boolean(entry?.getFlag?.("cypher-log", "cypher-log")); }
        catch { return false; }
      });
    } catch {
      return [];
    }
  }

  _bindPanelEvents() {
    const bar = this.element;
    if (!bar) return;

    bar.querySelectorAll(".ct-combat-action[data-combat-action]").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._handleCombatAction(e.currentTarget.dataset.combatAction);
      };
    });

    const combatCloseBtn = bar.querySelector("[data-combat-close]");
    if (combatCloseBtn) combatCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._closePanel();
    };

    const cpSettingsBtn = this.element?.querySelector("#ct-combat-placeholder-settings");
    if (cpSettingsBtn) cpSettingsBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openCombatPlaceholderSettings(e);
    };

    const skillSettingsBtn = bar.querySelector("[data-skills-settings]");
    if (skillSettingsBtn) skillSettingsBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openSkillsMenuSettings(e);
    };

    const skillCategoriesBtn = bar.querySelector("[data-skills-categories]");
    if (skillCategoriesBtn) skillCategoriesBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openSkillCategoryManager(e);
    };

    const skillCloseBtn = bar.querySelector("[data-skills-close]");
    if (skillCloseBtn) skillCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._closePanel();
    };

    const equipmentSettingsBtn = bar.querySelector("[data-equipment-settings]");
    if (equipmentSettingsBtn) equipmentSettingsBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openEquipmentMenuSettings(e);
    };

    const equipmentCategoriesBtn = bar.querySelector("[data-equipment-categories]");
    if (equipmentCategoriesBtn) equipmentCategoriesBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openEquipmentCategoryManager(e);
    };

    const equipmentCloseBtn = bar.querySelector("[data-equipment-close]");
    if (equipmentCloseBtn) equipmentCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._closePanel();
    };

    const cashCloseBtn = bar.querySelector("[data-cash-close]");
    if (cashCloseBtn) cashCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._cashPanelLocked = false;
      this._closePanel(true);
    };

    const assetsCloseBtn = bar.querySelector("[data-assets-close]");
    if (assetsCloseBtn) assetsCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._closePanel();
    };

    this._bindEquipmentRowEvents(bar);
    this._bindEquipmentDnD(bar);
    this._bindEquipmentTabs(bar);

    // ── Click on item images in panels → open item sheet ──
    const panelContainer = bar.querySelector("#ct-panel-container");
    if (panelContainer) {
      panelContainer.querySelectorAll(".ct-item-img").forEach(img => {
        const row = img.closest("[data-equipment-id], [data-ability-id], [data-skill-id], [data-weapon-id], [data-armor-id], [data-item-id]");
        if (!row) return;
        const itemId = row.dataset.equipmentId || row.dataset.abilityId || row.dataset.skillId || row.dataset.weaponId || row.dataset.armorId || row.dataset.itemId;
        if (!itemId || !this.actor) return;
        img.style.cursor = "pointer";
        img.title = "Click to open item sheet";
        img.onclick = (e) => {
          e.stopPropagation();
          const item = this.actor.items.get(itemId);
          if (item?.sheet) item.sheet.render(true);
        };
      });
    }

    bar.querySelectorAll("[data-open-item]").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const item = this.actor?.items.get(e.currentTarget.dataset.openItem);
        item?.sheet?.render(true);
      };
    });

    bar.querySelectorAll("[data-roll-skill]").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._rollSkillItem(e.currentTarget.dataset.rollSkill);
      };
    });

    bar.querySelectorAll(".ct-skill-draggable[data-skill-id]").forEach(row => {
      row.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._hideSkillTooltip();
        const item = this.actor?.items.get(row.dataset.skillId);
        item?.sheet?.render(true);
      };
      row.onmouseenter = () => {
        this._hideSkillTooltip();
        const item = this.actor?.items.get(row.dataset.skillId);
        const description = this._getSkillDescription(item);
        if (!description) return;
        this._skillTooltipTimer = setTimeout(() => this._showSkillTooltip(row, description), 2000);
      };
      row.onmouseleave = () => this._hideSkillTooltip();
      row.onmousedown = () => this._hideSkillTooltip();
      row.ondragstart = ((orig) => (e) => {
        this._hideSkillTooltip();
        return orig?.call(row, e);
      })(row.ondragstart);
    });

    bar.querySelectorAll("[data-category-header]").forEach(header => {
      header.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSkillCategoryAppearanceSettings(e, header.dataset.categoryHeader);
      };
    });
    bar.querySelectorAll("[data-edit-cat]").forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSkillCategoryAppearanceSettings(e, btn.dataset.editCat);
      };
    });

    this._bindSkillDnD(bar);

    const abSettingsBtn = bar.querySelector("[data-ab-settings]");
    if (abSettingsBtn) abSettingsBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openAbilitiesMenuSettings(e);
    };

    const abCategoriesBtn = bar.querySelector("[data-ab-categories]");
    if (abCategoriesBtn) abCategoriesBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._openAbilityCategoryManager(e);
    };

    const abCloseBtn = bar.querySelector("[data-ab-close]");
    if (abCloseBtn) abCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._closePanel();
    };

    bar.querySelectorAll("[data-use-ability]").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._openAbilityUseDialog(e.currentTarget.dataset.useAbility);
      };
    });

    this._bindAbilitiesDnD(bar);

    bar.querySelectorAll(".ct-ab-draggable[data-ability-id]").forEach(row => {
      row.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._hideSkillTooltip();
        const item = this.actor?.items.get(row.dataset.abilityId);
        item?.sheet?.render(true);
      };
      row.onmouseenter = () => {
        this._hideSkillTooltip();
        const item = this.actor?.items.get(row.dataset.abilityId);
        const description = this._getSkillDescription(item);
        if (!description) return;
        this._skillTooltipTimer = setTimeout(() => this._showSkillTooltip(row, description), 2000);
      };
      row.onmouseleave = () => this._hideSkillTooltip();
      row.onmousedown = () => this._hideSkillTooltip();
    });

    bar.querySelectorAll("[data-ab-category-header]").forEach(header => {
      header.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openAbilityCategoryAppearanceSettings(e, header.dataset.abCategoryHeader);
      };
    });

    if (this.activePanel === "spells") this._bindSpellsPanelEvents(bar);
    this._bindCashPanelEvents(bar);
    this._bindAssetsPanelEvents(bar);
  }

  _bindCashPanelEvents(bar) {
    if (!bar) return;
    const actor = this.actor;
    if (!actor) return;

    // Helper to save money without triggering panel flicker
    const _saveMoney = async (money) => {
      if (this._cashSuppressTimer) {
        clearTimeout(this._cashSuppressTimer);
        this._cashSuppressTimer = null;
      }
      this._cashOpPending = (this._cashOpPending || 0) + 1;
      this._suppressRender = true;
      try {
        await actor.setFlag(MODULE_ID, "cashMoney", money);
        // Sync with Cypher System actor sheet Equipment tab currency
        const currency = foundry.utils.duplicate(actor.system?.equipment?.currency ?? {});
        currency.active = true;
        currency.numberCategories = 4;
        currency.labelCategory1 = "CP";
        currency.labelCategory2 = "SP";
        currency.labelCategory3 = "GP";
        currency.labelCategory4 = "PP";
        currency.quantity1 = money.cp ?? 0;
        currency.quantity2 = money.sp ?? 0;
        currency.quantity3 = money.gp ?? 0;
        currency.quantity4 = money.pp ?? 0;
        await actor.update({ "system.equipment.currency": currency });
      } finally {
        this._cashOpPending = Math.max(0, (this._cashOpPending || 0) - 1);
        if (this._cashOpPending <= 0) {
          this._cashOpPending = 0;
          this._cashSuppressTimer = setTimeout(() => {
            this._suppressRender = false;
            this._cashSuppressTimer = null;
          }, 600);
        }
      }
    };

    // ── Money +/- buttons ──
    bar.querySelectorAll("[data-cash-plus]").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const coin = btn.dataset.cashPlus;
        const input = bar.querySelector(`#ct-cash-${coin}`);
        if (!input) return;
        const current = parseInt(input.value) || 0;
        const next = current + 1;
        input.value = next;
        const money = actor.getFlag(MODULE_ID, "cashMoney") ?? { cp: 0, sp: 0, gp: 0, pp: 0 };
        money[coin] = next;
        await _saveMoney(money);
      };
    });
    bar.querySelectorAll("[data-cash-minus]").forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const coin = btn.dataset.cashMinus;
        const input = bar.querySelector(`#ct-cash-${coin}`);
        if (!input) return;
        const current = parseInt(input.value) || 0;
        const next = Math.max(0, current - 1);
        input.value = next;
        const money = actor.getFlag(MODULE_ID, "cashMoney") ?? { cp: 0, sp: 0, gp: 0, pp: 0 };
        money[coin] = next;
        await _saveMoney(money);
      };
    });

    // ── Money input direct edit ──
    ["cp","sp","gp","pp"].forEach(coin => {
      const input = bar.querySelector(`#ct-cash-${coin}`);
      if (!input) return;
      input.addEventListener("change", async () => {
        const val = Math.max(0, parseInt(input.value) || 0);
        input.value = val;
        const money = actor.getFlag(MODULE_ID, "cashMoney") ?? { cp: 0, sp: 0, gp: 0, pp: 0 };
        money[coin] = val;
        await _saveMoney(money);
      });
    });

    // ── Spend button ──
    const spendBtn = bar.querySelector("[data-cash-spend]");
    if (spendBtn) {
      spendBtn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        this._showSpendDialog(actor);
      };
    }

    // ── Valuables drop zone ──
    const dropzone = bar.querySelector("[data-cash-dropzone]");
    if (dropzone && actor) {
      dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.classList.add("ct-cash-drop-active");
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      };
      dropzone.ondragleave = (e) => {
        if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove("ct-cash-drop-active");
      };
      dropzone.ondrop = async (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.remove("ct-cash-drop-active");

        let data;
        try { data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch { data = {}; }

        let item = null;

        // Try to resolve from UUID (sidebar drop)
        if (data.uuid) {
          try { item = await fromUuid(data.uuid); } catch { /* ignore */ }
        }
        // Try to resolve from world item ID (sidebar drop)
        if (!item && data.id) {
          item = game.items.get(data.id);
        }
        // If text/plain is just an item ID, it's from within the actor
        if (!item && data && !data.uuid && !data.id && typeof e.dataTransfer.getData("text/plain") === "string") {
          const rawId = e.dataTransfer.getData("text/plain").trim();
          if (rawId) item = actor.items.get(rawId);
        }

        if (!item) { ui.notifications.warn("Item not found."); return; }

        // If item is from sidebar, add to actor first
        let actorItem = actor.items.find(i => i.name === item.name && i.type === item.type);
        if (!actorItem && item.uuid && !item.actor) {
          // Item from sidebar - add to actor
          try {
            const itemData = item.toObject ? item.toObject() : foundry.utils.duplicate(item);
            delete itemData._id;
            const created = await actor.createEmbeddedDocuments("Item", [itemData]);
            if (created && created.length) actorItem = created[0];
          } catch (err) {
            ui.notifications.error("Failed to add item to actor.");
            return;
          }
        }
        if (!actorItem) actorItem = item;

        // Add to valuables list
        const valuables = actor.getFlag(MODULE_ID, "cashValuables") ?? [];
        if (valuables.includes(actorItem.id)) {
          ui.notifications.info(`"${actorItem.name}" is already in valuables.`);
          return;
        }
        valuables.push(actorItem.id);
        this._suppressRender = true;
        try {
          await actor.setFlag(MODULE_ID, "cashValuables", valuables);
        } finally {
          this._suppressRender = false;
        }
        ui.notifications.info(`"${actorItem.name}" added to valuables.`);

        // Refresh panel
        if (this.activePanel === "cash") {
          this._togglePanel("cash", this.element?.querySelector('.ct-btn[data-panel="cash"]'));
        }
      };
    }

    // ── Valuables hover tooltip + context menu ──
    bar.querySelectorAll("[data-cash-valuable]").forEach(el => {
      el.onmouseenter = () => {
        if (document.querySelector(".ct-cash-ctx-menu")) return;
        const name = el.dataset.tt || "";
        const desc = el.dataset.ttDesc || "";
        if (!name) return;
        let tooltip = document.querySelector("#ct-cash-tooltip");
        if (tooltip) tooltip.remove();
        tooltip = document.createElement("div");
        tooltip.id = "ct-cash-tooltip";
        tooltip.className = "ct-cash-tooltip";
        tooltip.innerHTML = `<div class="ct-cash-tt-header">${foundry.utils.escapeHTML(name)}</div>${desc ? `<div class="ct-cash-tt-desc">${foundry.utils.escapeHTML(desc)}</div>` : ""}`;
        document.body.appendChild(tooltip);
        const rect = el.getBoundingClientRect();
        let left = rect.left + rect.width / 2 - 100;
        let top = rect.top - tooltip.offsetHeight - 8;
        if (left < 8) left = 8;
        if (left + 200 > window.innerWidth) left = window.innerWidth - 208;
        if (top < 8) top = rect.bottom + 8;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      };
      el.onmouseleave = () => {
        const tooltip = document.querySelector("#ct-cash-tooltip");
        if (tooltip) tooltip.remove();
      };
      el.onclick = (e) => {
        e.stopPropagation();
        const itemId = el.dataset.cashValuable;
        const item = this.actor?.items.get(itemId);
        if (item?.sheet) item.sheet.render(true);
      };
      el.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showCashValuableContextMenu(el, e.clientX, e.clientY);
      };
    });
  }

  _showCashValuableContextMenu(el, x, y) {
    document.querySelectorAll(".ct-cash-ctx-menu").forEach(m => m.remove());
    const itemId = el.dataset.cashValuable;
    const item = this.actor?.items.get(itemId);
    if (!item) return;

    const menu = document.createElement("div");
    menu.className = "ct-cash-ctx-menu";
    menu.innerHTML = `
      <button class="ct-cash-ctx-item" data-action="use"><i class="fas fa-hand-sparkles"></i> USE</button>
      <button class="ct-cash-ctx-item" data-action="expend"><i class="fas fa-fire"></i> EXPEND</button>
      <button class="ct-cash-ctx-item" data-action="delete"><i class="fas fa-trash"></i> DELETE</button>
    `;
    document.body.appendChild(menu);

    // Position
    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // Actions
    menu.querySelectorAll("[data-action]").forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        menu.remove();
        const action = btn.dataset.action;
        if (action === "use") {
          await this._useCashValuable(item);
        } else if (action === "expend") {
          await this._expendCashValuable(item);
        } else if (action === "delete") {
          await this._deleteCashValuable(item);
        }
      };
    });

    // Close on outside click
    const closeHandler = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 0);
  }

  async _useCashValuable(item) {
    const actor = this.actor;
    if (!actor) return;
    const gmUsers = game.users.filter(u => u.isGM && u.active);
    if (!gmUsers.length) {
      ui.notifications.warn("No GM is currently online.");
      return;
    }
    const whisperTargets = gmUsers.map(u => u.id);
    const content = `
      <div class="ct-cash-use-card">
        <p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> is using <strong>${foundry.utils.escapeHTML(item.name)}</strong></p>
        <div class="ct-cash-use-actions">
          <button class="ct-cash-use-btn expend" data-cash-action="expend" data-actor-id="${actor.id}" data-item-id="${item.id}"><i class="fas fa-fire"></i> EXPEND</button>
          <button class="ct-cash-use-btn keep" data-cash-action="keep" data-actor-id="${actor.id}" data-item-id="${item.id}"><i class="fas fa-check"></i> OK</button>
        </div>
      </div>`;
    await ChatMessage.create({
      content,
      whisper: whisperTargets,
      speaker: ChatMessage.getSpeaker({ actor })
    });
  }

  async _expendCashValuable(item) {
    const actor = this.actor;
    if (!actor) return;
    await this._deleteCashValuable(item);
    const gmUsers = game.users.filter(u => u.isGM && u.active);
    if (gmUsers.length) {
      await ChatMessage.create({
        content: `<p><strong>${foundry.utils.escapeHTML(actor.name)}</strong> has expended <strong>${foundry.utils.escapeHTML(item.name)}</strong>.</p>`,
        whisper: gmUsers.map(u => u.id),
        speaker: ChatMessage.getSpeaker({ actor })
      });
    }
  }

  async _deleteCashValuable(item) {
    const actor = this.actor;
    if (!actor) return;
    // Remove from cashValuables flag
    const valuables = actor.getFlag(MODULE_ID, "cashValuables") ?? [];
    const filtered = valuables.filter(id => id !== item.id);

    if (this._cashSuppressTimer) {
      clearTimeout(this._cashSuppressTimer);
      this._cashSuppressTimer = null;
    }
    this._cashOpPending = (this._cashOpPending || 0) + 1;
    this._suppressRender = true;

    try {
      await actor.setFlag(MODULE_ID, "cashValuables", filtered);
      // Delete item from actor
      await actor.deleteEmbeddedDocuments("Item", [item.id]);
    } catch (err) {
      console.error("CypherTaskbar | deleteCashValuable error:", err);
    } finally {
      this._cashOpPending = Math.max(0, (this._cashOpPending || 0) - 1);
      if (this._cashOpPending <= 0) {
        this._cashOpPending = 0;
        this._cashSuppressTimer = setTimeout(() => {
          this._suppressRender = false;
          this._cashSuppressTimer = null;
        }, 600);
      }
    }

    ui.notifications.info(`"${item.name}" deleted.`);

    // Remove item from DOM to keep panel open without full rebuild flicker
    if (this.activePanel === "cash") {
      const itemEl = this.element?.querySelector(`[data-cash-valuable="${item.id}"]`);
      if (itemEl) {
        itemEl.remove();
        // If grid is now empty, show empty message
        const grid = this.element?.querySelector("[data-cash-dropzone]");
        if (grid && !grid.querySelector("[data-cash-valuable]")) {
          grid.innerHTML = `<div class="ct-cash-valuables-empty"><i class="fas fa-hand-holding"></i><span>Drop valuable items here</span></div>`;
        }
      }
    }
  }

  _showSpendDialog(actor) {
    if (!actor) return;
    // Close existing spend dialog
    const existing = document.querySelector(".ct-spend-dialog");
    if (existing) existing.remove();

    // Force Cash & Values panel open
    if (this.activePanel !== "cash") {
      const cashBtn = this.element?.querySelector('.ct-btn[data-panel="cash"]');
      if (cashBtn) this._togglePanel("cash", cashBtn);
    }

    const dialog = document.createElement("div");
    dialog.className = "ct-spend-dialog";
    dialog.innerHTML = `
      <div class="ct-spend-dialog-header"><i class="fas fa-hand-holding-usd"></i> SPEND CASH</div>
      <div class="ct-spend-dialog-body">
        <div class="ct-spend-buttons">
          ${[1,3,5,10,30,50,100,300,500].map(v => `<button type="button" class="ct-spend-value-btn" data-value="${v}">${v}</button>`).join("")}
        </div>
        <div class="ct-spend-denom">
          <label class="ct-spend-denom-label ct-spend-denom-cp"><input type="radio" name="ct-spend-denom" value="cp"> CP</label>
          <label class="ct-spend-denom-label ct-spend-denom-sp"><input type="radio" name="ct-spend-denom" value="sp" checked> SP</label>
          <label class="ct-spend-denom-label ct-spend-denom-gp"><input type="radio" name="ct-spend-denom" value="gp"> GP</label>
          <label class="ct-spend-denom-label ct-spend-denom-pp"><input type="radio" name="ct-spend-denom" value="pp"> PP</label>
        </div>
        <div class="ct-spend-total-row">
          <span class="ct-spend-total-label">TOTAL</span>
          <span class="ct-spend-total-value" id="ct-spend-total">0</span>
        </div>
        <div class="ct-spend-error" id="ct-spend-error"></div>
        <div class="ct-spend-actions">
          <button type="button" class="ct-spend-action-btn ct-spend-confirm" id="ct-spend-btn"><i class="fas fa-check"></i> SPEND</button>
          <button type="button" class="ct-spend-action-btn ct-spend-cancel" id="ct-spend-cancel"><i class="fas fa-times"></i> CANCEL</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    // Position near the Cash & Values panel if open
    const cashPanel = this.element?.querySelector(".ct-panel-cash");
    if (cashPanel) {
      const rect = cashPanel.getBoundingClientRect();
      dialog.style.left = `${rect.right + 8}px`;
      dialog.style.top = `${rect.top}px`;
    } else {
      dialog.style.left = "50%";
      dialog.style.top = "50%";
      dialog.style.transform = "translate(-50%, -50%)";
    }

    let total = 0;
    const totalEl = dialog.querySelector("#ct-spend-total");

    // Value buttons
    dialog.querySelectorAll(".ct-spend-value-btn").forEach(btn => {
      btn.onclick = () => {
        total += parseInt(btn.dataset.value);
        totalEl.textContent = total;
      };
    });

    // Cancel
    dialog.querySelector("#ct-spend-cancel").onclick = () => dialog.remove();

    // Spend
    dialog.querySelector("#ct-spend-btn").onclick = async () => {
      if (total <= 0) { dialog.remove(); return; }
      const denom = dialog.querySelector('input[name="ct-spend-denom"]:checked')?.value || "sp";
      const money = actor.getFlag(MODULE_ID, "cashMoney") ?? { cp: 0, sp: 0, gp: 0, pp: 0 };
      const current = money[denom] ?? 0;
      if (current < total) {
        const errEl = dialog.querySelector("#ct-spend-error");
        if (errEl) {
          errEl.innerHTML = `<i class="fas fa-crown"></i> Check again. You are not so rich! or you missed the color of coins...`;
          errEl.classList.add("is-visible");
          setTimeout(() => errEl.classList.remove("is-visible"), 2500);
        }
        return;
      }
      money[denom] = current - total;
      // Save using same suppression helper pattern
      if (this._cashSuppressTimer) {
        clearTimeout(this._cashSuppressTimer);
        this._cashSuppressTimer = null;
      }
      this._cashOpPending = (this._cashOpPending || 0) + 1;
      this._suppressRender = true;
      try {
        await actor.setFlag(MODULE_ID, "cashMoney", money);
        const currency = foundry.utils.duplicate(actor.system?.equipment?.currency ?? {});
        currency.active = true;
        currency.numberCategories = 4;
        currency.labelCategory1 = "CP";
        currency.labelCategory2 = "SP";
        currency.labelCategory3 = "GP";
        currency.labelCategory4 = "PP";
        currency.quantity1 = money.cp ?? 0;
        currency.quantity2 = money.sp ?? 0;
        currency.quantity3 = money.gp ?? 0;
        currency.quantity4 = money.pp ?? 0;
        await actor.update({ "system.equipment.currency": currency });
      } finally {
        this._cashOpPending = Math.max(0, (this._cashOpPending || 0) - 1);
        if (this._cashOpPending <= 0) {
          this._cashOpPending = 0;
          this._cashSuppressTimer = setTimeout(() => {
            this._suppressRender = false;
            this._cashSuppressTimer = null;
          }, 600);
        }
      }
      // Update input in the cash panel without full rebuild
      const input = this.element?.querySelector(`#ct-cash-${denom}`);
      if (input) input.value = money[denom];
      dialog.remove();
      ui.notifications.info(`Spent ${total} ${denom.toUpperCase()}.`);
    };

    // Close on outside click
    const outsideClick = (e) => {
      if (!dialog.contains(e.target)) {
        dialog.remove();
        document.removeEventListener("mousedown", outsideClick);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", outsideClick), 10);
  }

  _bindAssetsPanelEvents(bar) {
    if (!bar) return;
    const actor = this.actor;
    if (!actor) return;

    // Helper to save assets without triggering panel flicker
    const _saveAssets = async (assetIds) => {
      if (this._cashSuppressTimer) {
        clearTimeout(this._cashSuppressTimer);
        this._cashSuppressTimer = null;
      }
      this._cashOpPending = (this._cashOpPending || 0) + 1;
      this._suppressRender = true;
      try {
        await actor.setFlag(MODULE_ID, "assetsItems", assetIds);
      } finally {
        this._cashOpPending = Math.max(0, (this._cashOpPending || 0) - 1);
        if (this._cashOpPending <= 0) {
          this._cashOpPending = 0;
          this._cashSuppressTimer = setTimeout(() => {
            this._suppressRender = false;
            this._cashSuppressTimer = null;
          }, 600);
        }
      }
    };

    // ── Assets drop zone (GM only) ──
    const dropzone = bar.querySelector("[data-assets-dropzone]");
    if (dropzone && actor && game.user.isGM) {
      dropzone.ondragover = (e) => {
        e.preventDefault();
        dropzone.classList.add("ct-assets-drop-active");
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      };
      dropzone.ondragleave = (e) => {
        if (!dropzone.contains(e.relatedTarget)) dropzone.classList.remove("ct-assets-drop-active");
      };
      dropzone.ondrop = async (e) => {
        e.preventDefault(); e.stopPropagation();
        dropzone.classList.remove("ct-assets-drop-active");

        let data;
        try { data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch { data = {}; }

        let item = null;
        if (data.uuid) {
          try { item = await fromUuid(data.uuid); } catch { /* ignore */ }
        }
        if (!item && data.id) {
          item = game.items.get(data.id);
        }
        if (!item && data && !data.uuid && !data.id && typeof e.dataTransfer.getData("text/plain") === "string") {
          const rawId = e.dataTransfer.getData("text/plain").trim();
          if (rawId) item = actor.items.get(rawId);
        }

        if (!item) { ui.notifications.warn("Item not found."); return; }

        let actorItem = actor.items.find(i => i.name === item.name && i.type === item.type);
        if (!actorItem && item.uuid && !item.actor) {
          try {
            const itemData = item.toObject ? item.toObject() : foundry.utils.duplicate(item);
            delete itemData._id;
            const created = await actor.createEmbeddedDocuments("Item", [itemData]);
            if (created && created.length) actorItem = created[0];
          } catch (err) {
            ui.notifications.error("Failed to add item to actor.");
            return;
          }
        }
        if (!actorItem) actorItem = item;

        const assets = actor.getFlag(MODULE_ID, "assetsItems") ?? [];
        if (assets.includes(actorItem.id)) {
          ui.notifications.info(`"${actorItem.name}" is already in assets.`);
          return;
        }
        assets.push(actorItem.id);
        await _saveAssets(assets);
        ui.notifications.info(`"${actorItem.name}" added to assets.`);

        // Append to DOM to keep panel open
        if (this.activePanel === "assets") {
          const grid = this.element?.querySelector("[data-assets-dropzone]");
          const empty = grid?.querySelector(".ct-assets-empty");
          if (empty) empty.remove();
          if (grid) {
            const card = document.createElement("div");
            card.className = "ct-assets-card";
            card.dataset.assetsItem = actorItem.id;
            card.dataset.tt = foundry.utils.escapeHTML(actorItem.name);
            card.dataset.ttDesc = foundry.utils.escapeHTML(actorItem.system?.description || "");
            card.innerHTML = `<img src="${actorItem.img || 'icons/svg/item-bag.svg'}" alt="" draggable="false">`;
            grid.append(card);
            // Re-bind events on new element
            this._bindAssetsCardEvents(card);
          }
        }
      };
    }

    // ── Existing asset cards ──
    bar.querySelectorAll("[data-assets-item]").forEach(el => this._bindAssetsCardEvents(el));
  }

  _bindAssetsCardEvents(el) {
    if (!el) return;
    el.onmouseenter = () => {
      if (document.querySelector(".ct-assets-ctx-menu")) return;
      const name = el.dataset.tt || "";
      const desc = el.dataset.ttDesc || "";
      if (!name) return;
      let tooltip = document.querySelector("#ct-assets-tooltip");
      if (tooltip) tooltip.remove();
      tooltip = document.createElement("div");
      tooltip.id = "ct-assets-tooltip";
      tooltip.className = "ct-cash-tooltip";
      tooltip.innerHTML = `<div class="ct-cash-tt-header">${foundry.utils.escapeHTML(name)}</div>${desc ? `<div class="ct-cash-tt-desc">${foundry.utils.escapeHTML(desc)}</div>` : ""}`;
      document.body.appendChild(tooltip);
      const rect = el.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - 100;
      let top = rect.top - tooltip.offsetHeight - 8;
      if (left < 8) left = 8;
      if (left + 200 > window.innerWidth) left = window.innerWidth - 208;
      if (top < 8) top = rect.bottom + 8;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    };
    el.onmouseleave = () => {
      const tooltip = document.querySelector("#ct-assets-tooltip");
      if (tooltip) tooltip.remove();
    };
    el.onclick = (e) => {
      e.stopPropagation();
      const itemId = el.dataset.assetsItem;
      const item = this.actor?.items.get(itemId);
      if (item?.sheet) item.sheet.render(true);
    };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showAssetsContextMenu(el, e.clientX, e.clientY);
    };
  }

  _showAssetsContextMenu(el, x, y) {
    document.querySelectorAll(".ct-assets-ctx-menu").forEach(m => m.remove());
    const itemId = el.dataset.assetsItem;
    const item = this.actor?.items.get(itemId);
    if (!item) return;

    const menu = document.createElement("div");
    menu.className = "ct-cash-ctx-menu ct-assets-ctx-menu";
    menu.innerHTML = `
      <button class="ct-cash-ctx-item" data-action="open"><i class="fas fa-external-link-alt"></i> OPEN SHEET</button>
      <button class="ct-cash-ctx-item" data-action="delete"><i class="fas fa-trash"></i> REMOVE</button>
    `;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.querySelectorAll("[data-action]").forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        menu.remove();
        const action = btn.dataset.action;
        if (action === "open") {
          if (item.sheet) item.sheet.render(true);
        } else if (action === "delete") {
          await this._removeAsset(item);
        }
      };
    });

    const closeHandler = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("click", closeHandler), 0);
  }

  async _removeAsset(item) {
    const actor = this.actor;
    if (!actor) return;
    const assets = actor.getFlag(MODULE_ID, "assetsItems") ?? [];
    const filtered = assets.filter(id => id !== item.id);

    if (this._cashSuppressTimer) {
      clearTimeout(this._cashSuppressTimer);
      this._cashSuppressTimer = null;
    }
    this._cashOpPending = (this._cashOpPending || 0) + 1;
    this._suppressRender = true;

    try {
      await actor.setFlag(MODULE_ID, "assetsItems", filtered);
    } catch (err) {
      console.error("CypherTaskbar | removeAsset error:", err);
    } finally {
      this._cashOpPending = Math.max(0, (this._cashOpPending || 0) - 1);
      if (this._cashOpPending <= 0) {
        this._cashOpPending = 0;
        this._cashSuppressTimer = setTimeout(() => {
          this._suppressRender = false;
          this._cashSuppressTimer = null;
        }, 600);
      }
    }

    ui.notifications.info(`"${item.name}" removed from assets.`);

    // Remove from DOM to keep panel open
    if (this.activePanel === "assets") {
      const itemEl = this.element?.querySelector(`[data-assets-item="${item.id}"]`);
      if (itemEl) {
        itemEl.remove();
        const grid = this.element?.querySelector("[data-assets-dropzone]");
        if (grid && !grid.querySelector("[data-assets-item]")) {
          grid.innerHTML = `<div class="ct-assets-empty"><i class="fas fa-landmark"></i><span>Drop assets here</span></div>`;
        }
      }
    }
  }

  _buildPanel(key) {
    const actor = this.actor;
    if (!actor) return `<div class="ct-panel-empty">No character assigned.</div>`;
    const all = actor.items.contents;
    switch (key) {
      case "persona": return this._buildPersonaPanel(actor);
      case "skills": return this._buildSkillsPanel(actor);
      case "abilities": return this._buildAbilitiesPanel(actor);
      case "spells": return this._buildSpellsPanel(actor);
      case "combat": {
        const attacks   = all.filter(i => i.type === "attack").sort((a,b) => a.name.localeCompare(b.name));
        const armor     = all.filter(i => i.type === "armor").sort((a,b) => a.name.localeCompare(b.name));
        const ammo      = all.filter(i => i.type === "ammo").sort((a,b) => a.name.localeCompare(b.name));
        const cyphers   = all.filter(i => i.type === "cypher").sort((a,b) => a.name.localeCompare(b.name));
        const combat    = game.combat;
        const combatant = combat?.combatants?.find(c => c.actorId === actor.id) ?? null;
        const inCombat  = !!combatant;
        const initVal   = combatant?.initiative;
        let h = this._buildCombatButtons(actor, combat, combatant, inCombat, initVal);
        h += `<div class="ct-combat-status-row">
          <span class="ct-combat-pill ${inCombat ? 'active' : ''}"><i class="fas ${inCombat ? 'fa-shield-halved' : 'fa-moon'}"></i> ${inCombat ? 'In Combat' : 'Not In Combat'}</span>
          ${inCombat ? `<span class="ct-combat-pill initiative ${initVal != null ? 'has-value' : ''}"><i class="fas fa-bolt"></i> Initiative: ${initVal != null ? initVal : '—'}</span>` : ''}
        </div>`;
        h += `<div class="ct-panel-group-title">Attacks</div>`;
        h += attacks.length
          ? attacks.map(i => `<div class="ct-item-row" data-item-id="${i.id}"><img class="ct-item-img" src="${i.img || 'icons/svg/combat.svg'}" alt="" draggable="false"><span class="ct-item-name">${i.name}</span><span class="ct-item-meta">Dmg: ${i.system.basic?.damage ?? '—'}${i.system.basic?.range ? ' | ' + i.system.basic.range : ''}</span></div>`).join("")
          : `<div class="ct-empty-msg">No attacks</div>`;
        h += `<div class="ct-panel-group-title">Armor</div>`;
        h += armor.length
          ? armor.map(i => `<div class="ct-item-row" data-item-id="${i.id}"><img class="ct-item-img" src="${i.img || 'icons/svg/shield.svg'}" alt="" draggable="false"><span class="ct-item-name">${i.name}</span><span class="ct-item-meta">Armor: ${i.system.basic?.armor ?? 0}</span></div>`).join("")
          : `<div class="ct-empty-msg">No armor</div>`;
        h += `<div class="ct-panel-group-separator"></div>`;
        h += `<div class="ct-panel-group-title">Ammo</div>`;
        h += ammo.length
          ? ammo.map(i => {
              const qty = i.system.basic?.quantity ?? i.system.basic?.amount ?? '—';
              return `<div class="ct-item-row" data-item-id="${i.id}"><img class="ct-item-img" src="${i.img || 'icons/svg/item-bag.svg'}" alt="" draggable="false"><span class="ct-item-name">${i.name}</span><span class="ct-item-meta">Qty: ${qty}</span></div>`;
            }).join("")
          : `<div class="ct-empty-msg">No ammo</div>`;
        h += `<div class="ct-panel-group-title">Cyphers</div>`;
        h += cyphers.length
          ? cyphers.map(i => {
              const qty = i.system.basic?.quantity ?? i.system.basic?.amount ?? '';
              const meta = [qty !== '' ? `Qty: ${qty}` : null, i.system.basic?.identified === false ? 'Unidentified' : null].filter(Boolean).join(' | ');
              return `<div class="ct-item-row" data-item-id="${i.id}"><img class="ct-item-img" src="${i.img || 'icons/svg/item-bag.svg'}" alt="" draggable="false"><span class="ct-item-name">${i.name}</span><span class="ct-item-meta">${meta || 'Cypher'}</span></div>`;
            }).join("")
          : `<div class="ct-empty-msg">No cyphers</div>`;
        return `<div class="ct-panel ct-panel-combat" style="${this._getMenuBackgroundVars("combat")}"><div class="ct-panel-header ct-panel-header-combat-menu"><div class="ct-panel-title-wrap"><i class="fas fa-sword"></i> <span>Combat</span></div><div class="ct-panel-action-group"><button class="ct-panel-settings-btn" data-combat-close title="Close Combat Menu"><i class="fas fa-times"></i></button></div></div><div class="ct-panel-body">${h}</div></div>`;
      }
      case "equipment": return this._buildEquipmentPanel(actor);
      case "cash": return this._buildCashPanel(actor);
      case "assets": return this._buildAssetsPanel(actor);
    }
    return "";
  }

  _renderItemList(title, items, rowFn) {
    const icons = {Skills:"fas fa-graduation-cap",Abilities:"fas fa-magic",Equipment:"fas fa-backpack"};
    const body = items.length ? items.map(rowFn).join("") : `<div class="ct-empty-msg">No ${title.toLowerCase()} found.</div>`;
    return `<div class="ct-panel"><div class="ct-panel-header"><i class="${icons[title]||'fas fa-list'}"></i> ${title}</div><div class="ct-panel-body">${body}</div></div>`;
  }

  _skillRatingClass(r) {
    const l = (r||"").toLowerCase();
    if (l.includes("specialized")) return "ct-skill-specialized";
    if (l.includes("trained"))     return "ct-skill-trained";
    if (l.includes("inability"))   return "ct-skill-inability";
    return "ct-skill-practiced";
  }

  _equipTypeIcon(type) {
    return ({artifact:"fas fa-gem",cypher:"fas fa-flask",oddity:"fas fa-question-circle",material:"fas fa-cube",ammo:"fas fa-crosshairs",equipment:"fas fa-box"})[type]??"fas fa-box";
  }

  _isCashItem(item) {
    const name = (item.name || "").toLowerCase();
    const cashKeywords = ["shin","coin","credit","money","cash","gold","silver","copper","gem","jewel","ring","necklace","currency","wealth","fund"];
    if (cashKeywords.some(kw => name.includes(kw))) return true;
    const price = item.system?.basic?.price ?? item.system?.price ?? item.system?.cost ?? item.system?.value ?? null;
    if (price !== null && price !== "" && price !== undefined) return true;
    return false;
  }

  _buildCashPanel(actor) {
    // Read money from actor flag, falling back to Cypher System actor sheet currency
    let money = actor.getFlag(MODULE_ID, "cashMoney");
    if (!money) {
      const sysCur = actor.system?.equipment?.currency;
      if (sysCur?.active) {
        money = {
          cp: sysCur.quantity1 ?? 0,
          sp: sysCur.quantity2 ?? 0,
          gp: sysCur.quantity3 ?? 0,
          pp: sysCur.quantity4 ?? 0
        };
      } else {
        money = { cp: 0, sp: 0, gp: 0, pp: 0 };
      }
    }
    const { cp = 0, sp = 0, gp = 0, pp = 0 } = money;

    // Get carriable valuables
    const valuableIds = actor.getFlag(MODULE_ID, "cashValuables") ?? [];
    const valuables = valuableIds
      .map(id => actor.items.get(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Clean up missing items from the list
    if (valuables.length !== valuableIds.length) {
      const validIds = valuables.map(i => i.id);
      actor.setFlag(MODULE_ID, "cashValuables", validIds);
    }

    const moneyRow = `
      <div class="ct-cash-money-section">
        <div class="ct-cash-section-title"><i class="fas fa-coins"></i> MONEY</div>
        <div class="ct-cash-money-row">
          <div class="ct-cash-coin">
            <label class="ct-cash-coin-label">CP</label>
            <input type="number" class="ct-cash-input" id="ct-cash-cp" value="${cp}" min="0">
            <div class="ct-cash-coin-btns">
              <button type="button" class="ct-cash-coin-btn" data-cash-minus="cp" title="-1"><i class="fas fa-minus"></i></button>
              <button type="button" class="ct-cash-coin-btn" data-cash-plus="cp" title="+1"><i class="fas fa-plus"></i></button>
            </div>
          </div>
          <div class="ct-cash-coin">
            <label class="ct-cash-coin-label">SP</label>
            <input type="number" class="ct-cash-input" id="ct-cash-sp" value="${sp}" min="0">
            <div class="ct-cash-coin-btns">
              <button type="button" class="ct-cash-coin-btn" data-cash-minus="sp" title="-1"><i class="fas fa-minus"></i></button>
              <button type="button" class="ct-cash-coin-btn" data-cash-plus="sp" title="+1"><i class="fas fa-plus"></i></button>
            </div>
          </div>
          <div class="ct-cash-coin">
            <label class="ct-cash-coin-label">GP</label>
            <input type="number" class="ct-cash-input" id="ct-cash-gp" value="${gp}" min="0">
            <div class="ct-cash-coin-btns">
              <button type="button" class="ct-cash-coin-btn" data-cash-minus="gp" title="-1"><i class="fas fa-minus"></i></button>
              <button type="button" class="ct-cash-coin-btn" data-cash-plus="gp" title="+1"><i class="fas fa-plus"></i></button>
            </div>
          </div>
          <div class="ct-cash-coin">
            <label class="ct-cash-coin-label">PP</label>
            <input type="number" class="ct-cash-input" id="ct-cash-pp" value="${pp}" min="0">
            <div class="ct-cash-coin-btns">
              <button type="button" class="ct-cash-coin-btn" data-cash-minus="pp" title="-1"><i class="fas fa-minus"></i></button>
              <button type="button" class="ct-cash-coin-btn" data-cash-plus="pp" title="+1"><i class="fas fa-plus"></i></button>
            </div>
          </div>
          <button type="button" class="ct-cash-spend-btn" data-cash-spend title="Spend Cash"><i class="fas fa-hand-holding-usd"></i></button>
        </div>
      </div>`;

    const valuablesGrid = valuables.length
      ? valuables.map(i => `
        <div class="ct-cash-valuable-item" data-cash-valuable="${i.id}" data-tt="${foundry.utils.escapeHTML(i.name)}" data-tt-desc="${foundry.utils.escapeHTML(i.system?.description || '')}">
          <img src="${i.img || 'icons/svg/item-bag.svg'}" alt="" draggable="false">
        </div>`).join("")
      : `<div class="ct-cash-valuables-empty"><i class="fas fa-hand-holding"></i><span>Drop valuable items here</span></div>`;

    const valuablesSection = `
      <div class="ct-cash-valuables-section">
        <div class="ct-cash-section-title"><i class="fas fa-gem"></i> CARRIABLE VALUES</div>
        <div class="ct-cash-valuables-grid" data-cash-dropzone>
          ${valuablesGrid}
        </div>
      </div>`;

    return `<div class="ct-panel ct-panel-cash" style="${this._getMenuBackgroundVars("cash")}">
      <div class="ct-panel-header ct-panel-header-cash-menu">
        <div class="ct-panel-title-wrap"><i class="fas fa-coins"></i> <span>Cash & Values</span></div>
        <div class="ct-panel-action-group">
          <button class="ct-panel-settings-btn" data-cash-close title="Close Cash Menu"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="ct-panel-body ct-cash-body">
        ${moneyRow}
        ${valuablesSection}
      </div>
    </div>`;
  }

  _buildAssetsPanel(actor) {
    const assetIds = actor.getFlag(MODULE_ID, "assetsItems") ?? [];
    const assets = assetIds
      .map(id => actor.items.get(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));

    // Clean up missing items
    if (assets.length !== assetIds.length) {
      const validIds = assets.map(i => i.id);
      actor.setFlag(MODULE_ID, "assetsItems", validIds);
    }

    const emptyMsg = game.user?.isGM
      ? `<div class="ct-assets-empty"><i class="fas fa-landmark"></i><span>Drop assets here</span></div>`
      : `<div class="ct-assets-empty"><i class="fas fa-landmark"></i><span>No assets</span></div>`;

    const assetsGrid = assets.length
      ? assets.map(i => `
        <div class="ct-assets-card" data-assets-item="${i.id}" data-tt="${foundry.utils.escapeHTML(i.name)}" data-tt-desc="${foundry.utils.escapeHTML(i.system?.description || '')}">
          <img src="${i.img || 'icons/svg/item-bag.svg'}" alt="" draggable="false">
        </div>`).join("")
      : emptyMsg;

    return `<div class="ct-panel ct-panel-assets" style="${this._getMenuBackgroundVars("assets")}">
      <div class="ct-panel-header ct-panel-header-assets-menu">
        <div class="ct-panel-title-wrap"><i class="fas fa-landmark"></i> <span>Assets</span></div>
        <div class="ct-panel-action-group">
          <button class="ct-panel-settings-btn" data-assets-close title="Close Assets Menu"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="ct-panel-body ct-assets-body">
        <div class="ct-assets-section">
          <div class="ct-cash-section-title"><i class="fas fa-building"></i> ASSETS</div>
          <div class="ct-assets-grid" data-assets-dropzone>
            ${assetsGrid}
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ─── Window filter: only game content (actors, items, journals, images) ─── */
  _isGameContentWindow(app) {
    if (!app) return false;
    if (app === this) return false;

    const el = app.element?.[0] ?? app.element;
    if (!el) return false;
    if (!(el instanceof Element)) return false;  // V2 apps may have non-Element elements

    // Must be a Foundry window
    const isWindow = el.classList?.contains("window-app") ||
                     el.classList?.contains("application") ||
                     el.matches?.(".app") ||
                     el.querySelector?.(".window-header, header");
    if (!isWindow) return false;

    // Exclude taskbars
    if (el.id === "cypher-taskbar-bar") return false;
    if (el.id === "cypher-gm-taskbar") return false;
    if (el.closest("#cypher-taskbar-bar")) return false;
    if (el.closest("#cypher-gm-taskbar")) return false;

    // Exclude sidebar / UI panels
    if (el.closest("#sidebar")) return false;
    if (el.closest("#scene-controls")) return false;
    if (el.closest("#hotbar")) return false;
    if (el.closest("#players")) return false;
    if (el.closest("#navigation")) return false;
    if (el.closest("#ui-left")) return false;
    if (el.closest("#ui-bottom")) return false;
    if (el.closest("#notifications")) return false;

    // Exclude by title
    const title = (app.title ?? app.options?.title ?? "").toLowerCase();
    if (title.includes("settings")) return false;
    if (title.includes("configure token")) return false;
    if (title.includes("combat tracker")) return false;
    if (title.includes("chat log")) return false;

    // If it has a document → game content
    const doc = app.document ?? app.object;
    if (doc) return true;

    // Include by constructor name
    const ctor = app.constructor?.name ?? "";
    const gameTypes = ["Sheet", "Journal", "Image", "Lightbox", "Popout", "Table", "Cards", "Macro", "Scene"];
    if (gameTypes.some(t => ctor.includes(t))) return true;

    // Exclude obvious UI
    const uiTypes = ["Sidebar", "Controls", "Hotbar", "PlayerList", "Notifications", "ChatLog", "CombatTracker", "FilePicker", "Tour"];
    if (uiTypes.some(t => ctor.includes(t))) return false;

    // Default: include unknown windows (they're probably game content)
    return true;
  }

  refreshTray() {
    const tray = this.element?.querySelector("#ct-tray-inner"); if (!tray) return;

    if (!this._trayApps) this._trayApps = new Map();
    this._trayApps.clear();

    const tracked = [];
    let idx = 0;

    // V1 apps
    for (const [id, app] of Object.entries(ui.windows ?? {})) {
      if (!app) continue;
      if (!this._isGameContentWindow(app)) continue;
      const tid = `t${idx++}`;
      this._trayApps.set(tid, app);
      tracked.push({ tid, title: app.title ?? app.options?.title ?? "Window", minimized: this._isWindowMinimized(app) });
    }

    // V2 apps
    if (foundry?.applications?.instances) {
      for (const [id, app] of foundry.applications.instances) {
        if (!app) continue;
        // Skip if already tracked
        let already = false;
        for (const existing of this._trayApps.values()) { if (existing === app) { already = true; break; } }
        if (already) continue;
        if (!this._isGameContentWindow(app)) continue;
        const tid = `t${idx++}`;
        this._trayApps.set(tid, app);
        tracked.push({ tid, title: app.title ?? "Window", minimized: this._isWindowMinimized(app) });
      }
    }

    if (tracked.length === 0) {
      tray.innerHTML = `<span class="ct-tray-empty">—</span>`;
      return;
    }

    tray.innerHTML = tracked.map(w => {
      const icon = w.minimized ? "fa-window-restore" : "fa-window-minimize";
      const tip  = w.minimized ? `Restore ${w.title}` : `Minimize ${w.title}`;
      const cls  = w.minimized ? " ct-tray-window-minimized" : "";
      const label = w.title.substring(0,18) + (w.title.length > 18 ? "…" : "");
      return `<div class="ct-tray-window-btn${cls}" data-tid="${w.tid}" title="${tip}"><i class="fas ${icon}"></i><span class="ct-tray-window-label">${label}</span><button class="ct-tray-window-close" data-tid="${w.tid}" title="Close"><i class="fas fa-times"></i></button></div>`;
    }).join("");

    tray.querySelectorAll(".ct-tray-window-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        if (e.target.closest(".ct-tray-window-close")) return;
        const app = this._trayApps?.get(btn.dataset.tid);
        if (!app) return;
        if (this._isWindowMinimized(app)) this._restoreAppElement(app);
        else this._minimizeWindow(app);
      });
    });

    tray.querySelectorAll(".ct-tray-window-close").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const app = this._trayApps?.get(btn.dataset.tid);
        if (app) app.close?.();
        setTimeout(() => this.refreshTray(), 50);
      });
    });
  }

  _isWindowMinimized(app) {
    if (app._ctMinimized) return true;
    const el = app.element?.[0] ?? app.element;
    if (!el) return false;
    if (!(el instanceof Element)) return false;
    if (el.classList?.contains("ct-minimized")) return true;
    return el.style?.display === "none";
  }

  _startTrayRefresh() {
    if (this._trayInterval) clearInterval(this._trayInterval);
    this._trayInterval = setInterval(() => this.refreshTray(), 2000);
  }

  updateOnlineStatus() {
    const dot = this.element?.querySelector("#ct-online-dot"); if (!dot) return;
    const ok = game.user?.active ?? false;
    dot.classList.toggle("ct-online", ok);
    dot.classList.toggle("ct-offline", !ok);
    dot.title = ok ? "Connected" : "Disconnected";
  }

  _openPortraitSettings(event) {
    if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | _openPortraitSettings called`, {actor: this.actor?.name, hasElement: !!this.element, event: event?.type});
    document.querySelector("#ct-portrait-settings-popup")?.remove();
    if (!this.actor) { console.warn(`${MODULE_ID} | _openPortraitSettings: no actor`); return; }
    const blur  = this._gs("portraitShadowBlur");
    const color = this._gs("portraitShadowColor");
    const op    = this._gs("portraitShadowOpacity");
    const dist  = this._gs("portraitShadowDistance");
    const width = this._gs("portraitWidth");
    const arcWidgetX         = this._gs("arcWidgetOffsetX")   ?? 82;
    const arcWidgetY         = this._gs("arcWidgetOffsetY")   ?? 64;
    const arcWidgetScale     = this._gs("arcWidgetScale")     ?? 74;
    const arcWidgetBgOpacity = this._gs("arcWidgetBgOpacity") ?? 0.28;
    const arcWidgetFontColor = this._gs("arcWidgetFontColor") ?? "#fff0d0";
    const arcWidgetFontSize  = this._gs("arcWidgetFontSize")  ?? 84;
    const en    = this._gs("portraitShadow");
    const dir   = this._gs("portraitShadowDirection") ?? "bottom-right";
    const barScale = this._gs("attributeBarScale") ?? 100;
    const barOffset = this._gs("attributeBarRightOffset") ?? 55;
    const barYOffset = this._gs("attributeBarVerticalOffset") ?? 0;
    const barGap = this._gs("attributeBarGap") ?? 4;
    const barTopPadding = this._gs("attributeBarTopPadding") ?? 0;
    const valueColor = this._gs("attributeValueColor") ?? "#111111";
    const valueSize = this._gs("attributeValueSize") ?? 100;
    const titleColor = this._gs("attributeTitleColor") ?? "#111111";
    const titleStrokeColor = this._gs("attributeTitleStrokeColor") ?? "#ffffff";
    const titleStrokeThickness = this._gs("attributeTitleStrokeThickness") ?? 0.5;
    const titleBoldness = this._gs("attributeTitleBoldness") ?? 800;
    const titleSize = this._gs("attributeTitleSize") ?? 100;
    const titleSpacing = this._gs("attributeTitleSpacing") ?? 0.5;
    const upperPanelBgColor = this._gs("upperPanelBgColor") ?? "#16121e";
    const upperPanelOpacity = this._gs("upperPanelOpacity") ?? 0.9;
    const upperPanelFontColor = this._gs("upperPanelFontColor") ?? "#f0d68a";
    const upperPanelNameSize = this._gs("upperPanelNameSize") ?? 100;
    const upperPanelScale = this._gs("upperPanelScale") ?? 100;
    const upperPanelOffsetX = this._gs("upperPanelOffsetX") ?? 0;
    const upperPanelOffsetY = this._gs("upperPanelOffsetY") ?? 0;
    const xpCircleOffsetX = this._gs("xpCircleOffsetX") ?? 0;
    const xpCircleOffsetY = this._gs("xpCircleOffsetY") ?? 0;
    const portraitSpaceTransparent = this._gs("portraitSpaceTransparent") ?? true;
    const portraitSpaceOpacity = this._gs("portraitSpaceOpacity") ?? 0.8;
    const portraitRect = this.element.querySelector(".ct-portrait-wrap")?.getBoundingClientRect();
    const lastPortraitTab = this._gs("lastPortraitSettingsTab") || "portrait";
    const portraitTabs = ["portrait","identity","bars","arc","xp","opacity"];
    const activePortraitTab = portraitTabs.includes(lastPortraitTab) ? lastPortraitTab : "portrait";

    const popup = document.createElement("div");
    popup.id = "ct-portrait-settings-popup";
    popup.classList.add("ct-popup");
    // Position: use saved position if available, else next to portrait
    const savedPos = this._gjson("portraitSettingsPos");
    if (savedPos && typeof savedPos.left === "number" && typeof savedPos.top === "number") {
      popup.style.left = `${savedPos.left}px`;
      popup.style.top = `${savedPos.top}px`;
      popup.style.transform = "none";
    } else if (portraitRect) {
      popup.style.left = `${portraitRect.right + 12}px`;
      popup.style.top = `${portraitRect.top}px`;
      popup.style.transform = "none";
    } else {
      popup.style.left = "50%";
      popup.style.top = "50%";
      popup.style.transform = "translate(-50%, -50%)";
    }
    popup.innerHTML = `
      <div class="ct-popup-header ct-portrait-settings-header">
        <div class="ct-popup-header-icon"><i class="fas fa-user-circle"></i></div>
        <div class="ct-popup-header-title">Portrait Space Settings</div>
        <button class="ct-popup-close" title="Close"><i class="fas fa-times"></i></button>
      </div>
      <div class="ct-popup-tabs ct-portrait-settings-tabs">
        <button class="ct-popup-tab${activePortraitTab==="portrait"?" is-active":""}" data-tab="portrait" title="Portrait width & shadow"><i class="fas fa-image"></i><span>Portrait</span></button>
        <button class="ct-popup-tab${activePortraitTab==="identity"?" is-active":""}" data-tab="identity" title="Name panel appearance"><i class="fas fa-id-card"></i><span>Identity</span></button>
        <button class="ct-popup-tab${activePortraitTab==="bars"?" is-active":""}" data-tab="bars" title="Attribute bars layout & style"><i class="fas fa-bars"></i><span>Attribute Bar</span></button>
        <button class="ct-popup-tab${activePortraitTab==="arc"?" is-active":""}" data-tab="arc" title="Focused arc widget"><i class="fas fa-bullseye"></i><span>Arc</span></button>
        <button class="ct-popup-tab${activePortraitTab==="xp"?" is-active":""}" data-tab="xp" title="XP circle position"><i class="fas fa-star"></i><span>XP Circle</span></button>
        <button class="ct-popup-tab${activePortraitTab==="opacity"?" is-active":""}" data-tab="opacity" title="Portrait space transparency"><i class="fas fa-eye-slash"></i><span>Opacity</span></button>
      </div>
      <div class="ct-popup-body ct-popup-body-compact ct-portrait-settings-body">
        <!-- ═══ PORTRAIT TAB ═══ -->
        <div class="ct-popup-pane${activePortraitTab==="portrait"?" is-active":""}" data-pane="portrait">
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-image"></i> Size</div>
            <label>Portrait Width <span class="ct-val-label" id="ps-w-val">${width}px</span>
              <input type="range" id="ps-w" min="80" max="400" step="10" value="${width}">
            </label>
          </div>
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-cloud-moon"></i> Shadow</div>
            <label class="ct-toggle-row">Enable Shadow <input type="checkbox" id="ps-en" ${en?"checked":""}></label>
            <div class="ct-settings-section${en?"":" ct-hidden"}" id="ps-shadow-group">
              <label>Direction
                <select id="ps-dir">
                  <option value="bottom-right" ${dir==="bottom-right"?"selected":""}>Bottom Right ↘</option>
                  <option value="bottom-left" ${dir==="bottom-left"?"selected":""}>Bottom Left ↙</option>
                  <option value="top-right" ${dir==="top-right"?"selected":""}>Top Right ↗</option>
                  <option value="top-left" ${dir==="top-left"?"selected":""}>Top Left ↖</option>
                  <option value="bottom" ${dir==="bottom"?"selected":""}>Bottom ↓</option>
                  <option value="top" ${dir==="top"?"selected":""}>Top ↑</option>
                  <option value="left" ${dir==="left"?"selected":""}>Left ←</option>
                  <option value="right" ${dir==="right"?"selected":""}>Right →</option>
                </select>
              </label>
              <label>Blur Radius <span class="ct-val-label" id="ps-blur-val">${blur}px</span>
                <input type="range" id="ps-blur" min="0" max="30" step="1" value="${blur}">
              </label>
              <label>Shadow Color <input type="color" id="ps-color" value="${color}"></label>
              <label>Shadow Opacity <span class="ct-val-label" id="ps-op-val">${Math.round(op*100)}%</span>
                <input type="range" id="ps-op" min="0" max="1" step="0.05" value="${op}">
              </label>
              <label>Distance <span class="ct-val-label" id="ps-dist-val">${dist}px</span>
                <input type="range" id="ps-dist" min="0" max="20" step="1" value="${dist}">
              </label>
            </div>
          </div>
        </div>
        <!-- ═══ IDENTITY TAB ═══ -->
        <div class="ct-popup-pane${activePortraitTab==="identity"?" is-active":""}" data-pane="identity">
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-palette"></i> Appearance</div>
            <label>Background Color <input type="color" id="ps-upper-bg" value="${upperPanelBgColor}"></label>
            <label>Background Opacity <span class="ct-val-label" id="ps-upper-op-val">${Math.round(upperPanelOpacity*100)}%</span>
              <input type="range" id="ps-upper-op" min="0.1" max="1" step="0.05" value="${upperPanelOpacity}">
            </label>
            <label>Font Color <input type="color" id="ps-upper-font" value="${upperPanelFontColor}"></label>
          </div>
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-text-height"></i> Sizing</div>
            <label>Name Size <span class="ct-val-label" id="ps-upper-name-size-val">${upperPanelNameSize}%</span>
              <input type="range" id="ps-upper-name-size" min="70" max="220" step="5" value="${upperPanelNameSize}">
            </label>
            <label>Panel Scale <span class="ct-val-label" id="ps-upper-scale-val">${upperPanelScale}%</span>
              <input type="range" id="ps-upper-scale" min="60" max="180" step="5" value="${upperPanelScale}">
            </label>
          </div>
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-arrows-alt"></i> Position</div>
            <label>Horizontal Offset <span class="ct-val-label" id="ps-upper-x-val">${upperPanelOffsetX}%</span>
              <input type="range" id="ps-upper-x" min="-100" max="100" step="1" value="${upperPanelOffsetX}">
            </label>
            <label>Vertical Offset <span class="ct-val-label" id="ps-upper-y-val">${upperPanelOffsetY}%</span>
              <input type="range" id="ps-upper-y" min="-100" max="100" step="1" value="${upperPanelOffsetY}">
            </label>
          </div>
        </div>
        <!-- ═══ ATTRIBUTE BAR TAB ═══ -->
        <div class="ct-popup-pane${activePortraitTab==="bars"?" is-active":""}" data-pane="bars">
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-ruler-combined"></i> Layout</div>
            <label>Bar Scale <span class="ct-val-label" id="ps-bars-val">${barScale}%</span>
              <input type="range" id="ps-bars" min="60" max="180" step="5" value="${barScale}">
            </label>
            <label>Horizontal Offset <span class="ct-val-label" id="ps-bars-offset-val">${barOffset}</span>
              <input type="range" id="ps-bars-offset" min="-100" max="300" step="1" value="${barOffset}">
            </label>
            <label>Vertical Offset <span class="ct-val-label" id="ps-bars-y-offset-val">${barYOffset}px</span>
              <input type="range" id="ps-bars-y-offset" min="-600" max="600" step="1" value="${barYOffset}">
            </label>
            <label>Gap Between Bars <span class="ct-val-label" id="ps-bar-gap-val">${barGap}px</span>
              <input type="range" id="ps-bar-gap" min="0" max="40" step="1" value="${barGap}">
            </label>
            <label>Top Padding <span class="ct-val-label" id="ps-bar-top-padding-val">${barTopPadding}px</span>
              <input type="range" id="ps-bar-top-padding" min="-500" max="500" step="1" value="${barTopPadding}">
            </label>
          </div>
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-eye"></i> Values</div>
            <label>Value Color <input type="color" id="ps-value-color" value="${valueColor}"></label>
            <label>Value Size <span class="ct-val-label" id="ps-value-size-val">${valueSize}%</span>
              <input type="range" id="ps-value-size" min="70" max="220" step="5" value="${valueSize}">
            </label>
          </div>
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-font"></i> Titles</div>
            <label>Fill Color <input type="color" id="ps-title-color" value="${titleColor}"></label>
            <label>Size <span class="ct-val-label" id="ps-title-size-val">${titleSize}%</span>
              <input type="range" id="ps-title-size" min="70" max="220" step="5" value="${titleSize}">
            </label>
            <label>Character Spacing <span class="ct-val-label" id="ps-title-spacing-val">${titleSpacing}px</span>
              <input type="range" id="ps-title-spacing" min="-2" max="8" step="0.5" value="${titleSpacing}">
            </label>
            <label>Outline Color <input type="color" id="ps-title-stroke" value="${titleStrokeColor}"></label>
            <label>Outline Thickness <span class="ct-val-label" id="ps-title-stroke-width-val">${titleStrokeThickness}px</span>
              <input type="range" id="ps-title-stroke-width" min="0" max="4" step="0.1" value="${titleStrokeThickness}">
            </label>
            <label>Boldness <span class="ct-val-label" id="ps-title-bold-val">${titleBoldness}</span>
              <input type="range" id="ps-title-bold" min="100" max="900" step="100" value="${titleBoldness}">
            </label>
          </div>
        </div>
        <!-- ═══ ARC TAB ═══ -->
        <div class="ct-popup-pane${activePortraitTab==="arc"?" is-active":""}" data-pane="arc">
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-arrows-alt"></i> Position</div>
            <label>Horizontal Offset <span class="ct-val-label" id="ps-arc-x-val">${arcWidgetX}%</span>
              <input type="range" id="ps-arc-x" min="-100" max="150" step="1" value="${arcWidgetX}">
            </label>
            <label>Vertical Offset <span class="ct-val-label" id="ps-arc-y-val">${arcWidgetY}%</span>
              <input type="range" id="ps-arc-y" min="-100" max="150" step="1" value="${arcWidgetY}">
            </label>
          </div>
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-palette"></i> Appearance</div>
            <label>Widget Scale <span class="ct-val-label" id="ps-arc-scale-val">${arcWidgetScale}%</span>
              <input type="range" id="ps-arc-scale" min="50" max="160" step="1" value="${arcWidgetScale}">
            </label>
            <label>Background Opacity <span class="ct-val-label" id="ps-arc-bg-op-val">${Math.round(arcWidgetBgOpacity*100)}%</span>
              <input type="range" id="ps-arc-bg-op" min="0" max="1" step="0.05" value="${arcWidgetBgOpacity}">
            </label>
            <label>Font Color <input type="color" id="ps-arc-font-color" value="${arcWidgetFontColor}"></label>
            <label>Font Size <span class="ct-val-label" id="ps-arc-font-size-val">${arcWidgetFontSize}%</span>
              <input type="range" id="ps-arc-font-size" min="60" max="160" step="1" value="${arcWidgetFontSize}">
            </label>
          </div>
        </div>
        <!-- ═══ XP CIRCLE TAB ═══ -->
        <div class="ct-popup-pane${activePortraitTab==="xp"?" is-active":""}" data-pane="xp">
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-arrows-alt"></i> Position</div>
            <label>Horizontal Offset <span class="ct-val-label" id="ps-xp-x-val">${xpCircleOffsetX}%</span>
              <input type="range" id="ps-xp-x" min="-100" max="100" step="1" value="${xpCircleOffsetX}">
            </label>
            <label>Vertical Offset <span class="ct-val-label" id="ps-xp-y-val">${xpCircleOffsetY}%</span>
              <input type="range" id="ps-xp-y" min="-100" max="100" step="1" value="${xpCircleOffsetY}">
            </label>
          </div>
        </div>
        <!-- ═══ OPACITY TAB ═══ -->
        <div class="ct-popup-pane${activePortraitTab==="opacity"?" is-active":""}" data-pane="opacity">
          <div class="ct-settings-section">
            <div class="ct-settings-section-title"><i class="fas fa-eye-slash"></i> Portrait Space Opacity</div>
            <label class="ct-toggle-row">Transparent Portrait Space <input type="checkbox" id="ps-space-transparent" ${portraitSpaceTransparent?"checked":""}></label>
            <label>Opacity <span class="ct-val-label" id="ps-space-opacity-val">${Math.round(portraitSpaceOpacity*100)}%</span>
              <input type="range" id="ps-space-opacity" min="0" max="1" step="0.05" value="${portraitSpaceOpacity}">
            </label>
            <div class="ct-settings-note" style="font-size:0.72em;color:var(--ct-text-dim);margin-top:4px;">
              <i class="fas fa-info-circle"></i> Hovering over portrait space always sets opacity to 0%
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(popup);
    if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | Portrait settings popup appended`, {popupInDOM: !!document.querySelector("#ct-portrait-settings-popup")});
    requestAnimationFrame(() => {
      const rect = popup.getBoundingClientRect();
      const left = Math.min(Math.max(8, desiredLeft), Math.max(8, window.innerWidth - rect.width - 8));
      const top = Math.min(Math.max(8, desiredTop), Math.max(8, window.innerHeight - rect.height - 8));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    });

    popup.querySelectorAll(".ct-popup-tab").forEach(btn => {
      btn.addEventListener("click", async () => {
        const tab = btn.dataset.tab;
        if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | Tab clicked:`, tab);
        popup.querySelectorAll(".ct-popup-tab").forEach(el => el.classList.toggle("is-active", el === btn));
        popup.querySelectorAll(".ct-popup-pane").forEach(pane => pane.classList.toggle("is-active", pane.dataset.pane === tab));
        await this._ss("lastPortraitSettingsTab", tab);
      });
    });

    const header = popup.querySelector(".ct-popup-header");
    const closeBtn = popup.querySelector(".ct-popup-close");
    let dragState = null;
    const _psOnMove = (ev) => {
      if (!dragState) return;
      const rect = popup.getBoundingClientRect();
      const left = Math.min(Math.max(8, ev.clientX - dragState.offsetX), Math.max(8, window.innerWidth - rect.width - 8));
      const top = Math.min(Math.max(8, ev.clientY - dragState.offsetY), Math.max(8, window.innerHeight - rect.height - 8));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };
    const _psOnUp = async () => {
      dragState = null;
      document.body.classList.remove("ct-dragging-popup");
      // Save popup position
      const rect = popup.getBoundingClientRect();
      await this._ss("portraitSettingsPos", JSON.stringify({ left: rect.left, top: rect.top }));
    };
    header?.addEventListener("mousedown", (ev) => {
      if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
      ev.preventDefault();
      const rect = popup.getBoundingClientRect();
      dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
      document.body.classList.add("ct-dragging-popup");
      window.addEventListener("mousemove", _psOnMove);
      window.addEventListener("mouseup", _psOnUp, { once: true });
    });

    const apply = async () => {
      try {
        await this._ss("portraitWidth",  parseInt(popup.querySelector("#ps-w").value));
        await this._ss("attributeBarScale", parseInt(popup.querySelector("#ps-bars").value));
        await this._ss("attributeBarRightOffset", parseInt(popup.querySelector("#ps-bars-offset").value));
        await this._ss("attributeBarVerticalOffset", parseInt(popup.querySelector("#ps-bars-y-offset").value));
        await this._ss("attributeBarGap", parseInt(popup.querySelector("#ps-bar-gap").value));
        await this._ss("attributeBarTopPadding", parseInt(popup.querySelector("#ps-bar-top-padding").value));
        await this._ss("attributeValueColor", popup.querySelector("#ps-value-color").value);
        await this._ss("attributeValueSize", parseInt(popup.querySelector("#ps-value-size").value));
        await this._ss("upperPanelBgColor", popup.querySelector("#ps-upper-bg").value);
        await this._ss("upperPanelOpacity", parseFloat(popup.querySelector("#ps-upper-op").value));
        await this._ss("upperPanelFontColor", popup.querySelector("#ps-upper-font").value);
        await this._ss("upperPanelNameSize", parseInt(popup.querySelector("#ps-upper-name-size").value));
        await this._ss("upperPanelScale", parseInt(popup.querySelector("#ps-upper-scale").value));
        await this._ss("upperPanelOffsetX", parseInt(popup.querySelector("#ps-upper-x").value));
        await this._ss("upperPanelOffsetY", parseInt(popup.querySelector("#ps-upper-y").value));
        await this._ss("xpCircleOffsetX", parseInt(popup.querySelector("#ps-xp-x").value));
        await this._ss("xpCircleOffsetY", parseInt(popup.querySelector("#ps-xp-y").value));
        await this._ss("arcWidgetOffsetX",   parseInt(popup.querySelector("#ps-arc-x").value));
        await this._ss("arcWidgetOffsetY",   parseInt(popup.querySelector("#ps-arc-y").value));
        await this._ss("arcWidgetScale",     parseInt(popup.querySelector("#ps-arc-scale").value));
        await this._ss("arcWidgetBgOpacity", parseFloat(popup.querySelector("#ps-arc-bg-op").value));
        await this._ss("arcWidgetFontColor", popup.querySelector("#ps-arc-font-color").value);
        await this._ss("arcWidgetFontSize",  parseInt(popup.querySelector("#ps-arc-font-size").value));
        await this._ss("attributeTitleColor", popup.querySelector("#ps-title-color").value);
        await this._ss("attributeTitleStrokeColor", popup.querySelector("#ps-title-stroke").value);
        await this._ss("attributeTitleStrokeThickness", parseFloat(popup.querySelector("#ps-title-stroke-width").value));
        await this._ss("attributeTitleBoldness", parseInt(popup.querySelector("#ps-title-bold").value));
        await this._ss("attributeTitleSize", parseInt(popup.querySelector("#ps-title-size").value));
        await this._ss("attributeTitleSpacing", parseFloat(popup.querySelector("#ps-title-spacing").value));
        await this._ss("portraitShadow", popup.querySelector("#ps-en").checked);
        await this._ss("portraitShadowDirection", popup.querySelector("#ps-dir").value);
        await this._ss("portraitShadowBlur",     parseInt(popup.querySelector("#ps-blur").value));
        await this._ss("portraitShadowColor",    popup.querySelector("#ps-color").value);
        await this._ss("portraitShadowOpacity",  parseFloat(popup.querySelector("#ps-op").value));
        await this._ss("portraitShadowDistance", parseInt(popup.querySelector("#ps-dist").value));
        await this._ss("portraitSpaceTransparent", popup.querySelector("#ps-space-transparent").checked);
        await this._ss("portraitSpaceOpacity", parseFloat(popup.querySelector("#ps-space-opacity").value));
        this.refresh();
        if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | Portrait settings applied successfully`);
      } catch (err) {
        console.error(`${MODULE_ID} | apply() failed:`, err);
      }
    };
    let _applyTimer = null;
    const applyDebounced = () => {
      if (_applyTimer) clearTimeout(_applyTimer);
      _applyTimer = setTimeout(() => { _applyTimer = null; apply(); }, 200);
    };
    popup.querySelector("#ps-w")?.addEventListener("input",e=>{popup.querySelector("#ps-w-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ps-bars")?.addEventListener("input",e=>{popup.querySelector("#ps-bars-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-bars-offset")?.addEventListener("input",e=>{popup.querySelector("#ps-bars-offset-val").textContent=e.target.value;apply();});
    popup.querySelector("#ps-bars-y-offset")?.addEventListener("input",e=>{popup.querySelector("#ps-bars-y-offset-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ps-bar-gap")?.addEventListener("input",e=>{popup.querySelector("#ps-bar-gap-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ps-bar-top-padding")?.addEventListener("input",e=>{popup.querySelector("#ps-bar-top-padding-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ps-value-size")?.addEventListener("input",e=>{popup.querySelector("#ps-value-size-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-upper-op")?.addEventListener("input",e=>{popup.querySelector("#ps-upper-op-val").textContent=Math.round(e.target.value*100)+"%";apply();});
    popup.querySelector("#ps-upper-name-size")?.addEventListener("input",e=>{popup.querySelector("#ps-upper-name-size-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-upper-scale")?.addEventListener("input",e=>{popup.querySelector("#ps-upper-scale-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-upper-x")?.addEventListener("input",e=>{popup.querySelector("#ps-upper-x-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-upper-y")?.addEventListener("input",e=>{popup.querySelector("#ps-upper-y-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-xp-x")?.addEventListener("input",e=>{popup.querySelector("#ps-xp-x-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-xp-y")?.addEventListener("input",e=>{popup.querySelector("#ps-xp-y-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-value-color")?.addEventListener("input",applyDebounced);
    popup.querySelector("#ps-arc-x")?.addEventListener("input",e=>{popup.querySelector("#ps-arc-x-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-arc-y")?.addEventListener("input",e=>{popup.querySelector("#ps-arc-y-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-arc-scale")?.addEventListener("input",e=>{popup.querySelector("#ps-arc-scale-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-arc-bg-op")?.addEventListener("input",e=>{popup.querySelector("#ps-arc-bg-op-val").textContent=Math.round(e.target.value*100)+"%";apply();});
    popup.querySelector("#ps-arc-font-color")?.addEventListener("input",applyDebounced);
    popup.querySelector("#ps-arc-font-size")?.addEventListener("input",e=>{popup.querySelector("#ps-arc-font-size-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-title-color")?.addEventListener("input",applyDebounced);
    popup.querySelector("#ps-title-stroke")?.addEventListener("input",applyDebounced);
    popup.querySelector("#ps-title-stroke-width")?.addEventListener("input",e=>{popup.querySelector("#ps-title-stroke-width-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ps-title-size")?.addEventListener("input",e=>{popup.querySelector("#ps-title-size-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ps-title-spacing")?.addEventListener("input",e=>{popup.querySelector("#ps-title-spacing-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ps-title-bold")?.addEventListener("input",e=>{popup.querySelector("#ps-title-bold-val").textContent=e.target.value;apply();});
    popup.querySelector("#ps-blur")?.addEventListener("input",e=>{popup.querySelector("#ps-blur-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ps-op")?.addEventListener("input",e=>{popup.querySelector("#ps-op-val").textContent=Math.round(e.target.value*100)+"%";apply();});
    popup.querySelector("#ps-dist")?.addEventListener("input",e=>{popup.querySelector("#ps-dist-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ps-space-transparent")?.addEventListener("change",apply);
    popup.querySelector("#ps-space-opacity")?.addEventListener("input",e=>{popup.querySelector("#ps-space-opacity-val").textContent=Math.round(e.target.value*100)+"%";apply();});
    popup.querySelector("#ps-color")?.addEventListener("input",applyDebounced);
    popup.querySelector("#ps-dir")?.addEventListener("change",apply);
    popup.querySelector("#ps-en")?.addEventListener("change",e=>{popup.querySelector("#ps-shadow-group").classList.toggle("ct-hidden",!e.target.checked);apply();});
    popup.querySelector("#ps-upper-bg")?.addEventListener("input",applyDebounced);
    popup.querySelector("#ps-upper-font")?.addEventListener("input",applyDebounced);
    popup.querySelector(".ct-popup-close")?.addEventListener("click",()=>popup.remove());
    setTimeout(()=>{ document.addEventListener("click",function h(e){if(!popup.contains(e.target)){popup.remove();document.removeEventListener("click",h);}});},300);

  }

  _positionPopupAboveEvent(popup, event, options = {}) {
    const margin = Number(options.margin ?? 8);
    const gap = Number(options.gap ?? 10);
    const anchorX = Number(event?.clientX ?? (window.innerWidth / 2));
    const anchorY = Number(event?.clientY ?? (window.innerHeight / 2));

    popup.style.left = `${margin}px`;
    popup.style.top = `${margin}px`;
    popup.style.transform = "none";

    const rect = popup.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
    let left = Math.min(Math.max(margin, anchorX - (rect.width / 2)), maxLeft);
    let top = anchorY - rect.height - gap;

    if (top < margin) top = Math.min(Math.max(margin, anchorY + gap), maxTop);
    top = Math.min(Math.max(margin, top), maxTop);

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  }

  _openTaskbarSettings() {
    document.querySelector("#ct-taskbar-settings-popup")?.remove();
    const h     = this._gs("taskbarHeight");
    const bgC   = this._gs("bgColor");
    const bgO   = this._gs("bgOpacity");
    const acc   = this._gs("accentColor");
    const ah    = this._gs("autoHide");
    const secExp = this._gs("sectionsExpanded") ?? false;
    const mfSize = this._gs("menuFontSize") ?? 100;
    const mfColor = this._gs("menuFontColor") ?? "#e8e8e8";
    const mfCaps = this._gs("menuFontCaps") ?? false;
    const mfFamily = this._gs("menuFontFamily") ?? "inherit";
    const gtEnabled = this._gs("galleryTabsEnabled") ?? true;
    const gtOffset = this._gs("galleryTabsOffsetX") ?? 0;
    const ownedPCs = this._getOwnedPCs();
    const selectedActorId = game.settings.get(MODULE_ID, "selectedActorId") ?? "";
    const barRect = this.element.getBoundingClientRect();
    const popup = document.createElement("div");
    popup.id = "ct-taskbar-settings-popup";
    popup.classList.add("ct-popup");
    // Position: right-bottom corner above the Settings button
    const settingsBtn = this.element?.querySelector("#ct-btn-settings");
    const btnRect = settingsBtn?.getBoundingClientRect();
    if (btnRect) {
      popup.style.right = `${window.innerWidth - btnRect.right}px`;
      popup.style.bottom = `${window.innerHeight - btnRect.top + 8}px`;
      popup.style.left = "auto";
    } else {
      popup.style.right = "16px";
      popup.style.bottom = `${window.innerHeight - barRect.top + 8}px`;
      popup.style.left = "auto";
    }
    const lastTab = this._gs("lastSettingsTab") || "general";
    const tabs = ["general","sections","fonts","gallery","minimenu","icons","cash"];
    const activeTab = tabs.includes(lastTab) ? lastTab : "general";
    popup.innerHTML = `
      <div class="ct-popup-header"><i class="fas fa-cog"></i> Taskbar Settings <span class="ct-popup-header-actions"><button class="ct-popup-action-btn" id="ts-export" title="Export Settings"><i class="fas fa-file-export"></i></button><button class="ct-popup-action-btn" id="ts-import" title="Import Settings"><i class="fas fa-file-import"></i></button></span><button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
      <div class="ct-popup-tabs">
        <button class="ct-popup-tab${activeTab==="general"?" is-active":""}" data-tab="general"><i class="fas fa-sliders-h"></i> General</button>
        <button class="ct-popup-tab${activeTab==="sections"?" is-active":""}" data-tab="sections"><i class="fas fa-expand"></i> Sections</button>
        <button class="ct-popup-tab${activeTab==="fonts"?" is-active":""}" data-tab="fonts"><i class="fas fa-font"></i> Fonts</button>
        <button class="ct-popup-tab${activeTab==="gallery"?" is-active":""}" data-tab="gallery"><i class="fas fa-images"></i> Gallery Tabs</button>
        <button class="ct-popup-tab${activeTab==="minimenu"?" is-active":""}" data-tab="minimenu"><i class="fas fa-th"></i> Mini Menu</button>
        <button class="ct-popup-tab${activeTab==="icons"?" is-active":""}" data-tab="icons"><i class="fas fa-icons"></i> Icons</button>
        <button class="ct-popup-tab${activeTab==="cash"?" is-active":""}" data-tab="cash"><i class="fas fa-coins"></i> Cash & Values</button>
      </div>
      <div class="ct-popup-body">
        <div class="ct-popup-pane${activeTab==="general"?" is-active":""}" data-pane="general">
          ${ownedPCs.length > 1 ? `<label>Character <select id="ts-actor">${ownedPCs.map(a => `<option value="${a.id}"${a.id === selectedActorId ? " selected" : ""}>${foundry.utils.escapeHTML(a.name)}</option>`).join("")}<option value=""${!selectedActorId ? " selected" : ""}>Default</option></select></label>` : ""}
          <label>Height <span class="ct-val-label" id="ts-h-val">${h}px</span><input type="range" id="ts-h" min="50" max="110" step="5" value="${h}"></label>
          <label>Background <input type="color" id="ts-bg" value="${bgC}"></label>
          <label>Opacity <span class="ct-val-label" id="ts-op-val">${Math.round(bgO*100)}%</span><input type="range" id="ts-op" min="0.3" max="1" step="0.05" value="${bgO}"></label>
          <label>Accent <input type="color" id="ts-acc" value="${acc}"></label>
          <label class="ct-toggle-row">Auto-hide <input type="checkbox" id="ts-ah" ${ah?"checked":""}></label>
        </div>
        <div class="ct-popup-pane${activeTab==="sections"?" is-active":""}" data-pane="sections">
          <label class="ct-toggle-row">Expand Sections <input type="checkbox" id="ts-sec-exp" ${secExp?"checked":""}></label>
        </div>
        <div class="ct-popup-pane${activeTab==="fonts"?" is-active":""}" data-pane="fonts">
          <label>Font Size <span class="ct-val-label" id="ts-mf-size-val">${mfSize}%</span><input type="range" id="ts-mf-size" min="50" max="150" step="5" value="${mfSize}"></label>
          <label>Font Color <input type="color" id="ts-mf-color" value="${mfColor}"></label>
          <label class="ct-toggle-row">Capitalize <input type="checkbox" id="ts-mf-caps" ${mfCaps?"checked":""}></label>
          <label>Font Family <select id="ts-mf-family">
            <option value="inherit"${mfFamily==="inherit"?" selected":""}>Default (Signika)</option>
            <option value="&quot;Bebas Neue&quot;, sans-serif"${mfFamily.includes("Bebas")?" selected":""}>Bebas Neue</option>
            <option value="&quot;Oswald&quot;, sans-serif"${mfFamily.includes("Oswald")?" selected":""}>Oswald</option>
            <option value="&quot;Roboto&quot;, sans-serif"${mfFamily.includes("Roboto")?" selected":""}>Roboto</option>
            <option value="&quot;Courier New&quot;, monospace"${mfFamily.includes("Courier")?" selected":""}>Courier New</option>
          </select></label>
        </div>
        <div class="ct-popup-pane${activeTab==="gallery"?" is-active":""}" data-pane="gallery">
          <label class="ct-toggle-row">Show Gallery Tabs <input type="checkbox" id="ts-gt-enabled" ${gtEnabled?"checked":""}></label>
          <label>Horizontal Offset <span class="ct-val-label" id="ts-gt-off-val">${gtOffset}%</span><input type="range" id="ts-gt-offset" min="0" max="150" step="1" value="${gtOffset}"></label>
          <p class="ct-gallery-settings-hint"><i class="fas fa-info-circle"></i> Gallery tabs from the actor's cypher-gallery-tabs module appear above the taskbar. Use the offset slider to move them left or right.</p>
        </div>
        <div class="ct-popup-pane${activeTab==="minimenu"?" is-active":""}" data-pane="minimenu">
          <label>Display Mode
            <select id="ts-mm-mode">
              <option value="grid"${(this._gs("miniMenuDisplayMode")||"list")==="grid"?" selected":""}>Grid</option>
              <option value="list"${(this._gs("miniMenuDisplayMode")||"list")==="list"?" selected":""}>List</option>
              <option value="list-no-title"${(this._gs("miniMenuDisplayMode")||"list")==="list-no-title"?" selected":""}>List (no title)</option>
            </select>
          </label>
          <label>Item Size <span class="ct-val-label" id="ts-mm-size-val">${this._gs("miniMenuItemSize")||32}px</span><input type="range" id="ts-mm-size" min="8" max="256" step="8" value="${this._gs("miniMenuItemSize")||32}"></label>
          <label>Item Padding <span class="ct-val-label" id="ts-mm-pad-val">${this._gs("miniMenuPadding")||0}px</span><input type="range" id="ts-mm-padding" min="0" max="20" step="1" value="${this._gs("miniMenuPadding")||0}"></label>
          <label>Space Left <span class="ct-val-label" id="ts-mm-sl-val">${this._gs("miniMenuSpaceLeft")??2}px</span><input type="range" id="ts-mm-sl" min="0" max="50" step="1" value="${this._gs("miniMenuSpaceLeft")??2}"></label>
          <label>Space Right <span class="ct-val-label" id="ts-mm-sr-val">${this._gs("miniMenuSpaceRight")??0}px</span><input type="range" id="ts-mm-sr" min="0" max="50" step="1" value="${this._gs("miniMenuSpaceRight")??0}"></label>
          <label class="ct-toggle-row">Show Title <input type="checkbox" id="ts-mm-title" ${this._gs("miniMenuShowTitle")!==false?"checked":""}></label>
          <label class="ct-toggle-row">Show Description <input type="checkbox" id="ts-mm-desc" ${this._gs("miniMenuShowDescription")!==false?"checked":""}></label>
        </div>
        <div class="ct-popup-pane${activeTab==="icons"?" is-active":""}" data-pane="icons">
          <label class="ct-toggle-row">Unlock Menu Icons <input type="checkbox" id="ts-icons-unlocked" ${this._gs("menuIconsUnlocked")?"checked":""}></label>
          <p class="ct-gallery-settings-hint"><i class="fas fa-info-circle"></i> When unlocked, right-click any menu icon to customize its appearance individually.</p>
          <div class="ct-popup-subhead">Default Settings (for new / reset icons)</div>
          <label>Icon Size <span class="ct-val-label" id="ts-icon-size-val">${this._gs("menuIconSize")??100}%</span><input type="range" id="ts-icon-size" min="50" max="200" step="5" value="${this._gs("menuIconSize")??100}"></label>
          <label>Label Size <span class="ct-val-label" id="ts-label-size-val">${this._gs("menuLabelSize")??100}%</span><input type="range" id="ts-label-size" min="50" max="200" step="5" value="${this._gs("menuLabelSize")??100}"></label>
          <label>Icon Color <input type="color" id="ts-icon-color" value="${this._gs("menuIconColor")??"#c8a96e"}"></label>
          <label>Label Color <input type="color" id="ts-label-color" value="${this._gs("menuLabelColor")??"#e8e8e8"}"></label>
          <label>Background <input type="color" id="ts-icon-bg" value="${this._gs("menuIconBgColor")??"#1a1525"}"></label>
        </div>
        <div class="ct-popup-pane${activeTab==="cash"?" is-active":""}" data-pane="cash">
          <div class="ct-popup-subhead">Cash & Values Panel Background</div>
          <label>Image <input type="text" id="ts-cash-bg-image" value="${this._getMenuBackgroundValue("cash", "image")}" placeholder="URL or path..."></label>
          <label>Fit
            <select id="ts-cash-bg-fit">
              <option value="cover" ${this._getMenuBackgroundValue("cash", "fit") === "cover" ? "selected" : ""}>Cover</option>
              <option value="contain" ${this._getMenuBackgroundValue("cash", "fit") === "contain" ? "selected" : ""}>Contain</option>
              <option value="fit" ${this._getMenuBackgroundValue("cash", "fit") === "fit" ? "selected" : ""}>Stretch</option>
              <option value="fit-vertical" ${this._getMenuBackgroundValue("cash", "fit") === "fit-vertical" ? "selected" : ""}>Fit Vertical</option>
              <option value="fit-horizontal" ${this._getMenuBackgroundValue("cash", "fit") === "fit-horizontal" ? "selected" : ""}>Fit Horizontal</option>
            </select>
          </label>
          <label>Alignment
            <select id="ts-cash-bg-align">
              <option value="center" ${this._getMenuBackgroundValue("cash", "align") === "center" ? "selected" : ""}>Center</option>
              <option value="top" ${this._getMenuBackgroundValue("cash", "align") === "top" ? "selected" : ""}>Top</option>
              <option value="bottom" ${this._getMenuBackgroundValue("cash", "align") === "bottom" ? "selected" : ""}>Bottom</option>
              <option value="left" ${this._getMenuBackgroundValue("cash", "align") === "left" ? "selected" : ""}>Left</option>
              <option value="right" ${this._getMenuBackgroundValue("cash", "align") === "right" ? "selected" : ""}>Right</option>
              <option value="top left" ${this._getMenuBackgroundValue("cash", "align") === "top left" ? "selected" : ""}>Top Left</option>
              <option value="top right" ${this._getMenuBackgroundValue("cash", "align") === "top right" ? "selected" : ""}>Top Right</option>
              <option value="bottom left" ${this._getMenuBackgroundValue("cash", "align") === "bottom left" ? "selected" : ""}>Bottom Left</option>
              <option value="bottom right" ${this._getMenuBackgroundValue("cash", "align") === "bottom right" ? "selected" : ""}>Bottom Right</option>
            </select>
          </label>
          <label>Opacity <span class="ct-val-label" id="ts-cash-bg-op-val">${Math.round((this._getMenuBackgroundValue("cash", "opacity") ?? 0.2) * 100)}%</span><input type="range" id="ts-cash-bg-op" min="0" max="1" step="0.05" value="${this._getMenuBackgroundValue("cash", "opacity") ?? 0.2}"></label>
          <div class="ct-popup-subhead">Cash & Assets Button Spacing</div>
          <label>Space Left <span class="ct-val-label" id="ts-cash-sl-val">${this._gs("cashStackSpaceLeft") ?? 0}px</span><input type="range" id="ts-cash-sl" min="0" max="50" step="1" value="${this._gs("cashStackSpaceLeft") ?? 0}"></label>
          <label>Space Right <span class="ct-val-label" id="ts-cash-sr-val">${this._gs("cashStackSpaceRight") ?? 0}px</span><input type="range" id="ts-cash-sr" min="0" max="50" step="1" value="${this._gs("cashStackSpaceRight") ?? 0}"></label>
        </div>
      </div>`;
    document.body.appendChild(popup);
    popup.querySelectorAll(".ct-popup-tab").forEach(btn => {
      btn.addEventListener("click", async () => {
        const tab = btn.dataset.tab;
        popup.querySelectorAll(".ct-popup-tab").forEach(el => el.classList.toggle("is-active", el === btn));
        popup.querySelectorAll(".ct-popup-pane").forEach(pane => pane.classList.toggle("is-active", pane.dataset.pane === tab));
        await this._ss("lastSettingsTab", tab);
      });
    });

    const apply = async () => {
      const newActorId = popup.querySelector("#ts-actor")?.value ?? "";
      await game.settings.set(MODULE_ID, "selectedActorId", newActorId);
      await this._ss("taskbarHeight",parseInt(popup.querySelector("#ts-h").value));
      await this._ss("bgColor",     popup.querySelector("#ts-bg").value);
      await this._ss("bgOpacity",   parseFloat(popup.querySelector("#ts-op").value));
      await this._ss("accentColor", popup.querySelector("#ts-acc").value);
      await this._ss("autoHide",    popup.querySelector("#ts-ah").checked);
      await this._ss("sectionsExpanded", popup.querySelector("#ts-sec-exp").checked);
      await this._ss("menuFontSize", parseInt(popup.querySelector("#ts-mf-size").value));
      await this._ss("menuFontColor", popup.querySelector("#ts-mf-color").value);
      await this._ss("menuFontCaps", popup.querySelector("#ts-mf-caps").checked);
      await this._ss("menuFontFamily", popup.querySelector("#ts-mf-family").value);
      await this._ss("galleryTabsEnabled", popup.querySelector("#ts-gt-enabled").checked);
      const offsetVal = parseInt(popup.querySelector("#ts-gt-offset").value);
      await this._ss("galleryTabsOffsetX", offsetVal);
      // Apply offset immediately
      document.querySelectorAll(".cgt-strip-wrapper").forEach(el => {
        el.style.setProperty("--ct-gallery-offset-x", `${offsetVal}%`);
        el.dataset.galleryOffset = offsetVal;
      });
      // Mini menu settings
      await this._ss("miniMenuDisplayMode", popup.querySelector("#ts-mm-mode")?.value || "list");
      await this._ss("miniMenuItemSize", parseInt(popup.querySelector("#ts-mm-size")?.value || 32));
      await this._ss("miniMenuPadding", parseInt(popup.querySelector("#ts-mm-padding")?.value || 0));
      await this._ss("miniMenuSpaceLeft", parseInt(popup.querySelector("#ts-mm-sl")?.value ?? 2));
      await this._ss("miniMenuSpaceRight", parseInt(popup.querySelector("#ts-mm-sr")?.value ?? 0));
      await this._ss("miniMenuShowTitle", popup.querySelector("#ts-mm-title")?.checked ?? true);
      await this._ss("miniMenuShowDescription", popup.querySelector("#ts-mm-desc")?.checked ?? true);
      // Icon settings
      await this._ss("menuIconsUnlocked", popup.querySelector("#ts-icons-unlocked")?.checked ?? false);
      await this._ss("menuIconSize", parseInt(popup.querySelector("#ts-icon-size")?.value ?? 100));
      await this._ss("menuLabelSize", parseInt(popup.querySelector("#ts-label-size")?.value ?? 100));
      await this._ss("menuIconColor", popup.querySelector("#ts-icon-color")?.value ?? "#c8a96e");
      await this._ss("menuLabelColor", popup.querySelector("#ts-label-color")?.value ?? "#e8e8e8");
      await this._ss("menuIconBgColor", popup.querySelector("#ts-icon-bg")?.value ?? "#1a1525");
      // Cash & Values background settings
      const cashBgImage = popup.querySelector("#ts-cash-bg-image")?.value?.trim() || "";
      const cashBgFit = popup.querySelector("#ts-cash-bg-fit")?.value || "cover";
      const cashBgAlign = popup.querySelector("#ts-cash-bg-align")?.value || "center";
      const cashBgOp = parseFloat(popup.querySelector("#ts-cash-bg-op")?.value ?? 0.2);
      let menuBgs = {};
      try {
        const raw = game.settings.get(MODULE_ID, "menuBackgrounds");
        menuBgs = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
      } catch { menuBgs = {}; }
      if (cashBgImage) {
        menuBgs.cash = { image: cashBgImage, fit: cashBgFit, align: cashBgAlign, opacity: cashBgOp };
      } else {
        delete menuBgs.cash;
      }
      await game.settings.set(MODULE_ID, "menuBackgrounds", JSON.stringify(menuBgs));
      // Cash & Assets button spacing
      await this._ss("cashStackSpaceLeft", parseInt(popup.querySelector("#ts-cash-sl")?.value ?? 0));
      await this._ss("cashStackSpaceRight", parseInt(popup.querySelector("#ts-cash-sr")?.value ?? 0));
      this._resolveActor();
      this.reposition(); this.applySettings();
      if (newActorId !== (this.actor?.id ?? "")) this.render();
    };
    popup.querySelector("#ts-h").addEventListener("input",e=>{popup.querySelector("#ts-h-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ts-op").addEventListener("input",e=>{popup.querySelector("#ts-op-val").textContent=Math.round(e.target.value*100)+"%";apply();});
    popup.querySelector("#ts-sec-exp")?.addEventListener("change",apply);
    popup.querySelector("#ts-mf-size")?.addEventListener("input",e=>{popup.querySelector("#ts-mf-size-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ts-gt-offset")?.addEventListener("input",e=>{popup.querySelector("#ts-gt-off-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ts-mm-size")?.addEventListener("input",e=>{popup.querySelector("#ts-mm-size-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ts-mm-padding")?.addEventListener("input",e=>{popup.querySelector("#ts-mm-pad-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ts-mm-sl")?.addEventListener("input",e=>{popup.querySelector("#ts-mm-sl-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ts-mm-sr")?.addEventListener("input",e=>{popup.querySelector("#ts-mm-sr-val").textContent=e.target.value+"px";apply();});
    // Icon settings listeners
    popup.querySelector("#ts-icon-size")?.addEventListener("input",e=>{popup.querySelector("#ts-icon-size-val").textContent=e.target.value+"%";apply();});
    popup.querySelector("#ts-label-size")?.addEventListener("input",e=>{popup.querySelector("#ts-label-size-val").textContent=e.target.value+"%";apply();});
    // Cash & Values background listeners
    popup.querySelector("#ts-cash-bg-op")?.addEventListener("input",e=>{popup.querySelector("#ts-cash-bg-op-val").textContent=Math.round(e.target.value*100)+"%";apply();});
    // Cash & Assets button spacing listeners
    popup.querySelector("#ts-cash-sl")?.addEventListener("input",e=>{popup.querySelector("#ts-cash-sl-val").textContent=e.target.value+"px";apply();});
    popup.querySelector("#ts-cash-sr")?.addEventListener("input",e=>{popup.querySelector("#ts-cash-sr-val").textContent=e.target.value+"px";apply();});
    popup.querySelectorAll("#ts-cash-bg-image,#ts-cash-bg-fit,#ts-cash-bg-align").forEach(el=>el?.addEventListener("change",apply));
    popup.querySelectorAll("select,input[type=color],input[type=checkbox]").forEach(el=>el.addEventListener("change",apply));

    // ── Export / Import Settings ──
    popup.querySelector("#ts-export")?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const actor = this.actor;
      if (!actor) { ui.notifications.warn("No character assigned."); return; }
      const prefs = actor.getFlag("cypher-taskbar", "taskbarPrefs") ?? {};

      const taskbarKeys = [
        "taskbarHeight","bgColor","bgOpacity","accentColor","locked","autoHide",
        "portraitWidth","portraitAreaCollapsed","sectionsExpanded",
        "menuFontSize","menuFontColor","menuFontFamily","menuFontCaps",
        "miniMenuDisplayMode","miniMenuItemSize","miniMenuPadding",
        "miniMenuSpaceLeft","miniMenuSpaceRight",
        "menuIconSize","menuLabelSize","menuIconColor","menuLabelColor","menuIconBgColor",
        "menuIconsUnlocked","menuIconSettings",
        "galleryTabsFontSize","galleryTabsFontColor","galleryTabsIconColor","galleryTabsBackground",
        "lastSettingsTab"
      ];
      const portraitKeys = [
        "portraitShadowBlur","portraitShadowColor","portraitShadowOpacity",
        "portraitShadowOffsetX","portraitShadowOffsetY",
        "upperPanelBgColor","upperPanelOpacity",
        "namePanelBgColor","namePanelOpacity","namePanelFontSize","namePanelFontColor","namePanelFontFamily",
        "bar1Color","bar2Color","bar3Color","bar1TextColor","bar2TextColor","bar3TextColor",
        "arcBarColor","arcBarGlow","arcBarTextColor",
        "xpCircleColor","xpCircleSize","xpCircleOffsetX","xpCircleOffsetY",
        "portraitSpaceTransparent","portraitSpaceOpacity",
        "portraitSettingsPos","lastPortraitSettingsTab"
      ];

      const taskbarSettings = {};
      const portraitSettings = {};
      const otherSettings = {};
      for (const [k, v] of Object.entries(prefs)) {
        if (taskbarKeys.includes(k)) taskbarSettings[k] = v;
        else if (portraitKeys.includes(k)) portraitSettings[k] = v;
        else otherSettings[k] = v;
      }

      const exportData = {
        module: "cypher-taskbar",
        version: game.modules.get("cypher-taskbar")?.data?.version ?? "unknown",
        exportedAt: new Date().toISOString(),
        actorName: actor.name,
        actorId: actor.id,
        taskbarSettings,
        portraitSettings,
        otherSettings
      };

      const fileName = `cypher-taskbar-settings-${actor.name?.replace(/[^a-z0-9]/gi, "_") || "actor"}.json`;
      const jsonStr = JSON.stringify(exportData, null, 2);
      const dataUrl = "data:application/json;charset=utf-8," + encodeURIComponent(jsonStr);
      const a = document.createElement("a");
      a.style.position = "absolute";
      a.style.visibility = "hidden";
      a.href = dataUrl;
      a.download = fileName;
      a.target = "_self";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.dispatchEvent(new MouseEvent("click", { bubbles: false, cancelable: true, view: window }));
      setTimeout(() => {
        a.remove();
      }, 2000);
      ui.notifications.info(`Settings exported for "${actor.name}". File downloaded.`);
    });

    popup.querySelector("#ts-import")?.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.style.display = "none";
      input.addEventListener("change", async (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);

          const imported = {};
          if (data.taskbarSettings && typeof data.taskbarSettings === "object") {
            Object.assign(imported, data.taskbarSettings);
          }
          if (data.portraitSettings && typeof data.portraitSettings === "object") {
            Object.assign(imported, data.portraitSettings);
          }
          if (data.otherSettings && typeof data.otherSettings === "object") {
            Object.assign(imported, data.otherSettings);
          }
          if (Object.keys(imported).length === 0 && data.settings && typeof data.settings === "object") {
            Object.assign(imported, data.settings);
          }
          if (Object.keys(imported).length === 0) {
            ui.notifications.error("Invalid settings file: no recognizable settings section.");
            return;
          }

          const actor = this.actor;
          if (!actor) { ui.notifications.warn("No character assigned."); return; }
          const current = actor.getFlag("cypher-taskbar", "taskbarPrefs") ?? {};
          const merged = { ...current, ...imported };
          await actor.setFlag("cypher-taskbar", "taskbarPrefs", merged);
          this.applySettings();
          this.refresh();
          ui.notifications.info(`Settings imported successfully. (${Object.keys(imported).length} settings)`);
        } catch (err) {
          console.error(`${MODULE_ID} | Import failed:`, err);
          ui.notifications.error("Failed to import settings. Check file format.");
        }
        input.remove();
      });
      document.body.appendChild(input);
      input.click();
    });

    popup.querySelector(".ct-popup-close").addEventListener("click",()=>popup.remove());
    setTimeout(()=>{ document.addEventListener("click",function h(e){if(!popup.contains(e.target)){popup.remove();document.removeEventListener("click",h);}});},50);
  }

  _getIconSettings(panelKey) {
    const all = this._gjson("menuIconSettings", {});
    const defaults = {
      iconSize: this._gs("menuIconSize") ?? 100,
      labelSize: this._gs("menuLabelSize") ?? 100,
      iconColor: this._gs("menuIconColor") ?? "#c8a96e",
      labelColor: this._gs("menuLabelColor") ?? "#e8e8e8",
      bgColor: this._gs("menuIconBgColor") ?? "#1a1525"
    };
    return { ...defaults, ...(all[panelKey] || {}) };
  }

  /** Apply per-icon CSS variables to a menu panel button */
  _applyMenuIconStyles(btn) {
    const panel = btn.dataset.panel;
    if (!panel) return;
    const isettings = this._getIconSettings(panel);
    btn.style.setProperty("--ct-menu-icon-size", isettings.iconSize / 100);
    btn.style.setProperty("--ct-menu-label-size", isettings.labelSize / 100);
    btn.style.setProperty("--ct-menu-icon-color", isettings.iconColor);
    btn.style.setProperty("--ct-menu-label-color", isettings.labelColor);
    btn.style.setProperty("--ct-menu-icon-bg", isettings.bgColor);
  }

  async _setIconSetting(panelKey, key, value) {
    const all = this._gjson("menuIconSettings", {});
    if (!all[panelKey]) all[panelKey] = {};
    all[panelKey][key] = value;
    await this._ss("menuIconSettings", JSON.stringify(all));
  }

  _openMenuIconSettings(e, panelKey) {
    document.querySelector("#ct-menu-icon-settings-popup")?.remove();
    const popup = document.createElement("div");
    popup.id = "ct-menu-icon-settings-popup";
    popup.classList.add("ct-popup");
    popup.style.minWidth = "220px";

    // Position above the clicked button
    const btn = e.currentTarget;
    const rect = btn?.getBoundingClientRect?.();
    if (rect) {
      popup.style.left = `${rect.left + rect.width / 2}px`;
      popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
      popup.style.top = "auto";
      popup.style.transform = "translateX(-50%)";
    } else {
      popup.style.left = `${e.clientX}px`;
      popup.style.top = `${e.clientY - 10}px`;
    }

    const s = this._getIconSettings(panelKey);
    const panelNames = { persona: "Persona", skills: "Skills", abilities: "Abilities", combat: "Combat", equipment: "Equipment", spells: "Spells" };

    popup.innerHTML = `
      <div class="ct-popup-header"><i class="fas fa-paint-brush"></i> ${panelNames[panelKey] || panelKey} Icon <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
      <div class="ct-popup-body">
        <label>Icon Size <span class="ct-val-label" id="mi-size-val">${s.iconSize}%</span><input type="range" id="mi-size" min="50" max="200" step="5" value="${s.iconSize}"></label>
        <label>Label Size <span class="ct-val-label" id="mi-label-val">${s.labelSize}%</span><input type="range" id="mi-label" min="50" max="200" step="5" value="${s.labelSize}"></label>
        <label>Icon Color <input type="color" id="mi-icon-color" value="${s.iconColor}"></label>
        <label>Label Color <input type="color" id="mi-label-color" value="${s.labelColor}"></label>
        <label>Background <input type="color" id="mi-bg" value="${s.bgColor}"></label>
        <button class="ct-btn" id="mi-reset" style="margin-top:6px;font-size:0.7em;"><i class="fas fa-undo"></i> Reset to Defaults</button>
      </div>`;
    document.body.appendChild(popup);

    const apply = async () => {
      await this._setIconSetting(panelKey, "iconSize", parseInt(popup.querySelector("#mi-size").value));
      await this._setIconSetting(panelKey, "labelSize", parseInt(popup.querySelector("#mi-label").value));
      await this._setIconSetting(panelKey, "iconColor", popup.querySelector("#mi-icon-color").value);
      await this._setIconSetting(panelKey, "labelColor", popup.querySelector("#mi-label-color").value);
      await this._setIconSetting(panelKey, "bgColor", popup.querySelector("#mi-bg").value);
      this.applySettings();
      // Re-apply to the specific button that was right-clicked
      const btn = this.element?.querySelector(`.ct-btn[data-panel="${panelKey}"]`);
      if (btn) this._applyMenuIconStyles(btn);
    };

    popup.querySelector("#mi-reset").addEventListener("click", async () => {
      const all = this._gjson("menuIconSettings", {});
      delete all[panelKey];
      await this._ss("menuIconSettings", JSON.stringify(all));
      this.applySettings();
      // Re-apply to the specific button (now using global defaults)
      const btn = this.element?.querySelector(`.ct-btn[data-panel="${panelKey}"]`);
      if (btn) this._applyMenuIconStyles(btn);
      popup.remove();
    });

    popup.querySelector("#mi-size").addEventListener("input", ev => {
      popup.querySelector("#mi-size-val").textContent = ev.target.value + "%";
      apply();
    });
    popup.querySelector("#mi-label").addEventListener("input", ev => {
      popup.querySelector("#mi-label-val").textContent = ev.target.value + "%";
      apply();
    });
    popup.querySelectorAll("input[type=color]").forEach(el => el.addEventListener("change", apply));
    popup.querySelector(".ct-popup-close").addEventListener("click", () => popup.remove());
    setTimeout(() => {
      document.addEventListener("click", function h(ev) {
        if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener("click", h); }
      });
    }, 50);
  }

  async _toggleLock() {
    const locked = !this._gs("locked");
    await this._ss("locked",locked);
    const btn = this.element?.querySelector("#ct-btn-lock");
    if (btn) {
      btn.classList.toggle("ct-locked",locked);
      btn.querySelector("i").className = `fas fa-${locked?"lock":"lock-open"}`;
      btn.title = locked?"Unlock Taskbar":"Lock Taskbar (disable auto-hide)";
    }
    this.updateAutoHide();
  }

  /* ── Stuff Panel ── */

  _openStuffPanel() {
    const existing = document.querySelector("#ct-stuff-panel");
    if (existing) { existing.remove(); return; }
    const actor = this.actor;
    if (!actor) return;

    const tabs = this._gjson("stuffTabs", [{name:"All",icon:"fas fa-box-open",fontColor:"#f0d68a",caps:false,fontSize:100,iconSize:100,iconColor:"#c8a96e"}]);
    const tabItems = this._gjson("stuffTabItems", {});
    const defaultTab = Math.max(0, Math.min(tabs.length - 1, this._gs("stuffDefaultTab") ?? 0));
    let activeTab = defaultTab;

    const popup = document.createElement("div");
    popup.id = "ct-stuff-panel";
    popup.className = "ct-popup";

    // Position centered above the stuff button
    const stuffBtn = document.querySelector("#ct-btn-stuff");
    // Position centered on screen
    popup.style.left = "50%";
    popup.style.top = "50%";
    popup.style.transform = "translate(-50%, -50%)";

    // Apply settings as CSS variables
    this._applyStuffPanelSettings(popup);

    const renderContent = () => {
      const currentTab = tabs[activeTab];
      const tabKey = `tab${activeTab}`;
      const uuids = tabItems[tabKey] || [];
      const allUuids = this._gjson("stuffItems", []);
      const displayUuids = activeTab === 0 ? allUuids : uuids;
      const items = displayUuids.map(uuid => {
        try { return fromUuidSync(uuid); } catch { return null; }
      }).filter(i => i);
      const canAddMoreTabs = tabs.length < 5;
      const itemSizePx = this._gs("stuffMenuItemSize") ?? 32;
      const fontScale = (this._gs("stuffMenuFontSize") ?? 100) / 100;

      return `
        <div class="ct-popup-header">
          <span><i class="fas fa-box-open"></i> STUFF</span>
          <div class="ct-popup-header-actions">
            <button class="ct-popup-action-btn" id="ct-stuff-add" title="Add Item"><i class="fas fa-plus"></i></button>
            <button class="ct-popup-action-btn" id="ct-stuff-settings-gear" title="Settings"><i class="fas fa-cog"></i></button>
            <button class="ct-popup-close" id="ct-stuff-close"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div class="ct-stuff-tabs">
          ${tabs.map((t, i) => `<button class="ct-stuff-tab${i === activeTab ? ' is-active' : ''}" data-stuff-tab="${i}" style="color:${i===activeTab?t.fontColor:'var(--ct-text-dim)'};font-size:${(t.fontSize||100)*0.0068}em;text-transform:${t.caps?'uppercase':'none'};"><i class="${t.icon}" style="color:${t.iconColor};font-size:${(t.iconSize||100)*0.009}em;"></i>${foundry.utils.escapeHTML(t.name)}</button>`).join('')}
          ${canAddMoreTabs ? `<button class="ct-stuff-add-tab" id="ct-stuff-new-tab" title="New Tab"><i class="fas fa-plus"></i></button>` : ''}
        </div>
        <div class="ct-stuff-body" style="--ct-stuff-item-size:${itemSizePx}px;--ct-stuff-font-scale:${fontScale};">
          ${items.length === 0
            ? `<div class="ct-stuff-empty"><i class="fas fa-box-open"></i><span>${activeTab === 0 ? 'No items yet' : 'Tab is empty'}</span></div>`
            : `<div class="ct-stuff-grid">${items.map((item, idx) => {
              const uuid = displayUuids[idx];
              return `<div class="ct-stuff-item" data-stuff-uuid="${uuid}" data-stuff-idx="${idx}" title="${foundry.utils.escapeHTML(item.name)}">
                <img src="${item.img || 'icons/svg/item-bag.svg'}" alt="" draggable="false">
                <span class="ct-item-hand ct-stuff-hand" data-stuff-drag="${uuid}" title="Drag: ${foundry.utils.escapeHTML(item.name)}"><i class="fas fa-hand-paper"></i></span>
                <button class="ct-stuff-remove" data-stuff-remove="${uuid}" title="Remove"><i class="fas fa-times"></i></button>
              </div>`;
            }).join('')}</div>`}
        </div>`;
    };

    popup.innerHTML = renderContent();
    document.body.appendChild(popup);

    const bindEvents = () => {
      popup.querySelectorAll(".ct-stuff-tab").forEach(tab => {
        tab.addEventListener("click", () => {
          activeTab = parseInt(tab.dataset.stuffTab);
          popup.querySelector(".ct-stuff-tabs").innerHTML = extractTabs(renderContent());
          popup.querySelector(".ct-stuff-body").innerHTML = extractBody(renderContent());
          bindTabEvents();
          bindItemEvents();
        });
        tab.addEventListener("contextmenu", (e) => {
          e.preventDefault(); e.stopPropagation();
          const tabIdx = parseInt(tab.dataset.stuffTab);
          if (tabIdx === 0) return;
          this._openStuffTabConfig(tabIdx, () => {
            const updatedTabs = this._gjson("stuffTabs", []);
            tabs.splice(0, tabs.length, ...updatedTabs);
            popup.querySelector(".ct-stuff-tabs").innerHTML = extractTabs(renderContent());
            bindTabEvents();
          });
        });
      });

      popup.querySelector("#ct-stuff-new-tab")?.addEventListener("click", async () => {
        if (tabs.length >= 5) return;
        const newTab = { name: `Tab ${tabs.length}`, icon: "fas fa-folder", fontColor: "#f0d68a", caps: false, fontSize: 100, iconSize: 100, iconColor: "#c8a96e" };
        tabs.push(newTab);
        await this._ss("stuffTabs", JSON.stringify(tabs));
        activeTab = tabs.length - 1;
        popup.querySelector(".ct-stuff-tabs").innerHTML = extractTabs(renderContent());
        popup.querySelector(".ct-stuff-body").innerHTML = extractBody(renderContent());
        bindTabEvents();
        bindItemEvents();
      });

      popup.querySelector("#ct-stuff-add")?.addEventListener("click", () => this._openStuffAddDialog());
      popup.querySelector("#ct-stuff-settings-gear")?.addEventListener("click", () => this._openStuffSettings(popup));
      popup.querySelector("#ct-stuff-close")?.addEventListener("click", () => popup.remove());

      bindTabEvents();
      bindItemEvents();
    };

    const bindTabEvents = () => {
      popup.querySelectorAll(".ct-stuff-tab").forEach(tab => {
        tab.addEventListener("click", () => {
          activeTab = parseInt(tab.dataset.stuffTab);
          popup.querySelector(".ct-stuff-tabs").innerHTML = extractTabs(renderContent());
          popup.querySelector(".ct-stuff-body").innerHTML = extractBody(renderContent());
          bindTabEvents();
          bindItemEvents();
        });
        tab.addEventListener("contextmenu", (e) => {
          e.preventDefault(); e.stopPropagation();
          const tabIdx = parseInt(tab.dataset.stuffTab);
          if (tabIdx === 0) return;
          this._openStuffTabConfig(tabIdx, () => {
            const updatedTabs = this._gjson("stuffTabs", []);
            tabs.splice(0, tabs.length, ...updatedTabs);
            popup.querySelector(".ct-stuff-tabs").innerHTML = extractTabs(renderContent());
            bindTabEvents();
          });
        });
      });
      popup.querySelector("#ct-stuff-new-tab")?.addEventListener("click", async () => {
        if (tabs.length >= 5) return;
        const newTab = { name: `Tab ${tabs.length}`, icon: "fas fa-folder", fontColor: "#f0d68a", caps: false, fontSize: 100, iconSize: 100, iconColor: "#c8a96e" };
        tabs.push(newTab);
        await this._ss("stuffTabs", JSON.stringify(tabs));
        activeTab = tabs.length - 1;
        popup.querySelector(".ct-stuff-tabs").innerHTML = extractTabs(renderContent());
        popup.querySelector(".ct-stuff-body").innerHTML = extractBody(renderContent());
        bindTabEvents();
        bindItemEvents();
      });
    };

    const bindItemEvents = () => {
      popup.querySelectorAll("[data-stuff-remove]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const uuid = btn.dataset.stuffRemove;
          let current = this._gjson("stuffItems", []);
          current = current.filter(u => u !== uuid);
          await this._ss("stuffItems", JSON.stringify(current));
          let allTabItems = this._gjson("stuffTabItems", {});
          for (const key of Object.keys(allTabItems)) {
            allTabItems[key] = allTabItems[key].filter(u => u !== uuid);
          }
          await this._ss("stuffTabItems", JSON.stringify(allTabItems));
          popup.querySelector(".ct-stuff-body").innerHTML = extractBody(renderContent());
          bindItemEvents();
        });
      });
      popup.querySelectorAll("[data-stuff-uuid]").forEach(el => {
        el.addEventListener("click", () => {
          const uuid = el.dataset.stuffUuid;
          if (uuid) fromUuid(uuid).then(doc => doc?.sheet?.render(true));
        });
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault(); e.stopPropagation();
          const uuid = el.dataset.stuffUuid;
          this._openStuffContextMenu(e, uuid, tabs, async () => {
            popup.querySelector(".ct-stuff-body").innerHTML = extractBody(renderContent());
            bindItemEvents();
          });
        });
      });
      // Inline hand drag on stuff items
      popup.querySelectorAll("[data-stuff-drag]").forEach(hand => {
        hand.addEventListener("dragstart", (e) => {
          e.stopPropagation();
          const uuid = hand.dataset.stuffDrag;
          if (!uuid) return;
          const item = items.find(it => (tabUuids[activeTab] || []).includes(uuid));
          e.dataTransfer.setData("text/plain", JSON.stringify({ uuid, name: item?.name || "", img: item?.img || "" }));
          e.dataTransfer.effectAllowed = "copy";
        });
        hand.addEventListener("mousedown", (e) => e.stopPropagation());
      });
    };

    const extractTabs = (html) => {
      const match = html.match(/<div class="ct-stuff-tabs">([\s\S]*?)<\/div>\s*<div class="ct-stuff-body"/);
      return match ? match[1] : '';
    };
    const extractBody = (html) => {
      const match = html.match(/<div class="ct-stuff-body"[^>]*>([\s\S]*?)<\/div>\s*$/);
      return match ? match[1] : '';
    };

    bindEvents();
  }

  /* ── Book Panel ── */

  _openBookPanel() {
    const existing = document.querySelector("#ct-book-panel");
    if (existing) { existing.remove(); return; }
    const actor = this.actor;
    if (!actor) return;

    const globalLinks = (() => { try { return JSON.parse(game.settings.get(MODULE_ID, "bookGlobalLinks") || "[]"); } catch { return []; } })();
    const journals = Array.from(game.journal?.values() ?? []);
    const overrides = (() => { try { return JSON.parse(this._gs("bookJournalOverrides") || "{}"); } catch { return {}; } })();
    const isGM = game.user?.isGM ?? false;
    const viewMode = this._gs("bookMenuViewMode") ?? "list";

    let linkSort = "name-asc";
    let journalSort = "name-asc";

    const sortFn = (sortKey) => {
      switch (sortKey) {
        case "name-asc":  return (a, b) => (a.name || "").localeCompare(b.name || "");
        case "name-desc": return (a, b) => (b.name || "").localeCompare(a.name || "");
        case "date-new":  return (a, b) => (b.sort || b.timestamp || 0) - (a.sort || a.timestamp || 0);
        case "date-old":  return (a, b) => (a.sort || a.timestamp || 0) - (b.sort || b.timestamp || 0);
        default: return () => 0;
      }
    };

    const _isFaIcon = (icon) => typeof icon === "string" && /^(fa[srlbd]?\s|fa-solid\s|fa-regular\s|fa-brands\s|fa-light\s|fa-thin\s|fa-duotone\s|fa-sharp\s)/.test(icon);
    const _renderBookIcon = (icon, fit, color) => {
      if (_isFaIcon(icon)) {
        const colorStyle = color ? ` style="color:${color}"` : "";
        return `<i class="${icon} ct-book-fa-icon ct-book-icon-${fit || 'automatic'}"${colorStyle}></i>`;
      }
      return `<img src="${icon || 'icons/svg/book.svg'}" alt="" draggable="false" class="ct-book-icon-${fit || 'automatic'}">`;
    };

    const renderLinks = (sort) => {
      const sorted = [...globalLinks].sort(sortFn(sort));
      if (sorted.length === 0) return `<div class="ct-book-empty">No links</div>`;
      return `<div class="ct-book-list">${sorted.map((link, idx) => {
        const originalIdx = globalLinks.indexOf(link);
        const linkDragData = JSON.stringify({ name: link.name, icon: link.icon, uuid: link.uuid || null, url: link.url || null }).replace(/"/g, '&quot;');
        return `<div class="ct-book-entry" data-global-link="${originalIdx}" title="${foundry.utils.escapeHTML(link.description || link.name)}">
          ${_renderBookIcon(link.icon)}
          <span class="ct-book-entry-name">${foundry.utils.escapeHTML(link.name)}</span>
          <span class="ct-item-hand" data-link-drag="${originalIdx}" data-drag-payload="${linkDragData}" title="Drag: ${foundry.utils.escapeHTML(link.name)}"><i class="fas fa-hand-paper"></i></span>
          ${isGM ? `<button class="ct-book-edit" data-edit-link="${originalIdx}" title="Edit"><i class="fas fa-pencil-alt"></i></button>` : ''}
          ${isGM ? `<button class="ct-stuff-remove" data-remove-link="${originalIdx}" title="Remove"><i class="fas fa-times"></i></button>` : ''}
        </div>`;
      }).join('')}</div>`;
    };

    const renderJournals = (sort, observedOnly, ownedOnly) => {
      // Permission filtering using ownership data (robust across Foundry versions)
      const user = game.user;
      const _perm = (j) => {
        if (user?.isGM) return 3; // GM has full access
        const lvl = Number(j.ownership?.[user?.id] ?? j.ownership?.default ?? 0);
        return isNaN(lvl) ? 0 : lvl;
      };
      let filtered = journals;
      if (observedOnly) {
        filtered = filtered.filter(j => _perm(j) >= 2); // >= OBSERVER
      }
      if (ownedOnly) {
        filtered = filtered.filter(j => _perm(j) >= 3); // >= OWNER
      }
      // Now enrich the filtered results
      let enriched = filtered.map(j => {
        const ov = overrides[j.id] || {};
        return {
          id: j.id,
          displayName: ov.name || j.name,
          displayIcon: ov.icon || j.img || 'icons/svg/book.svg',
          iconFit: ov.iconFit || "automatic",
          iconColor: ov.iconColor || null,
          sortVal: j.sort || 0
        };
      });
      enriched.sort((a, b) => {
        switch (sort) {
          case "name-asc":  return (a.displayName || "").localeCompare(b.displayName || "");
          case "name-desc": return (b.displayName || "").localeCompare(a.displayName || "");
          case "date-new":  return (b.sortVal) - (a.sortVal);
          case "date-old":  return (a.sortVal) - (b.sortVal);
          default: return 0;
        }
      });
      if (enriched.length === 0) {
        const msg = ownedOnly ? "No owned journals" : observedOnly ? "No observed journals" : "No journals";
        return `<div class="ct-book-empty">${msg}</div>`;
      }
      return `<div class="ct-book-list">${enriched.map(j => {
        const dragData = JSON.stringify({ uuid: `JournalEntry.${j.id}`, name: j.displayName, img: j.displayIcon }).replace(/"/g, '&quot;');
        return `<div class="ct-book-entry" data-journal-id="${j.id}" title="${foundry.utils.escapeHTML(j.displayName)}">
          ${_renderBookIcon(j.displayIcon, j.iconFit, j.iconColor)}
          <span class="ct-book-entry-name">${foundry.utils.escapeHTML(j.displayName)}</span>
          <span class="ct-item-hand" data-journal-drag="${j.id}" data-drag-payload="${dragData}" title="Drag: ${foundry.utils.escapeHTML(j.displayName)}"><i class="fas fa-hand-paper"></i></span>
        </div>`;
      }).join('')}</div>`;
    };

    const sortOptions = `
      <option value="name-asc">Name A-Z</option>
      <option value="name-desc">Name Z-A</option>
      <option value="date-new">Newest</option>
      <option value="date-old">Oldest</option>`;

    const popup = document.createElement("div");
    popup.id = "ct-book-panel";
    popup.className = `ct-popup view-${viewMode}`;

    const bookBtn = document.querySelector("#ct-btn-book");
    // Position centered on screen
    popup.style.left = "50%";
    popup.style.top = "50%";
    popup.style.transform = "translate(-50%, -50%)";

    // Apply menu settings
    this._applyBookMenuSettings(popup);

    popup.innerHTML = `
      <div class="ct-popup-header">
        <span><i class="fas fa-book"></i> JOURNAL</span>
        <div class="ct-popup-header-actions">
          ${isGM ? `<button class="ct-popup-action-btn" id="ct-book-add-link" title="Add Global Link (GM)"><i class="fas fa-plus"></i></button>` : ''}
          <button class="ct-popup-action-btn" id="ct-book-settings-gear" title="Settings"><i class="fas fa-cog"></i></button>
          <button class="ct-popup-close" id="ct-book-close"><i class="fas fa-times"></i></button>
        </div>
      </div>
      <div class="ct-book-columns">
        <div class="ct-book-col">
          <div class="ct-book-col-header">
            <span class="ct-book-section-label"><i class="fas fa-globe"></i> Links</span>
            <select class="ct-book-sort" id="ct-book-sort-links">${sortOptions}</select>
          </div>
          <div class="ct-book-col-body" id="ct-book-links-area">${renderLinks(linkSort)}</div>
        </div>
        <div class="ct-book-col-sep"></div>
        <div class="ct-book-col">
          <div class="ct-book-col-header">
            <span class="ct-book-section-label"><i class="fas fa-journal-whills"></i> Journals</span>
            <div class="ct-book-journal-controls">
              <label class="ct-book-owned-toggle" title="Show journals you can observe">
                <input type="checkbox" id="ct-book-observed" checked>
                <span>Observed</span>
              </label>
              <label class="ct-book-owned-toggle" title="Show only journals you own">
                <input type="checkbox" id="ct-book-owned-only">
                <span>Owned only</span>
              </label>
              <select class="ct-book-sort" id="ct-book-sort-journals">${sortOptions}</select>
            </div>
          </div>
          <div class="ct-book-col-body" id="ct-book-journals-area">${renderJournals(journalSort, true, false)}</div>
        </div>
      </div>`;

    document.body.appendChild(popup);

    const bindLinkEvents = () => {
      popup.querySelectorAll("[data-global-link]").forEach(el => {
        el.addEventListener("click", async () => {
          const idx = parseInt(el.dataset.globalLink);
          const link = globalLinks[idx];
          if (!link) return;
          if (link.uuid) {
            try { const doc = await fromUuid(link.uuid); if (doc?.sheet) doc.sheet.render(true); else ui.notifications.warn("Document not found."); }
            catch (err) { ui.notifications.error("Could not open document."); console.error(err); }
          } else if (link.url) {
            window.open(link.url, "_blank");
          }
        });
      });
      popup.querySelectorAll("[data-edit-link]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.editLink);
          this._openBookEditGlobalLink(idx, () => {
            popup.querySelector("#ct-book-links-area").innerHTML = renderLinks(linkSort);
            bindLinkEvents();
          });
        });
      });
      popup.querySelectorAll("[data-remove-link]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.removeLink);
          globalLinks.splice(idx, 1);
          await game.settings.set(MODULE_ID, "bookGlobalLinks", JSON.stringify(globalLinks));
          popup.querySelector("#ct-book-links-area").innerHTML = renderLinks(linkSort);
          bindLinkEvents();
        });
      });
      // Inline hand drag on link entries
      popup.querySelectorAll("[data-link-drag]").forEach(hand => {
        hand.addEventListener("dragstart", (e) => {
          e.stopPropagation();
          try { const d = JSON.parse(hand.dataset.dragPayload?.replace(/&quot;/g, '"') || "{}"); e.dataTransfer.setData("text/plain", JSON.stringify(d)); e.dataTransfer.effectAllowed = "copy"; }
          catch { /* ignore */ }
        });
        hand.addEventListener("mousedown", (e) => e.stopPropagation());
      });
    };

    const bindJournalEvents = () => {
      popup.querySelectorAll("[data-journal-id]").forEach(el => {
        el.addEventListener("click", async () => {
          const id = el.dataset.journalId;
          if (!id) { ui.notifications.error("Invalid journal ID."); return; }
          // Try collection lookup first, then UUID fallback
          let journal = game.journal?.get(id);
          if (!journal) {
            try { journal = await fromUuid(`JournalEntry.${id}`); } catch { /* ignore */ }
          }
          if (journal?.sheet) {
            journal.sheet.render(true);
          } else {
            ui.notifications.warn("Journal entry not found.");
            console.warn(`[cypher-taskbar] Journal not found: ${id}`);
          }
        });
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault(); e.stopPropagation();
          const journalId = el.dataset.journalId;
          if (!game.journal.get(journalId)) return;
          this._openBookJournalEdit(journalId, () => {
            const observedOnly = popup.querySelector("#ct-book-observed")?.checked ?? true;
            const ownedOnly = popup.querySelector("#ct-book-owned-only")?.checked ?? false;
            popup.querySelector("#ct-book-journals-area").innerHTML = renderJournals(journalSort, observedOnly, ownedOnly);
            bindJournalEvents();
          });
        });
      });
      // Inline hand drag on journal entries
      popup.querySelectorAll("[data-journal-drag]").forEach(hand => {
        hand.addEventListener("dragstart", (e) => {
          e.stopPropagation();
          try { const d = JSON.parse(hand.dataset.dragPayload?.replace(/&quot;/g, '"') || "{}"); e.dataTransfer.setData("text/plain", JSON.stringify(d)); e.dataTransfer.effectAllowed = "copy"; }
          catch { /* ignore */ }
        });
        hand.addEventListener("mousedown", (e) => e.stopPropagation());
      });
    };

    popup.querySelector("#ct-book-sort-links")?.addEventListener("change", (e) => {
      linkSort = e.target.value;
      popup.querySelector("#ct-book-links-area").innerHTML = renderLinks(linkSort);
      bindLinkEvents();
    });
    const refreshJournals = () => {
      const observedOnly = popup.querySelector("#ct-book-observed")?.checked ?? true;
      const ownedOnly = popup.querySelector("#ct-book-owned-only")?.checked ?? false;
      popup.querySelector("#ct-book-journals-area").innerHTML = renderJournals(journalSort, observedOnly, ownedOnly);
      bindJournalEvents();
    };

    popup.querySelector("#ct-book-sort-journals")?.addEventListener("change", (e) => {
      journalSort = e.target.value;
      refreshJournals();
    });
    popup.querySelector("#ct-book-observed")?.addEventListener("change", refreshJournals);
    popup.querySelector("#ct-book-owned-only")?.addEventListener("change", refreshJournals);

    popup.querySelector("#ct-book-add-link")?.addEventListener("click", () => this._openBookAddGlobalLink());
    popup.querySelector("#ct-book-settings-gear")?.addEventListener("click", () => this._openBookSettings(popup));

    bindLinkEvents();
    bindJournalEvents();

    popup.querySelector("#ct-book-close")?.addEventListener("click", () => popup.remove());
  }

  _applyBookButtonSettings(state) {
    const btn = document.querySelector("#ct-btn-book");
    if (!btn) return;
    const icon = btn.querySelector("i");
    if (icon) {
      icon.style.color = state.bookBtnIconColor ?? "#c8a96e";
      icon.style.fontSize = `${(state.bookBtnIconSize ?? 100) / 100 * 1.15}em`;
    }
    const borderColor = state.bookBtnBorderColor ?? "#c8a96e";
    const borderOp = state.bookBtnBorderOpacity ?? 0.25;
    const borderThick = state.bookBtnBorderThickness ?? 1;
    const r = parseInt(borderColor.slice(1,3), 16);
    const g = parseInt(borderColor.slice(3,5), 16);
    const b = parseInt(borderColor.slice(5,7), 16);
    btn.style.borderColor = `rgba(${r},${g},${b},${borderOp})`;
    btn.style.borderWidth = `${borderThick}px`;
    btn.style.marginLeft = `${state.bookBtnIconOffset ?? 0}px`;
    const justifyMap = { left: "flex-start", center: "center", right: "flex-end" };
    const alignMap = { top: "flex-start", center: "center", bottom: "flex-end" };
    btn.style.justifyContent = justifyMap[state.bookBtnIconHPos ?? "center"] ?? "center";
    btn.style.alignItems = alignMap[state.bookBtnIconVPos ?? "center"] ?? "center";
  }

  _applyBookMenuSettings(popup) {
    const s = (key, fallback) => this._gs(key) ?? fallback;
    const dir = s("bookMenuShadowDirection", "bottom-right");
    const dist = s("bookMenuShadowDistance", 14);
    const dx = dir.includes("right") ? 1 : -1;
    const dy = dir.includes("bottom") ? 1 : -1;
    const wPx = s("bookMenuWidth", 480);
    const hPx = s("bookMenuHeight", 420);
    popup.style.width = `${Math.max(200, wPx)}px`;
    popup.style.maxHeight = `${Math.max(150, hPx)}px`;
    popup.style.setProperty("--ct-book-shadow", `${dist * dx}px ${dist * dy}px ${dist * 1.9}px ${hexToRGBA(s("bookMenuShadowColor", "#000000"), s("bookMenuShadowOpacity", 0.45))}`);
    popup.style.setProperty("--ct-book-bg", hexToRGBA(s("bookMenuBgColor", "#17121f"), s("bookMenuBgOpacity", 0.94)));
    popup.style.setProperty("--ct-book-font-scale", s("bookMenuFontSize", 100) / 100);
  }

  _applyLiveBookMenuSettings(state) {
    const panel = document.querySelector("#ct-book-panel");
    if (!panel) return;
    const dir = state.bookMenuShadowDirection ?? "bottom-right";
    const dist = state.bookMenuShadowDistance ?? 14;
    const dx = dir.includes("right") ? 1 : -1;
    const dy = dir.includes("bottom") ? 1 : -1;
    const wPx = state.bookMenuWidth ?? 480;
    const hPx = state.bookMenuHeight ?? 420;
    panel.style.width = `${Math.max(200, wPx)}px`;
    panel.style.maxHeight = `${Math.max(150, hPx)}px`;
    panel.style.setProperty("--ct-book-shadow", `${dist * dx}px ${dist * dy}px ${dist * 1.9}px ${hexToRGBA(state.bookMenuShadowColor ?? "#000000", state.bookMenuShadowOpacity ?? 0.45)}`);
    panel.style.setProperty("--ct-book-bg", hexToRGBA(state.bookMenuBgColor ?? "#17121f", state.bookMenuBgOpacity ?? 0.94));
    panel.style.setProperty("--ct-book-font-scale", (state.bookMenuFontSize ?? 100) / 100);
    // Update view mode class
    panel.classList.remove("view-list", "view-grid", "view-list-no-icons");
    panel.classList.add(`view-${state.bookMenuViewMode ?? "list"}`);
  }

  _openBookAddGlobalLink() {
    const content = `
      <form class="ct-roll-dialog">
        <label class="ct-form-full">Name <input type="text" id="bgl-name" placeholder="Link name..." style="width:100%"></label>
        <label class="ct-form-full">UUID or URL <input type="text" id="bgl-target" placeholder="Item.xxx, Compendium.xxx, or https://..." style="width:100%"></label>
        <label class="ct-form-full">Description <input type="text" id="bgl-desc" placeholder="Tooltip description..." style="width:100%"></label>
        <label class="ct-form-full">Icon URL <input type="text" id="bgl-icon" placeholder="https://... or icons/svg/..." style="width:100%" value="icons/svg/book.svg"></label>
      </form>`;

    new Dialog({
      title: "Add Global Link (GM Only)",
      content,
      buttons: {
        add: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Add",
          callback: async (html) => {
            const root = html[0];
            const name = root.querySelector("#bgl-name")?.value?.trim();
            const target = root.querySelector("#bgl-target")?.value?.trim();
            const desc = root.querySelector("#bgl-desc")?.value?.trim();
            const icon = root.querySelector("#bgl-icon")?.value?.trim() || "icons/svg/book.svg";
            if (!name || !target) { ui.notifications?.warn?.("Name and UUID/URL are required."); return; }
            const isUrl = target.startsWith("http");
            const link = { name, icon, description: desc || name };
            if (isUrl) link.url = target; else link.uuid = target;
            const current = (() => { try { return JSON.parse(game.settings.get(MODULE_ID, "bookGlobalLinks") || "[]"); } catch { return []; } })();
            current.push(link);
            await game.settings.set(MODULE_ID, "bookGlobalLinks", JSON.stringify(current));
            ui.notifications?.info?.(`Global link "${name}" added.`);
            const panel = document.querySelector("#ct-book-panel");
            if (panel) { panel.remove(); this._openBookPanel(); }
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "add"
    }).render(true);
  }

  _openBookEditGlobalLink(linkIdx, refresh) {
    const globalLinks = (() => { try { return JSON.parse(game.settings.get(MODULE_ID, "bookGlobalLinks") || "[]"); } catch { return []; } })();
    const link = globalLinks[linkIdx];
    if (!link) return;

    const content = `
      <form class="ct-roll-dialog">
        <label class="ct-form-full">Name <input type="text" id="bel-name" value="${foundry.utils.escapeHTML(link.name || '')}" style="width:100%"></label>
        <label class="ct-form-full">UUID or URL <input type="text" id="bel-target" value="${foundry.utils.escapeHTML(link.uuid || link.url || '')}" placeholder="Item.xxx or https://..." style="width:100%"></label>
        <label class="ct-form-full">Description <input type="text" id="bel-desc" value="${foundry.utils.escapeHTML(link.description || '')}" placeholder="Tooltip description..." style="width:100%"></label>
        <label class="ct-form-full">Icon URL <input type="text" id="bel-icon" value="${foundry.utils.escapeHTML(link.icon || 'icons/svg/book.svg')}" placeholder="https://... or icons/svg/..." style="width:100%"></label>
      </form>`;

    new Dialog({
      title: `Edit Link: ${link.name}`,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: async (html) => {
            const root = html[0];
            const name = root.querySelector("#bel-name")?.value?.trim();
            const target = root.querySelector("#bel-target")?.value?.trim();
            const desc = root.querySelector("#bel-desc")?.value?.trim();
            const icon = root.querySelector("#bel-icon")?.value?.trim() || "icons/svg/book.svg";
            if (!name || !target) { ui.notifications?.warn?.("Name and UUID/URL are required."); return; }
            const isUrl = target.startsWith("http");
            globalLinks[linkIdx] = { name, icon, description: desc || name };
            if (isUrl) globalLinks[linkIdx].url = target; else globalLinks[linkIdx].uuid = target;
            await game.settings.set(MODULE_ID, "bookGlobalLinks", JSON.stringify(globalLinks));
            ui.notifications?.info?.(`Link "${name}" updated.`);
            refresh();
          }
        },
        delete: {
          icon: '<i class="fas fa-trash"></i>',
          label: "Delete",
          callback: async () => {
            globalLinks.splice(linkIdx, 1);
            await game.settings.set(MODULE_ID, "bookGlobalLinks", JSON.stringify(globalLinks));
            ui.notifications?.info?.("Link deleted.");
            refresh();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "save"
    }).render(true);
  }

  _openBookSettings(bookPanel = null) {
    document.querySelector("#ct-book-settings-popup")?.remove();
    const state = {
      bookBtnIconSize: this._gs("bookBtnIconSize") ?? 100,
      bookBtnIconColor: this._gs("bookBtnIconColor") ?? "#c8a96e",
      bookBtnBorderOpacity: this._gs("bookBtnBorderOpacity") ?? 0.25,
      bookBtnBorderThickness: this._gs("bookBtnBorderThickness") ?? 1,
      bookBtnBorderColor: this._gs("bookBtnBorderColor") ?? "#c8a96e",
      bookBtnIconHPos: this._gs("bookBtnIconHPos") ?? "center",
      bookBtnIconVPos: this._gs("bookBtnIconVPos") ?? "center",
      bookBtnIconOffset: this._gs("bookBtnIconOffset") ?? 0,
      bookMenuWidth: this._gs("bookMenuWidth") ?? 480,
      bookMenuHeight: this._gs("bookMenuHeight") ?? 420,
      bookMenuBgColor: this._gs("bookMenuBgColor") ?? "#17121f",
      bookMenuBgOpacity: this._gs("bookMenuBgOpacity") ?? 0.94,
      bookMenuShadowColor: this._gs("bookMenuShadowColor") ?? "#000000",
      bookMenuShadowOpacity: this._gs("bookMenuShadowOpacity") ?? 0.45,
      bookMenuShadowDistance: this._gs("bookMenuShadowDistance") ?? 14,
      bookMenuFontSize: this._gs("bookMenuFontSize") ?? 100,
      bookMenuViewMode: this._gs("bookMenuViewMode") ?? "list"
    };

    const popup = document.createElement("div");
    popup.id = "ct-book-settings-popup";
    popup.className = "ct-popup";

    // Position centered on screen
    popup.style.left = "50%";
    popup.style.top = "50%";
    popup.style.transform = "translate(-50%, -50%)";

    popup.innerHTML = `
      <div class="ct-popup-header"><i class="fas fa-cog"></i> Book Menu Settings <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
      <div class="ct-popup-tabs">
        <button class="ct-popup-tab is-active" data-tab="icon"><i class="fas fa-icons"></i> Icon</button>
        <button class="ct-popup-tab" data-tab="menu"><i class="fas fa-image"></i> Menu</button>
      </div>
      <div class="ct-popup-body">
        <div class="ct-popup-pane is-active" data-pane="icon">
          <label>Icon Color <input type="color" id="bset-btn-icon-color" value="${state.bookBtnIconColor}"></label>
          <label>Icon Size <span class="ct-val-label" id="bset-btn-icon-size-val">${state.bookBtnIconSize}%</span><input type="range" id="bset-btn-icon-size" min="50" max="200" step="5" value="${state.bookBtnIconSize}"></label>
          <label>Border Color <input type="color" id="bset-btn-border-color" value="${state.bookBtnBorderColor}"></label>
          <label>Border Opacity <span class="ct-val-label" id="bset-btn-border-op-val">${Math.round(state.bookBtnBorderOpacity*100)}%</span><input type="range" id="bset-btn-border-op" min="0" max="1" step="0.05" value="${state.bookBtnBorderOpacity}"></label>
          <label>Border Thickness <span class="ct-val-label" id="bset-btn-border-thick-val">${state.bookBtnBorderThickness}px</span><input type="range" id="bset-btn-border-thick" min="0" max="4" step="0.5" value="${state.bookBtnBorderThickness}"></label>
          <label>Horizontal Position
            <select id="bset-btn-hpos">
              <option value="left" ${state.bookBtnIconHPos==="left"?"selected":""}>Left</option>
              <option value="center" ${state.bookBtnIconHPos==="center"?"selected":""}>Center</option>
              <option value="right" ${state.bookBtnIconHPos==="right"?"selected":""}>Right</option>
            </select>
          </label>
          <label>Vertical Position
            <select id="bset-btn-vpos">
              <option value="top" ${state.bookBtnIconVPos==="top"?"selected":""}>Top</option>
              <option value="center" ${state.bookBtnIconVPos==="center"?"selected":""}>Center</option>
              <option value="bottom" ${state.bookBtnIconVPos==="bottom"?"selected":""}>Bottom</option>
            </select>
          </label>
          <label>Move Left / Right <span class="ct-val-label" id="bset-btn-offset-val">${state.bookBtnIconOffset}px</span><input type="range" id="bset-btn-offset" min="-50" max="50" step="1" value="${state.bookBtnIconOffset}"></label>
        </div>
        <div class="ct-popup-pane" data-pane="menu">
          <label>Width <span class="ct-val-label" id="bset-menu-width-val">${state.bookMenuWidth}px</span><input type="range" id="bset-menu-width" min="200" max="1200" step="10" value="${state.bookMenuWidth}"></label>
          <label>Height <span class="ct-val-label" id="bset-menu-height-val">${state.bookMenuHeight}px</span><input type="range" id="bset-menu-height" min="150" max="1200" step="10" value="${state.bookMenuHeight}"></label>
          <label>Background Color <input type="color" id="bset-menu-bg-color" value="${state.bookMenuBgColor}"></label>
          <label>Background Opacity <span class="ct-val-label" id="bset-menu-bg-op-val">${Math.round(state.bookMenuBgOpacity*100)}%</span><input type="range" id="bset-menu-bg-op" min="0.1" max="1" step="0.05" value="${state.bookMenuBgOpacity}"></label>
          <label>Shadow Color <input type="color" id="bset-menu-shadow-color" value="${state.bookMenuShadowColor}"></label>
          <label>Shadow Opacity <span class="ct-val-label" id="bset-menu-shadow-op-val">${Math.round(state.bookMenuShadowOpacity*100)}%</span><input type="range" id="bset-menu-shadow-op" min="0" max="1" step="0.05" value="${state.bookMenuShadowOpacity}"></label>
          <label>Shadow Distance <span class="ct-val-label" id="bset-menu-shadow-dist-val">${state.bookMenuShadowDistance}px</span><input type="range" id="bset-menu-shadow-dist" min="0" max="40" step="1" value="${state.bookMenuShadowDistance}"></label>
          <label>Font Size <span class="ct-val-label" id="bset-menu-font-val">${state.bookMenuFontSize}%</span><input type="range" id="bset-menu-font" min="70" max="180" step="5" value="${state.bookMenuFontSize}"></label>
          <label>View Mode
            <select id="bset-menu-view">
              <option value="list" ${state.bookMenuViewMode==="list"?"selected":""}>List with Icons</option>
              <option value="grid" ${state.bookMenuViewMode==="grid"?"selected":""}>Grid</option>
              <option value="list-no-icons" ${state.bookMenuViewMode==="list-no-icons"?"selected":""}>List without Icons</option>
            </select>
          </label>
        </div>
      </div>`;
    document.body.appendChild(popup);

    const collectState = () => ({
      bookBtnIconColor: popup.querySelector("#bset-btn-icon-color").value,
      bookBtnIconSize: parseInt(popup.querySelector("#bset-btn-icon-size").value),
      bookBtnBorderColor: popup.querySelector("#bset-btn-border-color").value,
      bookBtnBorderOpacity: parseFloat(popup.querySelector("#bset-btn-border-op").value),
      bookBtnBorderThickness: parseFloat(popup.querySelector("#bset-btn-border-thick").value),
      bookBtnIconHPos: popup.querySelector("#bset-btn-hpos").value,
      bookBtnIconVPos: popup.querySelector("#bset-btn-vpos").value,
      bookBtnIconOffset: parseInt(popup.querySelector("#bset-btn-offset").value),
      bookMenuWidth: parseInt(popup.querySelector("#bset-menu-width").value),
      bookMenuHeight: parseInt(popup.querySelector("#bset-menu-height").value),
      bookMenuBgColor: popup.querySelector("#bset-menu-bg-color").value,
      bookMenuBgOpacity: parseFloat(popup.querySelector("#bset-menu-bg-op").value),
      bookMenuShadowColor: popup.querySelector("#bset-menu-shadow-color").value,
      bookMenuShadowOpacity: parseFloat(popup.querySelector("#bset-menu-shadow-op").value),
      bookMenuShadowDistance: parseInt(popup.querySelector("#bset-menu-shadow-dist").value),
      bookMenuFontSize: parseInt(popup.querySelector("#bset-menu-font").value),
      bookMenuViewMode: popup.querySelector("#bset-menu-view").value
    });

    popup.querySelectorAll(".ct-popup-tab").forEach(btn => btn.onclick = () => {
      const tab = btn.dataset.tab;
      popup.querySelectorAll(".ct-popup-tab").forEach(el => el.classList.toggle("is-active", el === btn));
      popup.querySelectorAll(".ct-popup-pane").forEach(pane => pane.classList.toggle("is-active", pane.dataset.pane === tab));
    });

    const syncVal = (id, formatter = v => v) => {
      const input = popup.querySelector(`#${id}`);
      const out = popup.querySelector(`#${id}-val`);
      if (!input || !out) return;
      const update = () => out.textContent = formatter(input.value);
      input.addEventListener("input", update);
      update();
    };
    syncVal("bset-btn-icon-size", v => `${v}%`);
    syncVal("bset-btn-border-op", v => `${Math.round(parseFloat(v)*100)}%`);
    syncVal("bset-btn-border-thick", v => `${v}px`);
    syncVal("bset-btn-offset", v => `${v}px`);
    syncVal("bset-menu-width", v => `${v}px`);
    syncVal("bset-menu-height", v => `${v}px`);
    syncVal("bset-menu-bg-op", v => `${Math.round(parseFloat(v)*100)}%`);
    syncVal("bset-menu-shadow-op", v => `${Math.round(parseFloat(v)*100)}%`);
    syncVal("bset-menu-shadow-dist", v => `${v}px`);
    syncVal("bset-menu-font", v => `${v}%`);

    const applyPreview = async () => {
      const preview = collectState();
      this._applyLiveBookMenuSettings(preview);
      this._applyBookButtonSettings(preview);
      const writes = Object.entries(preview).map(([key, value]) => this._ss(key, value));
      try { await Promise.all(writes); } catch (err) { console.warn("[CypherTaskbar] Book settings save failed:", err?.message || err); }
    };

    popup.querySelectorAll('input[type="range"], input[type="color"], input[type="text"], select').forEach(el => {
      const eventName = el.matches('select') ? 'change' : 'input';
      el.addEventListener(eventName, applyPreview);
    });

    popup.querySelector(".ct-popup-close").addEventListener("click", () => popup.remove());
    setTimeout(() => { document.addEventListener("click", function h(e) { if (!popup.contains(e.target) && !e.target.closest("#ct-book-panel")) { popup.remove(); document.removeEventListener("click", h); } }); }, 50);
  }

  _openBookJournalEdit(journalId, refresh) {
    const journal = game.journal.get(journalId);
    if (!journal) return;
    const overrides = (() => { try { return JSON.parse(this._gs("bookJournalOverrides") || "{}"); } catch { return {}; } })();
    const ov = overrides[journalId] || {};

    // Store edit state on the dialog element to avoid shared closure variables
    const esc = foundry.utils.escapeHTML;
    const isUrl = (s) => typeof s === "string" && (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("/"));

    // 50 beautiful Font Awesome icons with display labels (journals, events, items)
    const iconChoices = [
      /* === Books & Scrolls === */
      { cls: "fa-solid fa-book",              label: "Book",            color: "#c8a96e" },
      { cls: "fa-solid fa-book-open",         label: "Open Book",       color: "#c8a96e" },
      { cls: "fa-solid fa-book-journal-whills", label: "Journal",       color: "#b89b5e" },
      { cls: "fa-solid fa-file-lines",        label: "Document",        color: "#aab7b8" },
      { cls: "fa-solid fa-scroll",            label: "Scroll",          color: "#d4b896" },
      { cls: "fa-solid fa-feather-pointed",   label: "Quill",           color: "#a8c8e8" },
      { cls: "fa-solid fa-envelope",          label: "Letter",          color: "#d4a86b" },
      { cls: "fa-solid fa-receipt",           label: "Note",            color: "#aab7b8" },
      /* === Nature & Exploration === */
      { cls: "fa-solid fa-compass",           label: "Compass",         color: "#8fbc8f" },
      { cls: "fa-solid fa-map",               label: "Map",             color: "#c4a86b" },
      { cls: "fa-solid fa-campground",        label: "Camp",            color: "#27ae60" },
      { cls: "fa-solid fa-tree",              label: "Tree",            color: "#27ae60" },
      { cls: "fa-solid fa-mountain",          label: "Mountain",        color: "#6c5b31" },
      { cls: "fa-solid fa-anchor",            label: "Anchor",          color: "#2980b9" },
      { cls: "fa-solid fa-ship",              label: "Ship",            color: "#2980b9" },
      { cls: "fa-solid fa-horse",             label: "Horse",           color: "#a0522d" },
      { cls: "fa-solid fa-dungeon",           label: "Dungeon",         color: "#5d4e37" },
      { cls: "fa-solid fa-chess-rook",        label: "Castle",          color: "#7f8c8d" },
      { cls: "fa-solid fa-flag",              label: "Flag",            color: "#c0392b" },
      /* === Magic & Mystery === */
      { cls: "fa-solid fa-hat-wizard",        label: "Wizard",          color: "#8e44ad" },
      { cls: "fa-solid fa-wand-magic-sparkles", label: "Magic",         color: "#9b59b6" },
      { cls: "fa-solid fa-hand-sparkles",     label: "Blessing",        color: "#f1c40f" },
      { cls: "fa-solid fa-moon",              label: "Moon",            color: "#7d8cc4" },
      { cls: "fa-solid fa-sun",               label: "Sun",             color: "#f39c12" },
      { cls: "fa-solid fa-star",              label: "Star",            color: "#f1c40f" },
      { cls: "fa-solid fa-bolt",              label: "Lightning",       color: "#f1c40f" },
      { cls: "fa-solid fa-fire",              label: "Fire",            color: "#e74c3c" },
      { cls: "fa-solid fa-eye",               label: "Eye",             color: "#00cec9" },
      { cls: "fa-solid fa-ghost",             label: "Ghost",           color: "#bdc3c7" },
      { cls: "fa-solid fa-skull",             label: "Skull",           color: "#95a5a6" },
      /* === Items & Equipment === */
      { cls: "fa-solid fa-key",               label: "Key",             color: "#d4af37" },
      { cls: "fa-solid fa-gem",               label: "Gem",             color: "#40e0d0" },
      { cls: "fa-solid fa-crown",             label: "Crown",           color: "#ffd700" },
      { cls: "fa-solid fa-ring",              label: "Ring",            color: "#f1c40f" },
      { cls: "fa-solid fa-flask",             label: "Potion",          color: "#9b59b6" },
      { cls: "fa-solid fa-vial",              label: "Vial",            color: "#27ae60" },
      { cls: "fa-solid fa-mortar-pestle",     label: "Alchemy",         color: "#8e44ad" },
      { cls: "fa-solid fa-shield-halved",     label: "Shield",          color: "#7f8c8d" },
      { cls: "fa-solid fa-hammer",            label: "Craft",           color: "#a0522d" },
      { cls: "fa-solid fa-coins",             label: "Coins",           color: "#fdcb6e" },
      { cls: "fa-solid fa-wine-bottle",       label: "Bottle",          color: "#2ecc71" },
      /* === Symbols & Signs === */
      { cls: "fa-solid fa-heart",             label: "Heart",           color: "#e91e63" },
      { cls: "fa-solid fa-music",             label: "Music",           color: "#e84393" },
      { cls: "fa-solid fa-bell",              label: "Bell",            color: "#f39c12" },
      { cls: "fa-solid fa-clock",             label: "Clock",           color: "#b2bec3" },
      { cls: "fa-solid fa-mask",              label: "Mask",            color: "#636e72" },
      { cls: "fa-solid fa-certificate",       label: "Seal",            color: "#c0392b" },
      { cls: "fa-solid fa-landmark",          label: "Guild",           color: "#5d4e37" },
      { cls: "fa-solid fa-dragon",            label: "Dragon",          color: "#27ae60" },
      { cls: "fa-solid fa-dice-d20",          label: "Dice",            color: "#e74c3c" },
      { cls: "fa-solid fa-skull-crossbones",  label: "Danger",          color: "#e74c3c" },
      { cls: "fa-solid fa-staff-snake",       label: "Healer",          color: "#27ae60" }
    ];

    const _getPresetColor = (iconCls) => iconChoices.find(ic => ic.cls === iconCls)?.color || "#c8a96e";

    const initialIcon = ov.icon || journal.img || "icons/svg/book.svg";
    const initialIsFa = typeof initialIcon === "string" && /^(fa[srlbd]?\s|fa-solid\s|fa-regular\s|fa-brands\s)/.test(initialIcon);
    const editState = {
      selectedIcon: initialIcon,
      isCustomUrl: isUrl(initialIcon) && !initialIcon.startsWith("icons/svg/"),
      selectedFit: ov.iconFit || "automatic",
      iconColor: ov.iconColor || (initialIsFa ? _getPresetColor(initialIcon) : "#c8a96e")
    };

    const currentIcon = editState.selectedIcon;
    const isCurrentSvg = currentIcon && !isUrl(currentIcon);
    const gridSelectedId = editState.isCustomUrl ? null : currentIcon;

    const content = `
      <div class="ct-journal-edit">
        <div class="ct-je-section">
          <label class="ct-je-label">Journal Name</label>
          <input type="text" id="bje-name" class="ct-je-input" value="${esc(ov.name || journal.name)}" placeholder="Enter name...">
        </div>

        <div class="ct-je-section">
          <label class="ct-je-label">Choose an Icon</label>
          <div class="ct-je-icon-grid" id="bje-icon-grid">
            ${iconChoices.map((ic, idx) => `
              <div class="ct-je-icon-cell${ic.cls === gridSelectedId || (idx === 0 && isCurrentSvg && !gridSelectedId) ? ' is-selected' : ''}"
                   data-icon="${ic.cls}" title="${esc(ic.label)}"
                   style="--icon-color:${ic.color}">
                <i class="${ic.cls}"></i>
                <span class="ct-je-icon-label">${esc(ic.label)}</span>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="ct-je-section">
          <label class="ct-je-label">Icon Color</label>
          <div class="ct-je-color-row">
            <input type="color" id="bje-icon-color" class="ct-je-color-input" value="${editState.iconColor}">
            <span class="ct-je-color-hex" id="bje-color-hex">${editState.iconColor}</span>
            <button type="button" class="ct-je-color-reset" id="bje-color-reset" title="Reset to default">Reset</button>
          </div>
        </div>

        <div class="ct-je-section">
          <label class="ct-je-label">Custom Icon URL</label>
          <input type="text" id="bje-icon-url" class="ct-je-input" value="${editState.isCustomUrl ? esc(currentIcon) : ''}" placeholder="https://example.com/icon.png">
          <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
            <label class="ct-je-fit-label">Fit:</label>
            <select id="bje-icon-fit" class="ct-je-select">
              <option value="automatic"${editState.selectedFit === "automatic" ? " selected" : ""}>Automatic</option>
              <option value="contain"${editState.selectedFit === "contain" ? " selected" : ""}>Contain</option>
              <option value="cover"${editState.selectedFit === "cover" ? " selected" : ""}>Cover</option>
            </select>
          </div>
          ${editState.isCustomUrl ? `<div class="ct-je-preview"><img src="${esc(currentIcon)}" style="object-fit:${editState.selectedFit === 'automatic' ? 'contain' : editState.selectedFit};"></div>` : ""}
        </div>

        <div class="ct-je-section ct-je-preview-section">
          <label class="ct-je-label">Preview</label>
          <div class="ct-je-live-preview" id="bje-live-preview"></div>
        </div>
      </div>`;

    new Dialog({
      title: `Edit Journal — ${esc(journal.name)}`,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: async (html) => {
            const root = html[0];
            const name = root.querySelector("#bje-name")?.value?.trim();
            const urlVal = root.querySelector("#bje-icon-url")?.value?.trim();
            const fitVal = root.querySelector("#bje-icon-fit")?.value || "automatic";

            // Determine final icon: URL takes priority
            let finalIcon = editState.selectedIcon;
            if (urlVal) {
              finalIcon = urlVal;
            }
            const colorVal = root.querySelector("#bje-icon-color")?.value || editState.iconColor;
            const presetColor = _getPresetColor(finalIcon);

            const newOv = {};
            if (name && name !== journal.name) newOv.name = name;

            // Always save icon if it's different from journal default
            if (finalIcon && finalIcon !== (journal.img || "icons/svg/book.svg")) {
              newOv.icon = finalIcon;
            } else if (ov.icon) {
              // Was overridden, now reset to default
              newOv.icon = null;
            }

            if (fitVal !== "automatic") newOv.iconFit = fitVal;
            else if (ov.iconFit) newOv.iconFit = null;

            // Save color if it differs from the icon's preset (or always save for FA icons)
            const isFaFinal = typeof finalIcon === "string" && /^(fa[srlbd]?\s|fa-solid\s|fa-regular\s|fa-brands\s)/.test(finalIcon);
            if (isFaFinal && colorVal && colorVal !== presetColor) {
              newOv.iconColor = colorVal;
            } else if (ov.iconColor) {
              newOv.iconColor = null;
            }

            // Build clean override object
            const cleanOv = {};
            if (newOv.name !== undefined) cleanOv.name = newOv.name;
            if (newOv.icon !== undefined) cleanOv.icon = newOv.icon;
            if (newOv.iconFit !== undefined) cleanOv.iconFit = newOv.iconFit;
            if (newOv.iconColor !== undefined) cleanOv.iconColor = newOv.iconColor;

            if (Object.keys(cleanOv).length > 0) {
              overrides[journalId] = cleanOv;
            } else {
              delete overrides[journalId];
            }
            await this._ss("bookJournalOverrides", JSON.stringify(overrides));
            refresh();
          }
        },
        reset: {
          icon: '<i class="fas fa-undo"></i>',
          label: "Reset",
          callback: async () => {
            delete overrides[journalId];
            await this._ss("bookJournalOverrides", JSON.stringify(overrides));
            refresh();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      render: (html) => {
        const root = html[0];
        const urlInput = root.querySelector("#bje-icon-url");
        const previewDiv = root.querySelector(".ct-je-preview");
        const nameInput = root.querySelector("#bje-name");
        const livePreview = root.querySelector("#bje-live-preview");
        const colorInput = root.querySelector("#bje-icon-color");
        const colorHex = root.querySelector("#bje-color-hex");
        const colorReset = root.querySelector("#bje-color-reset");

        // Helper: render icon as it appears in the book panel
        const _renderPreviewIcon = (icon, fit, color) => {
          const isFa = typeof icon === "string" && /^(fa[srlbd]?\s|fa-solid\s|fa-regular\s|fa-brands\s)/.test(icon);
          if (isFa) {
            return `<i class="${icon} ct-je-preview-fa-icon" style="color:${color || 'var(--ct-accent)'}"></i>`;
          }
          return `<img src="${icon || 'icons/svg/book.svg'}" alt="" style="object-fit:${fit === 'automatic' ? 'contain' : fit};" onerror="this.style.opacity='0.3'">`;
        };

        // Live preview updater — called on every change
        const _updateLivePreview = () => {
          if (!livePreview) return;
          const name = nameInput?.value?.trim() || ov.name || journal.name;
          // Determine current effective icon
          let effIcon = editState.selectedIcon;
          const urlVal = urlInput?.value?.trim();
          if (urlVal) effIcon = urlVal;
          const fit = root.querySelector("#bje-icon-fit")?.value || "automatic";
          const color = colorInput?.value || editState.iconColor;
          const ovIcon = iconChoices.find(ic => ic.cls === effIcon);
          livePreview.innerHTML = `
            <div class="ct-je-preview-entry">
              ${_renderPreviewIcon(effIcon, fit, color)}
              <span class="ct-je-preview-name" title="${foundry.utils.escapeHTML(name)}">${foundry.utils.escapeHTML(name)}</span>
              ${ovIcon ? `<span class="ct-je-preview-badge" style="--badge-color:${color || ovIcon.color}">${foundry.utils.escapeHTML(ovIcon.label)}</span>` : ""}
            </div>`;
        };

        // Initial preview
        _updateLivePreview();

        // Grid icon click
        root.querySelectorAll("#bje-icon-grid .ct-je-icon-cell").forEach(cell => {
          cell.addEventListener("click", () => {
            root.querySelectorAll("#bje-icon-grid .ct-je-icon-cell").forEach(c => c.classList.remove("is-selected"));
            cell.classList.add("is-selected");
            editState.selectedIcon = cell.dataset.icon;
            editState.isCustomUrl = false;
            // Auto-update color to this icon's preset
            const newColor = cell.style.getPropertyValue("--icon-color").trim();
            if (newColor && colorInput) {
              colorInput.value = newColor;
              if (colorHex) colorHex.textContent = newColor;
              editState.iconColor = newColor;
            }
            if (urlInput) urlInput.value = "";
            if (previewDiv) previewDiv.style.display = "none";
            _updateLivePreview();
          });
        });

        // Name input: update preview live
        nameInput?.addEventListener("input", () => _updateLivePreview());

        // Color picker: update preview live
        colorInput?.addEventListener("input", () => {
          if (colorHex) colorHex.textContent = colorInput.value;
          editState.iconColor = colorInput.value;
          _updateLivePreview();
        });

        // Color reset: restore to selected icon's preset
        colorReset?.addEventListener("click", () => {
          const selectedCell = root.querySelector("#bje-icon-grid .ct-je-icon-cell.is-selected");
          const preset = selectedCell ? selectedCell.style.getPropertyValue("--icon-color").trim() : _getPresetColor(editState.selectedIcon);
          if (preset && colorInput) {
            colorInput.value = preset;
            if (colorHex) colorHex.textContent = preset;
            editState.iconColor = preset;
            _updateLivePreview();
          }
        });

        // URL input: deselect grid, show preview
        urlInput?.addEventListener("input", () => {
          const val = urlInput.value.trim();
          if (val) {
            root.querySelectorAll("#bje-icon-grid .ct-je-icon-cell").forEach(c => c.classList.remove("is-selected"));
            editState.isCustomUrl = true;
            editState.selectedIcon = val;
            // Update or create preview
            if (!previewDiv) {
              const newPreview = document.createElement("div");
              newPreview.className = "ct-je-preview";
              urlInput.parentNode.appendChild(newPreview);
            }
            const p = root.querySelector(".ct-je-preview");
            if (p) {
              const fit = root.querySelector("#bje-icon-fit")?.value || "automatic";
              p.innerHTML = `<img src="${val}" style="object-fit:${fit === 'automatic' ? 'contain' : fit};" onerror="this.style.display='none'">`;
              p.style.display = "block";
            }
          } else {
            editState.isCustomUrl = false;
            if (previewDiv) previewDiv.style.display = "none";
            // Restore to currently selected grid icon, or fall back to original journal icon
            const selectedCell = root.querySelector("#bje-icon-grid .ct-je-icon-cell.is-selected");
            if (selectedCell) {
              editState.selectedIcon = selectedCell.dataset.icon;
              const preset = selectedCell.style.getPropertyValue("--icon-color").trim();
              if (preset && colorInput) {
                colorInput.value = preset;
                if (colorHex) colorHex.textContent = preset;
                editState.iconColor = preset;
              }
            } else {
              editState.selectedIcon = journal.img || "icons/svg/book.svg";
            }
          }
          _updateLivePreview();
        });

        // Fit change: update preview if visible
        root.querySelector("#bje-icon-fit")?.addEventListener("change", () => {
          const p = root.querySelector(".ct-je-preview img");
          if (p) {
            const fit = root.querySelector("#bje-icon-fit")?.value || "automatic";
            p.style.objectFit = fit === "automatic" ? "contain" : fit;
          }
          _updateLivePreview();
        });
      }
    }, { width: 460, classes: ["dialog", "ct-journal-edit-dialog"] }).render(true);
  }

  /* ================================================================
     MINI CATEGORY DROP CONTAINERS — People / Places / Assets / Secrets
     Each is an empty droppable container. Drag any Foundry document
     onto it to store. Stored per-actor via _gjson / _ss.
     ================================================================ */

  _openMiniContainer(key, title, iconClass, color, sourceBtn) {
    const existing = document.querySelector("#ct-mini-popup");
    // If another mini menu is open, close it and continue opening this one
    if (existing) existing.remove();
    const actor = this.actor;
    if (!actor) { ui.notifications.warn("No character assigned."); return; }
    const esc = foundry.utils.escapeHTML;
    const stored = this._gjson(`mini${key.charAt(0).toUpperCase() + key.slice(1)}`) || [];

    // Read settings — per-menu sizes
    const displayMode = this._gs("miniMenuDisplayMode") || "list";
    const menuSizes = this._gjson("miniMenuSizes") || {};
    const mySize = menuSizes[key] || {};
    const widthPx = mySize.w || 250;
    const heightPx = mySize.h || 350;
    const padding = this._gs("miniMenuPadding") || 0;
    const itemSize = this._gs("miniMenuItemSize") || 32;
    const showTitle = this._gs("miniMenuShowTitle") !== false;
    const showDesc = this._gs("miniMenuShowDescription") !== false;

    const popup = document.createElement("div");
    popup.id = "ct-mini-popup";
    popup.className = `ct-popup ct-mini-popup view-${displayMode}`;
    popup.style.position = "fixed";
    popup.style.width = `${widthPx}px`;
    popup.style.height = `${heightPx}px`;
    popup.style.overflow = "hidden";
    popup.style.display = "flex";
    popup.style.flexDirection = "column";
    popup.style.setProperty("--ct-mini-icon-size", "32px");
    popup.innerHTML = `
      <div class="ct-popup-header">
        <span style="color:${color}"><i class="${iconClass}"></i> ${esc(title)}</span>
        <span class="ct-mini-resize-handle" id="ct-mini-resize" title="Drag to resize"><i class="fas fa-expand-alt"></i></span>
        <button class="ct-popup-close" id="ct-mini-close" title="Close"><i class="fas fa-times"></i></button>
      </div>
      <div class="ct-popup-body" id="ct-mini-body" style="overflow-y: auto; overflow-x: hidden; flex: 1; min-height: 0;">
        ${stored.length === 0 ? `<div class="ct-mini-empty-state">Empty — drag items here</div>` : ""}
        <div class="ct-mini-items" id="ct-mini-items"></div>
      </div>`;
    document.body.appendChild(popup);

    // Position above the source button (bottom-left corner of popup at top-left of button)
    if (sourceBtn) {
      const rect = sourceBtn.getBoundingClientRect();
      popup.style.left = `${rect.left}px`;
      popup.style.bottom = `${window.innerHeight - rect.top + 6}px`;
      popup.style.top = "auto";
      popup.style.transform = "none";
    } else {
      // Fallback: centered on screen
      popup.style.left = "50%";
      popup.style.top = "50%";
      popup.style.transform = "translate(-50%, -50%)";
    }
    // Set CSS vars for icon size and padding
    const _calcIconSize = () => {
      popup.style.setProperty("--ct-mini-icon-size", `${itemSize}px`);
    };
    popup.style.setProperty("--ct-mini-padding", `${padding}px`);
    _calcIconSize();

    requestAnimationFrame(() => popup.classList.add("is-open"));

    // —— Close on click outside ——
    const _onDocClick = (e) => {
      if (!popup.contains(e.target) && !sourceBtn?.contains(e.target)) {
        popup.remove();
        document.removeEventListener("click", _onDocClick);
      }
    };
    requestAnimationFrame(() => document.addEventListener("click", _onDocClick));
    popup.querySelector("#ct-mini-close")?.addEventListener("click", () => {
      popup.remove();
      document.removeEventListener("click", _onDocClick);
    });

    // —— Draggable resize handle ——
    const resizeHandle = popup.querySelector("#ct-mini-resize");
    if (resizeHandle) {
      resizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = popup.offsetWidth;
        const startH = popup.offsetHeight;
        const onMove = (ev) => {
          const newW = Math.max(150, Math.min(800, startW + (ev.clientX - startX)));
          // Handle is at the TOP — drag UP = taller, drag DOWN = shorter
          const newH = Math.max(150, Math.min(800, startH - (ev.clientY - startY)));
          popup.style.width = `${newW}px`;
          popup.style.height = `${newH}px`;
        };
        const onUp = () => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          // Recalculate icon sizes after resize
          _calcIconSize();
          // Save per-menu size
          const w = Math.round(popup.offsetWidth);
          const h = Math.round(popup.offsetHeight);
          const sizes = this._gjson("miniMenuSizes") || {};
          sizes[key] = { w, h };
          this._ss("miniMenuSizes", JSON.stringify(sizes));
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    const bodyEl = popup.querySelector("#ct-mini-body");
    const itemsEl = popup.querySelector("#ct-mini-items");
    const emptyEl = popup.querySelector(".ct-mini-empty-state");

    // —— Fancy tooltip system (conditional on settings) ——
    const itemOverrides = this._gjson("miniItemOverrides") || {};
    let tooltipEl = null;
    const _showTooltip = async (targetEl, it) => {
      if (!showTitle && !showDesc) return; // both off = no tooltip
      if (tooltipEl) tooltipEl.remove();
      tooltipEl = document.createElement("div");
      let cssClass = "ct-mini-tooltip";
      if (!showTitle) cssClass += " no-title";
      if (!showDesc) cssClass += " no-desc";
      tooltipEl.className = cssClass;
      // Check for item override
      const itemKey = it.uuid || it.img || it.name;
      const ov = itemOverrides[itemKey] || {};
      const displayName = ov.name || it.name || "Unknown";
      let desc = "";
      let typeLabel = it.type || "Item";
      if (showDesc) {
        if (ov.description) {
          desc = ov.description;
        } else if (it.uuid) {
          try {
            const doc = await fromUuid(it.uuid);
            if (doc) {
              desc = await this._resolveMiniItemDescription(doc, 300);
              typeLabel = doc.documentName || typeLabel;
            }
          } catch { /* ignore */ }
        }
      }
      let innerHtml = "";
      if (showTitle) {
        const iconHtml = it.icon
          ? `<i class="${it.icon} ct-book-fa-icon" style="color:${it.color || color}"></i>`
          : `<img src="${it.img || 'icons/svg/book.svg'}" alt="" style="width:22px;height:22px;border-radius:4px;object-fit:cover;">`;
        innerHtml += `<div class="ct-mini-tooltip-header">${iconHtml}<span class="ct-mini-tooltip-name">${esc(displayName)}</span></div>`;
      }
      if (showDesc && desc) {
        innerHtml += `<div class="ct-mini-tooltip-desc">${esc(desc)}</div>`;
      }
      innerHtml += `<span class="ct-mini-tooltip-type">${esc(typeLabel)}</span>`;
      tooltipEl.innerHTML = innerHtml;
      document.body.appendChild(tooltipEl);
      const tRect = targetEl.getBoundingClientRect();
      let left = tRect.right + 10;
      let top = tRect.top;
      if (left + 280 > window.innerWidth) left = tRect.left - 290;
      if (top + 120 > window.innerHeight) top = window.innerHeight - 130;
      tooltipEl.style.left = `${left}px`;
      tooltipEl.style.top = `${top}px`;
    };
    const _hideTooltip = () => { if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; } };

    // —— Render stored items ——
    const renderStored = () => {
      if (!stored.length) {
        itemsEl.innerHTML = "";
        if (emptyEl) emptyEl.style.display = "";
        return;
      }
      if (emptyEl) emptyEl.style.display = "none";
      const titleAttr = showTitle ? '' : ' style="display:none;"';
      itemsEl.innerHTML = stored.map((it, idx) => {
        const hasImg = it.img && it.img !== "icons/svg/book.svg";
        const iconHtml = hasImg
          ? `<img src="${it.img}" alt="" draggable="false" onerror="this.src='icons/svg/book.svg'">`
          : it.icon
            ? `<i class="${it.icon} ct-book-fa-icon" style="color:${it.color || color}"></i>`
            : `<img src="icons/svg/book.svg" alt="" draggable="false">`;
        const itemKey = it.uuid || it.img || it.name;
        const ov = itemOverrides[itemKey] || {};
        const displayName = ov.name || it.name || "Unknown";
        return `<div class="ct-mini-item" data-mini-idx="${idx}" draggable="true" title="${esc(displayName)}">${iconHtml}<span class="ct-book-entry-name"${titleAttr}>${esc(displayName)}</span><span class="ct-item-hand" data-mini-drag="${idx}" title="Drag: ${esc(displayName)}"><i class="fas fa-hand-paper"></i></span><button class="ct-mini-remove" data-mini-rm="${idx}" title="Remove"><i class="fas fa-times"></i></button></div>`;
      }).join('');

      // Click to open — scenes navigate, everything else opens sheet
      itemsEl.querySelectorAll("[data-mini-idx]").forEach(el => {
        el.addEventListener("click", async () => {
          const idx = parseInt(el.dataset.miniIdx);
          const it = stored[idx];
          if (!it) return;
          // Use overridden name for ImagePopout title
          const itemKey = it.uuid || it.img || it.name;
          const ov = itemOverrides[itemKey] || {};
          const displayName = ov.name || it.name || "Unknown";
          if (it.uuid?.startsWith("Scene.")) {
            // View scene for the current player
            try {
              const scene = await fromUuid(it.uuid);
              if (scene && scene.testUserPermission(game.user, "OBSERVER")) {
                await scene.view();
              } else {
                ui.notifications.warn("You do not have permission to view this scene.");
              }
            } catch (err) { console.warn(`${MODULE_ID} | Cannot view scene ${it.uuid}:`, err); }
          } else if (it.uuid) {
            try { const doc = await fromUuid(it.uuid); if (doc?.sheet) doc.sheet.render(true); }
            catch (err) { console.warn(`${MODULE_ID} | Cannot open ${it.uuid}:`, err); }
          } else if (it.img) {
            try { new ImagePopout(it.img, { title: displayName, shareable: true }).render(true); }
            catch { window.open(it.img, "_blank"); }
          }
        });
        // Right-click → edit item (name + description)
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(el.dataset.miniIdx);
          const it = stored[idx];
          if (!it) return;
          this._openMiniItemEdit(it, key, () => {
            popup.querySelector(".ct-popup-body").innerHTML = `
              ${stored.length === 0 ? `<div class="ct-mini-empty-state">Empty \u2014 drag items here</div>` : ""}
              <div class="ct-mini-items" id="ct-mini-items"></div>`;
            renderStored();
          });
        });
      });

      // Fancy tooltip on hover (only if at least one of title/desc is enabled)
      if (showTitle || showDesc) {
        itemsEl.querySelectorAll("[data-mini-idx]").forEach(el => {
          el.addEventListener("mouseenter", async () => {
            const idx = parseInt(el.dataset.miniIdx);
            const it = stored[idx];
            if (it) await _showTooltip(el, it);
          });
          el.addEventListener("mouseleave", _hideTooltip);
        });
      }

      // Remove button
      itemsEl.querySelectorAll("[data-mini-rm]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.dataset.miniRm);
          stored.splice(idx, 1);
          this._ss(`mini${key.charAt(0).toUpperCase() + key.slice(1)}`, JSON.stringify(stored));
          _hideTooltip();
          renderStored();
        });
      });

      // —— Drag-and-drop REORDERING within the menu ——
      let dragSrcIdx = null;
      itemsEl.querySelectorAll("[data-mini-idx]").forEach(el => {
        el.addEventListener("dragstart", (e) => {
          // Only reorder when dragging the item itself (not the hand icon)
          if (e.target.closest(".ct-item-hand") || e.target.closest(".ct-mini-remove")) {
            e.preventDefault();
            return;
          }
          dragSrcIdx = parseInt(el.dataset.miniIdx);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", JSON.stringify({ reorder: dragSrcIdx }));
          el.classList.add("is-dragging");
        });
        el.addEventListener("dragend", () => {
          el.classList.remove("is-dragging");
          itemsEl.querySelectorAll(".ct-drop-target").forEach(t => t.classList.remove("ct-drop-target"));
          dragSrcIdx = null;
        });
        el.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const dropIdx = parseInt(el.dataset.miniIdx);
          // Highlight the drop target
          itemsEl.querySelectorAll(".ct-drop-target").forEach(t => t.classList.remove("ct-drop-target"));
          if (dropIdx !== dragSrcIdx) el.classList.add("ct-drop-target");
        });
        el.addEventListener("dragleave", () => {
          el.classList.remove("ct-drop-target");
        });
        el.addEventListener("drop", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const dropIdx = parseInt(el.dataset.miniIdx);
          el.classList.remove("ct-drop-target");
          if (dragSrcIdx === null || dragSrcIdx === dropIdx) return;
          // Reorder: remove from old position, insert at new position
          const [moved] = stored.splice(dragSrcIdx, 1);
          stored.splice(dropIdx, 0, moved);
          this._ss(`mini${key.charAt(0).toUpperCase() + key.slice(1)}`, JSON.stringify(stored));
          renderStored();
        });
      });

      // Inline hand drag on items
      itemsEl.querySelectorAll("[data-mini-drag]").forEach(hand => {
        hand.addEventListener("dragstart", (e) => {
          e.stopPropagation();
          const idx = parseInt(hand.dataset.miniDrag);
          const it = stored[idx];
          if (!it) return;
          const payload = it.uuid ? { uuid: it.uuid, name: it.name, img: it.img } : { img: it.img, name: it.name };
          e.dataTransfer.setData("text/plain", JSON.stringify(payload));
          e.dataTransfer.effectAllowed = "copy";
        });
        hand.addEventListener("mousedown", (e) => e.stopPropagation());
      });
    };
    renderStored();

    // —— Drag-and-drop on the body ——
    const _onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); bodyEl.classList.add("is-dragover"); };
    const _onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); bodyEl.classList.remove("is-dragover"); };
    const _onDrop = async (e) => {
      e.preventDefault(); e.stopPropagation();
      bodyEl.classList.remove("is-dragover");
      let data;
      try { data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch { data = {}; }
      const hasUuid = !!data.uuid;
      const hasImg = !!data.img;
      if (!hasUuid && !hasImg && !data.type) return;
      let uuid = data.uuid || null;
      if (!uuid && data.type && data.id) {
        const typeMap = { Actor: "Actor", Item: "Item", JournalEntry: "JournalEntry", Scene: "Scene", Macro: "Macro", RollTable: "RollTable" };
        if (typeMap[data.type]) uuid = `${typeMap[data.type]}.${data.id}`;
      }
      if (uuid && stored.some(s => s.uuid === uuid)) { ui.notifications.info("Already in this container."); return; }
      if (!uuid && data.img && stored.some(s => s.img === data.img)) { ui.notifications.info("Already in this container."); return; }
      let name = data.name || "Unknown";
      let img = data.img || "icons/svg/book.svg";
      let itemIcon = null;
      if (uuid) {
        try {
          const doc = await fromUuid(uuid);
          if (doc) {
            name = doc.name || name;
            img = await this._resolveMiniItemImage(doc);
          }
        } catch { /* ignore */ }
        // Only use FA icon as fallback when no image was resolved
        if (!img || img === "icons/svg/book.svg") {
          const typeIcons = { Actor: "fas fa-user", JournalEntry: "fas fa-book", Scene: "fas fa-map", Item: "fas fa-box", Macro: "fas fa-play-circle", RollTable: "fas fa-dice-d20" };
          itemIcon = typeIcons[uuid.split(".")[0]] || "fas fa-tag";
        }
      }
      stored.push({ uuid, name, img, icon: itemIcon, color });
      this._ss(`mini${key.charAt(0).toUpperCase() + key.slice(1)}`, JSON.stringify(stored));
      renderStored();
      ui.notifications?.info?.(`"${name}" added to ${title}.`);
    };
    bodyEl.addEventListener("dragover", _onDragOver);
    bodyEl.addEventListener("dragleave", _onDragLeave);
    bodyEl.addEventListener("drop", _onDrop);
  }

  /**
   * Resolve the best image for a dropped document.
   * Actor → portrait img, Item → item img, Scene → thumbnail,
   * JournalEntry → first image found in pages, fallback → doc.img
   */
  async _resolveMiniItemImage(doc) {
    if (!doc) return "icons/svg/book.svg";
    const type = doc.documentName || doc.constructor?.name;
    if (type === "Actor" || type === "Item") return doc.img || "icons/svg/book.svg";
    if (type === "Scene") return doc.thumbnail || doc.img || "icons/svg/book.svg";
    if (type === "JournalEntry") {
      // Find first image in journal pages
      const pages = doc.pages?.contents || [];
      for (const page of pages) {
        const src = page?.src || page?.image?.src || page?.system?.src;
        if (src) return src;
        const text = page?.text?.content || page?.system?.description?.value || "";
        const imgMatch = text.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) return imgMatch[1];
      }
      return doc.img || "icons/svg/book.svg";
    }
    return doc.img || "icons/svg/book.svg";
  }

  /**
   * Extract plain-text description from a document.
   * For JournalEntry: first page's text content.
   * For others: description/biography field.
   * Returns plain text cropped to maxChars.
   */
  async _resolveMiniItemDescription(doc, maxChars = 300) {
    if (!doc) return "";
    let raw = "";
    const type = doc.documentName || doc.constructor?.name;
    if (type === "JournalEntry") {
      const pages = doc.pages?.contents || [];
      for (const page of pages) {
        const text = page?.text?.content || page?.system?.description?.value || "";
        if (text) { raw = text; break; }
      }
    }
    if (!raw) {
      raw = doc.system?.description?.value || doc.system?.biography?.value || doc.description || "";
    }
    if (!raw) return "";
    // Strip HTML
    const tmp = document.createElement("div");
    tmp.innerHTML = raw;
    let plain = (tmp.textContent || tmp.innerText || "").trim();
    // Collapse whitespace
    plain = plain.replace(/\s+/g, " ");
    if (plain.length > maxChars) plain = plain.substring(0, maxChars) + "...";
    return plain;
  }

  /**
   * Fancy dialog to edit a mini menu item's display name and description.
   * Overrides are stored per-actor in miniItemOverrides.
   */
  async _openMiniItemEdit(item, key, refreshFn) {
    const actor = this.actor;
    if (!actor) return;
    const overrides = this._gjson("miniItemOverrides") || {};
    const itemKey = item.uuid || item.img || item.name;
    const ov = overrides[itemKey] || {};
    const esc = foundry.utils.escapeHTML;
    const editState = {
      name: ov.name || item.name || "",
      description: ov.description || ""
    };

    const content = `
      <div class="ct-journal-edit">
        <div class="ct-je-section">
          <label class="ct-je-label">Display Name</label>
          <input type="text" id="mie-name" class="ct-je-input" value="${esc(editState.name)}" placeholder="Item name">
        </div>
        <div class="ct-je-section">
          <label class="ct-je-label">Short Description <span id="mie-char-count" style="color:rgba(232,232,232,0.4);font-size:0.75em;">(${editState.description.length}/800)</span></label>
          <textarea id="mie-desc" class="ct-je-input" rows="6" maxlength="800" placeholder="Enter a short description (max 800 characters)...">${esc(editState.description)}</textarea>
        </div>
        <div class="ct-je-section">
          <label class="ct-je-label">Preview</label>
          <div class="ct-je-live-preview" id="mie-preview"></div>
        </div>
      </div>`;

    new Dialog({
      title: `Edit: ${item.name || "Item"}`,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-check"></i>',
          label: "Save",
          callback: async html => {
            const root = html?.[0] ?? html;
            const nameVal = root.querySelector("#mie-name")?.value?.trim() || item.name;
            const descVal = root.querySelector("#mie-desc")?.value?.trim() || "";
            const newOv = {};
            if (nameVal && nameVal !== item.name) newOv.name = nameVal;
            if (descVal) newOv.description = descVal;
            // Build clean override
            const cleanOv = {};
            if (newOv.name !== undefined) cleanOv.name = newOv.name;
            if (newOv.description !== undefined) cleanOv.description = newOv.description;
            if (Object.keys(cleanOv).length > 0) {
              overrides[itemKey] = cleanOv;
            } else {
              delete overrides[itemKey];
            }
            this._ss("miniItemOverrides", JSON.stringify(overrides));
            refreshFn();
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel"
        }
      },
      default: "save",
      render: html => {
        const root = html?.[0] ?? html;
        const nameInput = root.querySelector("#mie-name");
        const descInput = root.querySelector("#mie-desc");
        const countEl = root.querySelector("#mie-char-count");
        const previewEl = root.querySelector("#mie-preview");
        const _updatePreview = () => {
          if (!previewEl) return;
          const name = nameInput?.value?.trim() || item.name;
          const desc = descInput?.value?.trim() || "";
          previewEl.innerHTML = `
            <div class="ct-je-preview-entry">
              <span class="ct-je-preview-name" title="${esc(name)}">${esc(name)}</span>
              ${desc ? `<span class="ct-je-preview-badge" style="--badge-color:var(--ct-accent)">Description</span>` : ""}
            </div>
            ${desc ? `<div style="margin-top:6px;font-size:0.75em;color:rgba(232,232,232,0.6);line-height:1.4;">${esc(desc.substring(0, 120))}${desc.length > 120 ? "..." : ""}</div>` : ""}`;
        };
        _updatePreview();
        nameInput?.addEventListener("input", _updatePreview);
        descInput?.addEventListener("input", () => {
          if (countEl) countEl.textContent = `(${descInput.value.length}/800)`;
          _updatePreview();
        });
      }
    }, { width: 420, classes: ["dialog", "ct-journal-edit-dialog"] }).render(true);
  }

  _openPeoplePanel(btn)   { this._openMiniContainer("people",  "PEOPLE",  "fas fa-users", "#8fbc8f", btn); }
  _openPlacesPanel(btn)   { this._openMiniContainer("places",  "PLACES",  "fas fa-map-marker-alt", "#c4a86b", btn); }
  _openAssetsPanel(btn)   { this._openMiniContainer("assets",  "ASSETS",  "fas fa-coins", "#d4af37", btn); }
  _openSecretsPanel(btn)  { this._openMiniContainer("secrets", "SECRETS", "fas fa-user-secret", "#9b59b6", btn); }

  /**
   * Make a mini-grid button into a drop target.
   * When a hand-dragged item is dropped on the button, it's added to that container
   * even if the popup is closed.
   */
  _makeMiniButtonDropTarget(btn, key) {
    if (!key || btn._ctDropBound) return;
    btn._ctDropBound = true;
    const title = key.toUpperCase();
    const color = { People: "#8fbc8f", Places: "#c4a86b", Assets: "#d4af37", Secrets: "#9b59b6" }[key] || "#c8a96e";
    const _onDragOver = (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.add("is-dragover"); };
    const _onDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); btn.classList.remove("is-dragover"); };
    const _onDrop = async (e) => {
      e.preventDefault(); e.stopPropagation();
      btn.classList.remove("is-dragover");
      let data;
      try { data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch { data = {}; }
      if (!data.uuid && !data.img) return;
      const actor = this.actor;
      if (!actor) { ui.notifications.warn("No character assigned."); return; }
      const stored = this._gjson(`mini${key}`) || [];
      // Deduplicate
      if (data.uuid && stored.some(s => s.uuid === data.uuid)) { ui.notifications.info("Already in this container."); return; }
      if (!data.uuid && data.img && stored.some(s => s.img === data.img)) { ui.notifications.info("Already in this container."); return; }
      let name = data.name || "Unknown";
      let img = data.img || "icons/svg/book.svg";
      let itemIcon = null;
      if (data.uuid) {
        try {
          const doc = await fromUuid(data.uuid);
          if (doc) {
            name = doc.name || name;
            img = await this._resolveMiniItemImage(doc);
          }
        } catch { /* ignore */ }
        // Only use FA icon as fallback when no image was resolved
        if (!img || img === "icons/svg/book.svg") {
          const typeIcons = { Actor: "fas fa-user", JournalEntry: "fas fa-book", Scene: "fas fa-map", Item: "fas fa-box", Macro: "fas fa-play-circle", RollTable: "fas fa-dice-d20" };
          itemIcon = typeIcons[data.uuid.split(".")[0]] || "fas fa-tag";
        }
      }
      stored.push({ uuid: data.uuid || null, name, img, icon: itemIcon, color });
      this._ss(`mini${key}`, JSON.stringify(stored));
      ui.notifications?.info?.(`"${name}" added to ${title}.`);
      // If popup is open for this container, refresh it
      const popup = document.querySelector("#ct-mini-popup");
      if (popup) {
        const itemsEl = popup.querySelector("#ct-mini-items");
        if (itemsEl) {
          const esc = foundry.utils.escapeHTML;
          const showT = this._gs("miniMenuShowTitle") !== false;
          const titleAttr = showT ? '' : ' style="display:none;"';
          itemsEl.innerHTML = stored.map((it, idx) => {
            const hasImg = it.img && it.img !== "icons/svg/book.svg";
            const iconHtml = hasImg
              ? `<img src="${it.img}" alt="" draggable="false" onerror="this.src='icons/svg/book.svg'">`
              : it.icon
                ? `<i class="${it.icon} ct-book-fa-icon" style="color:${it.color || color}"></i>`
                : `<img src="icons/svg/book.svg" alt="" draggable="false">`;
            return `<div class="ct-mini-item" data-mini-idx="${idx}">${iconHtml}<span class="ct-book-entry-name"${titleAttr}>${esc(it.name || 'Unknown')}</span><span class="ct-item-hand" data-mini-drag="${idx}" title="Drag: ${esc(it.name || 'Unknown')}"><i class="fas fa-hand-paper"></i></span><button class="ct-mini-remove" data-mini-rm="${idx}" title="Remove"><i class="fas fa-times"></i></button></div>`;
          }).join('');
        }
      }
    };
    btn.addEventListener("dragover", _onDragOver);
    btn.addEventListener("dragleave", _onDragLeave);
    btn.addEventListener("drop", _onDrop);
  }

  _makePanelButtonDropTarget(btn, panel) {
    if (btn._ctPanelDropBound) return;
    btn._ctPanelDropBound = true;

    const acceptedTypes = {
      skills:    ["skill"],
      abilities: ["ability", "action"],
      equipment: ["artifact", "cypher", "oddity", "equipment", "weapon", "armor", "ammo", "material"]
    }[panel] || [];

    const panelLabel = panel.charAt(0).toUpperCase() + panel.slice(1);

    const _onDragOver = (e) => {
      e.preventDefault(); e.stopPropagation();
      btn.classList.add("is-dragover");
    };
    const _onDragLeave = (e) => {
      e.preventDefault(); e.stopPropagation();
      btn.classList.remove("is-dragover");
    };
    const _onDrop = async (e) => {
      e.preventDefault(); e.stopPropagation();
      btn.classList.remove("is-dragover");

      let data;
      try { data = JSON.parse(e.dataTransfer.getData("text/plain") || "{}"); } catch { data = {}; }
      if (!data.uuid && !data.id) return;

      const actor = this.actor;
      if (!actor) { ui.notifications.warn("No character assigned."); return; }

      // Resolve item from UUID or ID
      let item = null;
      if (data.uuid) {
        try { item = await fromUuid(data.uuid); } catch { /* ignore */ }
      }
      if (!item && data.id) {
        item = game.items.get(data.id);
      }
      if (!item) { ui.notifications.warn("Item not found."); return; }

      // Check type (case-insensitive)
      const itemType = (item.type || item.system?.type || "").toLowerCase();
      if (!acceptedTypes.includes(itemType)) {
        ui.notifications.warn(`"${item.name}" is not a ${panelLabel.toLowerCase()} item.`);
        return;
      }

      // Check if already owned
      const existing = actor.items.find(i => i.name === item.name && (i.type || "").toLowerCase() === itemType);
      if (existing) {
        ui.notifications.info(`"${item.name}" is already on this character.`);
        return;
      }

      // Create item on actor
      try {
        const itemData = item.toObject ? item.toObject() : foundry.utils.duplicate(item);
        delete itemData._id;
        await actor.createEmbeddedDocuments("Item", [itemData]);
        ui.notifications.info(`"${item.name}" added to ${panelLabel}.`);

        // Refresh panel if open
        if (this.activePanel === panel) {
          this._togglePanel(panel, this.element?.querySelector(`.ct-btn[data-panel="${panel}"]`));
        }
      } catch (err) {
        console.error(`${MODULE_ID} | Drop failed:`, err);
        ui.notifications.error(`Failed to add "${item.name}".`);
      }
    };

    btn.addEventListener("dragover", _onDragOver);
    btn.addEventListener("dragleave", _onDragLeave);
    btn.addEventListener("drop", _onDrop);
  }

  _applyStuffPanelSettings(popup) {
    const s = (key, fallback) => this._gs(key) ?? fallback;
    const dir = s("stuffMenuShadowDirection", "bottom-right");
    const dist = s("stuffMenuShadowDistance", 14);
    const dx = dir.includes("right") ? 1 : -1;
    const dy = dir.includes("bottom") ? 1 : -1;
    const wPx = s("stuffMenuWidthScale", 320);
    const hPx = s("stuffMenuHeightScale", 300);

    popup.style.width = `${Math.max(100, wPx)}px`;
    popup.style.maxHeight = `${Math.max(100, hPx)}px`;

    popup.style.setProperty("--ct-stuff-shadow", `${dist * dx}px ${dist * dy}px ${dist * 1.9}px ${hexToRGBA(s("stuffMenuShadowColor", "#000000"), s("stuffMenuShadowOpacity", 0.45))}`);
    popup.style.setProperty("--ct-stuff-bg", hexToRGBA(s("stuffMenuBgColor", "#17121f"), s("stuffMenuBgOpacity", 0.94)));
    popup.style.setProperty("--ct-stuff-bg-image", `url('${String(s("stuffMenuBgImage", "")).replace(/'/g, "%27")}')`);
    popup.style.setProperty("--ct-stuff-bg-image-opacity", s("stuffMenuBgImageOpacity", 0.2));
    popup.style.setProperty("--ct-stuff-title-color", s("stuffMenuTitleColor", "#f0d68a"));
    popup.style.setProperty("--ct-stuff-title-scale", s("stuffMenuTitleSize", 100) / 100);
    popup.style.setProperty("--ct-stuff-title-transform", s("stuffMenuTitleCaps", false) ? "uppercase" : "none");
    popup.style.setProperty("--ct-stuff-heading-color", s("stuffMenuHeadingColor", "#d4a94d"));
    popup.style.setProperty("--ct-stuff-heading-opacity", s("stuffMenuHeadingOpacity", 0.85));
    popup.style.setProperty("--ct-stuff-columns", Math.max(1, Math.min(3, s("stuffMenuColumns", 1))));
    popup.style.setProperty("--ct-stuff-font-scale", s("stuffMenuFontSize", 100) / 100);
    popup.style.setProperty("--ct-stuff-item-padding", `${s("stuffMenuItemPadding", 5)}px`);
    popup.style.setProperty("--ct-stuff-item-size", `${s("stuffMenuItemSize", 32)}px`);
  }

  _applyLiveStuffPanelSettings(state) {
    const panel = document.querySelector("#ct-stuff-panel");
    if (!panel) return;
    const dir = state.stuffMenuShadowDirection ?? "bottom-right";
    const dist = state.stuffMenuShadowDistance ?? 14;
    const dx = dir.includes("right") ? 1 : -1;
    const dy = dir.includes("bottom") ? 1 : -1;
    const wPx = state.stuffMenuWidthScale ?? 320;
    const hPx = state.stuffMenuHeightScale ?? 300;

    panel.style.width = `${Math.max(100, wPx)}px`;
    panel.style.maxHeight = `${Math.max(100, hPx)}px`;
    panel.style.setProperty("--ct-stuff-shadow", `${dist * dx}px ${dist * dy}px ${dist * 1.9}px ${hexToRGBA(state.stuffMenuShadowColor ?? "#000000", state.stuffMenuShadowOpacity ?? 0.45)}`);
    panel.style.setProperty("--ct-stuff-bg", hexToRGBA(state.stuffMenuBgColor ?? "#17121f", state.stuffMenuBgOpacity ?? 0.94));
    panel.style.setProperty("--ct-stuff-bg-image", `url('${String(state.stuffMenuBgImage ?? "").replace(/'/g, "%27")}')`);
    panel.style.setProperty("--ct-stuff-bg-image-opacity", state.stuffMenuBgImageOpacity ?? 0.2);
    panel.style.setProperty("--ct-stuff-title-color", state.stuffMenuTitleColor ?? "#f0d68a");
    panel.style.setProperty("--ct-stuff-title-scale", (state.stuffMenuTitleSize ?? 100) / 100);
    panel.style.setProperty("--ct-stuff-title-transform", (state.stuffMenuTitleCaps ?? false) ? "uppercase" : "none");
    panel.style.setProperty("--ct-stuff-heading-color", state.stuffMenuHeadingColor ?? "#d4a94d");
    panel.style.setProperty("--ct-stuff-heading-opacity", state.stuffMenuHeadingOpacity ?? 0.85);
    panel.style.setProperty("--ct-stuff-columns", Math.max(1, Math.min(3, state.stuffMenuColumns ?? 1)));
    panel.style.setProperty("--ct-stuff-font-scale", (state.stuffMenuFontSize ?? 100) / 100);
    panel.style.setProperty("--ct-stuff-item-padding", `${state.stuffMenuItemPadding ?? 5}px`);
    panel.style.setProperty("--ct-stuff-item-size", `${state.stuffMenuItemSize ?? 32}px`);
  }

  _openStuffContextMenu(event, uuid, tabs, refreshCallback) {
    document.querySelector("#ct-stuff-context")?.remove();
    const menu = document.createElement("div");
    menu.id = "ct-stuff-context";
    menu.innerHTML = `
      <div class="ct-stuff-ctx-header">Send to Tab</div>
      ${tabs.map((t, i) => i === 0 ? '' : `<div class="ct-stuff-ctx-item" data-ctx-tab="${i}"><i class="${t.icon}" style="color:${t.iconColor}"></i>${foundry.utils.escapeHTML(t.name)}</div>`).join('')}
      <div class="ct-stuff-ctx-sep"></div>
      <div class="ct-stuff-ctx-item" data-ctx-remove><i class="fas fa-trash" style="color:#ff7a7a"></i>Remove</div>
    `;
    document.body.appendChild(menu);
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    menu.querySelectorAll("[data-ctx-tab]").forEach(el => {
      el.addEventListener("click", async () => {
        const tabIdx = parseInt(el.dataset.ctxTab);
        const tabKey = `tab${tabIdx}`;
        const allTabItems = this._gjson("stuffTabItems", {});
        if (!allTabItems[tabKey]) allTabItems[tabKey] = [];
        if (!allTabItems[tabKey].includes(uuid)) allTabItems[tabKey].push(uuid);
        await this._ss("stuffTabItems", JSON.stringify(allTabItems));
        // Also remove from the All tab (stuffItems)
        let allItems = this._gjson("stuffItems", []);
        allItems = allItems.filter(u => u !== uuid);
        await this._ss("stuffItems", JSON.stringify(allItems));
        menu.remove();
        refreshCallback();
      });
    });

    menu.querySelector("[data-ctx-remove]")?.addEventListener("click", async () => {
      let current = this._gjson("stuffItems", []);
      current = current.filter(u => u !== uuid);
      await this._ss("stuffItems", JSON.stringify(current));
      let allTabItems = this._gjson("stuffTabItems", {});
      for (const key of Object.keys(allTabItems)) {
        allTabItems[key] = allTabItems[key].filter(u => u !== uuid);
      }
      await this._ss("stuffTabItems", JSON.stringify(allTabItems));
      menu.remove();
      refreshCallback();
    });

    setTimeout(() => {
      document.addEventListener("click", function h() { menu.remove(); document.removeEventListener("click", h); });
    }, 10);
  }

  _openStuffTabConfig(tabIdx, onSave) {
    const tabs = this._gjson("stuffTabs", []);
    const tab = tabs[tabIdx];
    if (!tab) return;

    const iconChoices = [
      "fas fa-folder","fas fa-star","fas fa-heart","fas fa-fire","fas fa-bolt",
      "fas fa-shield-alt","fas fa-sword","fas fa-gem","fas fa-ring","fas fa-scroll",
      "fas fa-book","fas fa-flask","fas fa-hammer","fas fa-crown","fas fa-moon",
      "fas fa-sun","fas fa-skull","fas fa-dragon","fas fa-dungeon","fas fa-anchor",
      "fas fa-feather-alt","fas fa-mask","fas fa-music","fas fa-dice-d20","fas fa-coins",
      "fas fa-key","fas fa-lock","fas fa-map","fas fa-compass","fas fa-eye"
    ];

    const content = `
      <form class="ct-roll-dialog">
        <div class="ct-stuff-tab-config">
          <label class="ct-form-full">Tab Name <input type="text" id="st-tab-name" value="${foundry.utils.escapeHTML(tab.name || '')}" style="width:100%"></label>
          <label>Font Color <input type="color" id="st-tab-font-color" value="${tab.fontColor || '#f0d68a'}"></label>
          <label>Icon Color <input type="color" id="st-tab-icon-color" value="${tab.iconColor || '#c8a96e'}"></label>
          <label>Font Size <span class="ct-val-label" id="st-tab-font-size-val">${tab.fontSize || 100}%</span><input type="range" id="st-tab-font-size" min="70" max="200" step="5" value="${tab.fontSize || 100}"></label>
          <label>Icon Size <span class="ct-val-label" id="st-tab-icon-size-val">${tab.iconSize || 100}%</span><input type="range" id="st-tab-icon-size" min="70" max="200" step="5" value="${tab.iconSize || 100}"></label>
          <label class="ct-toggle-row">Capitalize <input type="checkbox" id="st-tab-caps" ${tab.caps ? 'checked' : ''}></label>
          ${tabs.length > 1 ? `<label class="ct-toggle-row" style="color:#ff7a7a">Delete Tab <input type="checkbox" id="st-tab-delete"></label>` : ''}
        </div>
        <label style="margin-top:10px;display:block;font-size:0.75em;color:var(--ct-text-dim)">Icon</label>
        <div class="ct-stuff-icon-grid" id="st-tab-icon-grid">
          ${iconChoices.map(ic => `<div class="ct-stuff-icon-option${tab.icon === ic ? ' is-selected' : ''}" data-icon="${ic}"><i class="${ic}"></i></div>`).join('')}
        </div>
      </form>`;

    let selectedIcon = tab.icon;

    const dialog = new Dialog({
      title: `Configure Tab: ${tab.name}`,
      content,
      buttons: {
        save: {
          icon: '<i class="fas fa-save"></i>',
          label: "Save",
          callback: async () => {
            const root = dialog.element[0];
            if (root.querySelector("#st-tab-delete")?.checked) {
              tabs.splice(tabIdx, 1);
              // Move items back to All
              const allTabItems = this._gjson("stuffTabItems", {});
              delete allTabItems[`tab${tabIdx}`];
              await this._ss("stuffTabItems", JSON.stringify(allTabItems));
            } else {
              tabs[tabIdx] = {
                name: root.querySelector("#st-tab-name")?.value?.trim() || tab.name,
                icon: selectedIcon,
                fontColor: root.querySelector("#st-tab-font-color")?.value || tab.fontColor,
                iconColor: root.querySelector("#st-tab-icon-color")?.value || tab.iconColor,
                fontSize: parseInt(root.querySelector("#st-tab-font-size")?.value) || tab.fontSize,
                iconSize: parseInt(root.querySelector("#st-tab-icon-size")?.value) || tab.iconSize,
                caps: root.querySelector("#st-tab-caps")?.checked || false
              };
            }
            await this._ss("stuffTabs", JSON.stringify(tabs));
            onSave();
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      render: (html) => {
        const root = html[0];
        // Icon selection
        root.querySelectorAll(".ct-stuff-icon-option").forEach(el => {
          el.addEventListener("click", () => {
            root.querySelectorAll(".ct-stuff-icon-option").forEach(o => o.classList.remove("is-selected"));
            el.classList.add("is-selected");
            selectedIcon = el.dataset.icon;
          });
        });
        // Sync values
        const syncVal = (id, suffix = '') => {
          const input = root.querySelector(`#${id}`);
          const out = root.querySelector(`#${id}-val`);
          if (input && out) input.addEventListener("input", () => { out.textContent = input.value + suffix; });
        };
        syncVal("st-tab-font-size", '%');
        syncVal("st-tab-icon-size", '%');
      }
    }, { width: 400 });
    dialog.render(true);
  }

  _openStuffAddDialog() {
    const content = `
      <form class="ct-roll-dialog">
        <div class="form-group">
          <label>Item UUID (e.g. Item.xxx or Compendium.xxx)</label>
          <input type="text" id="ct-stuff-uuid" placeholder="Paste UUID here..." style="width:100%;">
        </div>
      </form>`;

    new Dialog({
      title: "Add to Stuff",
      content,
      buttons: {
        add: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Add",
          callback: async (html) => {
            const uuid = html[0].querySelector("#ct-stuff-uuid")?.value?.trim();
            if (!uuid) return;
            const doc = await fromUuid(uuid);
            if (!doc) { ui.notifications?.warn?.("Item not found for that UUID."); return; }
            const current = this._gjson("stuffItems", []);
            if (current.includes(uuid)) { ui.notifications?.info?.("Already in Stuff."); return; }
            current.push(uuid);
            await this._ss("stuffItems", JSON.stringify(current));
            ui.notifications?.info?.(`Added "${doc.name}" to Stuff.`);
            const panel = document.querySelector("#ct-stuff-panel");
            if (panel) { panel.remove(); this._openStuffPanel(); }
          }
        },
        cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" }
      },
      default: "add"
    }).render(true);
  }

  _openStuffSettings(stuffPanel = null) {
    document.querySelector("#ct-stuff-settings-popup")?.remove();
    const tabs = this._gjson("stuffTabs", [{name:"All",icon:"fas fa-box-open"}]);
    const state = {
      stuffMenuShadowColor: this._gs("stuffMenuShadowColor") ?? "#000000",
      stuffMenuShadowOpacity: this._gs("stuffMenuShadowOpacity") ?? 0.45,
      stuffMenuShadowDistance: this._gs("stuffMenuShadowDistance") ?? 14,
      stuffMenuShadowDirection: this._gs("stuffMenuShadowDirection") ?? "bottom-right",
      stuffMenuTitleColor: this._gs("stuffMenuTitleColor") ?? "#f0d68a",
      stuffMenuTitleSize: this._gs("stuffMenuTitleSize") ?? 100,
      stuffMenuTitleCaps: this._gs("stuffMenuTitleCaps") ?? false,
      stuffMenuHeadingColor: this._gs("stuffMenuHeadingColor") ?? "#d4a94d",
      stuffMenuHeadingOpacity: this._gs("stuffMenuHeadingOpacity") ?? 0.85,
      stuffMenuBgColor: this._gs("stuffMenuBgColor") ?? "#17121f",
      stuffMenuBgOpacity: this._gs("stuffMenuBgOpacity") ?? 0.94,
      stuffMenuBgImage: this._gs("stuffMenuBgImage") ?? "",
      stuffMenuBgImageOpacity: this._gs("stuffMenuBgImageOpacity") ?? 0.2,
      stuffMenuBgFit: this._gs("stuffMenuBgFit") ?? "cover",
      stuffMenuColumns: this._gs("stuffMenuColumns") ?? 1,
      stuffMenuWidthScale: this._gs("stuffMenuWidthScale") ?? 20,
      stuffMenuHeightScale: this._gs("stuffMenuHeightScale") ?? 20,
      stuffMenuFontSize: this._gs("stuffMenuFontSize") ?? 100,
      stuffMenuItemPadding: this._gs("stuffMenuItemPadding") ?? 5,
      stuffMenuItemSize: this._gs("stuffMenuItemSize") ?? 32,
      stuffDefaultTab: this._gs("stuffDefaultTab") ?? 0,
      stuffBtnIconSize: this._gs("stuffBtnIconSize") ?? 100,
      stuffBtnIconColor: this._gs("stuffBtnIconColor") ?? "#c8a96e",
      stuffBtnBorderOpacity: this._gs("stuffBtnBorderOpacity") ?? 0.25,
      stuffBtnBorderThickness: this._gs("stuffBtnBorderThickness") ?? 1,
      stuffBtnBorderColor: this._gs("stuffBtnBorderColor") ?? "#c8a96e",
      stuffBtnIconHPos: this._gs("stuffBtnIconHPos") ?? "center",
      stuffBtnIconVPos: this._gs("stuffBtnIconVPos") ?? "center",
      stuffBtnIconOffset: this._gs("stuffBtnIconOffset") ?? 0
    };

    const popup = document.createElement("div");
    popup.id = "ct-stuff-settings-popup";
    popup.className = "ct-popup";

    // Position centered on screen
    popup.style.left = "50%";
    popup.style.top = "50%";
    popup.style.transform = "translate(-50%, -50%)";

    const tabOptions = tabs.map((t, i) => `<option value="${i}" ${i === state.stuffDefaultTab ? "selected" : ""}>${foundry.utils.escapeHTML(t.name)}</option>`).join('');

    popup.innerHTML = `
      <div class="ct-popup-header"><i class="fas fa-cog"></i> Stuff Menu Settings <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
      <div class="ct-popup-tabs">
        <button class="ct-popup-tab is-active" data-tab="shadow"><i class="fas fa-cloud"></i> Shadow</button>
        <button class="ct-popup-tab" data-tab="title"><i class="fas fa-heading"></i> Title</button>
        <button class="ct-popup-tab" data-tab="headings"><i class="fas fa-list"></i> Headings</button>
        <button class="ct-popup-tab" data-tab="background"><i class="fas fa-image"></i> Background</button>
        <button class="ct-popup-tab" data-tab="layout"><i class="fas fa-th"></i> Layout</button>
        <button class="ct-popup-tab" data-tab="items"><i class="fas fa-box"></i> Items</button>
        <button class="ct-popup-tab" data-tab="icon"><i class="fas fa-icons"></i> Icon</button>
      </div>
      <div class="ct-popup-body">
        <div class="ct-popup-pane is-active" data-pane="shadow">
          <label>Shadow Color <input type="color" id="stm-shadow-color" value="${state.stuffMenuShadowColor}"></label>
          <label>Shadow Opacity <span class="ct-val-label" id="stm-shadow-op-val">${Math.round(state.stuffMenuShadowOpacity*100)}%</span><input type="range" id="stm-shadow-op" min="0" max="1" step="0.05" value="${state.stuffMenuShadowOpacity}"></label>
          <label>Shadow Distance <span class="ct-val-label" id="stm-shadow-dist-val">${state.stuffMenuShadowDistance}px</span><input type="range" id="stm-shadow-dist" min="0" max="40" step="1" value="${state.stuffMenuShadowDistance}"></label>
          <label>Shadow Direction
            <select id="stm-shadow-dir">
              <option value="top-left" ${state.stuffMenuShadowDirection==="top-left"?"selected":""}>Top-Left</option>
              <option value="top-right" ${state.stuffMenuShadowDirection==="top-right"?"selected":""}>Top-Right</option>
              <option value="bottom-left" ${state.stuffMenuShadowDirection==="bottom-left"?"selected":""}>Bottom-Left</option>
              <option value="bottom-right" ${state.stuffMenuShadowDirection==="bottom-right"?"selected":""}>Bottom-Right</option>
            </select>
          </label>
        </div>
        <div class="ct-popup-pane" data-pane="title">
          <label>Title Color <input type="color" id="stm-title-color" value="${state.stuffMenuTitleColor}"></label>
          <label>Title Size <span class="ct-val-label" id="stm-title-size-val">${state.stuffMenuTitleSize}%</span><input type="range" id="stm-title-size" min="70" max="200" step="5" value="${state.stuffMenuTitleSize}"></label>
          <label class="ct-toggle-row">Capitalize <input type="checkbox" id="stm-title-caps" ${state.stuffMenuTitleCaps?"checked":""}></label>
        </div>
        <div class="ct-popup-pane" data-pane="headings">
          <label>Heading Color <input type="color" id="stm-heading-color" value="${state.stuffMenuHeadingColor}"></label>
          <label>Heading Opacity <span class="ct-val-label" id="stm-heading-op-val">${Math.round(state.stuffMenuHeadingOpacity*100)}%</span><input type="range" id="stm-heading-op" min="0.1" max="1" step="0.05" value="${state.stuffMenuHeadingOpacity}"></label>
        </div>
        <div class="ct-popup-pane" data-pane="background">
          <label>Background Color <input type="color" id="stm-bg-color" value="${state.stuffMenuBgColor}"></label>
          <label>Background Opacity <span class="ct-val-label" id="stm-bg-op-val">${Math.round(state.stuffMenuBgOpacity*100)}%</span><input type="range" id="stm-bg-op" min="0.1" max="1" step="0.05" value="${state.stuffMenuBgOpacity}"></label>
          <label class="ct-popup-wide">Background Image URL <input type="text" id="stm-bg-image" value="${state.stuffMenuBgImage.replace(/"/g,'&quot;')}" placeholder="https://..."></label>
          <label>Image Opacity <span class="ct-val-label" id="stm-bg-image-op-val">${Math.round(state.stuffMenuBgImageOpacity*100)}%</span><input type="range" id="stm-bg-image-op" min="0" max="1" step="0.05" value="${state.stuffMenuBgImageOpacity}"></label>
          <label>Image Fit
            <select id="stm-bg-fit">
              <option value="cover" ${state.stuffMenuBgFit==="cover"?"selected":""}>Cover</option>
              <option value="contain" ${state.stuffMenuBgFit==="contain"?"selected":""}>Contain</option>
              <option value="fit" ${state.stuffMenuBgFit==="fit"?"selected":""}>Fit</option>
            </select>
          </label>
        </div>
        <div class="ct-popup-pane" data-pane="layout">
          <label>Columns <span class="ct-val-label" id="stm-cols-val">${state.stuffMenuColumns}</span><input type="range" id="stm-cols" min="1" max="3" step="1" value="${state.stuffMenuColumns}"></label>
          <label>Width <span class="ct-val-label" id="stm-width-val">${state.stuffMenuWidthScale}px</span><input type="range" id="stm-width" min="100" max="1200" step="10" value="${state.stuffMenuWidthScale}"></label>
          <label>Height <span class="ct-val-label" id="stm-height-val">${state.stuffMenuHeightScale}px</span><input type="range" id="stm-height" min="100" max="1200" step="10" value="${state.stuffMenuHeightScale}"></label>
          <label>Default Tab
            <select id="stm-default-tab">${tabOptions}</select>
          </label>
        </div>
        <div class="ct-popup-pane" data-pane="items">
          <label>Item Font Size <span class="ct-val-label" id="stm-font-size-val">${state.stuffMenuFontSize}%</span><input type="range" id="stm-font-size" min="70" max="180" step="5" value="${state.stuffMenuFontSize}"></label>
          <label>Item Size <span class="ct-val-label" id="stm-item-size-val">${state.stuffMenuItemSize}px</span><input type="range" id="stm-item-size" min="16" max="128" step="1" value="${state.stuffMenuItemSize}"></label>
          <label>Item Padding <span class="ct-val-label" id="stm-item-padding-val">${state.stuffMenuItemPadding}px</span><input type="range" id="stm-item-padding" min="2" max="24" step="1" value="${state.stuffMenuItemPadding}"></label>
        </div>
        <div class="ct-popup-pane" data-pane="icon">
          <label>Icon Color <input type="color" id="stm-btn-icon-color" value="${state.stuffBtnIconColor}"></label>
          <label>Icon Size <span class="ct-val-label" id="stm-btn-icon-size-val">${state.stuffBtnIconSize}%</span><input type="range" id="stm-btn-icon-size" min="50" max="200" step="5" value="${state.stuffBtnIconSize}"></label>
          <label>Border Color <input type="color" id="stm-btn-border-color" value="${state.stuffBtnBorderColor}"></label>
          <label>Border Opacity <span class="ct-val-label" id="stm-btn-border-op-val">${Math.round(state.stuffBtnBorderOpacity*100)}%</span><input type="range" id="stm-btn-border-op" min="0" max="1" step="0.05" value="${state.stuffBtnBorderOpacity}"></label>
          <label>Border Thickness <span class="ct-val-label" id="stm-btn-border-thick-val">${state.stuffBtnBorderThickness}px</span><input type="range" id="stm-btn-border-thick" min="0" max="4" step="0.5" value="${state.stuffBtnBorderThickness}"></label>
          <label>Horizontal Position
            <select id="stm-btn-hpos">
              <option value="left" ${state.stuffBtnIconHPos==="left"?"selected":""}>Left</option>
              <option value="center" ${state.stuffBtnIconHPos==="center"?"selected":""}>Center</option>
              <option value="right" ${state.stuffBtnIconHPos==="right"?"selected":""}>Right</option>
            </select>
          </label>
          <label>Vertical Position
            <select id="stm-btn-vpos">
              <option value="top" ${state.stuffBtnIconVPos==="top"?"selected":""}>Top</option>
              <option value="center" ${state.stuffBtnIconVPos==="center"?"selected":""}>Center</option>
              <option value="bottom" ${state.stuffBtnIconVPos==="bottom"?"selected":""}>Bottom</option>
            </select>
          </label>
          <label>Move Left / Right <span class="ct-val-label" id="stm-btn-offset-val">${state.stuffBtnIconOffset}px</span><input type="range" id="stm-btn-offset" min="-50" max="50" step="1" value="${state.stuffBtnIconOffset}"></label>
        </div>
      </div>`;
    document.body.appendChild(popup);

    const collectState = () => ({
      stuffMenuShadowColor: popup.querySelector("#stm-shadow-color").value,
      stuffMenuShadowOpacity: parseFloat(popup.querySelector("#stm-shadow-op").value),
      stuffMenuShadowDistance: parseInt(popup.querySelector("#stm-shadow-dist").value),
      stuffMenuShadowDirection: popup.querySelector("#stm-shadow-dir").value,
      stuffMenuTitleColor: popup.querySelector("#stm-title-color").value,
      stuffMenuTitleSize: parseInt(popup.querySelector("#stm-title-size").value),
      stuffMenuTitleCaps: popup.querySelector("#stm-title-caps").checked,
      stuffMenuHeadingColor: popup.querySelector("#stm-heading-color").value,
      stuffMenuHeadingOpacity: parseFloat(popup.querySelector("#stm-heading-op").value),
      stuffMenuBgColor: popup.querySelector("#stm-bg-color").value,
      stuffMenuBgOpacity: parseFloat(popup.querySelector("#stm-bg-op").value),
      stuffMenuBgImage: popup.querySelector("#stm-bg-image").value.trim(),
      stuffMenuBgImageOpacity: parseFloat(popup.querySelector("#stm-bg-image-op").value),
      stuffMenuBgFit: popup.querySelector("#stm-bg-fit").value,
      stuffMenuColumns: parseInt(popup.querySelector("#stm-cols").value),
      stuffMenuWidthScale: parseInt(popup.querySelector("#stm-width").value),
      stuffMenuHeightScale: parseInt(popup.querySelector("#stm-height").value),
      stuffMenuFontSize: parseInt(popup.querySelector("#stm-font-size").value),
      stuffMenuItemSize: parseInt(popup.querySelector("#stm-item-size").value),
      stuffMenuItemPadding: parseInt(popup.querySelector("#stm-item-padding").value),
      stuffDefaultTab: parseInt(popup.querySelector("#stm-default-tab")?.value ?? 0),
      stuffBtnIconColor: popup.querySelector("#stm-btn-icon-color").value,
      stuffBtnIconSize: parseInt(popup.querySelector("#stm-btn-icon-size").value),
      stuffBtnBorderColor: popup.querySelector("#stm-btn-border-color").value,
      stuffBtnBorderOpacity: parseFloat(popup.querySelector("#stm-btn-border-op").value),
      stuffBtnBorderThickness: parseFloat(popup.querySelector("#stm-btn-border-thick").value),
      stuffBtnIconHPos: popup.querySelector("#stm-btn-hpos").value,
      stuffBtnIconVPos: popup.querySelector("#stm-btn-vpos").value,
      stuffBtnIconOffset: parseInt(popup.querySelector("#stm-btn-offset").value)
    });

    // Tab switching
    popup.querySelectorAll(".ct-popup-tab").forEach(btn => btn.onclick = () => {
      const tab = btn.dataset.tab;
      popup.querySelectorAll(".ct-popup-tab").forEach(el => el.classList.toggle("is-active", el === btn));
      popup.querySelectorAll(".ct-popup-pane").forEach(pane => pane.classList.toggle("is-active", pane.dataset.pane === tab));
    });

    // Value sync
    const syncVal = (id, formatter = v => v) => {
      const input = popup.querySelector(`#${id}`);
      const out = popup.querySelector(`#${id}-val`);
      if (!input || !out) return;
      const update = () => out.textContent = formatter(input.value);
      input.addEventListener("input", update);
      update();
    };
    syncVal("stm-shadow-op", v => `${Math.round(parseFloat(v)*100)}%`);
    syncVal("stm-shadow-dist", v => `${v}px`);
    syncVal("stm-title-size", v => `${v}%`);
    syncVal("stm-heading-op", v => `${Math.round(parseFloat(v)*100)}%`);
    syncVal("stm-bg-op", v => `${Math.round(parseFloat(v)*100)}%`);
    syncVal("stm-bg-image-op", v => `${Math.round(parseFloat(v)*100)}%`);
    syncVal("stm-cols", v => `${v}`);
    syncVal("stm-width", v => `${v}px`);
    syncVal("stm-height", v => `${v}px`);
    syncVal("stm-font-size", v => `${v}%`);
    syncVal("stm-item-size", v => `${v}px`);
    syncVal("stm-item-padding", v => `${v}px`);
    syncVal("stm-btn-icon-size", v => `${v}%`);
    syncVal("stm-btn-border-op", v => `${Math.round(parseFloat(v)*100)}%`);
    syncVal("stm-btn-border-thick", v => `${v}px`);
    syncVal("stm-btn-offset", v => `${v}px`);

    // Apply preview: saves to settings + applies live to open panel
    const applyPreview = async () => {
      const preview = collectState();
      // Apply live to the stuff panel
      this._applyLiveStuffPanelSettings(preview);
      // Apply button icon settings live
      this._applyLiveStuffButtonSettings(preview);
      // Save to settings
      const writes = Object.entries(preview).map(([key, value]) => this._ss(key, value));
      try { await Promise.all(writes); } catch (err) { console.warn("[CypherTaskbar] Stuff settings save failed:", err?.message || err); }
    };

    popup.querySelectorAll('input[type="range"], input[type="color"], input[type="text"], select, input[type="checkbox"]').forEach(el => {
      const eventName = el.matches('input[type="text"]') ? 'input' : (el.matches('select, input[type="checkbox"]') ? 'change' : 'input');
      el.addEventListener(eventName, applyPreview);
    });

    popup.querySelector(".ct-popup-close").addEventListener("click", () => popup.remove());
    setTimeout(() => { document.addEventListener("click", function h(e) { if (!popup.contains(e.target) && !e.target.closest("#ct-stuff-panel")) { popup.remove(); document.removeEventListener("click", h); } }); }, 50);
  }

  _applyLiveStuffButtonSettings(state) {
    const btn = document.querySelector("#ct-btn-stuff");
    if (!btn) return;
    const icon = btn.querySelector("i");
    if (icon) {
      icon.style.color = state.stuffBtnIconColor ?? "#c8a96e";
      icon.style.fontSize = `${(state.stuffBtnIconSize ?? 100) / 100 * 1.15}em`;
    }
    const borderColor = state.stuffBtnBorderColor ?? "#c8a96e";
    const borderOp = state.stuffBtnBorderOpacity ?? 0.25;
    const borderThick = state.stuffBtnBorderThickness ?? 1;
    const r = parseInt(borderColor.slice(1,3), 16);
    const g = parseInt(borderColor.slice(3,5), 16);
    const b = parseInt(borderColor.slice(5,7), 16);
    btn.style.borderColor = `rgba(${r},${g},${b},${borderOp})`;
    btn.style.borderWidth = `${borderThick}px`;
    btn.style.marginLeft = `${state.stuffBtnIconOffset ?? 0}px`;
    const hPos = state.stuffBtnIconHPos ?? "center";
    const vPos = state.stuffBtnIconVPos ?? "center";
    const justifyMap = { left: "flex-start", center: "center", right: "flex-end" };
    const alignMap = { top: "flex-start", center: "center", bottom: "flex-end" };
    btn.style.justifyContent = justifyMap[hPos] ?? "center";
    btn.style.alignItems = alignMap[vPos] ?? "center";
  }

  applySettings() {
    const bar = this.element; if (!bar) return;
    bar.style.setProperty("--ct-height",  `${this._gs("taskbarHeight")}px`);
    bar.style.setProperty("--ct-bg",       hexToRGBA(this._gs("bgColor"), this._gs("bgOpacity")));
    bar.style.setProperty("--ct-accent",   this._gs("accentColor"));
    bar.style.setProperty("--ct-portrait-w",`${this._gs("portraitWidth")}px`);
    const pTransparent = this._gs("portraitSpaceTransparent") ?? true;
    const pOpacity = this._gs("portraitSpaceOpacity") ?? 0.8;
    bar.style.setProperty("--ct-portrait-space-opacity", pTransparent ? pOpacity : 1);
    bar.classList.toggle("ct-sections-expanded", this._gs("sectionsExpanded") ?? false);
    bar.style.setProperty("--ct-menu-font-size", (this._gs("menuFontSize") ?? 100) / 100);
    bar.style.setProperty("--ct-menu-font-color", this._gs("menuFontColor") ?? "#e8e8e8");
    bar.style.setProperty("--ct-menu-font-caps", (this._gs("menuFontCaps") ?? false) ? "uppercase" : "none");
    bar.style.setProperty("--ct-menu-font-family", this._gs("menuFontFamily") ?? "inherit");
    // Mini menu spacing
    bar.style.setProperty("--ct-mini-space-left", `${this._gs("miniMenuSpaceLeft") ?? 2}px`);
    bar.style.setProperty("--ct-mini-space-right", `${this._gs("miniMenuSpaceRight") ?? 0}px`);
    // Cash & Assets button spacing
    bar.style.setProperty("--ct-cash-stack-space-left", `${this._gs("cashStackSpaceLeft") ?? 0}px`);
    bar.style.setProperty("--ct-cash-stack-space-right", `${this._gs("cashStackSpaceRight") ?? 0}px`);
    // Menu icon settings
    bar.style.setProperty("--ct-menu-icon-size", (this._gs("menuIconSize") ?? 100) / 100);
    bar.style.setProperty("--ct-menu-label-size", (this._gs("menuLabelSize") ?? 100) / 100);
    bar.style.setProperty("--ct-menu-icon-color", this._gs("menuIconColor") ?? "var(--ct-accent)");
    bar.style.setProperty("--ct-menu-label-color", this._gs("menuLabelColor") ?? "var(--ct-text)");
    bar.style.setProperty("--ct-menu-icon-bg", this._gs("menuIconBgColor") ?? "transparent");
    this._applyLiveStuffButtonSettings({
      stuffBtnIconColor: this._gs("stuffBtnIconColor") ?? "#c8a96e",
      stuffBtnIconSize: this._gs("stuffBtnIconSize") ?? 100,
      stuffBtnBorderColor: this._gs("stuffBtnBorderColor") ?? "#c8a96e",
      stuffBtnBorderOpacity: this._gs("stuffBtnBorderOpacity") ?? 0.25,
      stuffBtnBorderThickness: this._gs("stuffBtnBorderThickness") ?? 1,
      stuffBtnIconHPos: this._gs("stuffBtnIconHPos") ?? "center",
      stuffBtnIconVPos: this._gs("stuffBtnIconVPos") ?? "center",
      stuffBtnIconOffset: this._gs("stuffBtnIconOffset") ?? 0
    });
    this._applyBookButtonSettings({
      bookBtnIconColor: this._gs("bookBtnIconColor") ?? "#c8a96e",
      bookBtnIconSize: this._gs("bookBtnIconSize") ?? 100,
      bookBtnBorderColor: this._gs("bookBtnBorderColor") ?? "#c8a96e",
      bookBtnBorderOpacity: this._gs("bookBtnBorderOpacity") ?? 0.25,
      bookBtnBorderThickness: this._gs("bookBtnBorderThickness") ?? 1,
      bookBtnIconHPos: this._gs("bookBtnIconHPos") ?? "center",
      bookBtnIconVPos: this._gs("bookBtnIconVPos") ?? "center",
      bookBtnIconOffset: this._gs("bookBtnIconOffset") ?? 0
    });
    // Apply per-icon overrides to all panel buttons
    bar.querySelectorAll(".ct-btn[data-panel]").forEach(btn => this._applyMenuIconStyles(btn));
  }

  reposition() {
    const bar = this.element; if (!bar) return;
    bar.classList.remove("ct-pos-top","ct-pos-bottom");
    bar.classList.add("ct-pos-bottom");
    this._adjustCanvasPadding(
      this._gs("locked") || !this._gs("autoHide")
    );
  }

  _adjustCanvasPadding(add) {
    const height = this._gs("taskbarHeight");
    const canvas = document.querySelector("#board") ?? document.querySelector("#canvas") ?? document.querySelector("#game-canvas");
    if (canvas) {
      canvas.style.paddingBottom = "";
      canvas.style.paddingTop    = "";
      if (add) canvas.style.paddingBottom = `${height}px`;
    }
    // Push sidebar up via CSS variable + direct JS fallback
    const root = document.documentElement;
    const sidebarEls = ["#sidebar", "#ui-right", "#ui-right #sidebar"];
    const tabStripEls = ["#sidebar-tabs", ".sidebar-tabs"];
    if (game.settings.get(MODULE_ID, "pushSidebarUp")) {
      if (add) {
        const offset = height + 4;
        root.style.setProperty("--ct-sidebar-offset", `${offset}px`);
        sidebarEls.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty("bottom", `${offset}px`, "important");
            el.style.setProperty("height", `calc(100vh - ${offset}px)`, "important");
            el.style.setProperty("max-height", `calc(100vh - ${offset}px)`, "important");
          });
        });
        tabStripEls.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.setProperty("max-height", `calc(100vh - ${offset}px)`, "important");
          });
        });
      } else {
        root.style.removeProperty("--ct-sidebar-offset");
        sidebarEls.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.removeProperty("bottom");
            el.style.removeProperty("height");
            el.style.removeProperty("max-height");
          });
        });
        tabStripEls.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.removeProperty("max-height");
          });
        });
      }
    } else {
      root.style.removeProperty("--ct-sidebar-offset");
      sidebarEls.concat(tabStripEls).forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
          el.style.removeProperty("bottom");
          el.style.removeProperty("height");
          el.style.removeProperty("max-height");
        });
      });
    }
  }

  refresh(options = {}) {
    if (this._suppressRender) return;
    const actor   = this.actor;
    const noActor = !actor || actor.type !== "pc";

    // Rebuild floating portrait/stats — preserve outer element so CSS transitions keep running
    const old = this.element?.querySelector("#ct-char-float");
    if (old) {
      const tmp = document.createElement("div");
      tmp.innerHTML = this._buildFloating(actor, noActor);
      const newFloat = tmp.firstElementChild;
      // Preserve slide-away class to keep any ongoing transition alive
      const hadSlideAway = old.classList.contains("ct-portrait-slide-away");
      const hadCollapsed = old.classList.contains("ct-char-float-collapsed");
      // Replace inner HTML only, keeping the outer element (and its transitions)
      old.innerHTML = newFloat.innerHTML;
      // Re-apply classes from new build (sync with current setting) while preserving transition class
      old.className = newFloat.className;
      if (hadSlideAway) old.classList.add("ct-portrait-slide-away");
      if (hadCollapsed) old.classList.add("ct-char-float-collapsed");

      // Re-bind portrait events
      old.querySelector(".ct-portrait")?.addEventListener("click",e=>{e.stopPropagation();this.actor?.sheet?.render(true);});
      old.querySelector(".ct-portrait-wrap")?.addEventListener("contextmenu",e=>{e.preventDefault();e.stopPropagation();this._openPortraitSettings(e);});
      old.querySelectorAll(".ct-stat-bar-wrap[data-pool]").forEach(el => {
        el.addEventListener("click", async (e) => {
          e.stopPropagation();
          await this._adjustPool(el.dataset.pool, -1);
        });
        el.addEventListener("contextmenu", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this._adjustPool(el.dataset.pool, 1);
        });
      });
      old.querySelectorAll(".ct-roll-btn[data-roll-stat]").forEach(el => {
        el.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this._openStatRoll(el.dataset.rollStat);
        });
      });
      old.querySelector(".ct-xp-orb")?.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._adjustXP(1);
      });
      old.querySelector(".ct-xp-orb")?.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._adjustXP(-1);
      });
      // Re-bind dice button events
      old.querySelectorAll(".ct-dice-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const die = btn.dataset.die;
          if (!die) return;
          try {
            const roll = new Roll(`1${die}`);
            await roll.evaluate();
            await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }) });
          } catch (err) {
            console.error(`${MODULE_ID} | Dice roll failed:`, err);
            ui.notifications.error("Dice roll failed.");
          }
        });
      });
      // Re-bind recovery drops
      old.querySelectorAll(".ct-recovery-drop[data-recovery-index]").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const idx = parseInt(btn.dataset.recoveryIndex);
          if (Number.isNaN(idx)) return;
          await this._spendRecoveryRoll(idx);
        });
      });
    }

    // Rebuild bar meta + eye + book buttons
    const s1 = this.element?.querySelector(".ct-section-1");
    const portraitAreaCollapsed = this._gs("portraitAreaCollapsed") ?? false;
    if (s1) {
      // Preserve externally-injected buttons (e.g., Cypher Log's cl-taskbar-btn)
      const externalBtn = s1.querySelector("#cl-taskbar-log-btn");
      const collapsedClass = portraitAreaCollapsed ? ' ct-section-1-collapsed' : '';
      s1.className = `ct-section ct-section-1${collapsedClass}`;
      s1.innerHTML = noActor
        ? `<div class="ct-no-actor"><i class="fas fa-user-slash"></i> No Character</div>`
          + `<button class="ct-btn ct-eye-btn ${portraitAreaCollapsed ? 'ct-eye-collapsed' : ''}" id="ct-btn-eye" title="${portraitAreaCollapsed ? 'Show portrait' : 'Hide portrait'}" disabled><i class="fas ${portraitAreaCollapsed ? 'fa-eye-slash' : 'fa-eye'}"></i></button>`
        : this._buildBarMeta(actor)
          + `<button class="ct-btn ct-eye-btn ${portraitAreaCollapsed ? 'ct-eye-collapsed' : ''}" id="ct-btn-eye" title="${portraitAreaCollapsed ? 'Show portrait' : 'Hide portrait'}"><i class="fas ${portraitAreaCollapsed ? 'fa-eye-slash' : 'fa-eye'}"></i></button>`;
      // Re-insert preserved external button at end of section
      if (externalBtn) s1.append(externalBtn);
      // Re-bind eye button event
      const newEyeBtn = s1.querySelector("#ct-btn-eye");
      if (newEyeBtn && !noActor) {
        newEyeBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this._portraitToggleBusy) return;
          this._portraitToggleBusy = true;
          this._suppressRender = true;
          try {
            const collapsed = !!(this._gs("portraitAreaCollapsed") ?? false);
            const newCollapsed = !collapsed;
            // Toggle slide animation class FIRST (before save triggers any hook)
            const floatEl = document.querySelector("#ct-char-float");
            if (floatEl) floatEl.classList.toggle("ct-portrait-slide-away", newCollapsed);
            const s1El = this.element?.querySelector(".ct-section-1");
            if (s1El) s1El.classList.toggle("ct-section-1-collapsed", newCollapsed);
            const icon = newEyeBtn.querySelector("i");
            if (icon) icon.className = `fas ${newCollapsed ? 'fa-eye-slash' : 'fa-eye'}`;
            newEyeBtn.classList.toggle("ct-eye-collapsed", newCollapsed);
            newEyeBtn.title = newCollapsed ? "Show portrait" : "Hide portrait";
            // Save setting LAST (triggers updateActor hook → refresh, but _suppressRender blocks it)
            await this._ss("portraitAreaCollapsed", newCollapsed);
          } finally {
            this._portraitToggleBusy = false;
            this._suppressRender = false;
          }
        };
      }
    }

    // Rebuild gallery strip (above the bar)
    const oldStrip = this.element?.querySelector(".cgt-strip-wrapper");
    if (oldStrip) {
      oldStrip.remove();
      const newStripHtml = buildGalleryStrip(this);
      if (newStripHtml) {
        const tmp = document.createElement("div");
        tmp.innerHTML = newStripHtml;
        this.element?.insertBefore(tmp.firstElementChild, this.element?.querySelector(".ct-inner"));
        bindGalleryStripEvents(this);
      }
    }

    // Rebuild section 2 buttons
    const s2 = this.element?.querySelector(".ct-section-2");
    if (s2) {
      s2.innerHTML = this._buildSection2(noActor);
      s2.querySelectorAll(".ct-btn[data-panel]").forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._suppressNextDocumentClose = true;
          this._togglePanel(btn.dataset.panel, btn);
        };
        // Right-click icon settings when unlocked
        btn.oncontextmenu = (e) => {
          if (!this._gs("menuIconsUnlocked")) return;
          e.preventDefault();
          e.stopPropagation();
          this._openMenuIconSettings(e, btn.dataset.panel);
        };
        const panel = btn.dataset.panel;
        if (["skills","abilities","equipment"].includes(panel)) {
          this._makePanelButtonDropTarget(btn, panel);
        }
        // Apply per-icon settings
        this._applyMenuIconStyles(btn);
      });
      // Re-bind mini category grid buttons
      const miniMap = { people: "_openPeoplePanel", places: "_openPlacesPanel", assets: "_openAssetsPanel", secrets: "_openSecretsPanel" };
      const miniKeyToSetting = { people: "People", places: "Places", assets: "Assets", secrets: "Secrets" };
      s2.querySelectorAll(".ct-mini-btn[data-mini]").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const method = miniMap[btn.dataset.mini];
          if (method && typeof this[method] === "function") this[method](btn);
        });
        this._makeMiniButtonDropTarget(btn, miniKeyToSetting[btn.dataset.mini]);
      });
    }

    if (this.activePanel) this._refreshActivePanel();
    else {
      const container = this.element?.querySelector("#ct-panel-container");
      if (container) {
        container.innerHTML = "";
        container.classList.remove("ct-panel-open");
      }
    }

    this.applySettings();
    // Re-apply settings after a short delay to catch any async actor flag loading
    setTimeout(() => { if (this.element) { this._resolveActor(); this.applySettings(); } }, 100);
  }

  _getItemStat(item) {
    if (!item) return "Might";
    const sys = item.system;
    // Attacks: check for range to determine stat
    if (item.type === "attack") {
      const range = sys?.basic?.range?.toLowerCase?.() || "";
      if (range.includes("range") || range.includes("long") || range.includes("short")) return "Speed";
      return "Might";
    }
    // Abilities: parse cost string like "2 Intellect points"
    if (item.type === "ability" || item.type === "abilities") {
      const cost = sys?.basic?.cost || "";
      if (cost.toLowerCase().includes("intellect")) return "Intellect";
      if (cost.toLowerCase().includes("speed")) return "Speed";
      if (cost.toLowerCase().includes("might")) return "Might";
      return "Might";
    }
    // Skills: no inherent stat, default to Might
    if (item.type === "skill" || item.type === "skills") return "Might";
    return "Might";
  }

  _withCharSync(actor, fn) {
    const originalId = game.user._source?.character ?? game.user.character?.id;
    // Synchronously update internal source so getter immediately returns new value
    game.user.updateSource({ character: actor.id });
    try {
      return fn();
    } finally {
      // Restore original character reference
      try { game.user.updateSource({ character: originalId }); } catch (e) { /* ignore */ }
    }
  }

  async _rollItem(item) {
    const actor = this.actor;
    if (!actor || !item) return;
    await this._withCharSync(actor, async () => {
      // Try 1: Foundry native item.use() (v12+ standard)
      if (typeof item.use === "function") {
        try { return await item.use(); } catch (err) { console.warn("[CT] item.use() failed:", err?.message || err); }
      }
      // Try 2: Foundry native item.roll()
      if (typeof item.roll === "function") {
        try { return await item.roll(); } catch (err) { console.warn("[CT] item.roll() failed:", err?.message || err); }
      }
      // Try 3: Cypher System V2 dialog with item
      const api = game.cyphersystem;
      if (api?.allInOneRollDialogV2) {
        try { return await api.allInOneRollDialogV2(actor, item); } catch (err) { console.warn("[CT] V2 dialog failed:", err?.message || err); }
      }
      // Try 4: Cypher System V1 dialog with item
      if (api?.allInOneRollDialog) {
        try { return await api.allInOneRollDialog(actor, item); } catch (err) { console.warn("[CT] V1 dialog failed:", err?.message || err); }
      }
      // Fallback: open item sheet
      console.warn(`[CT] All roll methods failed for "${item.name}". Opening item sheet.`);
      item.sheet?.render?.(true);
    });
  }

  _skillStepFromRating(item) {
    const raw = String(item?.system?.basic?.rating ?? item?.system?.rating ?? '').trim().toLowerCase();
    if (["specialized", "specialised"].includes(raw)) return 2;
    if (["practiced", "practised", "trained"].includes(raw)) return 1;
    if (["inability", "hindered", "hindrance"].includes(raw)) return -1;
    return 0;
  }

  _skillRatingLabel(item) {
    return String(item?.system?.basic?.rating ?? item?.system?.rating ?? 'Untrained').trim() || 'Untrained';
  }

  _detectSkillPoolMeta(item) {
    const sys = item?.system ?? {};
    const direct = [
      sys?.basic?.pool,
      sys?.pool,
      sys?.stat,
      sys?.attribute,
      sys?.rollPool,
      sys?.governingStat,
      sys?.settings?.pool,
      sys?.settings?.stat
    ].map(v => String(v ?? '').trim()).filter(Boolean);
    const haystack = [
      ...direct,
      item?.name,
      sys?.basic?.description,
      sys?.basic?.sentence,
      sys?.description?.value,
      sys?.description?.text,
      JSON.stringify(sys)
    ].filter(Boolean).join(' ').toLowerCase();

    const mapPool = (value) => {
      const v = String(value ?? '').trim().toLowerCase();
      if (!v) return null;
      if (v.includes('speed')) return 'Speed';
      if (v.includes('intellect')) return 'Intellect';
      if (v.includes('might')) return 'Might';
      return null;
    };

    for (const value of direct) {
      const mapped = mapPool(value);
      if (mapped) return { pool: mapped, source: 'skill-data' };
    }
    if (haystack.includes('speed')) return { pool: 'Speed', source: 'skill-text' };
    if (haystack.includes('intellect')) return { pool: 'Intellect', source: 'skill-text' };
    if (haystack.includes('might')) return { pool: 'Might', source: 'skill-text' };
    return { pool: 'Might', source: 'fallback' };
  }

  _defaultSkillPool(item) {
    return this._detectSkillPoolMeta(item).pool;
  }

  _edgeForPool(actor, poolName) {
    const key = String(poolName ?? 'might').trim().toLowerCase();
    return Number(actor?.system?.pools?.[key]?.edge ?? 0) || 0;
  }

  _poolValueForName(actor, poolName) {
    const key = String(poolName ?? 'might').trim().toLowerCase();
    const pool = actor?.system?.pools?.[key] ?? {};
    return Number(pool?.value ?? pool?.current ?? 0) || 0;
  }

  async _spendEffortFromPool(actor, poolName, amount) {
    const cost = Math.max(0, Number(amount ?? 0) || 0);
    if (!actor || cost <= 0) return 0;
    const key = String(poolName ?? 'might').trim().toLowerCase();
    const pool = actor?.system?.pools?.[key] ?? {};
    const current = Number(pool?.value ?? pool?.current ?? 0) || 0;
    const next = Math.max(0, current - cost);
    const update = {};
    if (pool && Object.prototype.hasOwnProperty.call(pool, 'value')) update[`system.pools.${key}.value`] = next;
    if (pool && Object.prototype.hasOwnProperty.call(pool, 'current')) update[`system.pools.${key}.current`] = next;
    if (!Object.keys(update).length) update[`system.pools.${key}.value`] = next;
    await actor.update(update);
    return current - next;
  }

  _skillRollSelectOptions(min, max, selected, labels = null) {
    const out = [];
    for (let i = min; i <= max; i += 1) {
      const label = labels?.[i] ?? String(i);
      out.push(`<option value="${i}" ${Number(selected) === i ? 'selected' : ''}>${foundry.utils.escapeHTML(label)}</option>`);
    }
    return out.join('');
  }

  _skillRollIcon(item) {
    const src = String(item?.img ?? '').trim();
    if (src && !src.endsWith('/')) return src;
    return 'icons/svg/book.svg';
  }

  _readGlobalDifficultyControl() {
    const clampDiff = (v) => Math.max(0, Math.min(15, Number(v ?? 0) || 0));

    const cypherGame = globalThis.game?.cyphersystem;
    const directValues = [
      cypherGame?.globalDifficulty,
      cypherGame?.effectiveDifficulty,
      cypherGame?.currentDifficulty,
      cypherGame?.difficulty,
      cypherGame?.rollDifficulty,
      cypherGame?.taskDifficulty
    ];
    for (const value of directValues) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return clampDiff(parsed);
    }

    const candidateObjects = [cypherGame, globalThis.ui, globalThis.game];
    for (const obj of candidateObjects) {
      if (!obj || typeof obj !== 'object') continue;
      for (const [key, value] of Object.entries(obj)) {
        if (!/diffic|effective/i.test(String(key))) continue;
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return clampDiff(parsed);
      }
    }

    const parseFromText = (text) => {
      const m = String(text ?? '').match(/(?:^|)(10|[0-9])(?:|\/$)/);
      return m ? clampDiff(m[1]) : null;
    };

    const directSelectors = [
      '[data-global-difficulty]',
      '[data-difficulty-value]',
      '[data-current-difficulty]',
      '[data-effective-difficulty]',
      '[name="globalDifficulty"]',
      '[name="effectiveDifficulty"]',
      '[name="difficulty"]',
      '#difficulty',
      '#globalDifficulty',
      '#effectiveDifficulty'
    ];
    for (const sel of directSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const raw = el.value ?? el.dataset?.globalDifficulty ?? el.dataset?.difficultyValue ?? el.dataset?.effectiveDifficulty ?? el.textContent;
      const parsed = parseFromText(raw);
      if (parsed !== null) return parsed;
    }

    const panels = Array.from(document.querySelectorAll('[class*="diffic"], [id*="diffic"], [class*="difficulty"], [id*="difficulty"], [class*="effective"], [id*="effective"]'));
    for (const panel of panels) {
      const controls = panel.matches('input, select') ? [panel] : Array.from(panel.querySelectorAll('input, select, button, span, div'));
      for (const el of controls) {
        const raw = el.value ?? el.dataset?.value ?? el.getAttribute?.('aria-valuenow') ?? el.textContent;
        const parsed = parseFromText(raw);
        if (parsed !== null) return parsed;
      }
    }

    return 0;
  }

  _skillRollSpecialEvent(total) {
    const roll = Number(total ?? 0) || 0;
    if (roll === 1) return { title: 'GM Intrusion', text: 'Natural 1: GM intrusion. The GM may introduce a complication and awards XP according to the Cypher rules in use.' };
    if (roll === 17) return { title: 'Damage Bonus', text: 'Natural 17: if this was an attack, it deals +1 damage.' };
    if (roll === 18) return { title: 'Damage Bonus or Minor Effect', text: 'Natural 18: if this was an attack, it deals +2 damage or gains a minor effect.' };
    if (roll === 19) return { title: 'Damage Bonus or Minor Effect', text: 'Natural 19: if this was an attack, it deals +3 damage or gains a minor effect.' };
    if (roll === 20) return { title: 'Damage Bonus or Major Effect', text: 'Natural 20: if this was an attack, it deals +4 damage or gains a major effect.' };
    return null;
  }

  _skillRollSummary(actor, item, data = {}) {
    const pool = String(data.pool || this._defaultSkillPool(item));
    const baseDifficulty = Math.max(0, Math.min(15, Number(data.baseDifficulty ?? 0) || 0));
    const assets = Math.max(0, Math.min(2, Number(data.assets ?? 0) || 0));
    const effort = Math.max(0, Number(data.effort ?? 0) || 0);
    const easedBy = Math.max(0, Number(data.easedBy ?? 0) || 0);
    const hinderedBy = Math.max(0, Number(data.hinderedBy ?? 0) || 0);
    const skillStep = this._skillStepFromRating(item);
    const edge = this._edgeForPool(actor, pool);
    const poolValue = this._poolValueForName(actor, pool);
    const finalDifficulty = Math.max(0, Math.min(15, baseDifficulty - skillStep - assets - effort - easedBy + hinderedBy));
    const target = finalDifficulty * 3;
    const effortCost = Math.max(0, effort > 0 ? 3 + Math.max(0, effort - 1) * 2 - edge : 0);
    const remainingPool = Math.max(0, poolValue - effortCost);
    return { pool, baseDifficulty, assets, effort, easedBy, hinderedBy, skillStep, edge, poolValue, finalDifficulty, target, effortCost, remainingPool };
  }

  async _performNativeSkillRoll(actor, item, options = {}) {
    const summary = this._skillRollSummary(actor, item, options);
    const roll = await (new Roll('1d20')).evaluate();
    const total = Number(roll.total ?? 0);
    const ratingLabel = this._skillRatingLabel(item);
    const specialEvent = this._skillRollSpecialEvent(total);
    const achievedDifficulty = Math.max(0, Math.floor((total + (summary.skillStep + summary.assets + summary.effort + summary.easedBy - summary.hinderedBy) * 3) / 3));
    let spent = 0;
    if (summary.effortCost > 0) spent = await this._spendEffortFromPool(actor, summary.pool, summary.effortCost);
    const flavor = `
      <div class="ct-native-skill-roll-flavor">
        <div class="ct-native-skill-roll-flavor-head">
          <img class="ct-native-skill-roll-flavor-icon" src="${foundry.utils.escapeHTML(this._skillRollIcon(item))}" alt="${foundry.utils.escapeHTML(item.name)}" draggable="false">
          <div class="ct-native-skill-roll-flavor-title"><strong>${foundry.utils.escapeHTML(item.name)}</strong> · ${foundry.utils.escapeHTML(summary.pool)} task</div>
        </div>
        <div class="ct-native-skill-roll-flavor-meta">Rating ${foundry.utils.escapeHTML(ratingLabel)} · Base ${summary.baseDifficulty} · Assets ${summary.assets} · Effort ${summary.effort}</div>
        <div class="ct-native-skill-roll-flavor-meta">Other Ease ${summary.easedBy} · Hindrance ${summary.hinderedBy} · Edge ${summary.edge} · Effort Cost ${summary.effortCost}</div>
        <div class="ct-native-skill-roll-flavor-meta">Final Difficulty ${summary.finalDifficulty} · Target ${summary.target || 0}</div>
        <div class="ct-native-skill-roll-flavor-meta">${foundry.utils.escapeHTML(summary.pool)} Pool ${summary.poolValue} → ${Math.max(0, summary.poolValue - spent)}${spent !== summary.effortCost ? ` (spent ${spent})` : ''}</div>
        ${specialEvent ? `<div class="ct-native-skill-roll-flavor-event"><strong>${foundry.utils.escapeHTML(specialEvent.title)}:</strong> ${foundry.utils.escapeHTML(specialEvent.text)}</div>` : ''}
        <div class="ct-native-skill-roll-flavor-result">Achieved Difficulty ${achievedDifficulty}</div>
      </div>`;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor
    }, {
      rollMode: game.settings.get('core', 'rollMode')
    });
  }

  _closeSkillsMenuPanel() {
    const panel = this.element?.querySelector('.ct-panel-skills-custom');
    panel?.remove?.();
  }

  async _openNativeAttackRollDialog(actor, item, presetDifficulty = null) {
    const baseDamage = Number(item?.system?.basic?.damage ?? item?.system?.damage ?? 0) || 0;
    const defaultPool = this._detectSkillPoolMeta(item).pool;
    const effortCap = Math.max(0, Math.min(6, Number(actor?.system?.basic?.effort ?? actor?.system?.advancement?.effort ?? 0) || 0));
    const ratingLabel = this._skillRatingLabel(item);
    const skillSteps = this._skillStepFromRating(item);
    const title = `Attack Roll: ${item.name}`;
    const diffDefault = presetDifficulty ?? 0;

    const content = `
      <form class="ct-native-skill-roll-form ct-native-attack-roll-form">
        <div class="ct-skill-roll-shell">
          <div class="ct-skill-roll-hero">
            <div class="ct-skill-roll-kicker">Cypher Attack Roll</div>
            <div class="ct-skill-roll-title-wrap">
              <img class="ct-skill-roll-title-icon" src="${foundry.utils.escapeHTML(item.img || 'icons/svg/combat.svg')}" alt="" draggable="false">
              <div class="ct-skill-roll-title">${foundry.utils.escapeHTML(item.name)}</div>
            </div>
            <div class="ct-skill-roll-badges">
              <span class="ct-skill-roll-badge">Pool: ${foundry.utils.escapeHTML(defaultPool)}</span>
              <span class="ct-skill-roll-badge">Rating: ${foundry.utils.escapeHTML(ratingLabel)}</span>
              <span class="ct-skill-roll-badge">Base Damage: ${baseDamage}</span>
            </div>
          </div>

          <div class="ct-skill-roll-grid">
            <label class="ct-skill-roll-field">
              <span>Pool</span>
              <select name="pool">${['Might','Speed','Intellect'].map(p => `<option value="${p}" ${p === defaultPool ? 'selected' : ''}>${p}</option>`).join('')}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Difficulty</span>
              <select name="baseDifficulty">${this._skillRollSelectOptions(0, 15, diffDefault, {0:'0 – Routine',1:'1',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'11',12:'12',13:'13',14:'14',15:'15 – Impossible'})}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Assets</span>
              <select name="assets">${this._skillRollSelectOptions(0, 2, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Effort (Attack)</span>
              <select name="effort">${this._skillRollSelectOptions(0, effortCap, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Effort (Damage)</span>
              <select name="effortDamage">${this._skillRollSelectOptions(0, effortCap, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Other Ease</span>
              <select name="easedBy">${this._skillRollSelectOptions(0, 6, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Hindrance</span>
              <select name="hinderedBy">${this._skillRollSelectOptions(0, 6, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Bonus Damage</span>
              <input type="number" name="bonusDamage" value="0" min="0" style="width:100%;padding:2px 4px;">
            </label>
          </div>

          <div class="ct-skill-roll-summary" data-skill-roll-summary>
            <div class="ct-skill-roll-summary-item"><span>Base Difficulty</span><strong data-skill-base-difficulty>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Final Difficulty</span><strong data-skill-final-difficulty>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Target Number</span><strong data-skill-target-number>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Pool Edge</span><strong data-skill-pool-edge>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Effort Cost</span><strong data-skill-effort-cost>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Current Pool</span><strong data-skill-pool-current>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>After Spend</span><strong data-skill-pool-remaining>0</strong></div>
            <div class="ct-skill-roll-summary-item ct-atk-dmg-summary"><span>Base Damage</span><strong data-atk-base-damage>${baseDamage}</strong></div>
            <div class="ct-skill-roll-summary-item ct-atk-dmg-summary"><span>Effort Dmg Bonus</span><strong data-atk-effort-dmg-bonus>0</strong></div>
            <div class="ct-skill-roll-summary-item ct-atk-dmg-summary"><span>Bonus Damage</span><strong data-atk-bonus-damage>0</strong></div>
            <div class="ct-skill-roll-summary-item ct-atk-dmg-summary ct-atk-total-dmg-row"><span>Total Damage</span><strong data-atk-total-damage>0</strong></div>
          </div>
          <div class="ct-skill-roll-note">
            Each level of Effort on Damage adds +3 damage (free first level with Effort trained). Bonus Damage field is for abilities and other modifiers.
          </div>
        </div>
      </form>`;

    return await new Promise(resolve => {
      const dialog = new Dialog({
        title,
        content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: 'Roll Attack',
            callback: async html => {
              const root = html?.[0] ?? html;
              const form = root?.querySelector('.ct-native-attack-roll-form');
              if (!form) return resolve(false);
              const data = Object.fromEntries(new FormData(form).entries());
              data.baseDamage = baseDamage;
              await this._performNativeAttackRoll(actor, item, data);
              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => resolve(false)
          }
        },
        default: 'roll',
        render: html => {
          const root = html?.[0] ?? html;
          const app = root?.closest('.app');
          app?.classList?.add('ct-skill-roll-dialog-app');
          const form = root?.querySelector('.ct-native-attack-roll-form');
          if (!form) return;
          const sync = () => {
            const data = Object.fromEntries(new FormData(form).entries());
            data.baseDamage = baseDamage;
            const summary = this._skillRollSummary(actor, item, data);
            const effortDmg = Math.max(0, Number(data.effortDamage ?? 0));
            const effortDmgBonus = effortDmg > 0 ? (effortDmg * 3) : 0;
            const bonusDmg = Math.max(0, Number(data.bonusDamage ?? 0));
            const total = baseDamage + effortDmgBonus + bonusDmg;
            form.querySelector('[data-skill-base-difficulty]')?.replaceChildren(document.createTextNode(String(summary.baseDifficulty)));
            form.querySelector('[data-skill-final-difficulty]')?.replaceChildren(document.createTextNode(String(summary.finalDifficulty)));
            form.querySelector('[data-skill-target-number]')?.replaceChildren(document.createTextNode(String(summary.target)));
            form.querySelector('[data-skill-pool-edge]')?.replaceChildren(document.createTextNode(String(summary.edge)));
            form.querySelector('[data-skill-effort-cost]')?.replaceChildren(document.createTextNode(String(summary.effortCost)));
            form.querySelector('[data-skill-pool-current]')?.replaceChildren(document.createTextNode(String(summary.poolValue)));
            form.querySelector('[data-skill-pool-remaining]')?.replaceChildren(document.createTextNode(String(summary.remainingPool)));
            form.querySelector('[data-atk-base-damage]')?.replaceChildren(document.createTextNode(String(baseDamage)));
            form.querySelector('[data-atk-effort-dmg-bonus]')?.replaceChildren(document.createTextNode('+' + effortDmgBonus));
            form.querySelector('[data-atk-bonus-damage]')?.replaceChildren(document.createTextNode('+' + bonusDmg));
            form.querySelector('[data-atk-total-damage]')?.replaceChildren(document.createTextNode(String(total)));
          };
          form.querySelectorAll('select, input').forEach(el => el.addEventListener('change', sync));
          form.querySelectorAll('input[type="number"]').forEach(el => el.addEventListener('input', sync));
          sync();
        },
        close: () => resolve(false)
      }, {
        width: 580,
        classes: ['ct-skill-roll-dialog-app']
      });
      dialog.render(true);
    });
  }

  async _performNativeAttackRoll(actor, item, options = {}) {
    const summary = this._skillRollSummary(actor, item, options);
    const baseDamage = Number(options.baseDamage ?? item?.system?.basic?.damage ?? item?.system?.damage ?? 0) || 0;
    const effortDmg = Math.max(0, Number(options.effortDamage ?? 0));
    const effortDmgBonus = effortDmg > 0 ? (effortDmg * 3) : 0;
    const bonusDmg = Math.max(0, Number(options.bonusDamage ?? 0));

    const roll = await (new Roll('1d20')).evaluate();
    const total = Number(roll.total ?? 0);
    const ratingLabel = this._skillRatingLabel(item);
    const specialEvent = this._skillRollSpecialEvent(total);

    // Natural roll bonus damage from special events (17=+1, 18=+2, 19=+3, 20=+4)
    const naturalDmgBonus = total >= 17 ? (total - 16) : 0;

    const achievedDifficulty = Math.max(0, Math.floor((total + (summary.skillStep + summary.assets + summary.effort + summary.easedBy - summary.hinderedBy) * 3) / 3));

    let spent = 0;
    if (summary.effortCost > 0) spent = await this._spendEffortFromPool(actor, summary.pool, summary.effortCost);

    // Damage effort pool spend
    if (effortDmg > 0) {
      const dmgEffortCost = Math.max(0, 3 + Math.max(0, effortDmg - 1) * 2 - this._edgeForPool(actor, summary.pool));
      if (dmgEffortCost > 0) await this._spendEffortFromPool(actor, summary.pool, dmgEffortCost);
    }

    const totalDamage = baseDamage + effortDmgBonus + bonusDmg + naturalDmgBonus;
    const hit = achievedDifficulty >= summary.finalDifficulty;

    const flavor = `
      <div class="ct-native-skill-roll-flavor">
        <div class="ct-native-skill-roll-flavor-head">
          <img class="ct-native-skill-roll-flavor-icon" src="${foundry.utils.escapeHTML(item.img || 'icons/svg/combat.svg')}" alt="${foundry.utils.escapeHTML(item.name)}" draggable="false">
          <div class="ct-native-skill-roll-flavor-title"><strong>${foundry.utils.escapeHTML(item.name)}</strong> · Attack (${foundry.utils.escapeHTML(summary.pool)})</div>
        </div>
        <div class="ct-native-skill-roll-flavor-meta">Rating ${foundry.utils.escapeHTML(ratingLabel)} · Base Diff ${summary.baseDifficulty} · Assets ${summary.assets} · Effort ${summary.effort}</div>
        <div class="ct-native-skill-roll-flavor-meta">Ease ${summary.easedBy} · Hinder ${summary.hinderedBy} · Edge ${summary.edge} · Effort Cost ${summary.effortCost}</div>
        <div class="ct-native-skill-roll-flavor-meta">Final Difficulty ${summary.finalDifficulty} · Target ${summary.target || 0}</div>
        <div class="ct-native-skill-roll-flavor-meta">${foundry.utils.escapeHTML(summary.pool)} Pool ${summary.poolValue} → ${Math.max(0, summary.poolValue - spent)}${spent !== summary.effortCost ? ` (spent ${spent})` : ''}</div>
        ${specialEvent ? `<div class="ct-native-skill-roll-flavor-event"><strong>${foundry.utils.escapeHTML(specialEvent.title)}:</strong> ${foundry.utils.escapeHTML(specialEvent.text)}</div>` : ''}
        <div class="ct-native-skill-roll-flavor-result">Achieved Difficulty ${achievedDifficulty}</div>
        <div class="ct-native-attack-damage-block">
          <div class="ct-native-attack-damage-label">Damage</div>
          <div class="ct-native-attack-damage-breakdown">
            <span>${baseDamage} base</span>
            ${effortDmgBonus > 0 ? `<span>+${effortDmgBonus} effort</span>` : ''}
            ${bonusDmg > 0 ? `<span>+${bonusDmg} bonus</span>` : ''}
            ${naturalDmgBonus > 0 ? `<span>+${naturalDmgBonus} natural roll</span>` : ''}
          </div>
          <div class="ct-native-attack-total-damage" style="color:#e53e3e;font-weight:bold;font-size:1.15em;">
            TOTAL DAMAGE: ${totalDamage}
          </div>
        </div>
      </div>`;

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor
    }, {
      rollMode: game.settings.get('core', 'rollMode')
    });
  }

  async _openNativeSkillRollDialog(actor, item, presetDifficulty = null) {
    this._closeSkillsMenuPanel();
    const poolMeta = this._detectSkillPoolMeta(item);
    const ratingLabel = this._skillRatingLabel(item);
    const defaultPool = poolMeta.pool;
    const effortCap = Math.max(0, Math.min(6, Number(actor?.system?.basic?.effort ?? actor?.system?.advancement?.effort ?? 0) || 0));
    const skillSteps = this._skillStepFromRating(item);
    const title = `Roll Skill: ${item.name} (${defaultPool})`;
    const diffDefault = presetDifficulty ?? 0;
    const content = `
      <form class="ct-native-skill-roll-form">
        <div class="ct-skill-roll-shell">
          <div class="ct-skill-roll-hero">
            <div class="ct-skill-roll-kicker">Cypher Skill Check</div>
            <div class="ct-skill-roll-title-wrap"><img class="ct-skill-roll-title-icon" src="${foundry.utils.escapeHTML(this._skillRollIcon(item))}" alt="" draggable="false"><div class="ct-skill-roll-title">${foundry.utils.escapeHTML(item.name)}</div></div>
            <div class="ct-skill-roll-badges">
              <span class="ct-skill-roll-badge">Pool: ${foundry.utils.escapeHTML(defaultPool)}</span>
              <span class="ct-skill-roll-badge">Rating: ${foundry.utils.escapeHTML(ratingLabel)}</span>
              <span class="ct-skill-roll-badge">Skill Step: ${skillSteps >= 0 ? '+' + skillSteps : String(skillSteps)}</span>
            </div>
          </div>
          <div class="ct-skill-roll-grid">
            <label class="ct-skill-roll-field">
              <span>Pool</span>
              <select name="pool">${['Might','Speed','Intellect'].map(p => `<option value="${p}" ${p === defaultPool ? 'selected' : ''}>${p}</option>`).join('')}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Difficulty</span>
              <select name="baseDifficulty">${this._skillRollSelectOptions(0, 15, diffDefault, {0:'0 – Routine',1:'1',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'11',12:'12',13:'13',14:'14',15:'15 – Impossible'})}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Assets</span>
              <select name="assets">${this._skillRollSelectOptions(0, 2, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Effort</span>
              <select name="effort">${this._skillRollSelectOptions(0, effortCap, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Other Ease</span>
              <select name="easedBy">${this._skillRollSelectOptions(0, 6, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Hindrance</span>
              <select name="hinderedBy">${this._skillRollSelectOptions(0, 6, 0)}</select>
            </label>
          </div>
          <div class="ct-skill-roll-summary" data-skill-roll-summary>
            <div class="ct-skill-roll-summary-item"><span>Base Difficulty</span><strong data-skill-base-difficulty>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Final Difficulty</span><strong data-skill-final-difficulty>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Target Number</span><strong data-skill-target-number>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Pool Edge</span><strong data-skill-pool-edge>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Effort Cost</span><strong data-skill-effort-cost>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Current Pool</span><strong data-skill-pool-current>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>After Spend</span><strong data-skill-pool-remaining>0</strong></div>
          </div>
          <div class="ct-skill-roll-note">Pool was auto-detected from the skill and appended to the roll title. You can still change it if this skill uses a different pool in play.</div>
        </div>
      </form>`;

    return await new Promise(resolve => {
      const dialog = new Dialog({
        title,
        content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: 'Roll',
            callback: async html => {
              const root = html?.[0] ?? html;
              const form = root?.querySelector('.ct-native-skill-roll-form');
              if (!form) return resolve(false);
              const data = Object.fromEntries(new FormData(form).entries());
              await this._performNativeSkillRoll(actor, item, data);
              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => resolve(false)
          }
        },
        default: 'roll',
        render: html => {
          const root = html?.[0] ?? html;
          const app = root?.closest('.app');
          app?.classList?.add('ct-skill-roll-dialog-app');
          const form = root?.querySelector('.ct-native-skill-roll-form');
          if (!form) return;
          const sync = () => {
            const data = Object.fromEntries(new FormData(form).entries());
            const summary = this._skillRollSummary(actor, item, data);
            form.querySelector('[data-skill-base-difficulty]')?.replaceChildren(document.createTextNode(String(summary.baseDifficulty)));
            form.querySelector('[data-skill-final-difficulty]')?.replaceChildren(document.createTextNode(String(summary.finalDifficulty)));
            form.querySelector('[data-skill-target-number]')?.replaceChildren(document.createTextNode(String(summary.target)));
            form.querySelector('[data-skill-pool-edge]')?.replaceChildren(document.createTextNode(String(summary.edge)));
            form.querySelector('[data-skill-effort-cost]')?.replaceChildren(document.createTextNode(String(summary.effortCost)));
            form.querySelector('[data-skill-pool-current]')?.replaceChildren(document.createTextNode(String(summary.poolValue)));
            form.querySelector('[data-skill-pool-remaining]')?.replaceChildren(document.createTextNode(String(summary.remainingPool)));
          };
          form.querySelectorAll('select').forEach(el => el.addEventListener('change', sync));
          sync();
        },
        close: () => resolve(false)
      }, {
        width: 560,
        classes: ['ct-skill-roll-dialog-app']
      });
      dialog.render(true);
      setTimeout(() => dialog.bringToTop?.(), 100);
    });
  }

  async _rollSkillItem(itemId) {
    const actor = this.actor;
    if (!actor || actor.type !== "pc") return;
    const item = actor.items.get(itemId);
    if (!item) return;
    try {
      const gmDiff = this._getGMDifficulty(actor);
      await this._openNativeSkillRollDialog(actor, item, gmDiff);
    } catch (err) {
      console.error(`${MODULE_ID} | native skill roll failed`, err);
      ui.notifications?.error?.(`Skill roll failed for ${item.name}.`);
    }
  }

  async _rollSpellItem(itemId) {
    return this._rollAbilityItem(itemId);
  }

  async _rollAbilityItem(itemId) {
    const actor = this.actor;
    if (!actor) return;
    const item = actor.items.get(itemId);
    if (!item) return;
    await this._rollItem(item);
  }

  async _rollAttackItem(attackId) {
    const actor = this.actor;
    if (!actor) return;
    const item = actor.items.get(attackId);
    if (!item) return;
    const gmDiff = this._getGMDifficulty(actor);
    return await this._openNativeAttackRollDialog(actor, item, gmDiff);
  }

  async _adjustXP(delta) {
    const actor = this.actor;
    if (!actor || actor.type !== "pc") return;
    const current = Number(actor.system?.basic?.xp ?? 0);
    const next = Math.max(0, Math.min(10, current + delta));
    await actor.update({"system.basic.xp": next});
  }

  /* ─── GM Taskbar Difficulty Integration ─── */
  _getGMDifficulty(actor) {
    if (!actor) return null;
    // 1. Individual actor difficulty (set via GM Taskbar Target button)
    const individual = actor.getFlag("cypher-gm-taskbar", "targetDifficulty");
    if (Number.isFinite(individual)) return Math.max(0, Math.min(15, individual));
    // 2. Global difficulty from GM Taskbar settings
    try {
      const global = game.settings.get("cypher-gm-taskbar", "globalDifficulty");
      if (Number.isFinite(global)) return Math.max(0, Math.min(15, global));
    } catch (e) { /* GM Taskbar not loaded or setting not registered */ }
    return null;
  }

  async _openStatRoll(statName, options = {}) {
    const actor = this.actor;
    if (!actor || actor.type !== "pc") return null;
    const optionTitle = typeof options?.title === "string" ? options.title.trim() : "";
    const gmDiff = this._getGMDifficulty(actor);
    const presetDifficulty = Number.isFinite(Number(options?.presetDifficulty))
      ? Math.max(0, Math.round(Number(options.presetDifficulty)))
      : (gmDiff !== null ? gmDiff : null);

    return await this._openNativeAttributeRollDialog(actor, statName, {
      title: optionTitle,
      presetDifficulty
    });
  }

  async _openNativeAttributeRollDialog(actor, statName, options = {}) {
    const effortCap = Math.max(0, Math.min(6, Number(actor?.system?.basic?.effort ?? actor?.system?.advancement?.effort ?? 0) || 0));
    const poolValue = this._poolValueForName(actor, statName);
    const edge = this._edgeForPool(actor, statName);
    const rawPool = String(statName || "might").trim().toLowerCase();
    const defaultPool = rawPool.charAt(0).toUpperCase() + rawPool.slice(1);
    const presetDifficulty = Number.isFinite(Number(options?.presetDifficulty)) ? Math.max(0, Math.round(Number(options.presetDifficulty))) : null;
    const title = options.title || `Roll ${defaultPool}`;
    const difficultyLabels = {0:'0 \u2013 Routine',1:'1 \u2013 Simple',2:'2 \u2013 Standard',3:'3 \u2013 Demanding',4:'4 \u2013 Difficult',5:'5 \u2013 Challenging',6:'6 \u2013 Intimidating',7:'7 \u2013 Formidable',8:'8 \u2013 Heroic',9:'9 \u2013 Immortal',10:'10',11:'11',12:'12',13:'13',14:'14',15:'15 \u2013 Impossible'};
    const content = `
      <form class="ct-native-attribute-roll-form">
        <div class="ct-skill-roll-shell">
          <div class="ct-skill-roll-hero">
            <div class="ct-skill-roll-kicker">Attribute Check</div>
            <div class="ct-skill-roll-title-wrap"><img class="ct-skill-roll-title-icon" src="icons/svg/d20.svg" alt="" draggable="false"><div class="ct-skill-roll-title">${foundry.utils.escapeHTML(defaultPool)}</div></div>
            <div class="ct-skill-roll-badges">
              <span class="ct-skill-roll-badge">Pool: ${foundry.utils.escapeHTML(defaultPool)}</span>
              <span class="ct-skill-roll-badge">Current: ${poolValue}</span>
              <span class="ct-skill-roll-badge">Edge: ${edge}</span>
            </div>
          </div>
          <div class="ct-skill-roll-grid">
            <label class="ct-skill-roll-field">
              <span>Pool</span>
              <select disabled title="Locked to ${foundry.utils.escapeHTML(defaultPool)}">${['Might','Speed','Intellect'].map(p => `<option value="${p}" ${p === defaultPool ? 'selected' : ''}>${p}</option>`).join('')}</select>
              <input type="hidden" name="pool" value="${foundry.utils.escapeHTML(defaultPool)}">
            </label>
            <label class="ct-skill-roll-field">
              <span>Difficulty</span>
              <select name="baseDifficulty">${this._skillRollSelectOptions(0, 15, presetDifficulty ?? 0, difficultyLabels)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Assets</span>
              <select name="assets">${this._skillRollSelectOptions(0, 2, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Effort</span>
              <select name="effort">${this._skillRollSelectOptions(0, effortCap, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Other Ease</span>
              <select name="easedBy">${this._skillRollSelectOptions(0, 6, 0)}</select>
            </label>
            <label class="ct-skill-roll-field">
              <span>Hindrance</span>
              <select name="hinderedBy">${this._skillRollSelectOptions(0, 6, 0)}</select>
            </label>
          </div>
          <div class="ct-skill-roll-summary" data-attr-roll-summary>
            <div class="ct-skill-roll-summary-item"><span>Base Difficulty</span><strong data-attr-base-difficulty>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Final Difficulty</span><strong data-attr-final-difficulty>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Target Number</span><strong data-attr-target-number>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Pool Edge</span><strong data-attr-pool-edge>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Effort Cost</span><strong data-attr-effort-cost>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>Current Pool</span><strong data-attr-pool-current>0</strong></div>
            <div class="ct-skill-roll-summary-item"><span>After Spend</span><strong data-attr-pool-remaining>0</strong></div>
          </div>
          <div class="ct-skill-roll-note">This is a raw attribute check without skill training.</div>
        </div>
      </form>`;

    return await new Promise(resolve => {
      const dialog = new Dialog({
        title,
        content,
        buttons: {
          roll: {
            icon: '<i class="fas fa-dice-d20"></i>',
            label: 'Roll',
            callback: async html => {
              const root = html?.[0] ?? html;
              const form = root?.querySelector('.ct-native-attribute-roll-form');
              if (!form) return resolve(null);
              const data = Object.fromEntries(new FormData(form).entries());
              await this._performAttributeRoll(actor, defaultPool, data);
              resolve(true);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel',
            callback: () => resolve(null)
          }
        },
        default: 'roll',
        render: html => {
          const root = html?.[0] ?? html;
          const app = root?.closest('.app');
          app?.classList?.add('ct-skill-roll-dialog-app');
          const form = root?.querySelector('.ct-native-attribute-roll-form');
          if (!form) return;
          const sync = () => {
            const data = Object.fromEntries(new FormData(form).entries());
            const summary = this._attributeRollSummary(actor, data);
            form.querySelector('[data-attr-base-difficulty]')?.replaceChildren(document.createTextNode(String(summary.baseDifficulty)));
            form.querySelector('[data-attr-final-difficulty]')?.replaceChildren(document.createTextNode(String(summary.finalDifficulty)));
            form.querySelector('[data-attr-target-number]')?.replaceChildren(document.createTextNode(String(summary.target)));
            form.querySelector('[data-attr-pool-edge]')?.replaceChildren(document.createTextNode(String(summary.edge)));
            form.querySelector('[data-attr-effort-cost]')?.replaceChildren(document.createTextNode(String(summary.effortCost)));
            form.querySelector('[data-attr-pool-current]')?.replaceChildren(document.createTextNode(String(summary.poolValue)));
            form.querySelector('[data-attr-pool-remaining]')?.replaceChildren(document.createTextNode(String(summary.remainingPool)));
          };
          form.querySelectorAll('select').forEach(el => el.addEventListener('change', sync));
          sync();
        },
        close: () => resolve(null)
      }, {
        width: 560,
        classes: ['ct-skill-roll-dialog-app']
      });
      dialog.render(true);
      setTimeout(() => dialog.bringToTop?.(), 100);
    });
  }

  _attributeRollSummary(actor, data = {}) {
    const pool = String(data.pool || 'Might').trim();
    const baseDifficulty = Math.max(0, Math.min(15, Number(data.baseDifficulty ?? 0) || 0));
    const assets = Math.max(0, Math.min(2, Number(data.assets ?? 0) || 0));
    const effort = Math.max(0, Number(data.effort ?? 0) || 0);
    const easedBy = Math.max(0, Number(data.easedBy ?? 0) || 0);
    const hinderedBy = Math.max(0, Number(data.hinderedBy ?? 0) || 0);
    const edge = this._edgeForPool(actor, pool);
    const poolValue = this._poolValueForName(actor, pool);
    const finalDifficulty = Math.max(0, Math.min(15, baseDifficulty - assets - effort - easedBy + hinderedBy));
    const target = finalDifficulty * 3;
    const effortCost = Math.max(0, effort > 0 ? 3 + Math.max(0, effort - 1) * 2 - edge : 0);
    const remainingPool = Math.max(0, poolValue - effortCost);
    return { pool, baseDifficulty, assets, effort, easedBy, hinderedBy, edge, poolValue, finalDifficulty, target, effortCost, remainingPool };
  }

  async _performAttributeRoll(actor, statName, options = {}) {
    const summary = this._attributeRollSummary(actor, options);
    const roll = await (new Roll('1d20')).evaluate();
    const total = Number(roll.total ?? 0);
    const specialEvent = this._skillRollSpecialEvent(total);
    const modifier = (summary.assets + summary.effort + summary.easedBy - summary.hinderedBy) * 3;
    const achievedDifficulty = Math.max(0, Math.floor((total + modifier) / 3));
    let spent = 0;
    if (summary.effortCost > 0) spent = await this._spendEffortFromPool(actor, summary.pool, summary.effortCost);
    const flavor = `
      <div class="ct-native-skill-roll-flavor">
        <div class="ct-native-skill-roll-flavor-head">
          <img class="ct-native-skill-roll-flavor-icon" src="icons/svg/d20.svg" alt="" draggable="false">
          <div class="ct-native-skill-roll-flavor-title"><strong>${foundry.utils.escapeHTML(statName)}</strong> \u00b7 Attribute Check</div>
        </div>
        <div class="ct-native-skill-roll-flavor-meta">Base ${summary.baseDifficulty} \u00b7 Assets ${summary.assets} \u00b7 Effort ${summary.effort}</div>
        <div class="ct-native-skill-roll-flavor-meta">Ease ${summary.easedBy} \u00b7 Hindrance ${summary.hinderedBy} \u00b7 Edge ${summary.edge} \u00b7 Effort Cost ${summary.effortCost}</div>
        <div class="ct-native-skill-roll-flavor-meta">Final Difficulty ${summary.finalDifficulty} \u00b7 Target ${summary.target || 0}</div>
        <div class="ct-native-skill-roll-flavor-meta">${foundry.utils.escapeHTML(summary.pool)} Pool ${summary.poolValue} \u2192 ${Math.max(0, summary.poolValue - spent)}${spent !== summary.effortCost ? ` (spent ${spent})` : ''}</div>
        ${specialEvent ? `<div class="ct-native-skill-roll-flavor-event"><strong>${foundry.utils.escapeHTML(specialEvent.title)}:</strong> ${foundry.utils.escapeHTML(specialEvent.text)}</div>` : ''}
        <div class="ct-native-skill-roll-flavor-result">Achieved Difficulty ${achievedDifficulty}</div>
      </div>`;
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor
    }, { rollMode: game.settings.get('core', 'rollMode') });
  }


  async _openMoveActionRollDialog({ statName = "Speed", difficulty = 4, mode = "short-attack" } = {}) {
    const total = await this._openStatRoll(statName, {
      title: mode === "long-move" ? "LONG MOVE" : "SHORT MOVE and ATTACK",
      presetDifficulty: difficulty
    });
    if (total == null) return null;
    const success = Number(total) >= (Number(difficulty) * 3);
    if (mode === "long-move") {
      if (success) await this._fadeCombatActionButton("long-move");
      else await this._fadeCombatActionButtons(["move", "long-move", "attack", "guard", "use-ability", "use-item", "use-cypher", "cast-spell"]);
      return total;
    }
    await this._fadeCombatActionButtons(["move"]);
    return total;
  }

  async _adjustPool(poolKey, delta) {
    const actor = this.actor;
    if (!actor || actor.type !== "pc") return;
    const pool = foundry.utils.getProperty(actor, `system.pools.${poolKey}`) ?? {};
    const current = Number(pool.value ?? pool.current ?? 0);
    const max = Number(pool.max ?? current);
    const next = Math.max(0, Math.min(max, current + delta));
    if (next === current) return;
    await actor.update({ [`system.pools.${poolKey}.value`]: next });
  }

  _rgbaToHex(rgba, fallback = "#000000") {
    if (!rgba || typeof rgba !== "string") return fallback;
    const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) {
      // If it's already a hex, return it
      return rgba.startsWith("#") ? rgba : fallback;
    }
    const r = parseInt(m[1], 10).toString(16).padStart(2, "0");
    const g = parseInt(m[2], 10).toString(16).padStart(2, "0");
    const b = parseInt(m[3], 10).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }


  _isSidebarTab(app, element) {
    const el = element || (app?.element?.[0] ?? app?.element);
    if (!el) return false;
    if (el.classList?.contains("sidebar-tab")) return true;
    if (el.closest?.("#sidebar")) return true;
    const appId = app?.id ?? app?.options?.id ?? el.id ?? "";
    const sidebarIds = ["chat","combat","scenes","actors","items","journal","tables","cards","playlists","compendium","settings"];
    if (sidebarIds.includes(appId)) return true;
    const tabApp = app?.constructor?.name;
    if (tabApp && (tabApp.includes("Sidebar") || tabApp.includes("Directory"))) return true;
    return false;
  }

  _resolveWindowDoc(app, element) {
    const el = element || (app?.element?.[0] ?? app?.element);
    // Try to find document UUID from various app properties
    const doc = app?.document || app?.object || app?.actor || app?.item || app?.scene;
    if (doc?.uuid && doc?.name) {
      return { uuid: doc.uuid, name: doc.name, img: doc.img, type: doc.documentName || doc.constructor?.name };
    }
    // Image popouts and generic windows
    const title = app?.title ?? app?.options?.title ?? el?.querySelector(".window-title")?.textContent ?? "Window";
    const img = app?.options?.src ?? app?.options?.image ?? el?.querySelector("img")?.src;
    if (img) return { uuid: null, name: title, img, type: "Image" };
    return { uuid: null, name: title, img: null, type: "Window" };
  }

  /**
   * Check if a window is for a document type that supports hand-drag.
   * Whitelist: Actor, JournalEntry, Item, and Image popouts.
   */
  _isHandEligible(app, element) {
    const el = element || (app?.element?.[0] ?? app?.element);
    if (!el) return false;
    if (this._isSidebarTab(app, el)) return false;
    const doc = app?.document || app?.object || app?.actor || app?.item;
    if (doc) {
      const type = doc.documentName || doc.constructor?.name;
      if (["Actor", "JournalEntry", "Item"].includes(type)) return true;
    }
    // Image popouts: no document but have an image src
    const cls = app?.constructor?.name || "";
    if (cls.includes("ImagePopout") || cls.includes("ImageViewer")) return true;
    if (app?.options?.src || app?.options?.image) return true;
    return false;
  }

  _injectHandIcon(app, element) {
    if (!this._isHandEligible(app, element)) return;
    const el = element || (app?.element?.[0] ?? app?.element);
    if (!el) return;
    const header = el.querySelector(".window-header") ?? el.querySelector("header");
    if (!header || header.querySelector(".ct-hand-btn")) return;
    const hand = document.createElement("a");
    hand.className = "header-button ct-hand-btn";
    hand.title = "Drag to add to People/Places/Assets/Secrets";
    hand.draggable = true;
    hand.innerHTML = '<i class="fas fa-hand-paper"></i>';
    const docInfo = this._resolveWindowDoc(app, el);
    hand.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      if (docInfo) {
        e.dataTransfer.setData("text/plain", JSON.stringify(docInfo));
        e.dataTransfer.effectAllowed = "copy";
      }
    });
    // Prevent window drag: block all pointer/mouse events from reaching header drag handlers
    const _block = (e) => { e.stopPropagation(); };
    hand.addEventListener("mousedown", (e) => { e.stopPropagation(); });
    hand.addEventListener("pointerdown", (e) => { e.stopPropagation(); });
    hand.addEventListener("touchstart", (e) => { e.stopPropagation(); }, { passive: false });
    // Journal: place hand between close button and copy UUID button
    const isJournal = (docInfo?.type === "JournalEntry") ||
      (app?.constructor?.name?.includes("Journal"));
    if (isJournal) {
      const closeBtn = header.querySelector(".close, .header-control.close, [data-action='close']");
      if (closeBtn && closeBtn.nextElementSibling) {
        header.insertBefore(hand, closeBtn.nextElementSibling);
      } else if (closeBtn) {
        closeBtn.after(hand);
      } else {
        header.appendChild(hand);
      }
    } else {
      // Default: place hand left of the close button
      const closeBtn = header.querySelector(".close, .header-control.close, [data-action='close']");
      if (closeBtn) header.insertBefore(hand, closeBtn);
      else header.appendChild(hand);
    }
  }

  _injectMinimizeButton(app) {
    if (this._isSidebarTab(app)) return;
    const element = app.element?.[0] ?? app.element;
    if (!element) return;
    this._injectHandIcon(app, element);
    const header = element.querySelector(".window-header") ?? element.querySelector("header");
    if (!header || header.querySelector(".ct-minimize-btn")) return;
    const btn = document.createElement("a");
    btn.className = "header-button ct-minimize-btn";
    btn.title = "Minimize";
    btn.innerHTML = '<i class="fas fa-minus"></i>';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._minimizeWindow(app);
    };
    const closeBtn = header.querySelector(".close, .header-control.close, [data-action='close']");
    if (closeBtn) header.insertBefore(btn, closeBtn);
    else {
      const actions = header.querySelector(".header-controls, .header-actions");
      if (actions) actions.insertBefore(btn, actions.firstChild);
      else header.appendChild(btn);
    }
  }

  _startWindowObserver() {
    if (this._windowObserver) return;
    this._windowObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const apps = node.matches?.('.app, application') ? [node] : [];
          if (node.querySelectorAll) {
            apps.push(...node.querySelectorAll('.app, application'));
          }
          for (const appEl of apps) {
            this._injectMinimizeButtonForElement(appEl);
          }
        }
      }
    });
    this._windowObserver.observe(document.body, { childList: true, subtree: true });
  }

  _injectMinimizeButtonForElement(element) {
    if (this._isSidebarTab(null, element)) return;
    let app = null;
    for (const win of Object.values(ui.windows ?? {})) {
      const el = win.element?.[0] ?? win.element;
      if (el === element) { app = win; break; }
    }
    if (!app && foundry?.applications?.instances) {
      for (const win of foundry.applications.instances.values()) {
        const el = win.element?.[0] ?? win.element;
        if (el === element) { app = win; break; }
      }
    }
    this._injectHandIcon(app, element);
    if (element.querySelector('.ct-minimize-btn')) return;
    if (app) {
      this._injectMinimizeButton(app);
    } else {
      this._injectMinimizeButtonDOM(element);
    }
  }

  _injectMinimizeButtonDOM(element) {
    if (this._isSidebarTab(null, element)) return;
    this._injectHandIcon(null, element);
    const header = element.querySelector('.window-header') ?? element.querySelector('header');
    if (!header || header.querySelector('.ct-minimize-btn')) return;
    const btn = document.createElement('a');
    btn.className = 'header-button ct-minimize-btn';
    btn.title = 'Minimize';
    btn.innerHTML = '<i class="fas fa-minus"></i>';
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Save original position
      if (!element._ctOriginalParent) {
        element._ctOriginalParent = element.parentNode;
        element._ctOriginalNextSibling = element.nextSibling;
      }
      // Move to hidden container
      const hiddenContainer = document.querySelector("#ct-minimized-windows");
      if (hiddenContainer) {
        hiddenContainer.appendChild(element);
      } else {
        element.style.display = 'none';
      }
      element.classList.add('ct-minimized');
      this.refreshTray();
    };
    const closeBtn = header.querySelector('.close, .header-control.close, [data-action="close"]');
    if (closeBtn) header.insertBefore(btn, closeBtn);
    else {
      const actions = header.querySelector('.header-controls, .header-actions');
      if (actions) actions.insertBefore(btn, actions.firstChild);
      else header.appendChild(btn);
    }
  }

  _injectAllMinimizeButtons() {
    for (const app of Object.values(ui.windows ?? {})) {
      if (!this._isSidebarTab(app)) { this._injectHandIcon(app); this._injectMinimizeButton(app); }
    }
    if (foundry?.applications?.instances) {
      for (const app of foundry.applications.instances.values()) {
        if (!this._isSidebarTab(app)) { this._injectHandIcon(app); this._injectMinimizeButton(app); }
      }
    }
    this._injectSceneHand();
  }

  /**
   * Inject a draggable blue hand icon into the active scene entry
   * in the scene navigation bar.
   */
  _injectSceneHand() {
    const nav = document.querySelector("#scene-navigation");
    if (!nav) return;
    // Remove existing hand to avoid duplicates
    nav.querySelectorAll(".ct-scene-hand").forEach(h => h.remove());
    // Find the active/viewed scene entry
    const activeEntry = nav.querySelector("li.scene.view") || nav.querySelector("li.scene.active");
    if (!activeEntry) return;
    const sceneId = activeEntry.dataset.sceneId;
    if (!sceneId) return;
    const scene = game.scenes?.get(sceneId);
    if (!scene) return;
    const hand = document.createElement("span");
    hand.className = "ct-scene-hand";
    hand.title = `Drag: ${scene.name}`;
    hand.draggable = true;
    hand.innerHTML = '<i class="fas fa-hand-paper"></i>';
    const payload = { uuid: scene.uuid, name: scene.name, img: scene.thumbnail, type: "Scene" };
    hand.addEventListener("dragstart", (e) => {
      e.stopPropagation();
      e.dataTransfer.setData("text/plain", JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "copy";
    });
    hand.addEventListener("mousedown", (e) => e.stopPropagation());
    activeEntry.appendChild(hand);
  }

  _minimizeWindow(app) {
    const el = app.element?.[0] ?? app.element;
    if (el) {
      app._ctOriginalDisplay = el.style.display;
      el.style.display = "none";
      el.classList.add("ct-minimized");
    }
    app._ctMinimized = true;
    this.refreshTray();
  }

  _restoreAppElement(app) {
    const el = app.element?.[0] ?? app.element;
    if (el) {
      el.style.display = app._ctOriginalDisplay ?? "";
      el.classList.remove("ct-minimized");
    }
    app._ctMinimized = false;
    if (typeof app.bringToTop === "function") app.bringToTop();
    this.refreshTray();
  }

  /** Open the global Menu Backgrounds dialog */
  _openMenuBackgroundsDialog() {
    const menus = [
      { key: "equipment", label: "Equipment", icon: "fa-backpack" },
      { key: "skills", label: "Skills", icon: "fa-graduation-cap" },
      { key: "abilities", label: "Abilities", icon: "fa-magic" },
      { key: "spells", label: "Spells", icon: "fa-hat-wizard" },
      { key: "persona", label: "Persona", icon: "fa-user-circle" },
      { key: "combat", label: "Combat", icon: "fa-sword" }
    ];
    const fitOptions = [
      { value: "cover", label: "Cover" },
      { value: "contain", label: "Contain" },
      { value: "fit", label: "Stretch" },
      { value: "fit-vertical", label: "Fit Vertical" },
      { value: "fit-horizontal", label: "Fit Horizontal" }
    ];
    const alignOptions = [
      { value: "center", label: "Center" },
      { value: "top", label: "Top" },
      { value: "bottom", label: "Bottom" },
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
      { value: "top left", label: "Top Left" },
      { value: "top right", label: "Top Right" },
      { value: "bottom left", label: "Bottom Left" },
      { value: "bottom right", label: "Bottom Right" }
    ];

    let data = {};
    try {
      const raw = game.settings.get(MODULE_ID, "menuBackgrounds");
      data = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw || {});
    } catch { data = {}; }

    const dialog = new Dialog({
      title: "Menu BACKGROUNDS",
      content: `
        <style>
          .ct-bg-dialog { max-height: 70vh; overflow-y: auto; padding-right: 4px; }
          .ct-bg-dialog::-webkit-scrollbar { width: 6px; }
          .ct-bg-dialog::-webkit-scrollbar-thumb { background: rgba(200,169,110,0.3); border-radius: 3px; }
          .ct-bg-section { margin-bottom: 18px; padding: 12px; background: linear-gradient(135deg, rgba(20,16,32,0.9), rgba(15,12,26,0.9)); border: 1px solid rgba(200,169,110,0.15); border-radius: 8px; }
          .ct-bg-section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 1.05em; font-weight: 700; color: #c8a96e; text-transform: uppercase; letter-spacing: 0.08em; }
          .ct-bg-section-header i { font-size: 1.1em; }
          .ct-bg-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
          .ct-bg-row label { min-width: 110px; font-size: 0.85em; color: #b0a0c8; font-weight: 600; }
          .ct-bg-row input[type="text"] { flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(200,169,110,0.2); color: #e0d4f0; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; }
          .ct-bg-row input[type="range"] { flex: 1; }
          .ct-bg-row select { flex: 1; background: rgba(0,0,0,0.3); border: 1px solid rgba(200,169,110,0.2); color: #e0d4f0; padding: 4px 8px; border-radius: 4px; font-size: 0.85em; }
          .ct-bg-row .ct-bg-range-val { min-width: 36px; text-align: right; font-size: 0.8em; color: #c8a96e; font-weight: 700; }
          .ct-bg-file-btn { background: linear-gradient(180deg, #3a3060, #241a40); border: 1px solid rgba(200,169,110,0.3); color: #c8a96e; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.8em; font-weight: 600; transition: all 0.2s; }
          .ct-bg-file-btn:hover { background: linear-gradient(180deg, #4a4080, #342a60); border-color: rgba(200,169,110,0.5); }
          .ct-bg-preview { width: 40px; height: 40px; border-radius: 4px; border: 1px solid rgba(200,169,110,0.2); background-size: cover; background-position: center; flex-shrink: 0; }
        </style>
        <div class="ct-bg-dialog">
          ${menus.map(m => {
            const cfg = data[m.key] || {};
            return `
            <div class="ct-bg-section" data-menu="${m.key}">
              <div class="ct-bg-section-header"><i class="fas ${m.icon}"></i> ${m.label}</div>
              <div class="ct-bg-row">
                <label>Image</label>
                <div class="ct-bg-preview" id="ct-bg-preview-${m.key}" style="${cfg.image ? `background-image:url('${cfg.image.replace(/'/g,"%27")}')` : "display:none"}"></div>
                <input type="text" id="ct-bg-image-${m.key}" value="${cfg.image || ""}" placeholder="URL or path...">
                <button type="button" class="ct-bg-file-btn" data-file-picker="${m.key}"><i class="fas fa-folder-open"></i></button>
              </div>
              <div class="ct-bg-row">
                <label>Opacity</label>
                <input type="range" id="ct-bg-opacity-${m.key}" min="0" max="1" step="0.05" value="${cfg.opacity ?? 0.2}">
                <span class="ct-bg-range-val" id="ct-bg-opacity-val-${m.key}">${cfg.opacity ?? 0.2}</span>
              </div>
              <div class="ct-bg-row">
                <label>Fit</label>
                <select id="ct-bg-fit-${m.key}">
                  ${fitOptions.map(o => `<option value="${o.value}" ${(cfg.fit || "cover") === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
                </select>
              </div>
              <div class="ct-bg-row">
                <label>Alignment</label>
                <select id="ct-bg-align-${m.key}">
                  ${alignOptions.map(o => `<option value="${o.value}" ${(cfg.align || "center") === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
                </select>
              </div>
            </div>`;
          }).join("")}
        </div>
      `,
      buttons: {
        save: {
          icon: "<i class='fas fa-save'></i>",
          label: "Save",
          callback: async (html) => {
            const newData = {};
            for (const m of menus) {
              const image = html.find(`#ct-bg-image-${m.key}`).val()?.trim() || "";
              if (!image) continue;
              newData[m.key] = {
                image,
                opacity: parseFloat(html.find(`#ct-bg-opacity-${m.key}`).val()) || 0.2,
                fit: html.find(`#ct-bg-fit-${m.key}`).val() || "cover",
                align: html.find(`#ct-bg-align-${m.key}`).val() || "center"
              };
            }
            await game.settings.set(MODULE_ID, "menuBackgrounds", JSON.stringify(newData));
            ui.notifications.info("Menu backgrounds saved!");
            CypherTaskbar.instance?.render();
          }
        },
        cancel: {
          icon: "<i class='fas fa-times'></i>",
          label: "Cancel"
        }
      },
      default: "save",
      render: (html) => {
        // Range value updates
        html.find('input[type="range"]').on("input", function() {
          const id = this.id.replace("ct-bg-opacity-", "ct-bg-opacity-val-");
          html.find(`#${id}`).text(this.value);
        });
        // File pickers
        html.find("[data-file-picker]").on("click", async function() {
          const key = this.dataset.filePicker;
          const fp = new FilePicker({
            type: "image",
            current: html.find(`#ct-bg-image-${key}`).val(),
            callback: (path) => {
              html.find(`#ct-bg-image-${key}`).val(path);
              const preview = html.find(`#ct-bg-preview-${key}`);
              preview.css({ "background-image": `url('${path.replace(/'/g, "%27")}')`, display: "block" });
            }
          });
          await fp.browse();
        });
      }
    }, { width: 520, classes: ["dialog", "cypher-taskbar-dialog"] });
    dialog.render(true);
  }
}

// Apply panel mixins
applyPersonaPanel(CypherTaskbar);
applySkillsPanel(CypherTaskbar);
applyEquipmentPanel(CypherTaskbar);
applyAbilitiesPanel(CypherTaskbar);
applySpellsPanel(CypherTaskbar);
applyCombatPanel(CypherTaskbar);

// ══════════════════════════════════════════
//  Hooks
// ══════════════════════════════════════════

Hooks.once("init", () => {
  registerSettings();
  
  // Only register menu if FormApplication exists (Foundry VTT v13 and earlier)
  // In v14+, FormApplication was removed; we'll handle backgrounds via the taskbar UI directly
  if (typeof FormApplication !== "undefined") {
    game.settings.registerMenu(MODULE_ID, "menuBackgroundsMenu", {
      name: "Menu BACKGROUNDS",
      label: "Menu BACKGROUNDS",
      hint: "Customize background images for all taskbar menus.",
      icon: "fas fa-image",
      type: class MenuBackgroundsDialog extends FormApplication {
        static get defaultOptions() {
          return foundry.utils.mergeObject(super.defaultOptions, {
            title: "Menu BACKGROUNDS",
            template: undefined,
            width: 520,
            classes: ["dialog", "cypher-taskbar-dialog"]
          });
        }
        async _renderInner() { return $("<div></div>"); }
        render() {
          CypherTaskbar.instance?._openMenuBackgroundsDialog();
          return this;
        }
      },
      restricted: true
    });
  } else {
    if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | FormApplication not available (Foundry v14+) — settings menu skipped, backgrounds accessible from taskbar UI`);
  }
});

Hooks.once("ready", () => {
  try {
    if (game.system.id !== "cyphersystem") {
      console.warn(`${MODULE_ID} | Requires the Cypher System.`);
      return;
    }
    if (game.user?.isGM && game.settings.get(MODULE_ID, "loadOnlyForPlayers")) {
      if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | Load Only For Players is enabled — GM taskbar disabled.`);
      return;
    }

    // Migrate old client-scoped actorPreferences to actor flags (one-time)
    migrateActorPreferences();

    const modVer = game.modules.get(MODULE_ID)?.version ?? "?";
    if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | v${modVer} loaded | Cypher System ${game.system.version || '?'}`);
    
    try {
      CypherTaskbar.instance = new CypherTaskbar();
      window.CypherTaskbar = CypherTaskbar;
      if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | CypherTaskbar instance created`);
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to create CypherTaskbar instance:`, err);
      return;
    }
    
    try {
      CypherTaskbar.instance.render();
      if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | CypherTaskbar rendered successfully`);
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to render CypherTaskbar:`, err);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | ready hook failed:`, err);
  }

  game.socket.on(`module.${MODULE_ID}`, async (payload) => {
    if (!payload) return;
    if (payload.type === "gmCombatRequest" && game.user?.isGM) {
      CypherTaskbar.instance?._openGMCombatRequest(payload);
      return;
    }
    if (payload.type === "gmLeaveCombatRequest" && game.user?.isGM) {
      CypherTaskbar.instance?._openGMLeaveCombatRequest(payload);
      return;
    }
    if (payload.type === "gmRestRequest" && game.user?.isGM) {
      CypherTaskbar.instance?._openGMRestRequest(payload);
      return;
    }
    if (payload.type === "restApproved") {
      CypherTaskbar.instance?._onRestApproved(payload);
      return;
    }
    /* ── GM Taskbar CALL ROLL triggers ── */
    if (payload.type === "openAttributeRollDialog" && payload.actorId) {
      try {
        const actor = game.actors.get(payload.actorId);
        if (actor && actor.isOwner) {
          ui.notifications.info(`GM is calling for a ${payload.poolName} roll!`);
          await CypherTaskbar.instance?._openNativeAttributeRollDialog(actor, payload.poolName, { presetDifficulty: payload.difficulty });
        }
      } catch (err) {
        console.warn("[CypherTaskbar] openAttributeRollDialog failed:", err);
        ui.notifications.error("Roll dialog failed to open. Check console (F12) for details.");
      }
      return;
    }
    if (payload.type === "openSkillRollDialog" && payload.actorId && payload.skillId) {
      try {
        const actor = game.actors.get(payload.actorId);
        if (actor && actor.isOwner) {
          const item = actor.items.get(payload.skillId);
          if (item) {
            ui.notifications.info(`GM is calling for a ${item.name} roll!`);
            await CypherTaskbar.instance?._openNativeSkillRollDialog(actor, item, payload.difficulty);
          }
        }
      } catch (err) {
        console.warn("[CypherTaskbar] openSkillRollDialog failed:", err);
        ui.notifications.error("Roll dialog failed to open. Check console (F12) for details.");
      }
      return;
    }
  });

  // Gallery image sharing socket (compatible with cypher-gallery-tabs)
  game.socket.on("module.cypher-gallery-tabs", async (data) => {
    if (!data || data.type !== "showImage") return;
    if (typeof data.src !== "string" || typeof data.title !== "string") return;
    if (!Array.isArray(data.userIds)) return;
    if (typeof data.senderId !== "string") return;
    if (typeof data.sendToGM !== "boolean") return;
    if (!["all", "selected", "gm"].includes(data.shareMode)) return;

    const sender = game.users?.get(data.senderId);
    if (!sender?.active) return;

    if (game.user.isGM) {
      const activeGMs = game.users.filter(u => u.active && u.isGM);
      const primaryGM = activeGMs[0];
      if (primaryGM && game.user.id === primaryGM.id && !sender.isGM) {
        const gmIds = activeGMs.map(u => u.id);
        let targets = "all connected players";
        if (data.shareMode === "gm") targets = "the Game Master";
        else if (data.shareMode === "selected") {
          const names = data.userIds.map(id => game.users?.get(id)?.name).filter(Boolean);
          targets = names.length ? names.join(", ") : "selected players";
        }
        const esc = foundry.utils.escapeHTML;
        await ChatMessage.create({
          user: game.user.id,
          speaker: { alias: "Cypher Gallery Tabs" },
          whisper: gmIds,
          content: `<div class="cgt-gm-share-chat"><p><strong>${esc(sender.name)}</strong> is showing an image to <strong>${esc(targets)}</strong>.</p><div style="margin:8px 0 6px;"><img src="${esc(data.src)}" alt="${esc(data.title)}" style="max-width:100%;height:auto;border-radius:4px;border:1px solid rgba(255,255,255,0.15);display:block;" /></div><p style="margin:0;opacity:0.85;"><strong>Image:</strong> ${esc(data.title)}</p></div>`
        });
      }
      if (data.sendToGM && data.senderId !== game.user.id) {
        _openReceivedLightbox(data.src, data.title);
      }
      return;
    }

    if (data.senderId === game.user.id) return;
    const shouldOpen = data.shareMode === "all"
      || (data.shareMode === "selected" && data.userIds.includes(game.user.id));
    if (shouldOpen) {
      _openReceivedLightbox(data.src, data.title);
    }
  });

  function _openReceivedLightbox(src, title) {
    const lb = document.createElement("div");
    lb.id = "cgt-lightbox";
    lb.className = "cgt-lightbox";
    const esc2 = foundry.utils.escapeHTML;
    lb.innerHTML = `<div class="cgt-lb-stage"><div class="cgt-lb-controls"><button type="button" class="cgt-lb-btn cgt-lb-close" aria-label="Close image" title="Close image"><i class="fa-solid fa-xmark"></i></button></div><img src="${esc2(src)}" alt="${esc2(title || "Image")}" class="cgt-lb-img" id="cgt-lb-img" /></div>`;
    document.body.appendChild(lb);
    const onKey = (e) => { if (e.key === "Escape") { lb.remove(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);
    lb.querySelector(".cgt-lb-close")?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); lb.remove(); document.removeEventListener("keydown", onKey); });
    lb.addEventListener("click", (e) => { if (!e.target.closest(".cgt-lb-img") && !e.target.closest(".cgt-lb-btn")) { lb.remove(); document.removeEventListener("keydown", onKey); } });
    lb.querySelector("#cgt-lb-img")?.addEventListener("error", () => { ui.notifications.error("The image could not be loaded."); lb.remove(); document.removeEventListener("keydown", onKey); });
  }

  // Apply global UI settings (hide macro bar, push sidebar up)
  const hideMacro = game.settings.get(MODULE_ID, "hideMacroBar");
  const hotbar = document.getElementById("hotbar");
  if (hideMacro && hotbar) hotbar.style.display = "none";
  const style = document.createElement("style");
  style.id = "ct-global-ui";
  // Remove old global UI styles if they exist (prevent accumulation on re-init)
  document.getElementById("ct-global-ui")?.remove();
  style.textContent = `
    #hotbar { transition: display 0.2s; }
    #sidebar,
    .app#sidebar,
    aside#sidebar,
    #ui-right,
    #ui-right #sidebar,
    #ui-right .sidebar {
      bottom: var(--ct-sidebar-offset, 0px) !important;
      height: calc(100vh - var(--ct-sidebar-offset, 0px)) !important;
      max-height: calc(100vh - var(--ct-sidebar-offset, 0px)) !important;
      transition: bottom 0.2s ease, height 0.2s ease, max-height 0.2s ease;
    }
    #sidebar-tabs,
    .sidebar-tabs {
      max-height: calc(100vh - var(--ct-sidebar-offset, 0px)) !important;
      transition: max-height 0.2s ease;
    }
  `;
  document.head.appendChild(style);

  CypherTaskbar.instance._startWindowObserver();
  CypherTaskbar.instance._startTrayRefresh();
  CypherTaskbar.instance.refreshTray();
  initGallerySocket();
});

Hooks.on("disableModule", (module) => {
  if (module.id !== MODULE_ID) return;
  // Clear all timers to prevent leaks
  if (CypherTaskbar.instance) {
    clearInterval(CypherTaskbar.instance._trayInterval);
    clearTimeout(CypherTaskbar.instance._skillTooltipTimer);
    clearTimeout(CypherTaskbar.instance._hideTimeout);
  }
  document.querySelector(`#${MODULE_ID}-bar`)?.remove();
  document.querySelectorAll(".ct-popup").forEach(p => p.remove());
  CypherTaskbar.instance = null;
});

// Actor/Item/Combat hooks — debounced to prevent refresh storms
let _debouncedRefresh = null;
function _getDebouncedRefresh(tb) {
  if (!_debouncedRefresh) {
    _debouncedRefresh = foundry.utils.debounce(() => {
      CypherTaskbar.instance?.refresh();
      _debouncedRefresh = null;
    }, 50);
  }
  return _debouncedRefresh;
}

Hooks.on("updateActor", (actor) => { 
  const tb = CypherTaskbar.instance; 
  if (tb?._suppressRender) return;
  if (tb?.actor?.id === actor.id) { 
    tb.actor = actor;
    _getDebouncedRefresh(tb)();
  } 
});
Hooks.on("createItem", (item) => { 
  if (CypherTaskbar.instance?.actor?.id === item.parent?.id) _getDebouncedRefresh()(); 
});
Hooks.on("updateItem", (item) => { 
  if (CypherTaskbar.instance?.actor?.id === item.parent?.id) _getDebouncedRefresh()(); 
});
Hooks.on("deleteItem", (item) => { 
  if (CypherTaskbar.instance?.actor?.id === item.parent?.id) _getDebouncedRefresh()(); 
});
Hooks.on("createActiveEffect", (effect) => { if (CypherTaskbar.instance?.actor?.id === effect.parent?.id) CypherTaskbar.instance._refreshStatusEffects(); });
Hooks.on("updateActiveEffect", (effect) => { if (CypherTaskbar.instance?.actor?.id === effect.parent?.id) CypherTaskbar.instance._refreshStatusEffects(); });
Hooks.on("deleteActiveEffect", (effect) => { if (CypherTaskbar.instance?.actor?.id === effect.parent?.id) CypherTaskbar.instance._refreshStatusEffects(); });
Hooks.on("renderApplication", (app) => { CypherTaskbar.instance?._injectMinimizeButton(app); CypherTaskbar.instance?.refreshTray(); });
Hooks.on("closeApplication", () => CypherTaskbar.instance?.refreshTray());
Hooks.on("renderApplicationV2", (app) => { CypherTaskbar.instance?._injectMinimizeButton(app); CypherTaskbar.instance?.refreshTray(); });
Hooks.on("closeApplicationV2", () => CypherTaskbar.instance?.refreshTray());

// Catch-all hooks for specific sheet types to ensure minimize button appears on every window
const _ctInjectMinimize = (app) => CypherTaskbar.instance?._injectMinimizeButton(app);
Hooks.on("renderActorSheet", _ctInjectMinimize);
Hooks.on("renderItemSheet", _ctInjectMinimize);
Hooks.on("renderJournalSheet", _ctInjectMinimize);
Hooks.on("renderJournalPageSheet", _ctInjectMinimize);
Hooks.on("renderCompendium", _ctInjectMinimize);
Hooks.on("renderSettings", _ctInjectMinimize);
Hooks.on("renderDialog", _ctInjectMinimize);
Hooks.on("renderChatPopout", _ctInjectMinimize);
Hooks.on("renderTokenConfig", _ctInjectMinimize);
Hooks.on("renderSceneConfig", _ctInjectMinimize);
Hooks.on("renderFolderEdit", _ctInjectMinimize);
Hooks.on("renderMacroConfig", _ctInjectMinimize);
Hooks.on("renderRollTableConfig", _ctInjectMinimize);
Hooks.on("renderPlaylistConfig", _ctInjectMinimize);
Hooks.on("renderActiveEffectConfig", _ctInjectMinimize);
// Scene navigation hand icon — re-inject when scene nav renders
Hooks.on("renderSceneNavigation", () => CypherTaskbar.instance?._injectSceneHand());
Hooks.on("userConnected", () => CypherTaskbar.instance?.updateOnlineStatus());
Hooks.on("createCombatant", () => CypherTaskbar.instance?.refresh());
Hooks.on("updateCombatant", () => CypherTaskbar.instance?.refresh());
Hooks.on("deleteCombatant", () => CypherTaskbar.instance?.refresh());
Hooks.on("updateCombat", () => CypherTaskbar.instance?.refresh());
Hooks.on("deleteCombat", () => CypherTaskbar.instance?.refresh());

// ── Cash & Values: GM interaction with USE chat cards ──
Hooks.on("renderChatMessage", (message, html) => {
  html.find("[data-cash-action]").on("click", async (ev) => {
    ev.preventDefault();
    const btn = ev.currentTarget;
    const action = btn.dataset.cashAction;
    const actorId = btn.dataset.actorId;
    const itemId = btn.dataset.itemId;
    if (!actorId || !itemId) return;

    const actor = game.actors.get(actorId);
    if (!actor) { ui.notifications.warn("Actor not found."); return; }
    const item = actor.items.get(itemId);
    if (!item) { ui.notifications.info("Item already deleted."); return; }

    if (action === "expend") {
      // Remove from cashValuables flag
      const valuables = actor.getFlag(MODULE_ID, "cashValuables") ?? [];
      const filtered = valuables.filter(id => id !== itemId);
      await actor.setFlag(MODULE_ID, "cashValuables", filtered);
      // Delete item from actor
      await actor.deleteEmbeddedDocuments("Item", [itemId]);
      ui.notifications.info(`"${item.name}" expended and removed from ${actor.name}.`);
      // Disable buttons in this message
      const card = btn.closest(".ct-cash-use-card");
      if (card) {
        card.querySelectorAll(".ct-cash-use-btn").forEach(b => {
          b.disabled = true;
          b.style.opacity = "0.5";
        });
        card.insertAdjacentHTML("beforeend", `<div style="margin-top:6px;color:#c8a96e;font-weight:700;"><i class="fas fa-check-circle"></i> Item expended.</div>`);
      }
    } else if (action === "keep") {
      // Just acknowledge — item stays
      const card = btn.closest(".ct-cash-use-card");
      if (card) {
        card.querySelectorAll(".ct-cash-use-btn").forEach(b => {
          b.disabled = true;
          b.style.opacity = "0.5";
        });
        card.insertAdjacentHTML("beforeend", `<div style="margin-top:6px;color:#7ecf7e;font-weight:700;"><i class="fas fa-check-circle"></i> Item kept.</div>`);
      }
    }
  });
});
