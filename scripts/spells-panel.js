import { MODULE_ID, hexToRGBA, bgFitMap, buildSpellsMasonryColumns, skillCategoryIconChoices } from "./utils.js";

export function applySpellsPanel(CypherTaskbar) {
  Object.assign(CypherTaskbar.prototype, {
    // ══════════════════════════════════════════
    //  SPELLS MENU
    // ══════════════════════════════════════════

    // ── Spell name detection helper ──────────
    _isSpellName(name) {
      const n = (name ?? "").trim().toLowerCase();
      return ["spell", "spells", "magic"].includes(n);
    },

    // ── Spell detection helpers ──────────────
    _getSpellableItems(actor) {
      const skillCats = this._getSkillCategories();
      const abCats    = this._getAbilityCategories();
      const spellCatIds = new Set([
        ...skillCats.filter(c => this._isSpellName(c.name)).map(c => c.id),
        ...abCats.filter(c    => this._isSpellName(c.name)).map(c => c.id)
      ]);
      const items = [];
      // skills in spell-named categories
      const skillPlacement = this._getSkillPlacement(actor.id);
      actor.items.filter(i => i.type === "skill").forEach(item => {
        const p = skillPlacement[item.id];
        if (p && spellCatIds.has(p.category)) items.push(item);
      });
      // abilities in spell-named categories
      const abPlacement = this._getAbilityPlacement(actor.id);
      actor.items.filter(i => ["ability","abilities"].includes(i.type)).forEach(item => {
        const p = abPlacement[item.id];
        if (p && spellCatIds.has(p.category)) items.push(item);
      });
      // items placed directly in spells menu categories
      const spellPlacement = this._getSpellPlacement(actor.id);
      const spellCatCustom = this._getSpellCategories();
      const validSpellCats = new Set(["uncategorized", ...spellCatCustom.map(c => c.id)]);
      actor.items.filter(i => ["skill","ability","abilities"].includes(i.type)).forEach(item => {
        const p = spellPlacement[item.id];
        if (p && validSpellCats.has(p.category)) {
          if (!items.find(x => x.id === item.id)) items.push(item);
        }
      });
      return items.sort((a, b) => a.name.localeCompare(b.name));
    },

    // ── Storage helpers ──────────────────────
    _getSpellCategories() {
      const list = this._gjson("spellsMenuCategories", []);
      return Array.isArray(list) ? list.filter(c => c?.id && c?.name) : [];
    },
    _getSpellPlacement(actorId) {
      const all = this._gjson("spellsMenuPlacement", {});
      return all?.[actorId] && typeof all[actorId] === "object" ? all[actorId] : {};
    },
    async _saveSpellCategories(categories) {
      await this._ss("spellsMenuCategories", JSON.stringify(categories));
    },
    async _saveSpellPlacement(actorId, placement) {
      const all = this._gjson("spellsMenuPlacement", {});
      all[actorId] = placement;
      await this._ss("spellsMenuPlacement", JSON.stringify(all));
    },
    _getSpellCategoryStyles() { return this._gjson("spellsCategoryStyles", {}); },
    _getSpellCategoryStyle(categoryId) {
      const styles = this._getSpellCategoryStyles();
      const style  = styles?.[categoryId] ?? {};
      return {
        icon:        style.icon        ?? "",
        iconSize:    Math.max(12, Math.min(40,  Number(style.iconSize  ?? 16))),
        titleSize:   Math.max(70, Math.min(180, Number(style.titleSize ?? 100))),
        titleColor:  style.titleColor  ?? "#b8aaff",
        padding:     Math.max(4,  Math.min(24,  Number(style.padding   ?? 8))),
        headerColor: style.headerColor ?? "#2a1f5a"
      };
    },
    _spellCategoryHeaderStyle(style) {
      const s = style ?? this._getSpellCategoryStyle("uncategorized");
      return [
        `--ct-spell-category-title-scale:${s.titleSize / 100}`,
        `--ct-spell-category-title-color:${s.titleColor}`,
        `--ct-spell-category-padding:${s.padding}px`,
        `--ct-spell-category-icon-size:${s.iconSize}px`,
        `--ct-spell-category-header-bg:${s.headerColor}`
      ].join("; ");
    },
    _spellCategoryHeaderIconHtml(style) {
      return style?.icon ? `<i class="ct-spell-category-icon ${style.icon}"></i>` : "";
    },
    async _saveSpellCategoryStyle(categoryId, style) {
      const styles = this._getSpellCategoryStyles();
      styles[categoryId] = style;
      await this._ss("spellsCategoryStyles", JSON.stringify(styles));
    },
    _normalizeSpellPlacement(actor, categories = this._getSpellCategories()) {
      const validCats = new Set(["uncategorized", ...categories.map(c => c.id)]);
      const current   = this._getSpellPlacement(actor.id);
      const items     = this._getSpellableItems(actor);
      const normalized = {};
      items.forEach((item, index) => {
        const entry    = current[item.id] ?? {};
        const category = validCats.has(entry.category) ? entry.category : "uncategorized";
        const order    = Number.isFinite(Number(entry.order)) ? Number(entry.order) : index;
        normalized[item.id] = { category, order };
      });
      return normalized;
    },
    _getHiddenSpellCategories() {
      const list = this._gjson("spellsHiddenCategories", []);
      return Array.isArray(list) ? list : [];
    },
    async _toggleHideSpellCategory(categoryId) {
      const hidden = this._getHiddenSpellCategories();
      const idx    = hidden.indexOf(categoryId);
      if (idx >= 0) hidden.splice(idx, 1); else hidden.push(categoryId);
      await this._ss("spellsHiddenCategories", JSON.stringify(hidden));
      this._refreshActivePanel();
    },

    // ── CSS vars ────────────────────────────
    _spellsMenuStyleVars(overrides = null) {
      const get = (key, fb) => overrides && Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : (this._gs(key) ?? fb);
      const dir = get("spellsMenuShadowDirection", "bottom-right");
      const dirMap = { "bottom-right":[1,1], "bottom-left":[-1,1], "top-right":[1,-1], "top-left":[-1,-1], bottom:[0,1], top:[0,-1], left:[-1,0], right:[1,0] };
      const [dx, dy] = dirMap[dir] ?? [1, 1];
      const dist = Number(get("spellsMenuShadowDistance", 14));
      const bgFit = get("spellsMenuBgFit", "cover");
      const fitMap = { cover:{size:"cover",position:"center center"}, contain:{size:"contain",position:"center center"}, fit:{size:"100% 100%",position:"center center"}, "fit-vertical":{size:"auto 100%",position:"center center"}, "fit-horizontal":{size:"100% auto",position:"center center"} };
      const fit = fitMap[bgFit] ?? fitMap.cover;
      return [
        `--ct-sp-shadow:${dist*dx}px ${dist*dy}px ${dist*1.9}px ${hexToRGBA(get("spellsMenuShadowColor","#000000"),get("spellsMenuShadowOpacity",0.45))}`,
        `--ct-sp-title-color:${get("spellsMenuTitleColor","#b8aaff")}`,
        `--ct-sp-title-scale:${get("spellsMenuTitleSize",100)/100}`,
        `--ct-sp-title-transform:${get("spellsMenuTitleCaps",false)?"uppercase":"none"}`,
        `--ct-sp-heading-color:${get("spellsMenuHeadingColor","#7c6cfa")}`,
        `--ct-sp-heading-opacity:${get("spellsMenuHeadingOpacity",0.85)}`,
        `--ct-sp-bg:${hexToRGBA(get("spellsMenuBgColor","#0f0e1f"),get("spellsMenuBgOpacity",0.94))}`,
        `--ct-sp-bg-image:url('${String(get("spellsMenuBgImage","")).replace(/'/g,"%27")}')`,
        `--ct-sp-bg-image-opacity:${get("spellsMenuBgImageOpacity",0.2)}`,
        `--ct-sp-bg-size:${fit.size}`,
        `--ct-sp-bg-position:${fit.position}`,
        `--ct-sp-columns:${Math.max(1,Math.min(3,Number(get("spellsMenuColumns",1))))}`,
        `--ct-sp-width-scale:${get("spellsMenuWidthScale",100)/100}`,
        `--ct-sp-height-scale:${get("spellsMenuHeightScale",100)/100}`,
        `--ct-sp-font-scale:${get("spellsMenuFontSize",100)/100}`,
        `--ct-sp-item-padding:${get("spellsMenuItemPadding",5)}px`,
        `--ct-sp-ready-font-scale:${get("spellsReadyFontSize",100)/100}`,
        `--ct-sp-ready-padding:${get("spellsReadyPadding",5)}px`,
        `--ct-sp-ready-margin:${get("spellsReadyMargin",4)}px`,
        `--ct-sp-cast-icon-size:${get("spellsReadyCastIconSize",26)}px`,
        `--ct-sp-icon-size:${get("spellsIconSize",20)}px`
      ].join("; ");
    },

    // ── Masonry columns ──────────────────────
    _buildSpellsMasonryColumns(sections) {
      const count = Math.max(1, Number(this._gs("spellsMenuColumns") ?? 1));
      const cols  = Array.from({ length: count }, () => ({ height: 0, sections: [] }));
      sections.forEach(section => {
        const targetIndex = cols.reduce((best, col, i, arr) => col.height < arr[best].height ? i : best, 0);
        cols[targetIndex].sections.push(section.html);
        cols[targetIndex].height += section.weight;
      });
      return cols.map(col => `<div class="ct-sp-masonry-column">${col.sections.join("")}</div>`).join("");
    },

    _getMemorizedSpellIds(actorId) {
      const all = this._gjson("spellsReadyMemorized", {});
      const list = all?.[actorId];
      return Array.isArray(list) ? list : [];
    },

    async _setSpellMemorized(actorId, itemId, memorized) {
      try {
        const all = this._gjson("spellsReadyMemorized", {});
        const current = new Set(Array.isArray(all?.[actorId]) ? all[actorId] : []);
        if (memorized) current.add(itemId);
        else current.delete(itemId);
        if (current.size) all[actorId] = [...current];
        else delete all[actorId];
        await this._ss("spellsReadyMemorized", JSON.stringify(all));
      } catch(err) {
        console.error("CypherTaskbar | Failed to save memorized spells:", err);
      }
      this._refreshActivePanel();
    },

    _getSpellPointCost(item) {
      const value = item?.system?.basic?.cost ?? item?.system?.cost ?? "";
      return value === null || value === undefined || value === "" ? "—" : String(value);
    },

    _getSpellPool(item) {
      const value = item?.system?.basic?.pool ?? item?.system?.pool ?? "—";
      return value === null || value === undefined || value === "" ? "—" : String(value);
    },

    _renderSpellRow(item, { memorized = false, readyCopy = false } = {}) {
      const rowClass = ['ct-item-row', 'ct-sp-action-row'];
      if (!readyCopy) rowClass.push('ct-sp-draggable');
      if (memorized && !readyCopy) rowClass.push('is-ready');
      return `<div class="${rowClass.join(' ')}" ${readyCopy ? '' : 'draggable="true"'} data-spell-id="${item.id}" ${readyCopy ? 'data-spell-ready-copy="true"' : ''}><div class="ct-sp-row-main"><img class="ct-item-img" src="${item.img || 'icons/svg/magic-swirl.svg'}" alt="" draggable="false"><span class="ct-item-name">${item.name}</span></div><div class="ct-sp-row-meta"><span class="ct-sp-meta-pill ct-sp-cost" title="Point Cost">${this._getSpellPointCost(item)}</span><label class="ct-sp-ready-toggle" title="${memorized ? 'Remove from Ready' : 'Memorize spell'}"><input type="checkbox" data-ready-spell="${item.id}" ${memorized ? 'checked' : ''}><span class="ct-sp-ready-toggle-box"></span></label>${readyCopy ? `<button type="button" class="ct-sp-cast-btn" data-cast-spell="${item.id}" title="Cast ${item.name}"><i class="fas fa-sparkles"></i></button>` : ""}</div></div>`;
    },

    // ── Panel builder ────────────────────────
    _buildSpellsPanel(actor) {
      const items          = this._getSpellableItems(actor);
      const customCats     = this._getSpellCategories();
      const allCats        = [{ id: "uncategorized", name: "Uncategorized", system: true }, ...customCats];
      const placement      = this._normalizeSpellPlacement(actor, customCats);
      const hiddenCats     = new Set(this._getHiddenSpellCategories());
      const memorizedIds   = new Set(this._getMemorizedSpellIds(actor.id).filter(id => items.some(item => item.id === id)));
      const grouped        = new Map(allCats.map(c => [c.id, []]));

      for (const item of items) {
        const place = placement[item.id] ?? { category: "uncategorized", order: 9999 };
        if (!grouped.has(place.category)) grouped.set(place.category, []);
        grouped.get(place.category).push({ item, order: place.order });
      }

      const visibleCats = allCats.filter(category => {
        const entries = grouped.get(category.id) ?? [];
        return category.id !== "uncategorized" || entries.length > 0;
      });

      const hiddenSections = visibleCats.filter(c => hiddenCats.has(c.id));
      const hiddenIndicator = hiddenSections.length
        ? `<button class="ct-sp-hidden-indicator" data-sp-show-hidden title="Hidden categories: ${hiddenSections.map(c=>c.name).join(", ")}"><i class="fas fa-eye"></i> <span class="ct-sp-hidden-count">${hiddenSections.length}</span></button>`
        : "";

      const readyEntries = items
        .filter(item => memorizedIds.has(item.id))
        .sort((a, b) => {
          const aPlace = placement[a.id] ?? { category: "uncategorized", order: 9999 };
          const bPlace = placement[b.id] ?? { category: "uncategorized", order: 9999 };
          return aPlace.order - bPlace.order || a.name.localeCompare(b.name);
        });
      const readyRows = readyEntries.map(item => this._renderSpellRow(item, { memorized: true, readyCopy: true })).join("");
      const readyStyle = this._getSpellCategoryStyle('ready');
      const readyHtml = `<section class="ct-sp-category-section ct-sp-ready-section" data-sp-category-section="ready"><div class="ct-sp-category-header ct-sp-ready-header" data-sp-category-header="ready" style="${this._spellCategoryHeaderStyle(readyStyle)}" title="Right-click to edit category header"><span class="ct-sp-category-icon-wrap">${this._spellCategoryHeaderIconHtml(readyStyle)}</span><span class="ct-sp-category-title">READY</span></div><div class="ct-sp-ready-body ${readyEntries.length ? '' : 'ct-sp-ready-body-empty'}">${readyRows || `<div class="ct-sp-empty-drop ct-sp-ready-empty">Memorized spells appear here.</div>`}</div></section>`;

      const sectionData = visibleCats.filter(c => !hiddenCats.has(c.id)).map(category => {
        const entries = (grouped.get(category.id) ?? []).sort((a, b) => a.order - b.order || a.item.name.localeCompare(b.item.name));
        const bodyClass = entries.length ? "ct-sp-category-body" : "ct-sp-category-body ct-sp-category-body-empty";
        const rows = entries.length
          ? entries.map(({ item }) => this._renderSpellRow(item, { memorized: memorizedIds.has(item.id), readyCopy: false })).join("")
          : `<div class="ct-sp-empty-drop">Drop spells here</div>`;
        const categoryStyle = this._getSpellCategoryStyle(category.id);
        const isSpellNamed  = this._isSpellName(category.name);
        const hideBtn       = isSpellNamed ? `<button class="ct-sp-hide-btn" data-sp-hide-cat="${category.id}" title="Hide this category"><i class="fas fa-eye-slash"></i></button>` : "";
        const html = `<section class="ct-sp-category-section" data-sp-category-section="${category.id}"><div class="ct-sp-category-header" data-sp-category-header="${category.id}" style="${this._spellCategoryHeaderStyle(categoryStyle)}" title="Right-click to edit category header"><span class="ct-sp-category-icon-wrap">${this._spellCategoryHeaderIconHtml(categoryStyle)}</span><span class="ct-sp-category-title">${category.name}</span>${hideBtn}</div><div class="${bodyClass}" data-spell-category="${category.id}">${rows}</div></section>`;
        return { html, weight: Math.max(entries.length, 1) };
      });

      const sections = buildSpellsMasonryColumns(sectionData, this.actor?.id);
      const spellsGrid = sections ? `<div class="ct-sp-masonry-grid">${sections}</div>` : `<div class="ct-empty-msg">No spells found. Add abilities/skills to a category named Spell, Spells or Magic.</div>`;
      return `<div class="ct-panel ct-panel-spells-custom" style="${this._spellsMenuStyleVars()};${this._getMenuBackgroundVars("spells")}"><div class="ct-panel-header ct-panel-header-spells-menu"><div class="ct-panel-title-wrap"><i class="fas fa-hat-wizard"></i> <span class="ct-sp-panel-title-text">Spells</span>${hiddenIndicator}</div><div class="ct-panel-action-group"><button class="ct-panel-settings-btn" data-sp-categories title="Spell Categories"><i class="fas fa-folder-plus"></i></button><button class="ct-panel-settings-btn" data-sp-settings title="Spells Menu Settings"><i class="fas fa-sliders-h"></i></button><button class="ct-panel-settings-btn" data-sp-close title="Close Spells Menu"><i class="fas fa-times"></i></button></div></div><div class="ct-panel-body ct-sp-panel-body"><div class="ct-sp-layout-wrap">${readyHtml}${spellsGrid}</div></div></div>`;
    },

    // ── DnD ─────────────────────────────────
    _bindSpellsDnD(bar) {
      if (!this.actor) return;
      const zones = [...bar.querySelectorAll(".ct-sp-category-body")];
      const rows  = [...bar.querySelectorAll(".ct-sp-draggable")];
      if (!zones.length || !rows.length) return;
      let dragged = null;
      const getAfterElement = (container, y) => {
        const els = [...container.querySelectorAll(".ct-sp-draggable:not(.ct-dragging)")];
        return els.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) return { offset, element: child };
          return closest;
        }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
      };
      rows.forEach(row => {
        row.ondragstart = (e) => { dragged = row; row.classList.add("ct-dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", row.dataset.spellId || ""); };
        row.ondragend   = () => { row.classList.remove("ct-dragging"); zones.forEach(z => z.classList.remove("ct-drop-target")); dragged = null; };
      });
      zones.forEach(zone => {
        zone.ondragover  = (e) => { e.preventDefault(); zone.classList.add("ct-drop-target"); if (!dragged) return; const after = getAfterElement(zone, e.clientY); if (!after) zone.appendChild(dragged); else zone.insertBefore(dragged, after); };
        zone.ondragleave = (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove("ct-drop-target"); };
        zone.ondrop = async (e) => {
          e.preventDefault(); zone.classList.remove("ct-drop-target");
          const placement = this._normalizeSpellPlacement(this.actor);
          bar.querySelectorAll(".ct-sp-category-body").forEach(body => {
            [...body.querySelectorAll(".ct-sp-draggable")].forEach((row, index) => {
              placement[row.dataset.spellId] = { category: body.dataset.spellCategory || "uncategorized", order: index };
            });
          });
          await this._saveSpellPlacement(this.actor.id, placement);
          this._refreshActivePanel();
        };
      });
    },

    // ── Bind spells panel events ─────────────
    _bindSpellsPanelEvents(bar) {
      const spSettingsBtn  = bar.querySelector("[data-sp-settings]");
      const spCatsBtn      = bar.querySelector("[data-sp-categories]");
      const spCloseBtn     = bar.querySelector("[data-sp-close]");
      if (spSettingsBtn) spSettingsBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this._openSpellsMenuSettings(e); };
      if (spCatsBtn) spCatsBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this._openSpellCategoryManager(e); };
      if (spCloseBtn) spCloseBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this._closePanel(); };

      bar.querySelectorAll("[data-sp-hide-cat]").forEach(btn => {
        btn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this._toggleHideSpellCategory(btn.dataset.spHideCat); };
      });

      const showHiddenBtn = bar.querySelector("[data-sp-show-hidden]");
      if (showHiddenBtn) showHiddenBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await this._ss("spellsHiddenCategories", "[]");
        this._refreshActivePanel();
      };

      this._bindSpellsDnD(bar);

      bar.querySelectorAll("[data-cast-spell]").forEach(btn => {
        btn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this._openSpellCastDialog(btn.dataset.castSpell);
        };
      });

      bar.querySelectorAll("[data-ready-spell]").forEach(input => {
        input.onchange = async (e) => {
          e.stopPropagation();
          await this._setSpellMemorized(this.actor.id, input.dataset.readySpell, input.checked);
        };
        input.onclick = (e) => e.stopPropagation();
        input.closest(".ct-sp-ready-toggle")?.addEventListener("click", (e) => e.stopPropagation());
      });

      bar.querySelectorAll("[data-spell-id]").forEach(row => {
        row.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._hideSkillTooltip();
          const item = this.actor?.items.get(row.dataset.spellId);
          item?.sheet?.render(true);
        };
        row.onmouseenter = () => {
          this._hideSkillTooltip();
          const item = this.actor?.items.get(row.dataset.spellId);
          const desc = this._getSkillDescription(item);
          if (!desc) return;
          this._skillTooltipTimer = setTimeout(() => this._showSkillTooltip(row, desc), 2000);
        };
        row.onmouseleave = () => this._hideSkillTooltip();
        row.onmousedown = () => this._hideSkillTooltip();
      });

      bar.querySelectorAll("[data-sp-category-header]").forEach(header => {
        header.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); this._openSpellCategoryAppearanceSettings(e, header.dataset.spCategoryHeader); };
      });
    },

    // ── Settings popup ───────────────────────
    _openSpellsMenuSettings(event) {
      document.querySelector("#ct-spells-settings-popup")?.remove();
      const state = {
        spellsMenuShadowColor:     this._gs("spellsMenuShadowColor")     ?? "#000000",
        spellsMenuShadowOpacity:   this._gs("spellsMenuShadowOpacity")   ?? 0.45,
        spellsMenuShadowDistance:  this._gs("spellsMenuShadowDistance")  ?? 14,
        spellsMenuShadowDirection: this._gs("spellsMenuShadowDirection") ?? "bottom-right",
        spellsMenuTitleColor:      this._gs("spellsMenuTitleColor")      ?? "#b8aaff",
        spellsMenuTitleSize:       this._gs("spellsMenuTitleSize")       ?? 100,
        spellsMenuTitleCaps:       this._gs("spellsMenuTitleCaps")       ?? false,
        spellsMenuHeadingColor:    this._gs("spellsMenuHeadingColor")    ?? "#7c6cfa",
        spellsMenuHeadingOpacity:  this._gs("spellsMenuHeadingOpacity")  ?? 0.85,
        spellsMenuBgColor:         this._gs("spellsMenuBgColor")         ?? "#0f0e1f",
        spellsMenuBgOpacity:       this._gs("spellsMenuBgOpacity")       ?? 0.94,
        spellsMenuBgImage:         this._gs("spellsMenuBgImage")         ?? "",
        spellsMenuBgImageOpacity:  this._gs("spellsMenuBgImageOpacity")  ?? 0.2,
        spellsMenuBgFit:           this._gs("spellsMenuBgFit")           ?? "cover",
        spellsMenuColumns:         this._gs("spellsMenuColumns")         ?? 1,
        spellsMenuWidthScale:      this._gs("spellsMenuWidthScale")      ?? 100,
        spellsMenuHeightScale:     this._gs("spellsMenuHeightScale")     ?? 100,
        spellsMenuFontSize:        this._gs("spellsMenuFontSize")        ?? 100,
        spellsMenuItemPadding:     this._gs("spellsMenuItemPadding")     ?? 5,
        spellsReadyFontSize:       this._gs("spellsReadyFontSize")       ?? 100,
        spellsReadyPadding:        this._gs("spellsReadyPadding")        ?? 5,
        spellsReadyMargin:         this._gs("spellsReadyMargin")         ?? 4,
        spellsReadyCastIconSize:   this._gs("spellsReadyCastIconSize")   ?? 26,
        spellsIconSize:            this._gs("spellsIconSize")            ?? 20
      };
      const dirs    = ["bottom-right","bottom-left","top-right","top-left","bottom","top","left","right"];
      const dirOpts = dirs.map(d => `<option value="${d}" ${state.spellsMenuShadowDirection===d?"selected":""}>${d.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>`).join("");
      const fitOpts = [["cover","Cover"],["contain","Contain"],["fit","Fit"],["fit-vertical","Fit Vertical"],["fit-horizontal","Fit Horizontal"]].map(([v,l]) => `<option value="${v}" ${state.spellsMenuBgFit===v?"selected":""}>${l}</option>`).join("");

      const popup = document.createElement("div");
      popup.id = "ct-spells-settings-popup";
      popup.classList.add("ct-popup");
      popup.style.transform = "none";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-sliders-h"></i> Spells Menu Settings <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-tabs">
          <button class="ct-popup-tab is-active" data-tab="shadow">Shadow</button>
          <button class="ct-popup-tab" data-tab="title">Title</button>
          <button class="ct-popup-tab" data-tab="headings">Headings</button>
          <button class="ct-popup-tab" data-tab="background">Background</button>
          <button class="ct-popup-tab" data-tab="layout">Layout</button>
          <button class="ct-popup-tab" data-tab="spells">Spells</button>
        </div>
        <div class="ct-popup-body ct-popup-body-compact">
          <div class="ct-popup-pane is-active" data-pane="shadow">
            <label>Shadow Color <input type="color" id="sm-shadow-color" value="${state.spellsMenuShadowColor}"></label>
            <label>Transparency <span class="ct-val-label" id="sm-shadow-op-val">${Math.round(state.spellsMenuShadowOpacity*100)}%</span><input type="range" id="sm-shadow-op" min="0" max="1" step="0.05" value="${state.spellsMenuShadowOpacity}"></label>
            <label>Distance <span class="ct-val-label" id="sm-shadow-dist-val">${state.spellsMenuShadowDistance}px</span><input type="range" id="sm-shadow-dist" min="0" max="40" step="1" value="${state.spellsMenuShadowDistance}"></label>
            <label>Direction <select id="sm-shadow-dir">${dirOpts}</select></label>
          </div>
          <div class="ct-popup-pane" data-pane="title">
            <label>Title Color <input type="color" id="sm-title-color" value="${state.spellsMenuTitleColor}"></label>
            <label>Title Size <span class="ct-val-label" id="sm-title-size-val">${state.spellsMenuTitleSize}%</span><input type="range" id="sm-title-size" min="70" max="200" step="5" value="${state.spellsMenuTitleSize}"></label>
            <label class="ct-toggle-row">Capitalization <input type="checkbox" id="sm-title-caps" ${state.spellsMenuTitleCaps?"checked":""}></label>
          </div>
          <div class="ct-popup-pane" data-pane="headings">
            <label>Heading Color <input type="color" id="sm-heading-color" value="${state.spellsMenuHeadingColor}"></label>
            <label>Heading Transparency <span class="ct-val-label" id="sm-heading-op-val">${Math.round(state.spellsMenuHeadingOpacity*100)}%</span><input type="range" id="sm-heading-op" min="0.1" max="1" step="0.05" value="${state.spellsMenuHeadingOpacity}"></label>
          </div>
          <div class="ct-popup-pane" data-pane="background">
            <label>Menu Color <input type="color" id="sm-bg-color" value="${state.spellsMenuBgColor}"></label>
            <label>Menu Transparency <span class="ct-val-label" id="sm-bg-op-val">${Math.round(state.spellsMenuBgOpacity*100)}%</span><input type="range" id="sm-bg-op" min="0.1" max="1" step="0.05" value="${state.spellsMenuBgOpacity}"></label>
            <label class="ct-popup-wide">Background Image URL <input type="text" id="sm-bg-image" value="${state.spellsMenuBgImage.replace(/"/g,'&quot;')}" placeholder="https://..."></label>
            <label>Image Transparency <span class="ct-val-label" id="sm-bg-image-op-val">${Math.round(state.spellsMenuBgImageOpacity*100)}%</span><input type="range" id="sm-bg-image-op" min="0" max="1" step="0.05" value="${state.spellsMenuBgImageOpacity}"></label>
            <label>Image Fitting <select id="sm-bg-fit">${fitOpts}</select></label>
          </div>
          <div class="ct-popup-pane" data-pane="layout">
            <label>Menu Columns <span class="ct-val-label" id="sm-cols-val">${state.spellsMenuColumns}</span><input type="range" id="sm-cols" min="1" max="3" step="1" value="${state.spellsMenuColumns}"></label>
            <label>Width Resize <span class="ct-val-label" id="sm-width-val">${state.spellsMenuWidthScale}%</span><input type="range" id="sm-width" min="60" max="300" step="5" value="${state.spellsMenuWidthScale}"></label>
            <label>Height Resize <span class="ct-val-label" id="sm-height-val">${state.spellsMenuHeightScale}%</span><input type="range" id="sm-height" min="60" max="180" step="5" value="${state.spellsMenuHeightScale}"></label>
            <label>Font Size <span class="ct-val-label" id="sm-font-val">${state.spellsMenuFontSize}%</span><input type="range" id="sm-font" min="70" max="180" step="5" value="${state.spellsMenuFontSize}"></label>
          </div>
          <div class="ct-popup-pane" data-pane="spells">
            <label>Spell Padding <span class="ct-val-label" id="sm-item-padding-val">${state.spellsMenuItemPadding}px</span><input type="range" id="sm-item-padding" min="2" max="24" step="1" value="${state.spellsMenuItemPadding}"></label>
            <label>Spell Icon Size <span class="ct-val-label" id="sm-icon-size-val">${state.spellsIconSize}px</span><input type="range" id="sm-icon-size" min="12" max="40" step="2" value="${state.spellsIconSize}"></label>
            <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:10px 0;">
            <div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--ct-heading-color,#7c6cfa);font-weight:700;margin-bottom:8px;">Ready Category</div>
            <label>Font Size <span class="ct-val-label" id="sm-ready-font-val">${state.spellsReadyFontSize}%</span><input type="range" id="sm-ready-font" min="70" max="180" step="5" value="${state.spellsReadyFontSize}"></label>
            <label>Padding <span class="ct-val-label" id="sm-ready-padding-val">${state.spellsReadyPadding}px</span><input type="range" id="sm-ready-padding" min="2" max="24" step="1" value="${state.spellsReadyPadding}"></label>
            <label>Row Margin <span class="ct-val-label" id="sm-ready-margin-val">${state.spellsReadyMargin}px</span><input type="range" id="sm-ready-margin" min="0" max="20" step="1" value="${state.spellsReadyMargin}"></label>
            <label>Cast Icon Size <span class="ct-val-label" id="sm-ready-cast-val">${state.spellsReadyCastIconSize}px</span><input type="range" id="sm-ready-cast" min="16" max="40" step="2" value="${state.spellsReadyCastIconSize}"></label>
          </div>
        </div>`;
      document.body.appendChild(popup);

      const collectState = () => ({
        spellsMenuShadowColor:     popup.querySelector("#sm-shadow-color").value,
        spellsMenuShadowOpacity:   parseFloat(popup.querySelector("#sm-shadow-op").value),
        spellsMenuShadowDistance:  parseInt(popup.querySelector("#sm-shadow-dist").value),
        spellsMenuShadowDirection: popup.querySelector("#sm-shadow-dir").value,
        spellsMenuTitleColor:      popup.querySelector("#sm-title-color").value,
        spellsMenuTitleSize:       parseInt(popup.querySelector("#sm-title-size").value),
        spellsMenuTitleCaps:       popup.querySelector("#sm-title-caps").checked,
        spellsMenuHeadingColor:    popup.querySelector("#sm-heading-color").value,
        spellsMenuHeadingOpacity:  parseFloat(popup.querySelector("#sm-heading-op").value),
        spellsMenuBgColor:         popup.querySelector("#sm-bg-color").value,
        spellsMenuBgOpacity:       parseFloat(popup.querySelector("#sm-bg-op").value),
        spellsMenuBgImage:         popup.querySelector("#sm-bg-image").value,
        spellsMenuBgImageOpacity:  parseFloat(popup.querySelector("#sm-bg-image-op").value),
        spellsMenuBgFit:           popup.querySelector("#sm-bg-fit").value,
        spellsMenuColumns:         parseInt(popup.querySelector("#sm-cols").value),
        spellsMenuWidthScale:      parseInt(popup.querySelector("#sm-width").value),
        spellsMenuHeightScale:     parseInt(popup.querySelector("#sm-height").value),
        spellsMenuFontSize:        parseInt(popup.querySelector("#sm-font").value),
        spellsMenuItemPadding:     parseInt(popup.querySelector("#sm-item-padding").value),
        spellsReadyFontSize:       parseInt(popup.querySelector("#sm-ready-font").value),
        spellsReadyPadding:        parseInt(popup.querySelector("#sm-ready-padding").value),
        spellsReadyMargin:         parseInt(popup.querySelector("#sm-ready-margin").value),
        spellsReadyCastIconSize:   parseInt(popup.querySelector("#sm-ready-cast").value),
        spellsIconSize:            parseInt(popup.querySelector("#sm-icon-size").value)
      });

      const applyPreview = () => {
        const preview = collectState();
        const panel   = this.element?.querySelector(".ct-panel-spells-custom");
        if (panel) panel.setAttribute("style", this._spellsMenuStyleVars(preview));
      };

      const syncVal = (id, fmt = v => v) => {
        const input  = popup.querySelector(`#${id}`);
        const output = popup.querySelector(`#${id}-val`);
        if (!input || !output) return;
        input.addEventListener("input", () => { output.textContent = fmt(input.value); applyPreview(); });
      };
      syncVal("sm-shadow-op",       v => `${Math.round(v*100)}%`);
      syncVal("sm-shadow-dist",     v => `${v}px`);
      syncVal("sm-title-size",      v => `${v}%`);
      syncVal("sm-heading-op",      v => `${Math.round(v*100)}%`);
      syncVal("sm-bg-op",           v => `${Math.round(v*100)}%`);
      syncVal("sm-bg-image-op",     v => `${Math.round(v*100)}%`);
      syncVal("sm-cols",            v => `${v}`);
      syncVal("sm-width",           v => `${v}%`);
      syncVal("sm-height",          v => `${v}%`);
      syncVal("sm-font",            v => `${v}%`);
      syncVal("sm-item-padding",    v => `${v}px`);
      syncVal("sm-ready-font",      v => `${v}%`);
      syncVal("sm-ready-padding",   v => `${v}px`);
      syncVal("sm-ready-margin",    v => `${v}px`);
      syncVal("sm-ready-cast",      v => `${v}px`);
      syncVal("sm-icon-size",       v => `${v}px`);

      popup.querySelectorAll("input[type=color],input[type=checkbox],select").forEach(el => el.addEventListener("change", applyPreview));
      popup.querySelectorAll("input[type=text]").forEach(el => el.addEventListener("input", applyPreview));

      popup.querySelectorAll(".ct-popup-tab").forEach(tab => {
        tab.onclick = () => {
          popup.querySelectorAll(".ct-popup-tab").forEach(t => t.classList.remove("is-active"));
          popup.querySelectorAll(".ct-popup-pane").forEach(p => p.classList.remove("is-active"));
          tab.classList.add("is-active");
          popup.querySelector(`.ct-popup-pane[data-pane="${tab.dataset.tab}"]`)?.classList.add("is-active");
        };
      });

      const popHeader = popup.querySelector(".ct-popup-header");
      const closeBtn  = popup.querySelector(".ct-popup-close");
      let dragState   = null;
      const onMove = (ev) => {
        if (!dragState) return;
        const rect = popup.getBoundingClientRect();
        popup.style.left = `${Math.min(Math.max(8, ev.clientX - dragState.offsetX), window.innerWidth  - rect.width  - 8)}px`;
        popup.style.top  = `${Math.min(Math.max(8, ev.clientY - dragState.offsetY), window.innerHeight - rect.height - 8)}px`;
      };
      const onUp = () => { dragState = null; document.body.classList.remove("ct-dragging-popup"); };
      popHeader.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add("ct-dragging-popup");
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp, { once: true });
      };
      closeBtn.onclick = async () => {
        window.removeEventListener("mousemove", onMove);
        const final = collectState();
        for (const [key, val] of Object.entries(final)) await this._ss(key, val);
        this._refreshActivePanel();
        popup.remove();
      };
    },

    // ── Category appearance popup ────────────
    _openSpellCategoryAppearanceSettings(event, categoryId) {
      document.querySelector("#ct-spell-category-appearance-popup")?.remove();
      const categories = [{ id: "ready", name: "READY" }, { id: "uncategorized", name: "Uncategorized" }, ...this._getSpellCategories()];
      const category   = categories.find(c => c.id === categoryId) ?? { id: categoryId, name: categoryId };
      const state      = { ...this._getSpellCategoryStyle(categoryId) };
      const iconOptions = skillCategoryIconChoices().map(choice =>
        `<button type="button" class="ct-category-icon-choice ${choice.icon === state.icon ? "is-selected" : ""}" data-category-icon="${choice.icon}" title="${choice.label}" aria-label="${choice.label}">${choice.icon ? `<i class="${choice.icon}"></i>` : `<span class="ct-category-icon-choice-none">×</span>`}</button>`
      ).join("");

      const popup = document.createElement("div");
      popup.id    = "ct-spell-category-appearance-popup";
      popup.classList.add("ct-popup");
      popup.style.left = `${Math.max(8, event?.clientX ?? 120)}px`;
      popup.style.top  = `${Math.max(8, event?.clientY ?? 120)}px`;
      popup.style.transform = "none";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-palette"></i> ${category.name} Header <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body ct-popup-body-compact">
          <label class="ct-popup-wide">Icon</label>
          <div class="ct-popup-wide ct-category-icon-grid" id="ct-sp-category-header-icon-grid">${iconOptions}</div>
          <input type="hidden" id="ct-sp-category-header-icon" value="${state.icon}">
          <div class="ct-popup-wide ct-category-icon-preview" id="ct-sp-category-icon-preview"></div>
          <label>Icon Size <span class="ct-val-label" id="ct-sp-category-icon-size-val">${state.iconSize}px</span><input type="range" id="ct-sp-category-icon-size" min="12" max="40" step="1" value="${state.iconSize}"></label>
          <label>Header Title Size <span class="ct-val-label" id="ct-sp-category-title-size-val">${state.titleSize}%</span><input type="range" id="ct-sp-category-title-size" min="70" max="180" step="5" value="${state.titleSize}"></label>
          <label>Title and Icon Color <input type="color" id="ct-sp-category-title-color" value="${state.titleColor}"></label>
          <label>Header Padding <span class="ct-val-label" id="ct-sp-category-padding-val">${state.padding}px</span><input type="range" id="ct-sp-category-padding" min="4" max="24" step="1" value="${state.padding}"></label>
          <label>Header Color <input type="color" id="ct-sp-category-header-color" value="${state.headerColor}"></label>
        </div>`;
      document.body.appendChild(popup);
      this._positionPopupAboveEvent(popup, event);

      const previewTarget = () => this.element?.querySelector(`[data-sp-category-header="${categoryId}"]`);
      const syncVal = (id, fmt = v => v) => {
        const input  = popup.querySelector(`#${id}`);
        const output = popup.querySelector(`#${id}-val`);
        if (!input || !output) return;
        input.addEventListener("input", () => output.textContent = fmt(input.value));
      };
      syncVal("ct-sp-category-icon-size",  v => `${v}px`);
      syncVal("ct-sp-category-title-size", v => `${v}%`);
      syncVal("ct-sp-category-padding",    v => `${v}px`);

      const renderIconPreview = () => {
        const preview = popup.querySelector("#ct-sp-category-icon-preview");
        const icon    = popup.querySelector("#ct-sp-category-header-icon").value;
        popup.querySelectorAll("[data-category-icon]").forEach(btn => btn.classList.toggle("is-selected", btn.dataset.categoryIcon === icon));
        preview.innerHTML = icon
          ? `<span class="ct-category-icon-preview-chip"><i class="${icon}"></i></span>`
          : `<span class="ct-category-icon-preview-empty">No icon selected</span>`;
      };
      const collectState = () => ({
        icon:        popup.querySelector("#ct-sp-category-header-icon").value,
        iconSize:    parseInt(popup.querySelector("#ct-sp-category-icon-size").value),
        titleSize:   parseInt(popup.querySelector("#ct-sp-category-title-size").value),
        titleColor:  popup.querySelector("#ct-sp-category-title-color").value,
        padding:     parseInt(popup.querySelector("#ct-sp-category-padding").value),
        headerColor: popup.querySelector("#ct-sp-category-header-color").value
      });
      const applyPreview = () => {
        Object.assign(state, collectState());
        renderIconPreview();
        const header = previewTarget();
        if (!header) return;
        header.setAttribute("style", this._spellCategoryHeaderStyle(state));
        const iconWrap = header.querySelector(".ct-sp-category-icon-wrap");
        if (iconWrap) iconWrap.innerHTML = this._spellCategoryHeaderIconHtml(state);
      };
      popup.querySelectorAll("input, select").forEach(el => el.addEventListener(el.matches("select") ? "change" : "input", applyPreview));
      popup.querySelectorAll("[data-category-icon]").forEach(btn => btn.onclick = () => { popup.querySelector("#ct-sp-category-header-icon").value = btn.dataset.categoryIcon ?? ""; applyPreview(); });
      renderIconPreview();
      applyPreview();

      const popHeader = popup.querySelector(".ct-popup-header");
      const closeBtn  = popup.querySelector(".ct-popup-close");
      let dragState   = null;
      const onMove = (ev) => {
        if (!dragState) return;
        const rect = popup.getBoundingClientRect();
        popup.style.left = `${Math.min(Math.max(8, ev.clientX - dragState.offsetX), window.innerWidth  - rect.width  - 8)}px`;
        popup.style.top  = `${Math.min(Math.max(8, ev.clientY - dragState.offsetY), window.innerHeight - rect.height - 8)}px`;
      };
      const onUp = () => { dragState = null; document.body.classList.remove("ct-dragging-popup"); };
      popHeader.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add("ct-dragging-popup");
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp, { once: true });
      };
      closeBtn.onclick = async () => {
        window.removeEventListener("mousemove", onMove);
        await this._saveSpellCategoryStyle(categoryId, collectState());
        this._refreshActivePanel();
        popup.remove();
      };
    },

    // ── Category manager popup ───────────────
    _openSpellCategoryManager(event) {
      document.querySelector("#ct-spell-category-popup")?.remove();
      const popup = document.createElement("div");
      popup.id    = "ct-spell-category-popup";
      popup.classList.add("ct-popup");
      popup.style.left = `${Math.max(8, event?.clientX ?? 120)}px`;
      popup.style.top  = `${Math.max(8, event?.clientY ?? 120)}px`;
      popup.style.transform = "none";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-folder-plus"></i> Spell Categories <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body ct-popup-body-compact">
          <div class="ct-popup-pane is-active" data-pane="categories">
            <label class="ct-popup-wide">New Category Name <input type="text" id="ct-new-spell-category" placeholder="Enter category name"></label>
            <label><button type="button" class="ct-popup-action-btn" id="ct-add-spell-category">Add Category</button></label>
            <div class="ct-popup-wide ct-skill-category-list" id="ct-spell-category-list"></div>
            <div class="ct-popup-wide ct-popup-note">Drag spells between category boxes in the Spells menu to assign and sort them. READY is always shown at the top and cannot be deleted.</div>
          </div>
        </div>`;
      document.body.appendChild(popup);

      const renderCategories = () => {
        const list       = popup.querySelector("#ct-spell-category-list");
        const categories = this._getSpellCategories();
        const rows = [
          `<div class="ct-skill-category-entry ct-sp-system-category-entry"><span>READY</span><span class="ct-sp-system-category-lock" title="Default category"><i class="fas fa-lock"></i></span></div>`
        ];
        if (categories.length) rows.push(...categories.map(cat => `<div class="ct-skill-category-entry"><span>${cat.name}</span><button type="button" class="ct-skill-category-delete" data-delete-sp-category="${cat.id}" title="Delete ${cat.name}"><i class="fas fa-trash"></i></button></div>`));
        list.innerHTML   = rows.join("");
        list.querySelectorAll("[data-delete-sp-category]").forEach(btn => btn.onclick = async () => {
          const deleteId = btn.dataset.deleteSpCategory;
          const next     = this._getSpellCategories().filter(c => c.id !== deleteId);
          await this._saveSpellCategories(next);
          if (this.actor) {
            const placement = this._normalizeSpellPlacement(this.actor, next);
            Object.values(placement).forEach(e => { if (e.category === deleteId) e.category = "uncategorized"; });
            await this._saveSpellPlacement(this.actor.id, placement);
          }
          renderCategories();
          this._refreshActivePanel();
        });
      };
      popup.querySelector("#ct-add-spell-category").onclick = async () => {
        const input = popup.querySelector("#ct-new-spell-category");
        const name  = input.value.trim();
        if (!name) return;
        const categories = this._getSpellCategories();
        categories.push({ id: `sp-cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`, name });
        await this._saveSpellCategories(categories);
        input.value = "";
        renderCategories();
        this._refreshActivePanel();
      };
      renderCategories();

      const popHeader = popup.querySelector(".ct-popup-header");
      const closeBtn  = popup.querySelector(".ct-popup-close");
      let dragState   = null;
      const onMove = (ev) => {
        if (!dragState) return;
        const rect = popup.getBoundingClientRect();
        popup.style.left = `${Math.min(Math.max(8, ev.clientX - dragState.offsetX), window.innerWidth  - rect.width  - 8)}px`;
        popup.style.top  = `${Math.min(Math.max(8, ev.clientY - dragState.offsetY), window.innerHeight - rect.height - 8)}px`;
      };
      const onUp = () => { dragState = null; document.body.classList.remove("ct-dragging-popup"); };
      popHeader.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add("ct-dragging-popup");
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp, { once: true });
      };
      closeBtn.onclick = () => { window.removeEventListener("mousemove", onMove); popup.remove(); };
    },

    async _openSpellCastDialog(itemId) {
      this._closePanel();
      const actor = this.actor;
      if (!actor) return;
      const item = actor.items.get(itemId);
      if (!item) return;

      const effortCap = Math.max(0, Math.min(6, Number(actor?.system?.basic?.effort ?? actor?.system?.advancement?.effort ?? 0) || 0));
      const costStr = String(item.system?.basic?.cost ?? item.system?.cost ?? "").trim();
      const costNum = Number((costStr.match(/^(\d+)/)?.[1]) ?? 0);

      // Detect pool from cost string (Cypher System: abilities cost from a specific pool)
      const poolLower = costStr.toLowerCase();
      let detectedPool = "Intellect";
      if (poolLower.includes("might")) detectedPool = "Might";
      else if (poolLower.includes("speed")) detectedPool = "Speed";
      else if (poolLower.includes("intellect")) detectedPool = "Intellect";

      const edge = this._edgeForPool(actor, detectedPool);
      const poolCurrent = this._poolValueForName(actor, detectedPool);

      // ── Cypher System Ability/Spell Cost Rules ──
      // 1. Base cost is the spell's listed cost.
      // 2. Effort for effect and effort for damage are calculated SEPARATELY.
      //    Each type costs 3 pts for the 1st level, +2 pts for each additional level.
      // 3. Edge is subtracted from the TOTAL cost (base + all effort costs).
      // 4. Minimum total cost is 0.
      // 5. Final difficulty = base - assets - effortEffect - ease + hindrance.
      // 6. Target number = finalDifficulty * 3.
      const computeCastSummary = (data) => {
        const baseDifficulty = Math.max(0, Math.min(10, Number(data.baseDifficulty ?? 0) || 0));
        const assets = Math.max(0, Math.min(2, Number(data.assets ?? 0) || 0));
        const effortEffect = Math.max(0, Math.min(effortCap, Number(data.effortEffect ?? 0) || 0));
        const effortDamage = Math.max(0, Math.min(effortCap, Number(data.effortDamage ?? 0) || 0));
        const easedBy = Math.max(0, Number(data.easedBy ?? 0) || 0);
        const hinderedBy = Math.max(0, Number(data.hinderedBy ?? 0) || 0);

        // Effort costs are calculated PER TYPE (Cypher System core rule)
        const effortEffectCost = effortEffect > 0 ? 3 + (effortEffect - 1) * 2 : 0;
        const effortDamageCost = effortDamage > 0 ? 3 + (effortDamage - 1) * 2 : 0;
        const totalEffortCost = effortEffectCost + effortDamageCost;
        const totalEffortLevels = effortEffect + effortDamage;

        const finalDifficulty = Math.max(0, Math.min(10, baseDifficulty - assets - effortEffect - easedBy + hinderedBy));
        const target = finalDifficulty * 3;

        const subtotal = costNum + totalEffortCost;
        const edgeDiscount = Math.min(edge, subtotal);
        const totalSpend = Math.max(0, subtotal - edge);
        const remainingPool = Math.max(0, poolCurrent - totalSpend);
        const canAfford = totalSpend <= poolCurrent;

        return {
          baseDifficulty, assets, effortEffect, effortDamage, totalEffortLevels,
          effortEffectCost, effortDamageCost, totalEffortCost,
          easedBy, hinderedBy, edge, edgeDiscount, poolCurrent,
          subtotal, finalDifficulty, target, costNum, totalSpend, remainingPool, canAfford
        };
      };

      const initialSummary = computeCastSummary({});

      const title = `Cast Spell: ${item.name}`;
      const content = `
        <form class="ct-native-skill-roll-form">
          <div class="ct-skill-roll-shell">
            <div class="ct-skill-roll-hero" style="background: linear-gradient(135deg, rgba(42,31,90,0.95), rgba(90,52,144,0.92), rgba(42,31,90,0.95));">
              <div class="ct-skill-roll-kicker">Cypher Spell Cast</div>
              <div class="ct-skill-roll-title-wrap"><img class="ct-skill-roll-title-icon" src="${foundry.utils.escapeHTML(item.img || 'icons/svg/magic-swirl.svg')}" alt="" draggable="false"><div class="ct-skill-roll-title">${foundry.utils.escapeHTML(item.name)}</div></div>
              <div class="ct-skill-roll-badges">
                <span class="ct-skill-roll-badge">Cost: ${costNum}</span>
                <span class="ct-skill-roll-badge">Edge (discount): ${edge}</span>
                <span class="ct-skill-roll-badge">${foundry.utils.escapeHTML(detectedPool)} Pool: ${poolCurrent}</span>
              </div>
            </div>
            <div class="ct-skill-roll-grid">
              <label class="ct-skill-roll-field">
                <span>Difficulty</span>
                <select name="baseDifficulty">${Array.from({length:11},(_,i) => `<option value="${i}" ${i===0?'selected':''}>${i}${i===0?' – Routine':i===10?' – Impossible':''}</option>`).join('')}</select>
              </label>
              <label class="ct-skill-roll-field">
                <span>Assets</span>
                <select name="assets">${Array.from({length:3},(_,i) => `<option value="${i}" ${i===0?'selected':''}>${i}</option>`).join('')}</select>
              </label>
              <label class="ct-skill-roll-field">
                <span>Effort for Effect <small style="color:rgba(255,255,255,0.35);font-size:0.75em;">(max ${effortCap})</small></span>
                <select name="effortEffect" data-effort-type="effect">${Array.from({length:effortCap+1},(_,i) => `<option value="${i}" ${i===0?'selected':''}>${i}</option>`).join('')}</select>
              </label>
              <label class="ct-skill-roll-field">
                <span>Effort for Damage <small style="color:rgba(255,255,255,0.35);font-size:0.75em;">(max ${effortCap})</small></span>
                <select name="effortDamage" data-effort-type="damage">${Array.from({length:effortCap+1},(_,i) => `<option value="${i}" ${i===0?'selected':''}>${i}</option>`).join('')}</select>
              </label>
              <label class="ct-skill-roll-field">
                <span>Other Ease</span>
                <select name="easedBy">${Array.from({length:7},(_,i) => `<option value="${i}" ${i===0?'selected':''}>${i}</option>`).join('')}</select>
              </label>
              <label class="ct-skill-roll-field">
                <span>Hindrance</span>
                <select name="hinderedBy">${Array.from({length:7},(_,i) => `<option value="${i}" ${i===0?'selected':''}>${i}</option>`).join('')}</select>
              </label>
            </div>
            <div class="ct-skill-roll-summary" data-spell-cast-summary>
              <div class="ct-skill-roll-summary-item"><span>Base Difficulty</span><strong data-cast-base-diff>0</strong></div>
              <div class="ct-skill-roll-summary-item"><span>Final Difficulty</span><strong data-cast-final-diff>0</strong></div>
              <div class="ct-skill-roll-summary-item"><span>Target Number</span><strong data-cast-target>0</strong></div>
              <div class="ct-skill-roll-summary-item"><span>Effort Levels</span><strong data-cast-effort-levels>0</strong></div>
              <div class="ct-skill-roll-summary-item"><span>Effort Cost</span><strong data-cast-effort-cost>0</strong></div>
              <div class="ct-skill-roll-summary-item ct-ab-total-cost"><span>Edge (discount)</span><strong data-cast-edge>-0</strong></div>
              <div class="ct-skill-roll-summary-item"><span>Total Spend</span><strong data-cast-total-spend style="color:${initialSummary.canAfford?'#7cffa0':'#ff6b6b'};">${initialSummary.totalSpend}</strong></div>
            </div>
            <div class="ct-skill-roll-note">Spell casting uses the ${foundry.utils.escapeHTML(detectedPool)} pool. Effort for effect and damage are calculated separately: 3 pts for the 1st level of each type, 2 pts for each additional level of that type. Edge reduces the total cost (spell cost + all effort costs). Minimum spend is 0.</div>
          </div>
        </form>`;

      return await new Promise(resolve => {
        const dialog = new Dialog({
          title,
          content,
          buttons: {
            cast: {
              icon: '<i class="fas fa-sparkles"></i>',
              label: 'Cast Spell',
              callback: async html => {
                const root = html?.[0] ?? html;
                const form = root?.querySelector('.ct-native-skill-roll-form');
                if (!form) return resolve(false);
                const data = Object.fromEntries(new FormData(form).entries());
                const summary = computeCastSummary(data);
                if (!summary.canAfford) {
                  ui.notifications?.warn?.(`Not enough ${detectedPool} pool points. Need ${summary.totalSpend} total (${summary.costNum} spell + ${summary.totalEffortCost} effort - ${summary.edgeDiscount} edge), have ${summary.poolCurrent}.`);
                  return resolve(false);
                }

                // ── Roll the d20 (Cypher System core mechanic) ──
                const roll = await (new Roll('1d20')).evaluate();
                const rollTotal = Number(roll.total ?? 0);
                const specialEvent = this._skillRollSpecialEvent(rollTotal);

                // Achieved difficulty = (roll + modifiers*3) / 3
                const totalModifiers = summary.assets + summary.effortEffect + summary.easedBy - summary.hinderedBy;
                const achievedDifficulty = Math.max(0, Math.floor((rollTotal + totalModifiers * 3) / 3));
                const success = achievedDifficulty >= summary.finalDifficulty;

                // ── Spend from pool ──
                if (summary.totalSpend > 0) {
                  await this._spendEffortFromPool(actor, detectedPool, summary.totalSpend);
                }

                // Try to trigger the item's use handler
                try { await item.use(); } catch (e) { console.warn(`${MODULE_ID} | item.use() failed for spell`, e); }

                // ── Build chat message ──
                const costRows = [
                  ...(summary.costNum > 0 ? [{ label: 'Spell Cost', value: summary.costNum, type: 'cost' }] : []),
                  ...(summary.effortEffectCost > 0 ? [{ label: `Effort Effect (${summary.effortEffect} lvl${summary.effortEffect !== 1 ? 's' : ''})`, value: summary.effortEffectCost, type: 'cost' }] : []),
                  ...(summary.effortDamageCost > 0 ? [{ label: `Effort Damage (${summary.effortDamage} lvl${summary.effortDamage !== 1 ? 's' : ''})`, value: summary.effortDamageCost, type: 'cost' }] : []),
                  ...(summary.edgeDiscount > 0 ? [{ label: 'Edge (discount)', value: `-${summary.edgeDiscount}`, type: 'edge' }] : [])
                ].map(r => `<div class="ct-ability-cost-row ${r.type}"><span>${r.label}</span><strong>${r.value}</strong></div>`).join('');

                const damageBonus = summary.effortDamage * 3;
                const damageBlock = damageBonus > 0
                  ? `<div class="ct-ability-use-damage"><span class="ct-ability-use-damage-label">Damage Bonus</span><span class="ct-ability-use-damage-value">+${damageBonus} (Effort for Damage)</span></div>`
                  : '';

                const chatContent = `
                  <div class="ct-ability-use-card">
                    <div class="ct-ability-use-banner" style="background: linear-gradient(90deg, #2a1f5a, #5a3490);">SPELL CAST</div>
                    <div class="ct-ability-use-head">
                      <img class="ct-ability-use-icon" src="${foundry.utils.escapeHTML(item.img || 'icons/svg/magic-swirl.svg')}" alt="" draggable="false">
                      <div class="ct-ability-use-title">${foundry.utils.escapeHTML(item.name)}</div>
                    </div>
                    <div class="ct-ability-use-pool-badge">${foundry.utils.escapeHTML(detectedPool)} Pool</div>
                    <div class="ct-ability-cost-grid">
                      ${costRows}
                      <div class="ct-ability-cost-row total"><span>TOTAL SPENT</span><strong>${summary.totalSpend}</strong></div>
                    </div>
                    <div class="ct-ability-use-pool-track">
                      <div class="ct-ability-pool-dot"><span>${poolCurrent}</span><label>Before</label></div>
                      <div class="ct-ability-pool-arrow"><i class="fas fa-chevron-right"></i></div>
                      <div class="ct-ability-pool-dot spent"><span>-${summary.totalSpend}</span><label>Spent</label></div>
                      <div class="ct-ability-pool-arrow"><i class="fas fa-chevron-right"></i></div>
                      <div class="ct-ability-pool-dot remaining"><span>${summary.remainingPool}</span><label>After</label></div>
                    </div>
                    ${damageBlock}
                    <div class="ct-ability-use-roll-result">
                      <div class="ct-ability-use-roll-label">Roll Result</div>
                      <div class="ct-ability-use-roll-value">${rollTotal}</div>
                      <div class="ct-ability-use-roll-diff">Target: ${summary.target} (Difficulty ${summary.finalDifficulty})</div>
                      <div class="ct-ability-use-roll-success" style="color:${success ? '#7cffa0' : '#ff6b6b'};">${success ? 'SUCCESS' : 'FAILURE'}</div>
                      ${specialEvent ? `<div class="ct-ability-use-roll-special"><strong>${foundry.utils.escapeHTML(specialEvent.title)}:</strong> ${foundry.utils.escapeHTML(specialEvent.text)}</div>` : ''}
                    </div>
                  </div>`;

                try {
                  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: chatContent });
                } catch (err) {
                  console.error(`${MODULE_ID} | Spell cast chat message failed:`, err);
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
          default: 'cast',
          render: html => {
            const root = html?.[0] ?? html;
            const app = root?.closest('.app');
            app?.classList?.add('ct-skill-roll-dialog-app');
            const form = root?.querySelector('.ct-native-skill-roll-form');
            if (!form) return;
            const effectSel = form.querySelector('[name="effortEffect"]');
            const damageSel = form.querySelector('[name="effortDamage"]');

            // Constrain effort so effect + damage does not exceed effortCap
            const constrainEffort = (changed) => {
              const cap = effortCap;
              const effVal = Number(effectSel?.value ?? 0);
              const dmgVal = Number(damageSel?.value ?? 0);
              if (changed === 'effect' && damageSel) {
                const maxDmg = Math.max(0, cap - effVal);
                const currentDmg = Number(damageSel.value);
                if (currentDmg > maxDmg) damageSel.value = String(maxDmg);
                damageSel.innerHTML = Array.from({length: maxDmg + 1}, (_, i) => `<option value="${i}" ${i === Number(damageSel.value) ? 'selected' : ''}>${i}</option>`).join('');
              } else if (changed === 'damage' && effectSel) {
                const maxEff = Math.max(0, cap - dmgVal);
                const currentEff = Number(effectSel.value);
                if (currentEff > maxEff) effectSel.value = String(maxEff);
                effectSel.innerHTML = Array.from({length: maxEff + 1}, (_, i) => `<option value="${i}" ${i === Number(effectSel.value) ? 'selected' : ''}>${i}</option>`).join('');
              }
            };

            if (effectSel) effectSel.addEventListener('change', () => { constrainEffort('effect'); sync(); });
            if (damageSel) damageSel.addEventListener('change', () => { constrainEffort('damage'); sync(); });

            const sync = () => {
              const data = Object.fromEntries(new FormData(form).entries());
              const s = computeCastSummary(data);
              form.querySelector('[data-cast-base-diff]')?.replaceChildren(document.createTextNode(String(s.baseDifficulty)));
              form.querySelector('[data-cast-final-diff]')?.replaceChildren(document.createTextNode(String(s.finalDifficulty)));
              form.querySelector('[data-cast-target]')?.replaceChildren(document.createTextNode(String(s.target)));
              form.querySelector('[data-cast-effort-levels]')?.replaceChildren(document.createTextNode(String(s.totalEffortLevels)));
              form.querySelector('[data-cast-effort-cost]')?.replaceChildren(document.createTextNode(String(s.totalEffortCost)));
              const edgeEl = form.querySelector('[data-cast-edge]');
              if (edgeEl) edgeEl.replaceChildren(document.createTextNode(`-${s.edgeDiscount}`));
              const totalEl = form.querySelector('[data-cast-total-spend]');
              if (totalEl) {
                totalEl.replaceChildren(document.createTextNode(String(s.totalSpend)));
                totalEl.style.color = s.canAfford ? '#7cffa0' : '#ff6b6b';
              }
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
      });
    }

  });
}
