import { MODULE_ID, hexToRGBA, bgFitMap, buildAbilitiesMasonryColumns } from "./utils.js";

export function applyAbilitiesPanel(CypherTaskbar) {
  Object.assign(CypherTaskbar.prototype, {

    // ── Abilities Menu helpers ────────────────────────────────────────────────
    _abilitiesMenuStyleVars(overrides = null) {
      const get = (key, fallback) => overrides && Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : (this._gs(key) ?? fallback);
      const dir = get("abilitiesMenuShadowDirection", "bottom-right");
      const dirMap = {
        "bottom-right": [1, 1], "bottom-left": [-1, 1], "top-right": [1, -1], "top-left": [-1, -1],
        "bottom": [0, 1], "top": [0, -1], "left": [-1, 0], "right": [1, 0]
      };
      const [dx, dy] = dirMap[dir] ?? [1, 1];
      const dist = Number(get("abilitiesMenuShadowDistance", 14));
      const bgFit = get("abilitiesMenuBgFit", "cover");
      const fitMap = {
        cover: { size: "cover", position: "center center" },
        contain: { size: "contain", position: "center center" },
        fit: { size: "100% 100%", position: "center center" },
        "fit-vertical": { size: "auto 100%", position: "center center" },
        "fit-horizontal": { size: "100% auto", position: "center center" }
      };
      const fit = fitMap[bgFit] ?? fitMap.cover;
      return [
        `--ct-ab-shadow:${dist * dx}px ${dist * dy}px ${dist * 1.9}px ${hexToRGBA(get("abilitiesMenuShadowColor", "#000000"), get("abilitiesMenuShadowOpacity", 0.45))}`,
        `--ct-ab-title-color:${get("abilitiesMenuTitleColor", "#f0d68a")}`,
        `--ct-ab-title-scale:${get("abilitiesMenuTitleSize", 100) / 100}`,
        `--ct-ab-title-transform:${get("abilitiesMenuTitleCaps", false) ? "uppercase" : "none"}`,
        `--ct-ab-heading-color:${get("abilitiesMenuHeadingColor", "#a07cda")}`,
        `--ct-ab-heading-opacity:${get("abilitiesMenuHeadingOpacity", 0.85)}`,
        `--ct-ab-bg:${hexToRGBA(get("abilitiesMenuBgColor", "#17121f"), get("abilitiesMenuBgOpacity", 0.94))}`,
        `--ct-ab-bg-image:url('${String(get("abilitiesMenuBgImage", "")).replace(/'/g, "%27")}')`,
        `--ct-ab-bg-image-opacity:${get("abilitiesMenuBgImageOpacity", 0.2)}`,
        `--ct-ab-bg-size:${fit.size}`,
        `--ct-ab-bg-position:${fit.position}`,
        `--ct-ab-columns:${Math.max(1, Math.min(3, Number(get("abilitiesMenuColumns", 1))))}`,
        `--ct-ab-width-scale:${get("abilitiesMenuWidthScale", 100) / 100}`,
        `--ct-ab-height-scale:${get("abilitiesMenuHeightScale", 100) / 100}`,
        `--ct-ab-font-scale:${get("abilitiesMenuFontSize", 100) / 100}`,
        `--ct-ab-item-padding:${get("abilitiesMenuItemPadding", 5)}px`
      ].join("; ");
    },

    _getAbilityCategories() {
      const list = this._gjson("abilitiesMenuCategories", []);
      return Array.isArray(list) ? list.filter(cat => cat?.id && cat?.name) : [];
    },

    _getAbilityPlacement(actorId) {
      const all = this._gjson("abilitiesMenuPlacement", {});
      return all?.[actorId] && typeof all[actorId] === "object" ? all[actorId] : {};
    },

    async _saveAbilityCategories(categories) {
      await this._ss("abilitiesMenuCategories", JSON.stringify(categories));
    },

    async _saveAbilityPlacement(actorId, placement) {
      const all = this._gjson("abilitiesMenuPlacement", {});
      all[actorId] = placement;
      await this._ss("abilitiesMenuPlacement", JSON.stringify(all));
    },

    _normalizeAbilityPlacement(actor, categories = this._getAbilityCategories()) {
      const validCategories = new Set(["uncategorized", ...categories.map(cat => cat.id)]);
      const current = this._getAbilityPlacement(actor.id);
      const abilities = this._getActorAbilities(actor);
      const normalized = {};
      abilities.forEach((item, index) => {
        const entry = current[item.id] ?? {};
        const category = validCategories.has(entry.category) ? entry.category : "uncategorized";
        const order = Number.isFinite(Number(entry.order)) ? Number(entry.order) : index;
        normalized[item.id] = { category, order };
      });
      return normalized;
    },

    _getActorAbilities(actor) {
      const bucketed = [
        ...(Array.isArray(actor?.itemTypes?.ability) ? actor.itemTypes.ability : []),
        ...(Array.isArray(actor?.itemTypes?.abilities) ? actor.itemTypes.abilities : [])
      ];
      const fallback = actor?.items?.filter?.(item => ["ability", "abilities"].includes(item.type)) ?? [];
      const map = new Map();
      [...bucketed, ...fallback].forEach(item => {
        if (item?.id && !map.has(item.id)) map.set(item.id, item);
      });
      return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    _getAbilityCategoryStyles() {
      return this._gjson("abilitiesCategoryStyles", {});
    },

    _getAbilityCategoryStyle(categoryId) {
      const styles = this._getAbilityCategoryStyles();
      const style = styles?.[categoryId] ?? {};
      return {
        icon: style.icon ?? "",
        iconSize: Math.max(12, Math.min(40, Number(style.iconSize ?? 16))),
        titleSize: Math.max(70, Math.min(180, Number(style.titleSize ?? 100))),
        titleColor: style.titleColor ?? "#f0d68a",
        padding: Math.max(4, Math.min(24, Number(style.padding ?? 8))),
        headerColor: style.headerColor ?? "#3a2060"
      };
    },

    _abilityCategoryHeaderStyle(style) {
      const s = style ?? this._getAbilityCategoryStyle("uncategorized");
      return [
        `--ct-ab-category-title-scale:${s.titleSize / 100}`,
        `--ct-ab-category-title-color:${s.titleColor}`,
        `--ct-ab-category-padding:${s.padding}px`,
        `--ct-ab-category-icon-size:${s.iconSize}px`,
        `--ct-ab-category-header-bg:${s.headerColor}`
      ].join("; ");
    },

    _abilityCategoryHeaderIconHtml(style) {
      return style?.icon ? `<i class="ct-ab-category-icon ${style.icon}"></i>` : "";
    },

    async _saveAbilityCategoryStyle(categoryId, style) {
      const styles = this._getAbilityCategoryStyles();
      styles[categoryId] = style;
      await this._ss("abilitiesCategoryStyles", JSON.stringify(styles));
    },

    _getHiddenAbilityCategories() {
      const list = this._gjson("abilitiesHiddenCategories", []);
      return Array.isArray(list) ? list : [];
    },

    async _toggleHideAbilityCategory(categoryId) {
      const categories = this._getAbilityCategories();
      const category = categories.find(cat => cat.id === categoryId);
      if (!category) return;
      const hidden = this._getHiddenAbilityCategories();
      const next = hidden.includes(categoryId)
        ? hidden.filter(id => id !== categoryId)
        : [...hidden, categoryId];
      await this._ss("abilitiesHiddenCategories", JSON.stringify(next));
      this._refreshActivePanel();
    },

    _buildAbilitiesMasonryColumns(sections) {
      const count = Math.max(1, Number(this._gs("abilitiesMenuColumns") ?? 1));
      const cols = Array.from({ length: count }, () => ({ height: 0, sections: [] }));
      sections.forEach(section => {
        const targetIndex = cols.reduce((best, col, index, arr) => col.height < arr[best].height ? index : best, 0);
        cols[targetIndex].sections.push(section.html);
        cols[targetIndex].height += section.weight;
      });
      return cols.map(col => `<div class="ct-ab-masonry-column">${col.sections.join("")}</div>`).join("");
    },

    _buildAbilitiesPanel(actor) {
      const abilities = this._getActorAbilities(actor);
      const customCategories = this._getAbilityCategories();
      const allCategories = [{ id: "uncategorized", name: "Uncategorized", system: true }, ...customCategories];
      const placement = this._normalizeAbilityPlacement(actor, customCategories);
      const currentPlacement = this._getAbilityPlacement(actor.id);
      if (JSON.stringify(currentPlacement) !== JSON.stringify(placement)) this._saveAbilityPlacement(actor.id, placement);
      const hiddenCategories = new Set(this._getHiddenAbilityCategories());
      const grouped = new Map(allCategories.map(cat => [cat.id, []]));

      for (const item of abilities) {
        const place = placement[item.id] ?? { category: "uncategorized", order: 9999 };
        if (!grouped.has(place.category)) grouped.set(place.category, []);
        grouped.get(place.category).push({ item, order: place.order });
      }

      const visibleCategories = allCategories.filter(category => {
        const entries = grouped.get(category.id) ?? [];
        return category.id !== "uncategorized" || entries.length > 0;
      });
      const visibleSections = visibleCategories.filter(category => !hiddenCategories.has(category.id));

      const sectionData = visibleSections.map(category => {
        const entries = (grouped.get(category.id) ?? []).sort((a, b) => a.order - b.order || a.item.name.localeCompare(b.item.name));
        const bodyClass = entries.length ? "ct-ab-category-body" : "ct-ab-category-body ct-ab-category-body-empty";
        const rows = entries.length ? entries.map(({ item }) => {
          const cost = item.system.basic?.cost ? `<span class="ct-item-cost">${item.system.basic.cost}</span>` : "";
          const costNum = Number((String(item.system?.basic?.cost ?? "").match(/^(\d+)/)?.[1]) ?? 0);
          const useBtn = costNum > 0 ? `<button class="ct-ab-use-inline" data-use-ability="${item.id}" title="Use ${item.name}"><i class="fas fa-bolt"></i></button>` : "";
          return `<div class="ct-item-row ct-ab-action-row ct-ab-draggable" draggable="true" data-ability-id="${item.id}"><img class="ct-item-img" src="${item.img || 'icons/svg/ability.svg'}" alt="" draggable="false"><span class="ct-item-name">${item.name}</span>${cost}${useBtn}</div>`;
        }).join("") : `<div class="ct-ab-empty-drop">Drop abilities here</div>`;
        const categoryStyle = this._getAbilityCategoryStyle(category.id);
        const html = `<section class="ct-ab-category-section" data-ab-category-section="${category.id}"><div class="ct-ab-category-header" data-ab-category-header="${category.id}" style="${this._abilityCategoryHeaderStyle(categoryStyle)}" title="Right-click to edit category header"><span class="ct-ab-category-icon-wrap">${this._abilityCategoryHeaderIconHtml(categoryStyle)}</span><span class="ct-ab-category-title">${category.name}</span></div><div class="${bodyClass}" data-ability-category="${category.id}">${rows}</div></section>`;
        return { html, weight: Math.max(entries.length, 1) };
      });
      const sections = buildAbilitiesMasonryColumns(sectionData, this.actor?.id);

      return `<div class="ct-panel ct-panel-abilities-custom" style="${this._abilitiesMenuStyleVars()};${this._getMenuBackgroundVars("abilities")}"><div class="ct-panel-header ct-panel-header-abilities-menu"><div class="ct-panel-title-wrap"><i class="fas fa-magic"></i> <span class="ct-ab-panel-title-text">Abilities</span></div><div class="ct-panel-action-group"><button class="ct-panel-settings-btn" data-ab-categories title="Ability Categories"><i class="fas fa-folder-plus"></i></button><button class="ct-panel-settings-btn" data-ab-settings title="Abilities Menu Settings"><i class="fas fa-sliders-h"></i></button><button class="ct-panel-settings-btn" data-ab-close title="Close Abilities Menu"><i class="fas fa-times"></i></button></div></div><div class="ct-panel-body ct-ab-panel-body">${sections || `<div class="ct-empty-msg">No abilities found.</div>`}</div></div>`;
    },

    _bindAbilitiesDnD(bar) {
      if (!this.actor) return;
      const zones = [...bar.querySelectorAll(".ct-ab-category-body")];
      const rows = [...bar.querySelectorAll(".ct-ab-draggable")];
      if (!zones.length || !rows.length) return;

      let dragged = null;
      const getAfterElement = (container, y) => {
        const els = [...container.querySelectorAll(".ct-ab-draggable:not(.ct-dragging)")];
        return els.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) return { offset, element: child };
          return closest;
        }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
      };

      rows.forEach(row => {
        row.ondragstart = (e) => {
          dragged = row;
          row.classList.add("ct-dragging");
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", row.dataset.abilityId || "");
        };
        row.ondragend = () => {
          row.classList.remove("ct-dragging");
          zones.forEach(zone => zone.classList.remove("ct-drop-target"));
          dragged = null;
        };
      });

      zones.forEach(zone => {
        zone.ondragover = (e) => {
          e.preventDefault();
          zone.classList.add("ct-drop-target");
          const current = dragged;
          if (!current) return;
          const after = getAfterElement(zone, e.clientY);
          if (!after) zone.appendChild(current);
          else zone.insertBefore(current, after);
        };
        zone.ondragleave = (e) => {
          if (!zone.contains(e.relatedTarget)) zone.classList.remove("ct-drop-target");
        };
        zone.ondrop = async (e) => {
          e.preventDefault();
          zone.classList.remove("ct-drop-target");
          const placement = this._normalizeAbilityPlacement(this.actor);
          bar.querySelectorAll(".ct-ab-category-body").forEach(body => {
            [...body.querySelectorAll(".ct-ab-draggable")].forEach((row, index) => {
              placement[row.dataset.abilityId] = { category: body.dataset.abilityCategory || "uncategorized", order: index };
            });
          });
          await this._saveAbilityPlacement(this.actor.id, placement);
          this._refreshActivePanel();
        };
      });
    },

    _openAbilitiesMenuSettings(event) {
      document.querySelector("#ct-abilities-settings-popup")?.remove();
      const state = {
        abilitiesMenuShadowColor: this._gs("abilitiesMenuShadowColor") ?? "#000000",
        abilitiesMenuShadowOpacity: this._gs("abilitiesMenuShadowOpacity") ?? 0.45,
        abilitiesMenuShadowDistance: this._gs("abilitiesMenuShadowDistance") ?? 14,
        abilitiesMenuShadowDirection: this._gs("abilitiesMenuShadowDirection") ?? "bottom-right",
        abilitiesMenuTitleColor: this._gs("abilitiesMenuTitleColor") ?? "#f0d68a",
        abilitiesMenuTitleSize: this._gs("abilitiesMenuTitleSize") ?? 100,
        abilitiesMenuTitleCaps: this._gs("abilitiesMenuTitleCaps") ?? false,
        abilitiesMenuHeadingColor: this._gs("abilitiesMenuHeadingColor") ?? "#a07cda",
        abilitiesMenuHeadingOpacity: this._gs("abilitiesMenuHeadingOpacity") ?? 0.85,
        abilitiesMenuBgColor: this._gs("abilitiesMenuBgColor") ?? "#17121f",
        abilitiesMenuBgOpacity: this._gs("abilitiesMenuBgOpacity") ?? 0.94,
        abilitiesMenuBgImage: this._gs("abilitiesMenuBgImage") ?? "",
        abilitiesMenuBgImageOpacity: this._gs("abilitiesMenuBgImageOpacity") ?? 0.2,
        abilitiesMenuBgFit: this._gs("abilitiesMenuBgFit") ?? "cover",
        abilitiesMenuColumns: this._gs("abilitiesMenuColumns") ?? 1,
        abilitiesMenuWidthScale: this._gs("abilitiesMenuWidthScale") ?? 100,
        abilitiesMenuHeightScale: this._gs("abilitiesMenuHeightScale") ?? 100,
        abilitiesMenuFontSize: this._gs("abilitiesMenuFontSize") ?? 100,
        abilitiesMenuItemPadding: this._gs("abilitiesMenuItemPadding") ?? 5
      };

      const dirs = ["bottom-right","bottom-left","top-right","top-left","bottom","top","left","right"];
      const dirOpts = dirs.map(d => `<option value="${d}" ${state.abilitiesMenuShadowDirection === d ? "selected" : ""}>${d.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join("");
      const fitOpts = [["cover","Cover"],["contain","Contain"],["fit","Fit"],["fit-vertical","Fit Vertical"],["fit-horizontal","Fit Horizontal"]]
        .map(([v,l]) => `<option value="${v}" ${state.abilitiesMenuBgFit === v ? "selected" : ""}>${l}</option>`).join("");

      const popup = document.createElement("div");
      popup.id = "ct-abilities-settings-popup";
      popup.classList.add("ct-popup");
      popup.style.transform = "none";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-sliders-h"></i> Abilities Menu Settings <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-tabs">
          <button class="ct-popup-tab is-active" data-tab="shadow">Shadow</button>
          <button class="ct-popup-tab" data-tab="title">Title</button>
          <button class="ct-popup-tab" data-tab="headings">Headings</button>
          <button class="ct-popup-tab" data-tab="background">Background</button>
          <button class="ct-popup-tab" data-tab="layout">Layout</button>
          <button class="ct-popup-tab" data-tab="abilities">Abilities</button>
        </div>
        <div class="ct-popup-body ct-popup-body-compact">
          <div class="ct-popup-pane is-active" data-pane="shadow">
            <label>Shadow Color <input type="color" id="am-shadow-color" value="${state.abilitiesMenuShadowColor}"></label>
            <label>Transparency <span class="ct-val-label" id="am-shadow-op-val">${Math.round(state.abilitiesMenuShadowOpacity*100)}%</span><input type="range" id="am-shadow-op" min="0" max="1" step="0.05" value="${state.abilitiesMenuShadowOpacity}"></label>
            <label>Distance <span class="ct-val-label" id="am-shadow-dist-val">${state.abilitiesMenuShadowDistance}px</span><input type="range" id="am-shadow-dist" min="0" max="40" step="1" value="${state.abilitiesMenuShadowDistance}"></label>
            <label>Direction <select id="am-shadow-dir">${dirOpts}</select></label>
          </div>
          <div class="ct-popup-pane" data-pane="title">
            <label>Title Color <input type="color" id="am-title-color" value="${state.abilitiesMenuTitleColor}"></label>
            <label>Title Size <span class="ct-val-label" id="am-title-size-val">${state.abilitiesMenuTitleSize}%</span><input type="range" id="am-title-size" min="70" max="200" step="5" value="${state.abilitiesMenuTitleSize}"></label>
            <label class="ct-toggle-row">Capitalization <input type="checkbox" id="am-title-caps" ${state.abilitiesMenuTitleCaps ? "checked" : ""}></label>
          </div>
          <div class="ct-popup-pane" data-pane="headings">
            <label>Heading Color <input type="color" id="am-heading-color" value="${state.abilitiesMenuHeadingColor}"></label>
            <label>Heading Transparency <span class="ct-val-label" id="am-heading-op-val">${Math.round(state.abilitiesMenuHeadingOpacity*100)}%</span><input type="range" id="am-heading-op" min="0.1" max="1" step="0.05" value="${state.abilitiesMenuHeadingOpacity}"></label>
          </div>
          <div class="ct-popup-pane" data-pane="background">
            <label>Menu Color <input type="color" id="am-bg-color" value="${state.abilitiesMenuBgColor}"></label>
            <label>Menu Transparency <span class="ct-val-label" id="am-bg-op-val">${Math.round(state.abilitiesMenuBgOpacity*100)}%</span><input type="range" id="am-bg-op" min="0.1" max="1" step="0.05" value="${state.abilitiesMenuBgOpacity}"></label>
            <label class="ct-popup-wide">Background Image URL <input type="text" id="am-bg-image" value="${state.abilitiesMenuBgImage.replace(/"/g,'&quot;')}" placeholder="https://..."></label>
            <label>Image Transparency <span class="ct-val-label" id="am-bg-image-op-val">${Math.round(state.abilitiesMenuBgImageOpacity*100)}%</span><input type="range" id="am-bg-image-op" min="0" max="1" step="0.05" value="${state.abilitiesMenuBgImageOpacity}"></label>
            <label>Image Fitting <select id="am-bg-fit">${fitOpts}</select></label>
          </div>
          <div class="ct-popup-pane" data-pane="layout">
            <label>Menu Columns <span class="ct-val-label" id="am-cols-val">${state.abilitiesMenuColumns}</span><input type="range" id="am-cols" min="1" max="3" step="1" value="${state.abilitiesMenuColumns}"></label>
            <label>Width Resize <span class="ct-val-label" id="am-width-val">${state.abilitiesMenuWidthScale}%</span><input type="range" id="am-width" min="60" max="180" step="5" value="${state.abilitiesMenuWidthScale}"></label>
            <label>Height Resize <span class="ct-val-label" id="am-height-val">${state.abilitiesMenuHeightScale}%</span><input type="range" id="am-height" min="60" max="180" step="5" value="${state.abilitiesMenuHeightScale}"></label>
            <label>Font Size <span class="ct-val-label" id="am-font-val">${state.abilitiesMenuFontSize}%</span><input type="range" id="am-font" min="70" max="180" step="5" value="${state.abilitiesMenuFontSize}"></label>
          </div>
          <div class="ct-popup-pane" data-pane="abilities">
            <label>Ability Padding <span class="ct-val-label" id="am-item-padding-val">${state.abilitiesMenuItemPadding}px</span><input type="range" id="am-item-padding" min="2" max="24" step="1" value="${state.abilitiesMenuItemPadding}"></label>
          </div>
        </div>`;
      document.body.appendChild(popup);

      const collectState = () => ({
        abilitiesMenuShadowColor: popup.querySelector("#am-shadow-color").value,
        abilitiesMenuShadowOpacity: parseFloat(popup.querySelector("#am-shadow-op").value),
        abilitiesMenuShadowDistance: parseInt(popup.querySelector("#am-shadow-dist").value),
        abilitiesMenuShadowDirection: popup.querySelector("#am-shadow-dir").value,
        abilitiesMenuTitleColor: popup.querySelector("#am-title-color").value,
        abilitiesMenuTitleSize: parseInt(popup.querySelector("#am-title-size").value),
        abilitiesMenuTitleCaps: popup.querySelector("#am-title-caps").checked,
        abilitiesMenuHeadingColor: popup.querySelector("#am-heading-color").value,
        abilitiesMenuHeadingOpacity: parseFloat(popup.querySelector("#am-heading-op").value),
        abilitiesMenuBgColor: popup.querySelector("#am-bg-color").value,
        abilitiesMenuBgOpacity: parseFloat(popup.querySelector("#am-bg-op").value),
        abilitiesMenuBgImage: popup.querySelector("#am-bg-image").value,
        abilitiesMenuBgImageOpacity: parseFloat(popup.querySelector("#am-bg-image-op").value),
        abilitiesMenuBgFit: popup.querySelector("#am-bg-fit").value,
        abilitiesMenuColumns: parseInt(popup.querySelector("#am-cols").value),
        abilitiesMenuWidthScale: parseInt(popup.querySelector("#am-width").value),
        abilitiesMenuHeightScale: parseInt(popup.querySelector("#am-height").value),
        abilitiesMenuFontSize: parseInt(popup.querySelector("#am-font").value),
        abilitiesMenuItemPadding: parseInt(popup.querySelector("#am-item-padding").value)
      });

      const applyPreview = () => {
        const preview = collectState();
        const panel = this.element?.querySelector(".ct-panel-abilities-custom");
        if (panel) panel.setAttribute("style", this._abilitiesMenuStyleVars(preview));
      };

      const syncVal = (id, fmt = v => v) => {
        const input = popup.querySelector(`#${id}`);
        const output = popup.querySelector(`#${id}-val`);
        if (!input || !output) return;
        input.addEventListener("input", () => { output.textContent = fmt(input.value); applyPreview(); });
      };
      syncVal("am-shadow-op", v => `${Math.round(v*100)}%`);
      syncVal("am-shadow-dist", v => `${v}px`);
      syncVal("am-title-size", v => `${v}%`);
      syncVal("am-heading-op", v => `${Math.round(v*100)}%`);
      syncVal("am-bg-op", v => `${Math.round(v*100)}%`);
      syncVal("am-bg-image-op", v => `${Math.round(v*100)}%`);
      syncVal("am-cols", v => `${v}`);
      syncVal("am-width", v => `${v}%`);
      syncVal("am-height", v => `${v}%`);
      syncVal("am-font", v => `${v}%`);
      syncVal("am-item-padding", v => `${v}px`);

      popup.querySelectorAll("input[type=color], input[type=checkbox], select").forEach(el => {
        el.addEventListener("change", applyPreview);
      });
      popup.querySelectorAll("input[type=text]").forEach(el => {
        el.addEventListener("input", applyPreview);
      });

      popup.querySelectorAll(".ct-popup-tab").forEach(tab => {
        tab.onclick = () => {
          popup.querySelectorAll(".ct-popup-tab").forEach(t => t.classList.remove("is-active"));
          popup.querySelectorAll(".ct-popup-pane").forEach(p => p.classList.remove("is-active"));
          tab.classList.add("is-active");
          popup.querySelector(`.ct-popup-pane[data-pane="${tab.dataset.tab}"]`)?.classList.add("is-active");
        };
      });

      const popHeader = popup.querySelector(".ct-popup-header");
      const closeBtn = popup.querySelector(".ct-popup-close");
      let dragState = null;
      const onMove = (ev) => {
        if (!dragState) return;
        const rect = popup.getBoundingClientRect();
        const left = Math.min(Math.max(8, ev.clientX - dragState.offsetX), Math.max(8, window.innerWidth - rect.width - 8));
        const top = Math.min(Math.max(8, ev.clientY - dragState.offsetY), Math.max(8, window.innerHeight - rect.height - 8));
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
      };
      const onUp = () => { dragState = null; document.body.classList.remove("ct-dragging-popup"); };
      popHeader.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add("ct-dragging-popup");
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      closeBtn.onclick = async () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const final = collectState();
        for (const [key, val] of Object.entries(final)) await this._ss(key, val);
        this._refreshActivePanel();
        popup.remove();
      };
    },

    _openAbilityCategoryAppearanceSettings(event, categoryId) {
      document.querySelector("#ct-ability-category-appearance-popup")?.remove();
      const categories = [{ id: "uncategorized", name: "Uncategorized" }, ...this._getAbilityCategories()];
      const category = categories.find(cat => cat.id === categoryId) ?? { id: categoryId, name: categoryId };
      const state = { ...this._getAbilityCategoryStyle(categoryId) };
      const iconOptions = this._skillCategoryIconChoices().map(choice =>
        `<button type="button" class="ct-category-icon-choice ${choice.icon === state.icon ? "is-selected" : ""}" data-category-icon="${choice.icon}" title="${choice.label}" aria-label="${choice.label}">${choice.icon ? `<i class="${choice.icon}"></i>` : `<span class="ct-category-icon-choice-none">×</span>`}</button>`
      ).join("");

      const popup = document.createElement("div");
      popup.id = "ct-ability-category-appearance-popup";
      popup.classList.add("ct-popup");
      popup.style.left = `${Math.max(8, event?.clientX ?? 120)}px`;
      popup.style.top = `${Math.max(8, event?.clientY ?? 120)}px`;
      popup.style.transform = "none";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-palette"></i> ${category.name} Header <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body ct-popup-body-compact">
          <label class="ct-popup-wide">Icon</label>
          <div class="ct-popup-wide ct-category-icon-grid" id="ct-ab-category-header-icon-grid">${iconOptions}</div>
          <input type="hidden" id="ct-ab-category-header-icon" value="${state.icon}">
          <div class="ct-popup-wide ct-category-icon-preview" id="ct-ab-category-icon-preview"></div>
          <label>Icon Size <span class="ct-val-label" id="ct-ab-category-icon-size-val">${state.iconSize}px</span><input type="range" id="ct-ab-category-icon-size" min="12" max="40" step="1" value="${state.iconSize}"></label>
          <label>Header Title Size <span class="ct-val-label" id="ct-ab-category-title-size-val">${state.titleSize}%</span><input type="range" id="ct-ab-category-title-size" min="70" max="180" step="5" value="${state.titleSize}"></label>
          <label>Title and Icon Color <input type="color" id="ct-ab-category-title-color" value="${state.titleColor}"></label>
          <label>Header Padding <span class="ct-val-label" id="ct-ab-category-padding-val">${state.padding}px</span><input type="range" id="ct-ab-category-padding" min="4" max="24" step="1" value="${state.padding}"></label>
          <label>Header Color <input type="color" id="ct-ab-category-header-color" value="${state.headerColor}"></label>
        </div>`;
      document.body.appendChild(popup);
      this._positionPopupAboveEvent(popup, event);

      const previewTarget = () => this.element?.querySelector(`[data-ab-category-header="${categoryId}"]`);
      const syncVal = (id, fmt = v => v) => {
        const input = popup.querySelector(`#${id}`);
        const output = popup.querySelector(`#${id}-val`);
        if (!input || !output) return;
        input.addEventListener("input", () => output.textContent = fmt(input.value));
      };
      syncVal("ct-ab-category-icon-size", v => `${v}px`);
      syncVal("ct-ab-category-title-size", v => `${v}%`);
      syncVal("ct-ab-category-padding", v => `${v}px`);

      const renderIconPreview = () => {
        const preview = popup.querySelector("#ct-ab-category-icon-preview");
        const icon = popup.querySelector("#ct-ab-category-header-icon").value;
        popup.querySelectorAll("[data-category-icon]").forEach(btn => btn.classList.toggle("is-selected", btn.dataset.categoryIcon === icon));
        preview.innerHTML = icon
          ? `<span class="ct-category-icon-preview-chip"><i class="${icon}"></i></span>`
          : `<span class="ct-category-icon-preview-empty">No icon selected</span>`;
      };

      const collectState = () => ({
        icon: popup.querySelector("#ct-ab-category-header-icon").value,
        iconSize: parseInt(popup.querySelector("#ct-ab-category-icon-size").value),
        titleSize: parseInt(popup.querySelector("#ct-ab-category-title-size").value),
        titleColor: popup.querySelector("#ct-ab-category-title-color").value,
        padding: parseInt(popup.querySelector("#ct-ab-category-padding").value),
        headerColor: popup.querySelector("#ct-ab-category-header-color").value
      });

      const applyPreview = () => {
        Object.assign(state, collectState());
        renderIconPreview();
        const header = previewTarget();
        if (!header) return;
        header.setAttribute("style", this._abilityCategoryHeaderStyle(state));
        const iconWrap = header.querySelector(".ct-ab-category-icon-wrap");
        if (iconWrap) iconWrap.innerHTML = this._abilityCategoryHeaderIconHtml(state);
      };

      popup.querySelectorAll("input, select").forEach(el => {
        el.addEventListener(el.matches("select") ? "change" : "input", applyPreview);
      });
      popup.querySelectorAll("[data-category-icon]").forEach(btn => btn.onclick = () => {
        popup.querySelector("#ct-ab-category-header-icon").value = btn.dataset.categoryIcon ?? "";
        applyPreview();
      });
      renderIconPreview();
      applyPreview();

      const popHeader = popup.querySelector(".ct-popup-header");
      const closeBtn = popup.querySelector(".ct-popup-close");
      let dragState = null;
      const onMove = (ev) => {
        if (!dragState) return;
        const rect = popup.getBoundingClientRect();
        popup.style.left = `${Math.min(Math.max(8, ev.clientX - dragState.offsetX), window.innerWidth - rect.width - 8)}px`;
        popup.style.top = `${Math.min(Math.max(8, ev.clientY - dragState.offsetY), window.innerHeight - rect.height - 8)}px`;
      };
      const onUp = () => { dragState = null; document.body.classList.remove("ct-dragging-popup"); };
      popHeader.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add("ct-dragging-popup");
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      closeBtn.onclick = async () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        await this._saveAbilityCategoryStyle(categoryId, collectState());
        this._refreshActivePanel();
        popup.remove();
      };
    },

    _openAbilityCategoryManager(event) {
      document.querySelector("#ct-ability-category-popup")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-ability-category-popup";
      popup.classList.add("ct-popup");
      popup.style.left = `${Math.max(8, event?.clientX ?? 120)}px`;
      popup.style.top = `${Math.max(8, event?.clientY ?? 120)}px`;
      popup.style.transform = "none";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-folder-plus"></i> Ability Categories <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body ct-popup-body-compact">
          <div class="ct-popup-pane is-active" data-pane="categories">
            <label class="ct-popup-wide">New Category Name <input type="text" id="ct-new-ability-category" placeholder="Enter category name"></label>
            <label><button type="button" class="ct-popup-action-btn" id="ct-add-ability-category">Add Category</button></label>
            <div class="ct-popup-wide ct-skill-category-list" id="ct-ability-category-list"></div>
            <div class="ct-popup-wide ct-popup-note">Drag abilities between category boxes in the Abilities menu to assign and sort them.</div>
          </div>
        </div>`;
      document.body.appendChild(popup);

      const renderCategories = () => {
        const list = popup.querySelector("#ct-ability-category-list");
        const hiddenIds = this._getHiddenAbilityCategories();
        const hiddenSet = new Set(hiddenIds);
        const categories = this._getAbilityCategories().slice().sort((a, b) => {
          const aHidden = hiddenSet.has(a.id) ? 1 : 0;
          const bHidden = hiddenSet.has(b.id) ? 1 : 0;
          return aHidden - bHidden || a.name.localeCompare(b.name);
        });
        list.innerHTML = categories.length
          ? categories.map(cat => {
              const isHidden = hiddenSet.has(cat.id);
              return `<div class="ct-skill-category-entry"><span class="${isHidden ? 'ct-ab-cat-hidden-label' : ''}">${cat.name}</span><button type="button" class="ct-ab-cat-toggle-hide" data-toggle-ab-hidden="${cat.id}" title="${isHidden ? 'Unhide' : 'Hide'} ${cat.name}"><i class="fas ${isHidden ? 'fa-eye' : 'fa-eye-slash'}"></i></button><button type="button" class="ct-skill-category-delete" data-delete-ab-category="${cat.id}" title="Delete ${cat.name}"><i class="fas fa-trash"></i></button></div>`;
            }).join("")
          : `<div class="ct-empty-msg">No custom categories yet.</div>`;
        list.querySelectorAll("[data-delete-ab-category]").forEach(btn => btn.onclick = async () => {
          const deleteId = btn.dataset.deleteAbCategory;
          const next = this._getAbilityCategories().filter(cat => cat.id !== deleteId);
          await this._saveAbilityCategories(next);
          if (this.actor) {
            const placement = this._normalizeAbilityPlacement(this.actor, next);
            Object.values(placement).forEach(entry => { if (entry.category === deleteId) entry.category = "uncategorized"; });
            await this._saveAbilityPlacement(this.actor.id, placement);
          }
          renderCategories();
          this._refreshActivePanel();
        });
        list.querySelectorAll("[data-toggle-ab-hidden]").forEach(btn => btn.onclick = async () => {
          await this._toggleHideAbilityCategory(btn.dataset.toggleAbHidden);
          renderCategories();
        });
      };

      popup.querySelector("#ct-add-ability-category").onclick = async () => {
        const input = popup.querySelector("#ct-new-ability-category");
        const name = input.value.trim();
        if (!name) return;
        const categories = this._getAbilityCategories();
        categories.push({ id: `ab-cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name });
        await this._saveAbilityCategories(categories);
        input.value = "";
        renderCategories();
        this._refreshActivePanel();
      };

      const popHeader = popup.querySelector(".ct-popup-header");
      const closeBtn = popup.querySelector(".ct-popup-close");
      let dragState = null;
      const onMove = (ev) => {
        if (!dragState) return;
        const rect = popup.getBoundingClientRect();
        popup.style.left = `${Math.min(Math.max(8, ev.clientX - dragState.offsetX), window.innerWidth - rect.width - 8)}px`;
        popup.style.top = `${Math.min(Math.max(8, ev.clientY - dragState.offsetY), window.innerHeight - rect.height - 8)}px`;
      };
      const onUp = () => { dragState = null; document.body.classList.remove("ct-dragging-popup"); };
      popHeader.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add("ct-dragging-popup");
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      closeBtn.onclick = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        popup.remove();
      };
      renderCategories();
    },

    async _openAbilityUseDialog(itemId) {
      this._closePanel();
      const actor = this.actor;
      if (!actor) return;
      const item = actor.items.get(itemId);
      if (!item) return;

      const sys = item.system ?? {};
      const costStr = String(sys?.basic?.cost ?? sys?.cost ?? "").trim();
      const effortCap = Math.max(0, Math.min(6, Number(actor?.system?.basic?.effort ?? actor?.system?.advancement?.effort ?? 0) || 0));

      const parseCost = (str) => {
        const s = String(str ?? "").toLowerCase();
        const num = Number((s.match(/^(\d+)/)?.[1]) ?? 0);
        let pool = null;
        if (s.includes("intellect")) pool = "Intellect";
        else if (s.includes("speed")) pool = "Speed";
        else if (s.includes("might")) pool = "Might";
        return { cost: num, pool };
      };

      const parsed = parseCost(costStr);
      const defaultPool = parsed.pool ?? this._defaultSkillPool(item);
      const baseCost = parsed.cost;
      const edge = this._edgeForPool(actor, defaultPool);
      const poolCurrent = this._poolValueForName(actor, defaultPool);

      const computeSummary = (effort, additional) => {
        const eff = Math.max(0, Math.min(effortCap, Number(effort) || 0));
        const add = Math.max(0, Number(additional) || 0);
        const effortCost = eff > 0 ? 3 + Math.max(0, eff - 1) * 2 : 0;
        const totalCost = Math.max(0, baseCost + effortCost + add - edge);
        const remaining = Math.max(0, poolCurrent - totalCost);
        return { effort: eff, additional: add, effortCost, totalCost, edge, poolCurrent, remaining, canAfford: totalCost <= poolCurrent };
      };

      const title = `Use Ability: ${item.name}`;
      const content = `
        <form class="ct-native-skill-roll-form">
          <div class="ct-skill-roll-shell">
            <div class="ct-skill-roll-hero">
              <div class="ct-skill-roll-kicker">Cypher Ability Cost</div>
              <div class="ct-skill-roll-title-wrap"><img class="ct-skill-roll-title-icon" src="${foundry.utils.escapeHTML(item.img || 'icons/svg/ability.svg')}" alt="" draggable="false"><div class="ct-skill-roll-title">${foundry.utils.escapeHTML(item.name)}</div></div>
              <div class="ct-skill-roll-badges">
                <span class="ct-skill-roll-badge">Pool: ${foundry.utils.escapeHTML(defaultPool)}</span>
                <span class="ct-skill-roll-badge">Base Cost: ${baseCost}</span>
                <span class="ct-skill-roll-badge">Edge: ${edge}</span>
              </div>
            </div>
            <div class="ct-skill-roll-grid">
              <label class="ct-skill-roll-field">
                <span>Effort for Effect</span>
                <select name="effort">${Array.from({ length: effortCap + 1 }, (_, i) => `<option value="${i}">${i} level${i !== 1 ? 's' : ''}</option>`).join('')}</select>
              </label>
              <label class="ct-skill-roll-field">
                <span>Additional Cost</span>
                <select name="additional">${Array.from({ length: 21 }, (_, i) => `<option value="${i}">${i}</option>`).join('')}</select>
              </label>
            </div>
            <div class="ct-skill-roll-summary" data-ability-cost-summary>
              <div class="ct-skill-roll-summary-item"><span>Base Cost</span><strong data-ab-base-cost>${baseCost}</strong></div>
              <div class="ct-skill-roll-summary-item"><span>Effort Cost</span><strong data-ab-effort-cost>0</strong></div>
              <div class="ct-skill-roll-summary-item"><span>Additional</span><strong data-ab-additional>0</strong></div>
              <div class="ct-skill-roll-summary-item"><span>Edge (discount)</span><strong data-ab-edge>${edge}</strong></div>
              <div class="ct-skill-roll-summary-item ct-ab-total-cost"><span>Total Cost</span><strong data-ab-total-cost>${Math.max(0, baseCost - edge)}</strong></div>
              <div class="ct-skill-roll-summary-item"><span>${foundry.utils.escapeHTML(defaultPool)} Pool</span><strong data-ab-pool-current>${poolCurrent}</strong></div>
              <div class="ct-skill-roll-summary-item"><span>After Use</span><strong data-ab-pool-remaining>${Math.max(0, poolCurrent - Math.max(0, baseCost - edge))}</strong></div>
            </div>
            <div class="ct-skill-roll-note">Effort for effect costs 3 points for the first level and 2 points for each additional level. Edge is subtracted from the total cost (minimum 0).</div>
          </div>
        </form>`;

      return await new Promise(resolve => {
        const dialog = new Dialog({
          title,
          content,
          buttons: {
            use: {
              icon: '<i class="fas fa-bolt"></i>',
              label: 'Use Ability',
              callback: async html => {
                const root = html?.[0] ?? html;
                const form = root?.querySelector('.ct-native-skill-roll-form');
                if (!form) return resolve(false);
                const data = Object.fromEntries(new FormData(form).entries());
                const summary = computeSummary(data.effort, data.additional);
                if (!summary.canAfford) {
                  ui.notifications?.warn?.(`Not enough ${defaultPool} pool points. Need ${summary.totalCost}, have ${poolCurrent}.`);
                  return resolve(false);
                }
                if (summary.totalCost > 0) {
                  await this._spendEffortFromPool(actor, defaultPool, summary.totalCost);
                }
                try { await item.use(); } catch (e) { console.warn(`${MODULE_ID} | item.use() failed`, e); }

                const costRows = [
                  { label: 'Base Cost', value: baseCost, type: 'cost' },
                  ...(summary.effort > 0 ? [{ label: `Effort (${summary.effort} lvl${summary.effort !== 1 ? 's' : ''})`, value: `+${summary.effortCost}`, type: 'cost' }] : []),
                  ...(summary.additional > 0 ? [{ label: 'Additional', value: `+${summary.additional}`, type: 'cost' }] : []),
                  { label: 'Edge (discount)', value: `-${Math.min(edge, baseCost + summary.effortCost + summary.additional)}`, type: 'edge' }
                ].map(r => `<div class="ct-ability-cost-row ${r.type}"><span>${r.label}</span><strong>${r.value}</strong></div>`).join('');

                const chatContent = `
                  <div class="ct-ability-use-card">
                    <div class="ct-ability-use-banner">ABILITY USED</div>
                    <div class="ct-ability-use-head">
                      <img class="ct-ability-use-icon" src="${foundry.utils.escapeHTML(item.img || 'icons/svg/ability.svg')}" alt="" draggable="false">
                      <div class="ct-ability-use-title">${foundry.utils.escapeHTML(item.name)}</div>
                    </div>
                    <div class="ct-ability-use-pool-badge">${foundry.utils.escapeHTML(defaultPool)} Pool</div>
                    <div class="ct-ability-cost-grid">
                      ${costRows}
                      <div class="ct-ability-cost-row total"><span>TOTAL COST</span><strong>${summary.totalCost}</strong></div>
                    </div>
                    <div class="ct-ability-use-pool-track">
                      <div class="ct-ability-pool-dot"><span>${poolCurrent}</span><label>Before</label></div>
                      <div class="ct-ability-pool-arrow"><i class="fas fa-chevron-right"></i></div>
                      <div class="ct-ability-pool-dot spent"><span>-${summary.totalCost}</span><label>Spent</label></div>
                      <div class="ct-ability-pool-arrow"><i class="fas fa-chevron-right"></i></div>
                      <div class="ct-ability-pool-dot remaining"><span>${summary.remaining}</span><label>After</label></div>
                    </div>
                  </div>`;
                try {
                  await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    content: chatContent
                  });
                } catch (err) {
                  console.error(`${MODULE_ID} | ChatMessage.create failed:`, err);
                }

                resolve(true);
              }
            },
            cancel: {
              icon: '<i class="fas fa-times"></i>',
              label: 'Cancel',
              callback: () => resolve(false)
            }
          },
          default: 'use',
          render: html => {
            const root = html?.[0] ?? html;
            const app = root?.closest('.app');
            app?.classList?.add('ct-skill-roll-dialog-app');
            const form = root?.querySelector('.ct-native-skill-roll-form');
            if (!form) return;
            const sync = () => {
              const data = Object.fromEntries(new FormData(form).entries());
              const s = computeSummary(data.effort, data.additional);
              form.querySelector('[data-ab-base-cost]')?.replaceChildren(document.createTextNode(String(baseCost)));
              form.querySelector('[data-ab-effort-cost]')?.replaceChildren(document.createTextNode(String(s.effortCost)));
              form.querySelector('[data-ab-additional]')?.replaceChildren(document.createTextNode(String(s.additional)));
              form.querySelector('[data-ab-edge]')?.replaceChildren(document.createTextNode(String(s.edge)));
              const totalEl = form.querySelector('[data-ab-total-cost]');
              if (totalEl) {
                totalEl.replaceChildren(document.createTextNode(String(s.totalCost)));
                totalEl.style.color = s.canAfford ? '#7cffa0' : '#ff6b6b';
              }
              form.querySelector('[data-ab-pool-current]')?.replaceChildren(document.createTextNode(String(s.poolCurrent)));
              const remEl = form.querySelector('[data-ab-pool-remaining]');
              if (remEl) {
                remEl.replaceChildren(document.createTextNode(String(s.remaining)));
                remEl.style.color = s.canAfford ? '#7cffa0' : '#ff6b6b';
              }
            };
            form.querySelectorAll('select').forEach(el => el.addEventListener('change', sync));
            sync();
          },
          close: () => resolve(false)
        }, {
          width: 520,
          classes: ['ct-skill-roll-dialog-app']
        });
        dialog.render(true);
      });
    }

  });
}
