import { MODULE_ID, buildMasonryColumns, skillCategoryIconChoices, hexToRGBA, bgFitMap } from "./utils.js";

export function applySkillsPanel(CypherTaskbar) {
  Object.assign(CypherTaskbar.prototype, {

    _buildSkillsPanel(actor) {
      const skills = actor.items.filter(item => item.type === "skill").sort((a, b) => a.name.localeCompare(b.name));
      const customCategories = this._getSkillCategories();
      const allCategories = [{ id: "uncategorized", name: "Uncategorized", system: true }, ...customCategories];
      const placement = this._normalizeSkillPlacement(actor, customCategories);
      const grouped = new Map(allCategories.map(cat => [cat.id, []]));

      for (const item of skills) {
        const place = placement[item.id] ?? { category: "uncategorized", order: 9999 };
        if (!grouped.has(place.category)) grouped.set(place.category, []);
        grouped.get(place.category).push({ item, order: place.order });
      }

      const visibleCategories = allCategories.filter(category => {
        const entries = grouped.get(category.id) ?? [];
        return category.id !== "uncategorized" || entries.length > 0;
      });

      const sectionData = visibleCategories.map(category => {
        const entries = (grouped.get(category.id) ?? []).sort((a, b) => a.order - b.order || a.item.name.localeCompare(b.item.name));
        const rows = entries.length ? entries.map(({ item }) => {
          const r = item.system.basic?.rating ?? "Practiced";
          return `<div class="ct-item-row ct-skill-action-row ct-skill-draggable" draggable="true" data-skill-id="${item.id}"><img class="ct-item-img" src="${item.img || 'icons/svg/book.svg'}" alt="" draggable="false"><span class="ct-item-name">${item.name}</span><span class="ct-skill-rating ${this._skillRatingClass(r)}">${r}</span><button class="ct-skill-roll-inline" data-roll-skill="${item.id}" title="Roll ${item.name}"><i class="fas fa-dice-d20"></i></button></div>`;
        }).join("") : `<div class="ct-skill-empty-drop">Drop skills here</div>`;
        const bodyClass = entries.length ? "ct-skill-category-body" : "ct-skill-category-body ct-skill-category-body-empty";
        const categoryStyle = this._getSkillCategoryStyle(category.id);
        const html = `<section class="ct-skill-category-section" data-category-section="${category.id}"><div class="ct-skill-category-header" data-category-header="${category.id}" style="${this._skillCategoryHeaderStyle(categoryStyle)}" title="Right-click to edit category header"><span class="ct-skill-category-icon-wrap">${this._skillCategoryHeaderIconHtml(categoryStyle)}</span><span class="ct-skill-category-title">${category.name}</span><button class="ct-cat-header-edit-btn" data-edit-cat="${category.id}" title="Edit ${category.name}"><i class="fas fa-pen"></i></button></div><div class="${bodyClass}" data-skill-category="${category.id}">${rows}</div></section>`;
        return { html, weight: Math.max(entries.length, 1) };
      });
      const sections = this._buildSkillsMasonryColumns(sectionData);

      return `<div class="ct-panel ct-panel-skills-custom" style="${this._skillsMenuStyleVars()};${this._getMenuBackgroundVars("skills")}"><div class="ct-panel-header ct-panel-header-skill-menu"><div class="ct-panel-title-wrap"><i class="fas fa-graduation-cap"></i> <span class="ct-panel-title-text">Skills</span></div><div class="ct-panel-action-group"><button class="ct-panel-settings-btn" data-skills-categories title="Skill Categories"><i class="fas fa-folder-plus"></i></button><button class="ct-panel-settings-btn" data-skills-settings title="Skills Menu Settings"><i class="fas fa-sliders-h"></i></button><button class="ct-panel-settings-btn" data-skills-close title="Close Skills Menu"><i class="fas fa-times"></i></button></div></div><div class="ct-panel-body ct-panel-body-skills-custom">${sections || `<div class="ct-empty-msg">No skills found.</div>`}</div></div>`;
    },

    _bindSkillDnD(bar) {
      if (!this.actor) return;
      const zones = [...bar.querySelectorAll(".ct-skill-category-body")];
      const rows = [...bar.querySelectorAll(".ct-skill-draggable")];
      if (!zones.length || !rows.length) return;

      let dragged = null;
      const getAfterElement = (container, y) => {
        const els = [...container.querySelectorAll(".ct-skill-draggable:not(.ct-dragging)")];
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
          e.dataTransfer.setData("text/plain", row.dataset.skillId || "");
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
          const placement = {};
          bar.querySelectorAll(".ct-skill-category-body").forEach(body => {
            [...body.querySelectorAll(".ct-skill-draggable")].forEach((row, index) => {
              placement[row.dataset.skillId] = { category: body.dataset.skillCategory || "uncategorized", order: index };
            });
          });
          await this._saveSkillPlacement(this.actor.id, placement);
          this._refreshActivePanel();
        };
      });
    },

    _skillsMenuStyleVars(overrides = null) {
      const get = (key, fallback) => overrides && Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : (this._gs(key) ?? fallback);
      const dir = get("skillsMenuShadowDirection", "bottom-right");
      const dirMap = {
        "bottom-right": [1, 1], "bottom-left": [-1, 1], "top-right": [1, -1], "top-left": [-1, -1],
        "bottom": [0, 1], "top": [0, -1], "left": [-1, 0], "right": [1, 0]
      };
      const [dx, dy] = dirMap[dir] ?? [1, 1];
      const dist = Number(get("skillsMenuShadowDistance", 14));
      const bgFit = get("skillsMenuBgFit", "cover");
      const fitMap = {
        cover: { size: "cover", position: "center center" },
        contain: { size: "contain", position: "center center" },
        fit: { size: "100% 100%", position: "center center" },
        "fit-vertical": { size: "auto 100%", position: "center center" },
        "fit-horizontal": { size: "100% auto", position: "center center" }
      };
      const fit = fitMap[bgFit] ?? fitMap.cover;
      return [
        `--ct-skills-shadow:${dist * dx}px ${dist * dy}px ${dist * 1.9}px ${hexToRGBA(get("skillsMenuShadowColor", "#000000"), get("skillsMenuShadowOpacity", 0.45))}`,
        `--ct-skills-title-color:${get("skillsMenuTitleColor", "#f0d68a")}`,
        `--ct-skills-title-scale:${get("skillsMenuTitleSize", 100) / 100}`,
        `--ct-skills-title-transform:${get("skillsMenuTitleCaps", false) ? "uppercase" : "none"}`,
        `--ct-skills-heading-color:${get("skillsMenuHeadingColor", "#d4a94d")}`,
        `--ct-skills-heading-opacity:${get("skillsMenuHeadingOpacity", 0.85)}`,
        `--ct-skills-bg:${hexToRGBA(get("skillsMenuBgColor", "#17121f"), get("skillsMenuBgOpacity", 0.94))}`,
        `--ct-skills-bg-image:url('${String(get("skillsMenuBgImage", "")).replace(/'/g, "%27")}')`,
        `--ct-skills-bg-image-opacity:${get("skillsMenuBgImageOpacity", 0.2)}`,
        `--ct-skills-bg-size:${fit.size}`,
        `--ct-skills-bg-position:${fit.position}`,
        `--ct-skills-columns:${Math.max(1, Math.min(3, Number(get("skillsMenuColumns", 1))))}`,
        `--ct-skills-width-scale:${get("skillsMenuWidthScale", 100) / 100}`,
        `--ct-skills-height-scale:${get("skillsMenuHeightScale", 100) / 100}` ,
        `--ct-skills-font-scale:${get("skillsMenuFontSize", 100) / 100}`,
        `--ct-skills-item-padding:${get("skillsMenuItemPadding", 5)}px`
      ].join("; ");
    },

    _applyLiveSkillsPanelSettings(preview = null) {
      if (this.activePanel !== "skills") return;
      const container = this.element?.querySelector("#ct-panel-container");
      const panel = container?.querySelector(".ct-panel-skills-custom");
      if (!panel) return;
      panel.setAttribute("style", this._skillsMenuStyleVars(preview));
    },

    _getSkillCategories() {
      const list = this._gjson("skillsMenuCategories", []);
      return Array.isArray(list) ? list.filter(cat => cat?.id && cat?.name) : [];
    },

    _saveSkillCategories(categories) {
      return this._ss("skillsMenuCategories", JSON.stringify(categories));
    },

    _getSkillPlacement(actorId) {
      const all = this._gjson("skillsMenuPlacement", {});
      return all?.[actorId] && typeof all[actorId] === "object" ? all[actorId] : {};
    },

    _saveSkillPlacement(actorId, placement) {
      const all = this._gjson("skillsMenuPlacement", {});
      all[actorId] = placement;
      return this._ss("skillsMenuPlacement", JSON.stringify(all));
    },

    _normalizeSkillPlacement(actor, categories = this._getSkillCategories()) {
      const validCategories = new Set(["uncategorized", ...categories.map(cat => cat.id)]);
      const current = this._getSkillPlacement(actor.id);
      const skills = actor.items.filter(item => item.type === "skill").sort((a, b) => a.name.localeCompare(b.name));
      const normalized = {};
      skills.forEach((item, index) => {
        const entry = current[item.id] ?? {};
        const category = validCategories.has(entry.category) ? entry.category : "uncategorized";
        const order = Number.isFinite(Number(entry.order)) ? Number(entry.order) : index;
        normalized[item.id] = { category, order };
      });
      return normalized;
    },

    _getSkillDescription(item) {
      const sys = item?.system ?? {};
      const raw = sys.basic?.sentence ?? sys.description?.sentence ?? sys.basic?.description ?? sys.description?.value ?? sys.description?.text ?? sys.description ?? "";
      const text = typeof raw === "string" ? raw : (raw?.value ?? raw?.text ?? raw?.content ?? "");
      return String(text ?? "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    },

    _hideSkillTooltip() {
      if (this._skillTooltipTimer) {
        clearTimeout(this._skillTooltipTimer);
        this._skillTooltipTimer = null;
      }
      this._skillTooltipEl?.remove();
      this._skillTooltipEl = null;
    },

    _showSkillTooltip(target, text) {
      this._hideSkillTooltip();
      const tooltip = document.createElement("div");
      tooltip.className = "ct-skill-hover-tooltip";
      tooltip.textContent = text || "No description.";
      document.body.appendChild(tooltip);
      const rect = target.getBoundingClientRect();
      const tipRect = tooltip.getBoundingClientRect();
      const left = Math.min(Math.max(10, rect.left), Math.max(10, window.innerWidth - tipRect.width - 10));
      const top = rect.bottom + 8 + tipRect.height > window.innerHeight
        ? Math.max(10, rect.top - tipRect.height - 8)
        : rect.bottom + 8;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      this._skillTooltipEl = tooltip;
    },

    _buildSkillsMasonryColumns(sections) {
      const count = Math.max(1, Number(this._gs("skillsMenuColumns") ?? 1));
      const cols = Array.from({ length: count }, () => ({ height: 0, sections: [] }));
      sections.forEach(section => {
        const targetIndex = cols.reduce((best, col, index, arr) => col.height < arr[best].height ? index : best, 0);
        cols[targetIndex].sections.push(section.html);
        cols[targetIndex].height += section.weight;
      });
      return cols.map(col => `<div class="ct-skill-masonry-column">${col.sections.join("")}</div>`).join("");
    },

    _getSkillCategoryStyles() {
      return this._gjson("skillsCategoryStyles", {});
    },

    _getSkillCategoryStyle(categoryId) {
      const styles = this._getSkillCategoryStyles();
      const style = styles?.[categoryId] ?? {};
      return {
        icon: style.icon ?? "",
        iconSize: Math.max(12, Math.min(40, Number(style.iconSize ?? 16))),
        titleSize: Math.max(70, Math.min(180, Number(style.titleSize ?? 100))),
        titleColor: style.titleColor ?? "#f0d68a",
        padding: Math.max(4, Math.min(24, Number(style.padding ?? 8))),
        headerColor: style.headerColor ?? "#6a5320"
      };
    },

    _saveSkillCategoryStyle(categoryId, style) {
      const styles = this._getSkillCategoryStyles();
      styles[categoryId] = style;
      return this._ss("skillsCategoryStyles", JSON.stringify(styles));
    },

    _skillCategoryHeaderStyle(style) {
      const s = style ?? this._getSkillCategoryStyle("uncategorized");
      return [
        `--ct-skill-category-title-scale:${s.titleSize / 100}`,
        `--ct-skill-category-title-color:${s.titleColor}`,
        `--ct-skills-category-padding:${s.padding}px`,
        `--ct-skill-category-icon-size:${s.iconSize}px`,
        `--ct-skill-category-header-bg:${s.headerColor}`
      ].join("; ");
    },

    _skillCategoryHeaderIconHtml(style) {
      return style?.icon ? `<i class="ct-skill-category-icon ${style.icon}"></i>` : "";
    },

    _skillCategoryIconChoices() {
      return [
        { icon: "", label: "No Icon" },
        { icon: "fas fa-dice-d20", label: "D20" },
        { icon: "fas fa-shield-alt", label: "Shield" },
        { icon: "fas fa-fist-raised", label: "Fist" },
        { icon: "fas fa-bolt", label: "Lightning" },
        { icon: "fas fa-fire", label: "Fire" },
        { icon: "fas fa-snowflake", label: "Frost" },
        { icon: "fas fa-tint", label: "Water" },
        { icon: "fas fa-leaf", label: "Nature" },
        { icon: "fas fa-eye", label: "Perception" },
        { icon: "fas fa-brain", label: "Mind" },
        { icon: "fas fa-book", label: "Lore" },
        { icon: "fas fa-scroll", label: "Scroll" },
        { icon: "fas fa-feather-alt", label: "Stealth" },
        { icon: "fas fa-ring", label: "Ring" },
        { icon: "fas fa-gem", label: "Gem" },
        { icon: "fas fa-key", label: "Key" },
        { icon: "fas fa-lock", label: "Lock" },
        { icon: "fas fa-moon", label: "Moon" },
        { icon: "fas fa-sun", label: "Sun" },
        { icon: "fas fa-star", label: "Star" },
        { icon: "fas fa-crosshairs", label: "Aim" },
        { icon: "fas fa-running", label: "Speed" },
        { icon: "fas fa-hand-rock", label: "Might" },
        { icon: "fas fa-user-ninja", label: "Ninja" },
        { icon: "fas fa-mask", label: "Mask" },
        { icon: "fas fa-flask", label: "Alchemy" },
        { icon: "fas fa-medkit", label: "Healing" },
        { icon: "fas fa-music", label: "Music" },
        { icon: "fas fa-theater-masks", label: "Acting" },
        { icon: "fas fa-skull", label: "Skull" },
        { icon: "fas fa-skull-crossbones", label: "Danger" },
        { icon: "fas fa-paw", label: "Beast" },
        { icon: "fas fa-mountain", label: "Mountain" },
        { icon: "fas fa-archway", label: "Ruins" },
        { icon: "fas fa-anchor", label: "Sea" },
        { icon: "fas fa-ghost", label: "Spirit" },
        { icon: "fas fa-hammer", label: "Craft" },
        { icon: "fas fa-heart", label: "Vitality" },
        { icon: "fas fa-hourglass-half", label: "Time" },
        { icon: "fas fa-crown", label: "Crown" },
        { icon: "fas fa-hat-wizard", label: "Wizard Hat" },
        { icon: "fas fa-dragon", label: "Dragon" },
        { icon: "fas fa-dungeon", label: "Dungeon" },
        { icon: "fas fa-place-of-worship", label: "Temple" },
        { icon: "fas fa-chess-king", label: "King" },
        { icon: "fas fa-chess-knight", label: "Knight" },
        { icon: "fas fa-chess-rook", label: "Tower" },
        { icon: "fas fa-compass", label: "Compass" },
        { icon: "fas fa-map", label: "Map" },
        { icon: "fas fa-map-marked-alt", label: "Marked Map" },
        { icon: "fas fa-binoculars", label: "Scout" },
        { icon: "fas fa-bone", label: "Bone" },
        { icon: "fas fa-crow", label: "Crow" },
        { icon: "fas fa-cat", label: "Cat" },
        { icon: "fas fa-horse", label: "Horse" },
        { icon: "fas fa-user-shield", label: "Guardian" },
        { icon: "fas fa-user-secret", label: "Spy" },
        { icon: "fas fa-fingerprint", label: "Trace" },
        { icon: "fas fa-torii-gate", label: "Gateway" },
        { icon: "fas fa-meteor", label: "Meteor" }
      ];
    },

    _openSkillsMenuSettings(event) {
      document.querySelector("#ct-skills-settings-popup")?.remove();
      const state = {
        skillsMenuShadowColor: this._gs("skillsMenuShadowColor") ?? "#000000",
        skillsMenuShadowOpacity: this._gs("skillsMenuShadowOpacity") ?? 0.45,
        skillsMenuShadowDistance: this._gs("skillsMenuShadowDistance") ?? 14,
        skillsMenuShadowDirection: this._gs("skillsMenuShadowDirection") ?? "bottom-right",
        skillsMenuTitleColor: this._gs("skillsMenuTitleColor") ?? "#f0d68a",
        skillsMenuTitleSize: this._gs("skillsMenuTitleSize") ?? 100,
        skillsMenuTitleCaps: this._gs("skillsMenuTitleCaps") ?? false,
        skillsMenuHeadingColor: this._gs("skillsMenuHeadingColor") ?? "#d4a94d",
        skillsMenuHeadingOpacity: this._gs("skillsMenuHeadingOpacity") ?? 0.85,
        skillsMenuBgColor: this._gs("skillsMenuBgColor") ?? "#17121f",
        skillsMenuBgOpacity: this._gs("skillsMenuBgOpacity") ?? 0.94,
        skillsMenuBgImage: this._gs("skillsMenuBgImage") ?? "",
        skillsMenuBgImageOpacity: this._gs("skillsMenuBgImageOpacity") ?? 0.2,
        skillsMenuBgFit: this._gs("skillsMenuBgFit") ?? "cover",
        skillsMenuColumns: this._gs("skillsMenuColumns") ?? 1,
        skillsMenuWidthScale: this._gs("skillsMenuWidthScale") ?? 100,
        skillsMenuHeightScale: this._gs("skillsMenuHeightScale") ?? 100,
        skillsMenuFontSize: this._gs("skillsMenuFontSize") ?? 100,
        skillsMenuItemPadding: this._gs("skillsMenuItemPadding") ?? 5
      };

      const popup = document.createElement("div");
      popup.id = "ct-skills-settings-popup";
      popup.classList.add("ct-popup");
      popup.style.left = `${Math.max(8, event?.clientX ?? 120)}px`;
      popup.style.top = `${Math.max(8, event?.clientY ?? 120)}px`;
      popup.style.transform = "none";
      popup.innerHTML = `
      <div class="ct-popup-header"><i class="fas fa-sliders-h"></i> Skills Menu Settings <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
      <div class="ct-popup-tabs">
        <button class="ct-popup-tab is-active" data-tab="shadow">Shadow</button>
        <button class="ct-popup-tab" data-tab="title">Title</button>
        <button class="ct-popup-tab" data-tab="headings">Headings</button>
        <button class="ct-popup-tab" data-tab="background">Background</button>
        <button class="ct-popup-tab" data-tab="layout">Layout</button>
        <button class="ct-popup-tab" data-tab="skills">Skills</button>
      </div>
      <div class="ct-popup-body ct-popup-body-compact">
        <div class="ct-popup-pane is-active" data-pane="shadow">
          <label>Shadow Color <input type="color" id="sm-shadow-color" value="${state.skillsMenuShadowColor}"></label>
          <label>Transparency <span class="ct-val-label" id="sm-shadow-op-val">${Math.round(state.skillsMenuShadowOpacity*100)}%</span><input type="range" id="sm-shadow-op" min="0" max="1" step="0.05" value="${state.skillsMenuShadowOpacity}"></label>
          <label>Distance <span class="ct-val-label" id="sm-shadow-dist-val">${state.skillsMenuShadowDistance}px</span><input type="range" id="sm-shadow-dist" min="0" max="40" step="1" value="${state.skillsMenuShadowDistance}"></label>
          <label>Direction
            <select id="sm-shadow-dir">
              <option value="bottom-right" ${state.skillsMenuShadowDirection==="bottom-right"?"selected":""}>Bottom Right</option>
              <option value="bottom-left" ${state.skillsMenuShadowDirection==="bottom-left"?"selected":""}>Bottom Left</option>
              <option value="top-right" ${state.skillsMenuShadowDirection==="top-right"?"selected":""}>Top Right</option>
              <option value="top-left" ${state.skillsMenuShadowDirection==="top-left"?"selected":""}>Top Left</option>
              <option value="bottom" ${state.skillsMenuShadowDirection==="bottom"?"selected":""}>Bottom</option>
              <option value="top" ${state.skillsMenuShadowDirection==="top"?"selected":""}>Top</option>
              <option value="left" ${state.skillsMenuShadowDirection==="left"?"selected":""}>Left</option>
              <option value="right" ${state.skillsMenuShadowDirection==="right"?"selected":""}>Right</option>
            </select>
          </label>
        </div>
        <div class="ct-popup-pane" data-pane="title">
          <label>Title Color <input type="color" id="sm-title-color" value="${state.skillsMenuTitleColor}"></label>
          <label>Title Size <span class="ct-val-label" id="sm-title-size-val">${state.skillsMenuTitleSize}%</span><input type="range" id="sm-title-size" min="70" max="200" step="5" value="${state.skillsMenuTitleSize}"></label>
          <label class="ct-toggle-row">Capitalization <input type="checkbox" id="sm-title-caps" ${state.skillsMenuTitleCaps ? "checked" : ""}></label>
        </div>
        <div class="ct-popup-pane" data-pane="headings">
          <label>Heading Color <input type="color" id="sm-heading-color" value="${state.skillsMenuHeadingColor}"></label>
          <label>Heading Transparency <span class="ct-val-label" id="sm-heading-op-val">${Math.round(state.skillsMenuHeadingOpacity*100)}%</span><input type="range" id="sm-heading-op" min="0.1" max="1" step="0.05" value="${state.skillsMenuHeadingOpacity}"></label>
        </div>
        <div class="ct-popup-pane" data-pane="background">
          <label>Menu Color <input type="color" id="sm-bg-color" value="${state.skillsMenuBgColor}"></label>
          <label>Menu Transparency <span class="ct-val-label" id="sm-bg-op-val">${Math.round(state.skillsMenuBgOpacity*100)}%</span><input type="range" id="sm-bg-op" min="0.1" max="1" step="0.05" value="${state.skillsMenuBgOpacity}"></label>
          <label class="ct-popup-wide">Background Image URL <input type="text" id="sm-bg-image" value="${state.skillsMenuBgImage.replace(/"/g, '&quot;')}" placeholder="https://..."></label>
          <label>Image Transparency <span class="ct-val-label" id="sm-bg-image-op-val">${Math.round(state.skillsMenuBgImageOpacity*100)}%</span><input type="range" id="sm-bg-image-op" min="0" max="1" step="0.05" value="${state.skillsMenuBgImageOpacity}"></label>
          <label>Image Fitting
            <select id="sm-bg-fit">
              <option value="cover" ${state.skillsMenuBgFit==="cover"?"selected":""}>Cover</option>
              <option value="contain" ${state.skillsMenuBgFit==="contain"?"selected":""}>Contain</option>
              <option value="fit" ${state.skillsMenuBgFit==="fit"?"selected":""}>Fit</option>
              <option value="fit-vertical" ${state.skillsMenuBgFit==="fit-vertical"?"selected":""}>Fit Vertical</option>
              <option value="fit-horizontal" ${state.skillsMenuBgFit==="fit-horizontal"?"selected":""}>Fit Horizontal</option>
            </select>
          </label>
        </div>
        <div class="ct-popup-pane" data-pane="layout">
          <label>Menu Columns <span class="ct-val-label" id="sm-cols-val">${state.skillsMenuColumns}</span><input type="range" id="sm-cols" min="1" max="3" step="1" value="${state.skillsMenuColumns}"></label>
          <label>Width Resize <span class="ct-val-label" id="sm-width-val">${state.skillsMenuWidthScale}%</span><input type="range" id="sm-width" min="60" max="180" step="5" value="${state.skillsMenuWidthScale}"></label>
          <label>Height Resize <span class="ct-val-label" id="sm-height-val">${state.skillsMenuHeightScale}%</span><input type="range" id="sm-height" min="60" max="180" step="5" value="${state.skillsMenuHeightScale}"></label>
        </div>
        <div class="ct-popup-pane" data-pane="skills">
          <label>Skill Font Size <span class="ct-val-label" id="sm-font-size-val">${state.skillsMenuFontSize}%</span><input type="range" id="sm-font-size" min="70" max="180" step="5" value="${state.skillsMenuFontSize}"></label>
          <label>Skill Padding <span class="ct-val-label" id="sm-item-padding-val">${state.skillsMenuItemPadding}px</span><input type="range" id="sm-item-padding" min="2" max="24" step="1" value="${state.skillsMenuItemPadding}"></label>
        </div>
      </div>`;
      document.body.appendChild(popup);

      requestAnimationFrame(() => {
        const rect = popup.getBoundingClientRect();
        popup.style.left = `${Math.min(Math.max(8, parseFloat(popup.style.left)), Math.max(8, window.innerWidth - rect.width - 8))}px`;
        popup.style.top = `${Math.min(Math.max(8, parseFloat(popup.style.top)), Math.max(8, window.innerHeight - rect.height - 8))}px`;
      });

      const collectState = () => ({
        skillsMenuShadowColor: popup.querySelector("#sm-shadow-color").value,
        skillsMenuShadowOpacity: parseFloat(popup.querySelector("#sm-shadow-op").value),
        skillsMenuShadowDistance: parseInt(popup.querySelector("#sm-shadow-dist").value),
        skillsMenuShadowDirection: popup.querySelector("#sm-shadow-dir").value,
        skillsMenuTitleColor: popup.querySelector("#sm-title-color").value,
        skillsMenuTitleSize: parseInt(popup.querySelector("#sm-title-size").value),
        skillsMenuTitleCaps: popup.querySelector("#sm-title-caps").checked,
        skillsMenuHeadingColor: popup.querySelector("#sm-heading-color").value,
        skillsMenuHeadingOpacity: parseFloat(popup.querySelector("#sm-heading-op").value),
        skillsMenuBgColor: popup.querySelector("#sm-bg-color").value,
        skillsMenuBgOpacity: parseFloat(popup.querySelector("#sm-bg-op").value),
        skillsMenuBgImage: popup.querySelector("#sm-bg-image").value.trim(),
        skillsMenuBgImageOpacity: parseFloat(popup.querySelector("#sm-bg-image-op").value),
        skillsMenuBgFit: popup.querySelector("#sm-bg-fit").value,
        skillsMenuColumns: parseInt(popup.querySelector("#sm-cols").value),
        skillsMenuWidthScale: parseInt(popup.querySelector("#sm-width").value),
        skillsMenuHeightScale: parseInt(popup.querySelector("#sm-height").value),
        skillsMenuFontSize: parseInt(popup.querySelector("#sm-font-size").value),
        skillsMenuItemPadding: parseInt(popup.querySelector("#sm-item-padding").value)
      });

      const applyPreview = () => {
        const preview = collectState();
        Object.assign(state, preview);
        this._applyLiveSkillsPanelSettings(preview);
      };

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
      syncVal("sm-shadow-op", v => `${Math.round(parseFloat(v)*100)}%`);
      syncVal("sm-shadow-dist", v => `${v}px`);
      syncVal("sm-title-size", v => `${v}%`);
      syncVal("sm-heading-op", v => `${Math.round(parseFloat(v)*100)}%`);
      syncVal("sm-bg-op", v => `${Math.round(parseFloat(v)*100)}%`);
      syncVal("sm-bg-image-op", v => `${Math.round(parseFloat(v)*100)}%`);
      syncVal("sm-cols", v => `${v}`);
      syncVal("sm-width", v => `${v}%`);
      syncVal("sm-height", v => `${v}%`);
      syncVal("sm-font-size", v => `${v}%`);
      syncVal("sm-item-padding", v => `${v}px`);

      popup.querySelectorAll('input[type="range"], input[type="color"], input[type="text"], select, input[type="checkbox"]').forEach(el => {
        const eventName = el.matches('input[type="text"]') ? 'input' : (el.matches('select, input[type="checkbox"]') ? 'change' : 'input');
        el.addEventListener(eventName, applyPreview);
      });

      const header = popup.querySelector(".ct-popup-header");
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
      const onUp = () => {
        dragState = null;
        document.body.classList.remove("ct-dragging-popup");
      };
      header.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add("ct-dragging-popup");
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);

      const closePopup = async () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const finalState = collectState();
        const writes = Object.entries(finalState).map(([key, value]) => this._ss(key, value));
        try { await Promise.all(writes); } catch (err) { console.warn("[CypherTaskbar] Settings save failed:", err?.message || err); }
        this._skillsSettingsOpen = false;
        popup.remove();
      };

      this._skillsSettingsOpen = true;
      closeBtn.onclick = () => { closePopup(); };
    },

    _openSkillCategoryManager(event) {

      document.querySelector("#ct-skill-category-popup")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-skill-category-popup";
      popup.classList.add("ct-popup");
      popup.style.left = `${Math.max(8, event?.clientX ?? 120)}px`;
      popup.style.top = `${Math.max(8, event?.clientY ?? 120)}px`;
      popup.style.transform = "none";
      popup.innerHTML = `
      <div class="ct-popup-header"><i class="fas fa-folder-plus"></i> Skill Categories <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
      <div class="ct-popup-body ct-popup-body-compact">
        <div class="ct-popup-pane is-active" data-pane="categories">
          <label class="ct-popup-wide">New Category Name <input type="text" id="ct-new-skill-category" placeholder="Enter category name"></label>
          <label><button type="button" class="ct-popup-action-btn" id="ct-add-skill-category">Add Category</button></label>
          <div class="ct-popup-wide ct-skill-category-list" id="ct-skill-category-list"></div>
          <div class="ct-popup-wide ct-popup-note">Drag skills between category boxes in the Skills menu to assign and sort them.</div>
        </div>
      </div>`;
      document.body.appendChild(popup);

      const renderCategories = () => {
        const list = popup.querySelector("#ct-skill-category-list");
        const categories = this._getSkillCategories();
        list.innerHTML = categories.length ? categories.map(cat => `<div class="ct-skill-category-entry"><span>${cat.name}</span><button type="button" class="ct-skill-category-delete" data-delete-category="${cat.id}" title="Delete ${cat.name}"><i class="fas fa-trash"></i></button></div>`).join("") : `<div class="ct-empty-msg">No custom categories yet.</div>`;
        list.querySelectorAll("[data-delete-category]").forEach(btn => btn.onclick = async () => {
          const deleteId = btn.dataset.deleteCategory;
          const nextCategories = this._getSkillCategories().filter(cat => cat.id !== deleteId);
          await this._saveSkillCategories(nextCategories);
          if (this.actor) {
            const placement = this._normalizeSkillPlacement(this.actor, nextCategories);
            Object.values(placement).forEach(entry => { if (entry.category === deleteId) entry.category = "uncategorized"; });
            await this._saveSkillPlacement(this.actor.id, placement);
          }
          renderCategories();
          this._refreshActivePanel();
        });
      };

      popup.querySelector("#ct-add-skill-category").onclick = async () => {
        const input = popup.querySelector("#ct-new-skill-category");
        const name = input.value.trim();
        if (!name) return;
        const categories = this._getSkillCategories();
        categories.push({ id: `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name });
        await this._saveSkillCategories(categories);
        input.value = "";
        renderCategories();
        this._refreshActivePanel();
      };

      const header = popup.querySelector(".ct-popup-header");
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
      const onUp = () => {
        dragState = null;
        document.body.classList.remove("ct-dragging-popup");
      };
      header.onmousedown = (ev) => {
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

    _openSkillCategoryAppearanceSettings(event, categoryId) {
      document.querySelector("#ct-skill-category-appearance-popup")?.remove();
      const categories = [{ id: "uncategorized", name: "Uncategorized" }, ...this._getSkillCategories()];
      const category = categories.find(cat => cat.id === categoryId) ?? { id: categoryId, name: categoryId };
      const state = { ...this._getSkillCategoryStyle(categoryId) };
      const iconOptions = this._skillCategoryIconChoices().map(choice => `
      <button type="button" class="ct-category-icon-choice ${choice.icon === state.icon ? 'is-selected' : ''}" data-category-icon="${choice.icon}" title="${choice.label}" aria-label="${choice.label}">
        ${choice.icon ? `<i class="${choice.icon}"></i>` : `<span class="ct-category-icon-choice-none">×</span>`}
      </button>`).join("");

      const popup = document.createElement("div");
      popup.id = "ct-skill-category-appearance-popup";
      popup.classList.add("ct-popup");
      popup.style.transform = "none";
      popup.innerHTML = `
      <div class="ct-popup-header"><i class="fas fa-palette"></i> ${category.name} Header <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
      <div class="ct-popup-body ct-popup-body-compact">
        <label class="ct-popup-wide">Icon</label>
        <div class="ct-popup-wide ct-category-icon-grid" id="ct-category-header-icon-grid">${iconOptions}</div>
        <input type="hidden" id="ct-category-header-icon" value="${state.icon}">
        <div class="ct-popup-wide ct-category-icon-preview" id="ct-category-icon-preview"></div>
        <label>Icon Size <span class="ct-val-label" id="ct-category-icon-size-val">${state.iconSize}px</span><input type="range" id="ct-category-icon-size" min="12" max="40" step="1" value="${state.iconSize}"></label>
        <label>Header Title Size <span class="ct-val-label" id="ct-category-title-size-val">${state.titleSize}%</span><input type="range" id="ct-category-title-size" min="70" max="180" step="5" value="${state.titleSize}"></label>
        <label>Title and Icon Color <input type="color" id="ct-category-title-color" value="${state.titleColor}"></label>
        <label>Header Padding <span class="ct-val-label" id="ct-category-padding-val">${state.padding}px</span><input type="range" id="ct-category-padding" min="4" max="24" step="1" value="${state.padding}"></label>
        <label>Header Color <input type="color" id="ct-category-header-color" value="${state.headerColor}"></label>
      </div>`;
      document.body.appendChild(popup);
      this._positionPopupAboveEvent(popup, event);

      const previewTarget = () => this.element?.querySelector(`[data-category-header="${categoryId}"]`);
      const syncVal = (id, fmt = v => v) => {
        const input = popup.querySelector(`#${id}`);
        const output = popup.querySelector(`#${id}-val`);
        if (!input || !output) return;
        const update = () => output.textContent = fmt(input.value);
        input.addEventListener("input", update);
        update();
      };
      syncVal("ct-category-icon-size", v => `${v}px`);
      syncVal("ct-category-title-size", v => `${v}%`);
      syncVal("ct-category-padding", v => `${v}px`);

      const renderIconPreview = () => {
        const preview = popup.querySelector("#ct-category-icon-preview");
        const icon = popup.querySelector("#ct-category-header-icon").value;
        popup.querySelectorAll("[data-category-icon]").forEach(btn => btn.classList.toggle("is-selected", btn.dataset.categoryIcon === icon));
        preview.innerHTML = icon
          ? `<span class="ct-category-icon-preview-chip"><i class="${icon}"></i></span>`
          : `<span class="ct-category-icon-preview-empty">No icon selected</span>`;
      };

      const collectState = () => ({
        icon: popup.querySelector("#ct-category-header-icon").value,
        iconSize: parseInt(popup.querySelector("#ct-category-icon-size").value),
        titleSize: parseInt(popup.querySelector("#ct-category-title-size").value),
        titleColor: popup.querySelector("#ct-category-title-color").value,
        padding: parseInt(popup.querySelector("#ct-category-padding").value),
        headerColor: popup.querySelector("#ct-category-header-color").value
      });

      const applyPreview = () => {
        Object.assign(state, collectState());
        renderIconPreview();
        const header = previewTarget();
        if (!header) return;
        header.setAttribute("style", this._skillCategoryHeaderStyle(state));
        const iconWrap = header.querySelector(".ct-skill-category-icon-wrap");
        if (iconWrap) iconWrap.innerHTML = this._skillCategoryHeaderIconHtml(state);
      };

      popup.querySelectorAll('input, select').forEach(el => {
        const ev = el.matches('select') ? 'change' : 'input';
        el.addEventListener(ev, applyPreview);
      });
      popup.querySelectorAll('[data-category-icon]').forEach(btn => btn.onclick = () => {
        popup.querySelector('#ct-category-header-icon').value = btn.dataset.categoryIcon ?? "";
        applyPreview();
      });
      renderIconPreview();
      applyPreview();

      const header = popup.querySelector(".ct-popup-header");
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
      const onUp = () => {
        dragState = null;
        document.body.classList.remove("ct-dragging-popup");
      };
      header.onmousedown = (ev) => {
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
        await this._saveSkillCategoryStyle(categoryId, collectState());
        this._refreshActivePanel();
        popup.remove();
      };
    }

  });
}
