import { MODULE_ID } from "./utils.js";

export function applyCombatPanel(CypherTaskbar) {
  Object.assign(CypherTaskbar.prototype, {

    // ── Combat helpers ──────────────────────────────────────────────────────────
    _shadowOffset(dir = "top-left", dist = 14) {
      const map = {"top-left":[-dist,-dist],"top-right":[dist,-dist],"bottom-left":[-dist,dist],"bottom-right":[dist,dist],"top":[0,-dist],"bottom":[0,dist],"left":[-dist,0],"right":[dist,0]};
      return map[dir] ?? map["top-left"];
    },

    _getCPS(key, fallback) {
      try {
        const value = this._gs(key);
        return value ?? fallback;
      } catch {
        return fallback;
      }
    },

    _refreshCombatUIState() {
      if (this.activePanel === "combat" && this.element) {
        this._refreshActivePanel();
        return;
      }
      this.refresh();
    },

    _suppressCombatNativeTooltips() {
      const buttons = this.element?.querySelectorAll('.ct-combat-actions-compact .ct-combat-action');
      if (!buttons?.length) return;
      for (const btn of buttons) {
        btn.removeAttribute('title');
        btn.removeAttribute('data-tooltip');
        btn.removeAttribute('data-tooltip-direction');
        btn.dataset.tooltipClass = '';
      }
    },

    async _createEncounterAndJoin(actor, requestedSceneId = null) {
      let combat = game.combat;
      if (!combat) {
        const sceneId = requestedSceneId ?? canvas?.scene?.id ?? game.scenes?.current?.id ?? game.user?.viewedScene ?? null;
        try {
          combat = await Combat.create({ scene: sceneId, active: true });
        } catch (err) {
          console.error(`${MODULE_ID} | could not create combat encounter`, err);
          ui.notifications?.error?.("Could not create a combat encounter.");
          return;
        }
      }

      const existing = combat.combatants.find(c => c.actorId === actor.id);
      if (!existing) {
        const token = actor.getActiveTokens?.()?.[0];
        await combat.createEmbeddedDocuments("Combatant", [{ actorId: actor.id, tokenId: token?.id ?? null, hidden: false }]);
      }

      const combatant = combat.combatants.find(c => c.actorId === actor.id);
      ui.notifications?.info?.(`${actor.name} joined combat.`);
      if (combatant) {
        try {
          if (typeof combat.rollInitiative === "function") {
            await combat.rollInitiative([combatant.id]);
          } else if (typeof actor.rollInitiative === "function") {
            await actor.rollInitiative({ createCombatants: false });
          } else {
            ui.notifications?.warn?.("Joined combat, but no initiative roller is available.");
          }
        } catch (err) {
          console.error(`${MODULE_ID} | auto initiative after join failed`, err);
          ui.notifications?.error?.("Joined combat, but initiative roll failed.");
        }
      }
      this._refreshCombatUIState();
    },

    _emitGMCombatRequest(actor) {
      const gms = (game.users ?? []).filter(u => u.isGM && u.active);
      if (!gms.length) {
        ui.notifications?.warn?.("No active GM is available.");
        return;
      }

      const payload = {
        type: "gmCombatRequest",
        actorId: actor.id,
        actorName: actor.name,
        sceneId: canvas?.scene?.id ?? game.scenes?.current?.id ?? game.user?.viewedScene ?? null,
        userId: game.user?.id,
        userName: game.user?.name ?? "Player"
      };

      game.socket.emit(`module.${MODULE_ID}`, payload);
      ui.notifications?.info?.("Combat request sent to the GM.");
    },

    _openStartCombatConfirm(actor) {
      document.querySelector("#ct-start-combat-confirm")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-start-combat-confirm";
      popup.className = "ct-popup ct-start-combat-confirm";
      popup.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10035;min-width:420px;max-width:580px;";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-skull-crossbones"></i> Start Combat<button class="ct-popup-close" title="Close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body">
          <div class="ct-start-combat-text">Are you sure you want to start a combat?</div>
          <div class="ct-start-combat-actions">
            <button class="ct-start-combat-btn is-danger" data-choice="yes">YES! Do you feel lucky PUNK!</button>
            <button class="ct-start-combat-btn is-muted" data-choice="no">NO! I wonder if it is a good day to die</button>
            <button class="ct-start-combat-btn is-gm" data-choice="ask">Well maybe. Can I? Should I?</button>
          </div>
        </div>`;
      document.body.appendChild(popup);

      const close = () => popup.remove();
      popup.querySelector('.ct-popup-close')?.addEventListener('click', close);
      popup.querySelectorAll('.ct-start-combat-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const choice = btn.dataset.choice;
          if (choice === 'yes') {
            await this._createEncounterAndJoin(actor);
          } else if (choice === 'ask') {
            this._emitGMCombatRequest(actor);
          }
          close();
        });
      });
    },

    _openGMCombatRequest(payload) {
      document.querySelector("#ct-gm-combat-request")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-gm-combat-request";
      popup.className = "ct-popup ct-gm-combat-request";
      popup.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10036;min-width:420px;max-width:580px;";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-user-shield"></i> GM Combat Approval<button class="ct-popup-close" title="Close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body">
          <div class="ct-start-combat-text"><strong>${payload.userName ?? "A player"}</strong> asks to start combat for <strong>${payload.actorName ?? "an actor"}</strong>.</div>
          <div class="ct-start-combat-actions">
            <button class="ct-start-combat-btn is-danger" data-gm-choice="create">CREATE COMBAT ENCOUNTER</button>
            <button class="ct-start-combat-btn is-muted" data-gm-choice="deny">HELL NO!</button>
          </div>
        </div>`;
      document.body.appendChild(popup);

      const close = () => popup.remove();
      popup.querySelector('.ct-popup-close')?.addEventListener('click', close);
      popup.querySelector('[data-gm-choice="deny"]')?.addEventListener('click', () => {
        ui.notifications?.info?.('Combat request denied.');
        close();
      });
      popup.querySelector('[data-gm-choice="create"]')?.addEventListener('click', async () => {
        const actor = game.actors?.get(payload.actorId);
        if (!actor) {
          ui.notifications?.warn?.('Requested actor was not found.');
          close();
          return;
        }
        await this._createEncounterAndJoin(actor, payload.sceneId);
        close();
      });
    },

    _buildCombatButtons(actor, combat, combatant, inCombat, initVal) {
      const hasInit = initVal != null;
      const enterTip = inCombat ? "Already in encounter" : "Join encounter and roll immediately";
      const initiativeTip = !inCombat ? "Enter combat first" : hasInit ? `Current: ${initVal} - GM permission required` : "Roll your place in combat";
      const leaveTip = !inCombat ? "Must be in combat first" : "Ask GM to remove you from combat";
      return `<div class="ct-combat-actions ct-combat-actions-compact">
        <button class="ct-combat-action enter${inCombat ? " active" : ""}" data-combat-action="enter" data-fancy-tooltip="${enterTip}" aria-label="Enter combat">
          <span class="ct-ca-icon"><i class="fas fa-door-open"></i></span>
          <span class="ct-ca-body">
            <span class="ct-ca-label">Enter</span>
            <span class="ct-ca-label ct-ca-label-secondary">Combat</span>
          </span>
        </button>
        <button class="ct-combat-action initiative${!inCombat ? " disabled" : ""}${hasInit ? " reroll" : ""}" data-combat-action="initiative" data-fancy-tooltip="${initiativeTip}" aria-label="${hasInit ? "Reroll initiative" : "Roll initiative"}"${!inCombat ? " disabled" : ""}>
          <span class="ct-ca-icon"><i class="fas fa-dice-d20"></i></span>
          <span class="ct-ca-body">
            <span class="ct-ca-label">${hasInit ? "Reroll" : "Roll"}</span>
            <span class="ct-ca-label ct-ca-label-secondary">Initiative</span>
          </span>
        </button>
        <button class="ct-combat-action leave${!inCombat ? " disabled" : ""}" data-combat-action="leave" data-fancy-tooltip="${leaveTip}" aria-label="Leave combat"${!inCombat ? " disabled" : ""}>
          <span class="ct-ca-icon"><i class="fas fa-person-walking-arrow-right"></i></span>
          <span class="ct-ca-body">
            <span class="ct-ca-label">Leave</span>
            <span class="ct-ca-label ct-ca-label-secondary">Combat</span>
          </span>
        </button>
      </div>`;
    },

    async _handleCombatAction(action) {
      const actor = this.actor;
      const combat = game.combat;
      if (!actor) {
        ui.notifications?.warn?.("No character assigned.");
        return;
      }

      const existing = combat?.combatants.find(c => c.actorId === actor.id);

      if (action === "enter") {
        if (existing) {
          ui.notifications?.info?.(`${actor.name} is already in combat.`);
          return;
        }
        if (!combat) {
          this._openStartCombatConfirm(actor);
          return;
        }
        await this._createEncounterAndJoin(actor);
        return;
      }

      if (action === "initiative") {
        if (!combat) {
          ui.notifications?.warn?.("No active combat encounter.");
          return;
        }
        if (!existing) {
          ui.notifications?.warn?.(`${actor.name} is not in combat.`);
          return;
        }
        if (existing.initiative != null) {
          this._openInitiativeRerollConfirm(existing);
          return;
        }
        try {
          if (typeof combat.rollInitiative === "function") {
            await combat.rollInitiative([existing.id]);
          } else if (typeof actor.rollInitiative === "function") {
            await actor.rollInitiative({ createCombatants: false });
          } else {
            ui.notifications?.warn?.("No initiative roller available.");
            return;
          }
        } catch (err) {
          console.error(`${MODULE_ID} | initiative roll failed`, err);
          ui.notifications?.error?.("Initiative roll failed.");
          return;
        }
        this._refreshCombatUIState();
        return;
      }

      if (action === "leave") {
        if (!combat) {
          ui.notifications?.warn?.("No active combat encounter.");
          return;
        }
        if (!existing) {
          ui.notifications?.warn?.(`${actor.name} is not in combat.`);
          return;
        }
        this._openLeaveCombatConfirm(existing);
        return;
      }

      return await this._handleAction(action);
    },

    _openInitiativeRerollConfirm(combatant) {
      document.querySelector("#ct-init-reroll-confirm")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-init-reroll-confirm";
      popup.className = "ct-popup ct-init-reroll-confirm";
      popup.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10030;min-width:360px;max-width:460px;";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-triangle-exclamation"></i> Initiative Reroll<button class="ct-popup-close" title="Close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body">
          <div class="ct-init-reroll-text">Are you sure - ask GM for permission to roll again.</div>
          <div class="ct-init-reroll-actions">
            <button class="ct-reroll-decline" type="button">Declined</button>
            <button class="ct-reroll-grant" type="button">Permission Granted</button>
          </div>
        </div>`;
      document.body.appendChild(popup);
      const close = () => popup.remove();
      popup.querySelector('.ct-popup-close')?.addEventListener('click', close);
      popup.querySelector('.ct-reroll-decline')?.addEventListener('click', () => {
        ui.notifications?.info?.("Initiative reroll cancelled.");
        close();
      });
      popup.querySelector('.ct-reroll-grant')?.addEventListener('click', async () => {
        try {
          const combat = game.combat;
          const actor = this.actor;
          if (!combat || !combatant) {
            ui.notifications?.warn?.("Combatant not found.");
            close();
            return;
          }
          if (typeof combat.rollInitiative === "function") {
            await combat.rollInitiative([combatant.id]);
          } else if (typeof actor?.rollInitiative === "function") {
            await actor.rollInitiative({ createCombatants: false });
          } else {
            ui.notifications?.warn?.("No initiative roller available.");
            close();
            return;
          }
          this._refreshCombatUIState();
        } catch (err) {
          console.error(`${MODULE_ID} | initiative reroll failed`, err);
          ui.notifications?.error?.("Initiative reroll failed.");
        }
        close();
      });
    },

    _emitGMLeaveCombatRequest(actor, combatant) {
      const gms = (game.users ?? []).filter(u => u.isGM && u.active);
      if (!gms.length) {
        ui.notifications?.warn?.("No active GM is available.");
        return;
      }

      const payload = {
        type: "gmLeaveCombatRequest",
        actorId: actor.id,
        actorName: actor.name,
        combatantId: combatant?.id ?? null,
        combatId: game.combat?.id ?? null,
        userId: game.user?.id,
        userName: game.user?.name ?? "Player"
      };

      game.socket.emit(`module.${MODULE_ID}`, payload);
      ui.notifications?.info?.("Leave combat request sent to the GM.");
    },

    _openLeaveCombatConfirm(combatant) {
      document.querySelector("#ct-leave-combat-confirm")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-leave-combat-confirm";
      popup.className = "ct-popup ct-leave-combat-confirm";
      popup.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10030;min-width:360px;max-width:480px;";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-person-walking-arrow-right"></i> Leave Combat<button class="ct-popup-close" title="Close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body">
          <div class="ct-init-reroll-text">Ask GM for permission to leave combat?</div>
          <div class="ct-init-reroll-actions">
            <button class="ct-reroll-decline" type="button">NO</button>
            <button class="ct-reroll-grant" type="button">YES</button>
          </div>
        </div>`;
      document.body.appendChild(popup);
      const close = () => popup.remove();
      popup.querySelector('.ct-popup-close')?.addEventListener('click', close);
      popup.querySelector('.ct-reroll-decline')?.addEventListener('click', () => {
        ui.notifications?.info?.("Leave combat cancelled.");
        close();
      });
      popup.querySelector('.ct-reroll-grant')?.addEventListener('click', () => {
        if (!this.actor || !combatant) {
          ui.notifications?.warn?.("Combatant not found.");
          close();
          return;
        }
        this._emitGMLeaveCombatRequest(this.actor, combatant);
        close();
      });
    },

    _openGMLeaveCombatRequest(payload) {
      document.querySelector("#ct-gm-leave-combat-request")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-gm-leave-combat-request";
      popup.className = "ct-popup ct-gm-combat-request";
      popup.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10036;min-width:420px;max-width:620px;";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-user-shield"></i> GM Combat Approval<button class="ct-popup-close" title="Close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body">
          <div class="ct-start-combat-text">${payload.actorName ?? "This character"} is attempting to leave combat. Do you approve?</div>
          <div class="ct-start-combat-actions">
            <button class="ct-start-combat-btn is-danger" data-gm-leave-choice="yes">YES</button>
            <button class="ct-start-combat-btn is-muted" data-gm-leave-choice="no">NO</button>
          </div>
        </div>`;
      document.body.appendChild(popup);

      const close = () => popup.remove();
      popup.querySelector('.ct-popup-close')?.addEventListener('click', close);
      popup.querySelector('[data-gm-leave-choice="no"]')?.addEventListener('click', () => {
        ui.notifications?.info?.('Leave combat request denied.');
        close();
      });
      popup.querySelector('[data-gm-leave-choice="yes"]')?.addEventListener('click', async () => {
        const combat = payload.combatId ? game.combats?.get(payload.combatId) : game.combat;
        if (!combat) {
          ui.notifications?.warn?.('Combat encounter was not found.');
          close();
          return;
        }
        const combatant = (payload.combatantId && combat.combatants.get(payload.combatantId))
          || combat.combatants.find(c => c.actorId === payload.actorId);
        if (!combatant) {
          ui.notifications?.warn?.('Combatant was not found.');
          close();
          return;
        }
        try {
          await combat.deleteEmbeddedDocuments("Combatant", [combatant.id]);
          ui.notifications?.info?.(`${payload.actorName ?? 'Actor'} removed from combat.`);
        } catch (err) {
          console.error(`${MODULE_ID} | leave combat failed`, err);
          ui.notifications?.error?.('Could not remove actor from combat.');
        }
        close();
        this._refreshCombatUIState();
      });
    },

    _shouldShowCombatPlaceholder() {
      const actor = this.actor;
      if (!actor || !game.combat) return false;
      const combatant = game.combat.combatants?.find(c => c.actorId === actor.id);
      return Number.isFinite(Number(combatant?.initiative));
    },

    _buildCombatPlaceholder() {
      return "";
    },

    _refreshCombatPlaceholder() {
      const shell = this.element?.querySelector("#ct-combat-placeholder-shell");
      if (!shell) return;
      shell.innerHTML = this._buildCombatPlaceholder();
      const btn = shell.querySelector("#ct-combat-placeholder-settings");
      if (btn) btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openCombatPlaceholderSettings(e);
      });
      shell.querySelectorAll(".ct-cp-action-card[data-cp-action]").forEach(ab => {
        ab.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this._handleAction(ab.dataset.cpAction, ab); });
      });
    },

    _openCombatPlaceholderSettings(event) {
      document.querySelector("#ct-cp-settings-popup")?.remove();
      const dirs = ["top-left","top-right","bottom-left","bottom-right","top","bottom","left","right"];
      const gradDirs = [{value:"to-right",label:"Left to Right"},{value:"to-left",label:"Right to Left"},{value:"to-bottom",label:"Top to Bottom"},{value:"to-top",label:"Bottom to Top"},{value:"to-br",label:"Diagonal (BL to TR)"},{value:"to-bl",label:"Diagonal (BR to TL)"},{value:"to-tr",label:"Diagonal (TL to BR)"},{value:"to-tl",label:"Diagonal (TR to BL)"}];
      const bgSizes = [{value:"cover",label:"Cover"},{value:"contain",label:"Contain"},{value:"fit",label:"Fit"},{value:"auto",label:"Auto"}];
      const bgPositions = [{value:"center",label:"Center"},{value:"top",label:"Top"},{value:"bottom",label:"Bottom"},{value:"left",label:"Left"},{value:"right",label:"Right"}];
      const separators = [{value:"none",label:"None"},{value:"thin",label:"Thin Line"},{value:"thick",label:"Thick Line"},{value:"dotted",label:"Dotted"},{value:"dashed",label:"Dashed"},{value:"glow",label:"Glow"}];
      const v = {
        bgColor: this._getCPS("combatPlaceholderBgColor", "#ff2414"),
        bgOpacity: this._getCPS("combatPlaceholderBgOpacity", 0.98),
        widthScale: this._getCPS("combatPlaceholderWidthScale", 100),
        heightScale: this._getCPS("combatPlaceholderHeightScale", 100),
        borderWidth: this._getCPS("combatPlaceholderBorderWidth", 1),
        borderColor: this._getCPS("combatPlaceholderBorderColor", "#fff4dc"),
        borderOpacity: this._getCPS("combatPlaceholderBorderOpacity", 0.18),
        shadowOpacity: this._getCPS("combatPlaceholderShadowOpacity", 0.28),
        shadowDir: this._getCPS("combatPlaceholderShadowDir", "top-left"),
        shadowBlur: this._getCPS("combatPlaceholderShadowBlur", 28),
        position: this._getCPS("combatPlaceholderPosition", 50),
        vertPos: this._getCPS("combatPlaceholderOffset", 0),
        gradColor2: this._getCPS("combatPlaceholderGradientColor2", "#990000"),
        gradStretch: this._getCPS("combatPlaceholderGradientStretch", 50),
        gradType: this._getCPS("combatPlaceholderGradientType", "none"),
        gradDir: this._getCPS("combatPlaceholderGradientDir", "to-right"),
        bgImage: this._getCPS("combatPlaceholderBgImage", ""),
        bgImageOpacity: this._getCPS("combatPlaceholderBgImageOpacity", 0.5),
        bgImageSize: this._getCPS("combatPlaceholderBgImageSize", "cover"),
        bgImagePos: this._getCPS("combatPlaceholderBgImagePos", "center"),
        separator: this._getCPS("combatPlaceholderSeparator", "thin"),
        sepMargin: this._getCPS("combatPlaceholderSeparatorMargin", 4),
        sepColor: this._getCPS("combatPlaceholderSeparatorColor", "#ffffff"),
        iconColor: this._getCPS("combatActionIconColor", "#c8a96e"),
        iconBgColor: this._getCPS("combatActionIconBgColor", "rgba(0,0,0,0.22)"),
        iconSize: this._getCPS("combatActionIconSize", 100),
        iconPadding: this._getCPS("combatActionIconPadding", 3),
        iconMargin: this._getCPS("combatActionIconMargin", 4)
      };
      const popup = document.createElement("div");
      popup.id = "ct-cp-settings-popup";
      popup.className = "ct-popup ct-popup-draggable";
      popup.style.cssText = "min-width:380px;max-width:460px;position:fixed;z-index:10020;";
      const tr = (label, input) => `<label class="ct-cps-row">${label}<div class="ct-cps-ctrl">${input}</div></label>`;
      const rng = (n, mn, mx, st, val, unit) => `<input type="range" name="${n}" min="${mn}" max="${mx}" step="${st}" value="${val}"><span class="ct-setting-value" data-for="${n}">${val}${unit}</span>`;
      const tabs = [
        { key: "layout", icon: "fas fa-layer-group", label: "Layout" },
        { key: "appearance", icon: "fas fa-palette", label: "Style" },
        { key: "shadow", icon: "fas fa-cloud-moon", label: "Shadow" },
        { key: "actions", icon: "fas fa-bolt", label: "Actions" }
      ];
      const tabButtons = tabs.map((t, i) => `<button class="ct-popup-tab${i===0?' is-active':''}" data-cp-tab="${t.key}" type="button"><i class="${t.icon}"></i> ${t.label}</button>`).join("");
      const pane = (key, content) => `<div class="ct-popup-pane${key==='layout'?' is-active':''}" data-cp-pane="${key}">${content}</div>`;
      popup.innerHTML = `
        <div class="ct-popup-header ct-popup-drag-handle" title="Drag to move"><i class="fas fa-grip-lines" style="margin-right:6px;opacity:0.5;"></i><i class="fas fa-sliders-h"></i> Combat Bar Settings<button class="ct-popup-close" title="Close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-tabs">${tabButtons}</div>
        <div class="ct-popup-body ct-popup-body-compact">
          ${pane("layout", `
            <div class="ct-cps-grid">
              ${tr("Position", `<input type="range" name="position" min="0" max="100" step="1" value="${v.position}"><span class="ct-setting-value" data-for="position">${v.position}%</span>`)}
              ${tr("Vertical position", `<input type="range" name="vertPos" min="-200" max="200" step="1" value="${v.vertPos}"><span class="ct-setting-value" data-for="vertPos">${v.vertPos}%</span>`)}
              ${tr("Width %", rng("widthScale",40,140,1,v.widthScale,"%"))}
              ${tr("Height %", rng("heightScale",60,180,1,v.heightScale,"%"))}
            </div>
          `)}
          ${pane("appearance", `
            <div class="ct-cps-grid">
              ${tr("Background color", `<input type="color" name="bgColor" value="${v.bgColor}">`)}
              ${tr("Bg opacity", rng("bgOpacity",0.1,1,0.05,v.bgOpacity,""))}
              ${tr("Border size", rng("borderWidth",0,8,1,v.borderWidth,"px"))}
              ${tr("Border color", `<input type="color" name="borderColor" value="${v.borderColor}">`)}
              ${tr("Border opacity", rng("borderOpacity",0,1,0.05,v.borderOpacity,""))}
              <div style="grid-column:1/-1;border-top:1px solid rgba(255,255,255,0.08);margin:4px 0;"></div>
              ${tr("Gradient color 2", `<input type="color" name="gradColor2" value="${v.gradColor2}">`)}
              ${tr("Gradient type", `<select name="gradType"><option value="none"${v.gradType==="none"?" selected":""}>None</option><option value="linear"${v.gradType==="linear"?" selected":""}>Linear</option><option value="radial"${v.gradType==="radial"?" selected":""}>Radial</option></select>`)}
              ${tr("Gradient direction", `<select name="gradDir">${gradDirs.map(d => `<option value="${d.value}"${v.gradDir===d.value?" selected":""}>${d.label}</option>`).join("")}</select>`)}
              ${tr("Gradient stretch", rng("gradStretch",0,100,1,v.gradStretch,"%"))}
              <div style="grid-column:1/-1;border-top:1px solid rgba(255,255,255,0.08);margin:4px 0;"></div>
              ${tr("Background image URL", `<input type="text" name="bgImage" value="${v.bgImage}" placeholder="https://..." style="flex:1;min-width:120px;">`)}
              ${tr("Image opacity", rng("bgImageOpacity",0,1,0.05,v.bgImageOpacity,""))}
              ${tr("Image size", `<select name="bgImageSize">${bgSizes.map(s => `<option value="${s.value}"${v.bgImageSize===s.value?" selected":""}>${s.label}</option>`).join("")}</select>`)}
              ${tr("Image position", `<select name="bgImagePos">${bgPositions.map(p => `<option value="${p.value}"${v.bgImagePos===p.value?" selected":""}>${p.label}</option>`).join("")}</select>`)}
            </div>
          `)}
          ${pane("shadow", `
            <div class="ct-cps-grid">
              ${tr("Shadow opacity", rng("shadowOpacity",0,1,0.05,v.shadowOpacity,""))}
              ${tr("Shadow direction", `<select name="shadowDir">${dirs.map(d => `<option value="${d}"${v.shadowDir===d ? " selected" : ""}>${d}</option>`).join("")}</select>`)}
              ${tr("Shadow blur", rng("shadowBlur",0,60,1,v.shadowBlur,"px"))}
            </div>
          `)}
          ${pane("actions", `
            <div class="ct-cps-grid">
              ${tr("Icon color", `<input type="color" name="iconColor" value="${v.iconColor}">`)}
              ${tr("Icon background", `<input type="color" name="iconBgColor" value="${this._rgbaToHex(v.iconBgColor, '#0a0a0a')}">`)}
              ${tr("Icon size", rng("iconSize",50,200,1,v.iconSize,"%"))}
              ${tr("Icon padding", rng("iconPadding",0,20,1,v.iconPadding,"px"))}
              ${tr("Icon margin", rng("iconMargin",0,20,1,v.iconMargin,"px"))}
              ${tr("Separator", `<select name="separator">${separators.map(s => `<option value="${s.value}"${v.separator===s.value?" selected":""}>${s.label}</option>`).join("")}</select>`)}
              ${tr("Separator margin", rng("sepMargin",0,20,1,v.sepMargin,"px"))}
              ${tr("Separator color", `<input type="color" name="sepColor" value="${v.sepColor}">`)}
            </div>
          `)}
        </div>`;
      document.body.appendChild(popup);
      const rect = event?.currentTarget?.getBoundingClientRect?.() ?? {left: 200, bottom: 200};
      popup.style.left = Math.min(Math.max(8, rect.left), window.innerWidth - 460) + "px";
      popup.style.top = Math.min(rect.bottom + 8, window.innerHeight - 520) + "px";
      popup.querySelector(".ct-popup-close").onclick = () => popup.remove();
      // Draggable header
      const handle = popup.querySelector(".ct-popup-drag-handle");
      let dragging = false, dragOffX = 0, dragOffY = 0;
      handle.addEventListener("mousedown", (e) => {
        if (e.target.closest(".ct-popup-close")) return;
        dragging = true;
        dragOffX = e.clientX - popup.offsetLeft;
        dragOffY = e.clientY - popup.offsetTop;
        handle.style.cursor = "grabbing";
      });
      window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        popup.style.left = Math.max(0, Math.min(window.innerWidth - popup.offsetWidth, e.clientX - dragOffX)) + "px";
        popup.style.top = Math.max(0, Math.min(window.innerHeight - popup.offsetHeight, e.clientY - dragOffY)) + "px";
      });
      window.addEventListener("mouseup", () => { dragging = false; handle.style.cursor = "grab"; });
      // Tab switching
      popup.querySelectorAll(".ct-popup-tab[data-cp-tab]").forEach(tab => {
        tab.addEventListener("click", () => {
          const key = tab.dataset.cpTab;
          popup.querySelectorAll(".ct-popup-tab").forEach(t => t.classList.toggle("is-active", t === tab));
          popup.querySelectorAll(".ct-popup-pane").forEach(p => p.classList.toggle("is-active", p.dataset.cpPane === key));
        });
      });
      const apply = async () => {
        const pairs = [
          ["combatPlaceholderBgColor", popup.querySelector('[name="bgColor"]').value],
          ["combatPlaceholderBgOpacity", +popup.querySelector('[name="bgOpacity"]').value],
          ["combatPlaceholderWidthScale", +popup.querySelector('[name="widthScale"]').value],
          ["combatPlaceholderHeightScale", +popup.querySelector('[name="heightScale"]').value],
          ["combatPlaceholderBorderWidth", +popup.querySelector('[name="borderWidth"]').value],
          ["combatPlaceholderBorderColor", popup.querySelector('[name="borderColor"]').value],
          ["combatPlaceholderBorderOpacity", +popup.querySelector('[name="borderOpacity"]').value],
          ["combatPlaceholderShadowOpacity", +popup.querySelector('[name="shadowOpacity"]').value],
          ["combatPlaceholderShadowDir", popup.querySelector('[name="shadowDir"]').value],
          ["combatPlaceholderShadowBlur", +popup.querySelector('[name="shadowBlur"]').value],
          ["combatPlaceholderPosition", +popup.querySelector('[name="position"]').value],
          ["combatPlaceholderOffset", +popup.querySelector('[name="vertPos"]').value],
          ["combatPlaceholderGradientColor2", popup.querySelector('[name="gradColor2"]').value],
          ["combatPlaceholderGradientStretch", +popup.querySelector('[name="gradStretch"]').value],
          ["combatPlaceholderGradientType", popup.querySelector('[name="gradType"]').value],
          ["combatPlaceholderGradientDir", popup.querySelector('[name="gradDir"]').value],
          ["combatPlaceholderBgImage", popup.querySelector('[name="bgImage"]').value],
          ["combatPlaceholderBgImageOpacity", +popup.querySelector('[name="bgImageOpacity"]').value],
          ["combatPlaceholderBgImageSize", popup.querySelector('[name="bgImageSize"]').value],
          ["combatPlaceholderBgImagePos", popup.querySelector('[name="bgImagePos"]').value],
          ["combatPlaceholderSeparator", popup.querySelector('[name="separator"]').value],
          ["combatPlaceholderSeparatorMargin", +popup.querySelector('[name="sepMargin"]').value],
          ["combatPlaceholderSeparatorColor", popup.querySelector('[name="sepColor"]').value],
          ["combatActionIconColor", popup.querySelector('[name="iconColor"]').value],
          ["combatActionIconBgColor", this._hexToRGBA(popup.querySelector('[name="iconBgColor"]').value, 1)],
          ["combatActionIconSize", +popup.querySelector('[name="iconSize"]').value],
          ["combatActionIconPadding", +popup.querySelector('[name="iconPadding"]').value],
          ["combatActionIconMargin", +popup.querySelector('[name="iconMargin"]').value],
        ];
        for (const [k, v] of pairs) await this._ss(k, v);
        this._refreshCombatPlaceholder();
      };
      popup.querySelectorAll('input[type="range"]').forEach(inp => {
        inp.addEventListener('input', () => {
          const el = popup.querySelector(`.ct-setting-value[data-for="${inp.name}"]`);
          if (el) {
            const val = +inp.value;
            if (inp.name === "position" || inp.name === "vertPos" || inp.name === "gradStretch") {
              el.textContent = val + "%";
            } else if (inp.name === "iconSize") {
              el.textContent = val + "%";
            } else if (inp.name.includes("Opacity")) {
              el.textContent = Math.round(val * 100) + "%";
            } else if (inp.name.includes("Scale")) {
              el.textContent = val + "%";
            } else {
              el.textContent = val + "px";
            }
          }
          apply();
        });
      });
      popup.querySelectorAll('input[type="color"], select').forEach(el => {
        el.addEventListener('change', () => apply());
      });
      popup.querySelectorAll('input[type="text"]').forEach(el => {
        el.addEventListener('change', () => apply());
      });
    },

    // ── Action handlers ─────────────────────────────────────────────────────────
    async _handleAction(actionKey, triggerBtn) {
      const actor = this.actor;
      if (!actor) return;
      const api = game.cyphersystem;
      switch (actionKey) {
        case "attack": {
          const attacks = actor.items.filter(i => i.type === "attack").sort((a,b) => a.name.localeCompare(b.name));
          if (!attacks.length) { ui.notifications?.info?.("No attacks found on this character."); return; }
          if (attacks.length === 1) { await this._rollAttackItem(attacks[0].id); return; }
          this._openAttackPicker(attacks, triggerBtn);
          break;
        }
        case "move": {
          this._openStatRoll("Speed");
          break;
        }
        case "guard": {
          this._openStatRoll("Might");
          break;
        }
        case "use-ability": {
          const abilities = actor.items.filter(i => ["ability","abilities"].includes(i.type)).sort((a,b) => a.name.localeCompare(b.name));
          if (!abilities.length) { ui.notifications?.info?.("No abilities found."); return; }
          const list = abilities.map(a => `<option value="${a.id}">${foundry.utils.escapeHTML(a.name)}${a.system?.basic?.cost ? ` (Cost: ${a.system.basic.cost})` : ''}</option>`).join("");
          const d = new Dialog({ title: "Use Ability", content: `<div style="padding:8px 4px"><select id="ct-ability-select" style="width:100%">${list}</select></div>`, buttons: { use: { icon: '<i class="fas fa-hand-sparkles"></i>', label: "Use", callback: async (html) => { const id = html[0].querySelector("#ct-ability-select")?.value; if (id) await this._rollAbilityItem(id); } }, cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" } }, default: "use" });
          d.render(true);
          break;
        }
        case "use-item": {
          const items = actor.items.filter(i => ["equipment","artifact","oddity","material","ammo"].includes(i.type)).sort((a,b) => a.name.localeCompare(b.name));
          if (!items.length) { ui.notifications?.info?.("No items found."); return; }
          const list = items.map(i => `<option value="${i.id}">${foundry.utils.escapeHTML(i.name)} ×${i.system?.basic?.quantity ?? 1}</option>`).join("");
          const d = new Dialog({ title: "Use Item", content: `<div style="padding:8px 4px"><select id="ct-item-select" style="width:100%">${list}</select></div>`, buttons: { use: { icon: '<i class="fas fa-flask"></i>', label: "Use", callback: async (html) => { const id = html[0].querySelector("#ct-item-select")?.value; const item = actor.items.get(id); if (item) item.sheet?.render?.(true); } }, cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" } }, default: "use" });
          d.render(true);
          break;
        }
        case "use-cypher": {
          const cyphers = actor.items.filter(i => ["cypher","artifact"].includes(i.type)).sort((a,b) => a.name.localeCompare(b.name));
          if (!cyphers.length) { ui.notifications?.info?.("No cyphers found."); return; }
          const list = cyphers.map(c => `<option value="${c.id}">${foundry.utils.escapeHTML(c.name)}${c.system?.basic?.level ? ` (Lvl ${c.system.basic.level})` : ''}</option>`).join("");
          const d = new Dialog({ title: "Use Cypher", content: `<div style="padding:8px 4px"><select id="ct-cypher-select" style="width:100%">${list}</select></div>`, buttons: { use: { icon: '<i class="fas fa-atom"></i>', label: "Activate", callback: async (html) => { const id = html[0].querySelector("#ct-cypher-select")?.value; const cypher = actor.items.get(id); if (cypher) cypher.sheet?.render?.(true); } }, cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" } }, default: "use" });
          d.render(true);
          break;
        }
        case "cast-spell": {
          const spellItems = this._getSpellableItems(actor);
          if (!spellItems.length) { ui.notifications?.info?.("No spells found."); return; }
          const list = spellItems.map(s => `<option value="${s.id}">${foundry.utils.escapeHTML(s.name)}</option>`).join("");
          const d = new Dialog({ title: "Cast Spell", content: `<div style="padding:8px 4px"><select id="ct-spell-select" style="width:100%">${list}</select></div>`, buttons: { cast: { icon: '<i class="fas fa-wand-magic-sparkles"></i>', label: "Cast", callback: async (html) => { const id = html[0].querySelector("#ct-spell-select")?.value; if (id) await this._rollSpellItem(id); } }, cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel" } }, default: "cast" });
          d.render(true);
          break;
        }
      }
    },

    _openAttackPicker(attacks, triggerBtn) {
      document.querySelector("#ct-attack-picker")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-attack-picker";
      popup.className = "ct-popup ct-attack-picker";
      const attackCards = attacks.map(a => {
        const dmg = a.system?.basic?.damage ?? '—';
        const range = a.system?.basic?.range ?? '';
        const mod = a.system?.basic?.modifier ?? '';
        const metaParts = [];
        if (dmg !== '—') metaParts.push(`Dmg ${dmg}`);
        if (mod) metaParts.push(`Mod ${mod}`);
        if (range) metaParts.push(range);
        const meta = metaParts.join(' | ') || 'Attack';
        return `<button class="ct-attack-card" data-attack-id="${a.id}" type="button">
          <img class="ct-attack-card-img" src="${a.img || 'icons/svg/combat.svg'}" alt="" draggable="false">
          <div class="ct-attack-card-body">
            <div class="ct-attack-card-name">${foundry.utils.escapeHTML(a.name)}</div>
            <div class="ct-attack-card-meta">${meta}</div>
          </div>
          <div class="ct-attack-card-roll"><i class="fas fa-dice-d20"></i></div>
        </button>`;
      }).join("");
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-sword"></i> Choose Attack<button class="ct-popup-close" title="Close"><i class="fas fa-times"></i></button></div>
        <div class="ct-attack-picker-body">${attackCards}</div>`;
      document.body.appendChild(popup);
      // Position above the trigger button
      requestAnimationFrame(() => {
        const btnRect = triggerBtn?.getBoundingClientRect();
        const popW = popup.offsetWidth || 280;
        if (btnRect) {
          const left = btnRect.left + btnRect.width / 2 - popW / 2;
          popup.style.left = Math.max(8, Math.min(window.innerWidth - popW - 8, left)) + "px";
          popup.style.bottom = (window.innerHeight - btnRect.top + 6) + "px";
        } else {
          popup.style.left = "200px";
          popup.style.bottom = "120px";
        }
        popup.style.top = "auto";
      });
      // Close button
      popup.querySelector(".ct-popup-close").onclick = () => popup.remove();
      // Attack card clicks
      popup.querySelectorAll(".ct-attack-card[data-attack-id]").forEach(card => {
        card.onclick = async () => {
          popup.remove();
          await this._rollAttackItem(card.dataset.attackId);
        };
      });
      // Close on click outside (delayed to avoid current click)
      const outsideHandler = (e) => {
        if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener("click", outsideHandler); }
      };
      requestAnimationFrame(() => {
        setTimeout(() => document.addEventListener("click", outsideHandler), 60);
      });
    },

    _buildActionsPanel() {
      const actions = [
        { key: "attack",      icon: "fas fa-sword",      label: "Attack",      desc: "Make an attack roll" },
        { key: "move",        icon: "fas fa-person-running", label: "Move",    desc: "Move action" },
        { key: "guard",       icon: "fas fa-shield-halved",  label: "Guard",   desc: "Defend and guard" },
        { key: "use-ability", icon: "fas fa-hand-sparkles",  label: "Use Ability", desc: "Use an ability" },
        { key: "use-item",    icon: "fas fa-flask",      label: "Use Item",    desc: "Use an item" },
        { key: "use-cypher",  icon: "fas fa-atom",       label: "Use Cypher",  desc: "Use a cypher" }
      ];
      const grid = actions.map(a => `
        <button class="ct-action-card" data-action="${a.key}" title="${a.desc}">
          <div class="ct-action-card-icon"><i class="${a.icon}"></i></div>
          <div class="ct-action-card-label">${a.label}</div>
        </button>`).join("");
      return `<div class="ct-panel ct-panel-actions"><div class="ct-panel-header ct-panel-header-actions-menu"><div class="ct-panel-title-wrap"><i class="fas fa-bolt"></i> <span>Actions</span></div><div class="ct-panel-action-group"><button class="ct-panel-settings-btn" data-actions-close title="Close Actions Menu"><i class="fas fa-times"></i></button></div></div><div class="ct-panel-body ct-actions-body">${grid}</div></div>`;
    },

  });
}
