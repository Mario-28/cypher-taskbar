import { MODULE_ID, hexToRGBA, bgFitMap, getActorPref, setActorPref } from "./utils.js";

function buildEquipmentMasonryColumns(sections, count = 1) {
  const total = Math.max(1, Number(count ?? 1));
  const cols = Array.from({ length: total }, () => ({ height: 0, sections: [] }));
  sections.forEach(section => {
    const targetIndex = cols.reduce((best, col, index, arr) => col.height < arr[best].height ? index : best, 0);
    cols[targetIndex].sections.push(section.html);
    cols[targetIndex].height += section.weight;
  });
  return cols.map(col => `<div class="ct-equipment-masonry-column">${col.sections.join("")}</div>`).join("");
}

function equipmentQuantityInfo(item) {
  const basic = item?.system?.basic ?? {};
  const quantity = Number(basic.quantity ?? basic.amount ?? 0);
  const hasQuantity = Number.isFinite(quantity);
  return { quantity: hasQuantity ? Math.max(0, quantity) : 0, hasQuantity };
}

function equipmentLevelValue(item) {
  const basic = item?.system?.basic ?? {};
  const candidates = [basic.level, basic.itemLevel, basic.rank, item?.system?.level, item?.system?.itemLevel, item?.system?.rank];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    const num = Number(candidate);
    if (Number.isFinite(num)) return Math.max(0, Math.trunc(num));
    const str = String(candidate).trim();
    if (str) return str.slice(0, 2);
  }
  return '—';
}

function escapeEquipmentText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const equipmentCategoryIconChoices = [
  { icon: "", label: "No Icon" },
  { icon: "fas fa-backpack", label: "Pack" },
  { icon: "fas fa-suitcase", label: "Case" },
  { icon: "fas fa-toolbox", label: "Kit" },
  { icon: "fas fa-tools", label: "Tools" },
  { icon: "fas fa-hammer", label: "Crafting" },
  { icon: "fas fa-wrench", label: "Repair" },
  { icon: "fas fa-cog", label: "Mechanism" },
  { icon: "fas fa-cogs", label: "Machinery" },
  { icon: "fas fa-sword", label: "Blade" },
  { icon: "fas fa-axe", label: "Axe" },
  { icon: "fas fa-hammer-war", label: "Heavy Weapon" },
  { icon: "fas fa-dagger", label: "Dagger" },
  { icon: "fas fa-bow-arrow", label: "Bow" },
  { icon: "fas fa-bullseye-arrow", label: "Ammo" },
  { icon: "fas fa-shield-alt", label: "Shield" },
  { icon: "fas fa-helmet-battle", label: "Armor" },
  { icon: "fas fa-vest", label: "Clothing" },
  { icon: "fas fa-mitten", label: "Gloves" },
  { icon: "fas fa-boot", label: "Boots" },
  { icon: "fas fa-ring", label: "Ring" },
  { icon: "fas fa-gem", label: "Gem" },
  { icon: "fas fa-coins", label: "Currency" },
  { icon: "fas fa-crown", label: "Relic" },
  { icon: "fas fa-key", label: "Key Item" },
  { icon: "fas fa-lock", label: "Secure" },
  { icon: "fas fa-scroll", label: "Scroll" },
  { icon: "fas fa-book", label: "Book" },
  { icon: "fas fa-map", label: "Map" },
  { icon: "fas fa-compass", label: "Navigation" },
  { icon: "fas fa-binoculars", label: "Scout" },
  { icon: "fas fa-flask", label: "Alchemy" },
  { icon: "fas fa-vial", label: "Potion" },
  { icon: "fas fa-pills", label: "Consumable" },
  { icon: "fas fa-medkit", label: "Medical" },
  { icon: "fas fa-syringe", label: "Injector" },
  { icon: "fas fa-apple-alt", label: "Food" },
  { icon: "fas fa-drumstick-bite", label: "Rations" },
  { icon: "fas fa-tint", label: "Liquid" },
  { icon: "fas fa-wine-bottle", label: "Bottle" },
  { icon: "fas fa-fire", label: "Explosive" },
  { icon: "fas fa-bomb", label: "Bomb" },
  { icon: "fas fa-lightbulb", label: "Light" },
  { icon: "fas fa-torch", label: "Torch" },
  { icon: "fas fa-battery-full", label: "Power Cell" },
  { icon: "fas fa-magnet", label: "Device" },
  { icon: "fas fa-microchip", label: "Tech" },
  { icon: "fas fa-cube", label: "Component" },
  { icon: "fas fa-cubes", label: "Supplies" },
  { icon: "fas fa-box-open", label: "Storage" },
  { icon: "fas fa-parachute-box", label: "Drop Crate" },
  { icon: "fas fa-anchor", label: "Heavy Gear" },
  { icon: "fas fa-leaf", label: "Herbal" },
  { icon: "fas fa-seedling", label: "Ingredients" },
  { icon: "fas fa-bone", label: "Trophy" },
  { icon: "fas fa-mask", label: "Disguise" },
  { icon: "fas fa-eye", label: "Sensor" },
  { icon: "fas fa-snowflake", label: "Cold" }
];

export function applyEquipmentPanel(CypherTaskbar) {
  Object.assign(CypherTaskbar.prototype, {

    _getEquipmentCategories() {
      const list = this._gjson("equipmentMenuCategories", []);
      return Array.isArray(list) ? list.filter(cat => cat?.id && cat?.name) : [];
    },

    _getEquipmentPlacement(actorId) {
      const all = this._gjson("equipmentMenuPlacement", {});
      return all?.[actorId] && typeof all[actorId] === "object" ? all[actorId] : {};
    },

    async _saveEquipmentCategories(categories) {
      await this._ss("equipmentMenuCategories", JSON.stringify(categories));
    },

    async _saveEquipmentPlacement(actorId, placement) {
      const all = this._gjson("equipmentMenuPlacement", {});
      all[actorId] = placement;
      await this._ss("equipmentMenuPlacement", JSON.stringify(all));
    },

    _getEquipmentCategoryStyles() {
      return this._gjson("equipmentCategoryStyles", {});
    },

    async _saveEquipmentCategoryStyle(categoryId, style) {
      const styles = this._getEquipmentCategoryStyles();
      styles[categoryId] = {
        icon: style?.icon ?? "",
        iconSize: Math.max(12, Math.min(40, Number(style?.iconSize ?? 16))),
        titleSize: Math.max(70, Math.min(180, Number(style?.titleSize ?? 100))),
        titleColor: style?.titleColor ?? "#f0d68a",
        padding: Math.max(4, Math.min(24, Number(style?.padding ?? 8))),
        headerColor: style?.headerColor ?? "#6a5320"
      };
      await this._ss("equipmentCategoryStyles", JSON.stringify(styles));
    },

    _getEquipmentCategoryStyle(categoryId) {
      const styles = this._getEquipmentCategoryStyles();
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

    _equipmentCategoryHeaderStyle(style = {}) {
      return [
        `--ct-equipment-category-icon-size:${Math.max(12, Math.min(40, Number(style.iconSize ?? 16)))}px`,
        `--ct-equipment-category-title-scale:${Math.max(70, Math.min(180, Number(style.titleSize ?? 100))) / 100}`,
        `--ct-equipment-category-title-color:${style.titleColor ?? "#f0d68a"}`,
        `--ct-equipment-category-padding:${Math.max(4, Math.min(24, Number(style.padding ?? 8)))}px`,
        `--ct-equipment-category-header-bg:${style.headerColor ?? "#6a5320"}`
      ].join("; ");
    },

    _equipmentCategoryHeaderIconHtml(style = {}) {
      return style?.icon ? `<i class="ct-equipment-category-icon ${style.icon}"></i>` : "";
    },

    _equipmentPositionPopupAboveEvent(popup, event, options = {}) {
      const margin = Number(options.margin ?? 8);
      const fallbackLeft = Number(options.left ?? 120);
      const fallbackTop = Number(options.top ?? 120);
      const x = Number(event?.clientX ?? fallbackLeft);
      const y = Number(event?.clientY ?? fallbackTop);
      popup.style.left = `${Math.max(margin, x)}px`;
      popup.style.top = `${Math.max(margin, y)}px`;
      popup.style.transform = "none";
      requestAnimationFrame(() => {
        const rect = popup.getBoundingClientRect();
        const left = Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - rect.width - margin));
        const top = Math.min(Math.max(margin, y - rect.height - 12), Math.max(margin, window.innerHeight - rect.height - margin));
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
      });
    },

    _equipmentHideTooltip() {
      clearTimeout(this._equipmentTooltipTimer);
      this._equipmentTooltipTimer = null;
      document.querySelector(".ct-equipment-hover-tooltip")?.remove();
    },

    _equipmentGetDescription(item) {
      const candidates = [
        item?.system?.description,
        item?.system?.description?.value,
        item?.system?.basic?.description,
        item?.system?.notes,
        item?.system?.summary,
        item?.system?.basic?.notes
      ];
      const found = candidates.find(v => typeof v === "string" && v.trim());
      return found ? found.trim() : "";
    },

    _equipmentShowTooltip(anchor, content) {
      this._equipmentHideTooltip();
      if (!anchor || !content) return;
      const tip = document.createElement("div");
      tip.className = "ct-equipment-hover-tooltip";
      tip.innerHTML = content;
      document.body.appendChild(tip);
      const a = anchor.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      const left = Math.min(window.innerWidth - t.width - 8, Math.max(8, a.right + 10));
      const top = Math.min(window.innerHeight - t.height - 8, Math.max(8, a.top + (a.height / 2) - (t.height / 2)));
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    },

    _bindEquipmentRowEvents(bar) {
      if (!this.actor) return;
      bar.querySelectorAll('[data-use-equipment]').forEach((btn) => btn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Do not auto-close equipment while combat menu is open
        if (!this._combatFloatingOpen) this._closePanel();
        await this.openEquipmentUseDialog(e.currentTarget.dataset.useEquipment);
      });
      bar.querySelectorAll(".ct-equipment-draggable[data-equipment-id]").forEach(row => {
        row.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._equipmentHideTooltip();
          // Auto-close Equipment panel when opening the Foundry item sheet (unless combat is open)
          if (this.activePanel === "equipment" && !this._combatFloatingOpen) {
            this._closePanel();
          }
          const item = this.actor?.items.get(row.dataset.equipmentId);
          item?.sheet?.render(true);
        };
        row.onmouseenter = () => {
          this._equipmentHideTooltip();
          const item = this.actor?.items.get(row.dataset.equipmentId);
          const description = this._equipmentGetDescription(item);
          if (!description) return;
          this._equipmentTooltipTimer = setTimeout(() => this._equipmentShowTooltip(row, description), 2000);
        };
        row.onmouseleave = () => this._equipmentHideTooltip();
        row.onmousedown = () => this._equipmentHideTooltip();
      });
      bar.querySelectorAll("[data-equipment-category-header]").forEach(header => {
        header.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._openEquipmentCategoryAppearanceSettings(e, header.dataset.equipmentCategoryHeader, { anchor: header });
        };
        header.onclick = null;
      });
    },

    _isWeaponItem(item) {
      const sys = item?.system ?? {};
      const basic = sys.basic ?? {};
      if (basic.damage || basic.range) return true;
      if (sys.weaponType || basic.weaponType) return true;
      const nameLower = (item.name || "").toLowerCase();
      const keywords = ["sword","axe","bow","dagger","mace","spear","staff","crossbow","pistol","rifle","gun","blade","club","hammer","whip","weapon","ammo","arrow","bolt","bullet","quiver","slingshot","javelin","lance","musket","shotgun","grenade","explosive"];
      return keywords.some(k => nameLower.includes(k));
    },

    _isArmorItem(item) {
      const sys = item?.system ?? {};
      const basic = sys.basic ?? {};
      if (basic.armor !== undefined || sys.armor !== undefined) return true;
      if (basic.armorValue !== undefined || sys.armorValue !== undefined) return true;
      if (sys.armorType || basic.armorType) return true;
      const nameLower = (item.name || "").toLowerCase();
      const keywords = ["armor","armour","shield","helmet","helm","breastplate","cuirass","mail","plate","leather","hide","chain","gauntlet","bracer","greaves","boot","cloak","robe","vest","padding","jack","surcoat","barding","buckler","tower shield","aegis","protection","defensive"];
      return keywords.some(k => nameLower.includes(k));
    },

    _bindEquipmentTabs(bar) {
      const tabs = bar.querySelectorAll(".ct-equipment-side-tab");
      if (!tabs.length) return;
      tabs.forEach(tab => {
        tab.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const target = tab.dataset.equipmentTab;
          if (target === "equip") {
            const isNowOpen = !this._combatFloatingOpen;
            this._combatFloatingOpen = isNowOpen;
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.toggle("active", isNowOpen);
            if (isNowOpen) {
              this._openCombatFloatingPanel();
            } else {
              this._closeCombatFloatingPanel();
            }
          } else if (target === "home" || target === "weapon" || target === "armor") {
            this._equipmentSubTab = target;
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            this._closeCombatFloatingPanel();
            this._refreshActivePanel();
          }
        };
      });
    },

    _openCombatFloatingPanel() {
      this._closeCombatFloatingPanel();
      if (!this.actor) return;
      // 9:16 aspect ratio helper
      const ASPECT_W = 9, ASPECT_H = 16;
      const enforceRatio = (w) => {
        const width = Math.max(200, Math.min(500, Math.round(w)));
        const height = Math.round(width * ASPECT_H / ASPECT_W);
        return { width, height };
      };
      const savedPos = this._combatFloatingPos || { left: 340, bottom: 80 };
      const savedSize = this._combatFloatingSize ? enforceRatio(this._combatFloatingSize.width) : enforceRatio(270);
      const panel = document.createElement("div");
      panel.className = "ct-combat-floating-panel";
      panel.id = "ct-combat-floating";
      panel.style.left = `${savedPos.left}px`;
      panel.style.bottom = `${savedPos.bottom}px`;
      panel.style.width = `${savedSize.width}px`;
      panel.style.height = `${savedSize.height}px`;
      panel.style.maxHeight = `${savedSize.height}px`;
      panel.innerHTML = `
        <div class="ct-combat-floating-header" data-combat-drag-handle>
          <div class="ct-combat-drag-dots"><span></span><span></span><span></span></div>
          <div class="ct-panel-action-group ct-combat-actions-right">
            <button class="ct-panel-settings-btn ct-combat-btn-sm" data-combat-lock title="Lock/Unlock Slots"><i class="fas fa-lock"></i></button>
            <button class="ct-panel-settings-btn ct-combat-btn-sm" data-combat-settings title="Combat Equipment Settings"><i class="fas fa-sliders-h"></i></button>
            <button class="ct-panel-settings-btn ct-combat-btn-sm" data-combat-close title="Close"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div class="ct-combat-floating-body">${this._buildEquipmentDoll(this.actor)}</div>
        <div class="ct-combat-resize-handle" data-combat-resize title="Resize"></div>
      `;
      document.body.appendChild(panel);
      this._bindCombatFloatingDrag(panel);
      this._bindCombatFloatingResize(panel);
      requestAnimationFrame(() => this._bindCombatDollEvents(panel));
      // Close button
      const closeBtn = panel.querySelector("[data-combat-close]");
      if (closeBtn) {
        closeBtn.onclick = (e) => { e.stopPropagation(); this._closeCombatFloatingPanel(); };
      }
      // Lock + settings + slots are bound by _bindCombatDollEvents below
    },

    _closeCombatFloatingPanel() {
      const panel = document.getElementById("ct-combat-floating");
      if (!panel) return;
      // Save position + size before removing
      const left = parseInt(panel.style.left, 10);
      const bottom = parseInt(panel.style.bottom, 10);
      if (!isNaN(left) && !isNaN(bottom)) {
        this._combatFloatingPos = { left, bottom };
      }
      const width = parseInt(panel.style.width, 10);
      const height = parseInt(panel.style.height, 10);
      if (!isNaN(width) && !isNaN(height)) {
        // Enforce 9:16 ratio on save — store width only, derive height from ratio
        this._combatFloatingSize = { width };
      }
      // Persist to actor preferences
      void this._saveCombatSettings();
      panel.remove();
      this._combatFloatingOpen = false;
      // Deactivate equip tab in equipment panel
      const tab = this.element?.querySelector('.ct-equipment-side-tab[data-equipment-tab="equip"]');
      if (tab) tab.classList.remove("active");
    },

    _bindCombatFloatingDrag(panel) {
      const handle = panel.querySelector("[data-combat-drag-handle]");
      if (!handle) return;
      let dragging = false;
      let startX = 0, startY = 0, startLeft = 0, startBottom = 0;

      const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.left = `${startLeft + dx}px`;
        panel.style.bottom = `${startBottom - dy}px`;
      };

      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // Save final position
        const left = parseInt(panel.style.left, 10);
        const bottom = parseInt(panel.style.bottom, 10);
        if (!isNaN(left) && !isNaN(bottom)) {
          this._combatFloatingPos = { left, bottom };
        }
        void this._saveCombatSettings();
      };

      handle.onmousedown = (e) => {
        if (e.target.closest(".ct-panel-settings-btn")) return;
        dragging = true;
        handle.classList.add("dragging");
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(panel.style.left, 10) || 340;
        startBottom = parseInt(panel.style.bottom, 10) || 80;
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      };
    },

    _bindCombatFloatingResize(panel) {
      const resizeHandle = panel.querySelector("[data-combat-resize]");
      if (!resizeHandle) return;
      let resizing = false;
      let startX = 0, startY = 0, startW = 0;
      const ASPECT_W = 9, ASPECT_H = 16;

      const onMove = (e) => {
        if (!resizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        // Use average of dx and dy for natural diagonal resize feel
        const delta = Math.round((dx + dy) / 2);
        const newW = Math.max(200, Math.min(500, startW + delta));
        const newH = Math.round(newW * ASPECT_H / ASPECT_W);
        panel.style.width = `${newW}px`;
        panel.style.height = `${newH}px`;
        panel.style.maxHeight = `${newH}px`;
      };

      const onUp = () => {
        if (!resizing) return;
        resizing = false;
        resizeHandle.classList.remove("resizing");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // Save final size (width only — height derived from 9:16 ratio)
        const width = parseInt(panel.style.width, 10);
        if (!isNaN(width)) {
          this._combatFloatingSize = { width };
        }
        void this._saveCombatSettings();
      };

      resizeHandle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        resizing = true;
        resizeHandle.classList.add("resizing");
        startX = e.clientX;
        startY = e.clientY;
        startW = panel.offsetWidth;
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      };
    },

    _bindDialogDrag(element, type) {
      const header = element.querySelector('.window-header, .dialog-title, .ct-combat-slot-edit-header');
      if (!header) return;
      header.style.cursor = 'move';
      let dragging = false;
      let startX = 0, startY = 0, startLeft = 0, startTop = 0;
      let rafId = null;
      let currentX = 0, currentY = 0;

      const onMove = (e) => {
        if (!dragging) return;
        currentX = e.clientX;
        currentY = e.clientY;
      };

      const doDrag = () => {
        if (!dragging) return;
        const dx = currentX - startX;
        const dy = currentY - startY;
        element.style.left = `${startLeft + dx}px`;
        element.style.top = `${startTop + dy}px`;
        rafId = requestAnimationFrame(doDrag);
      };

      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        if (rafId) cancelAnimationFrame(rafId);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        // Save position
        const left = parseInt(element.style.left, 10);
        const top = parseInt(element.style.top, 10);
        if (!isNaN(left) && !isNaN(top)) {
          if (!this._combatDialogPositions) this._combatDialogPositions = {};
          this._combatDialogPositions[type] = { left, top };
          void this._saveCombatSettings();
        }
      };

      header.onmousedown = (e) => {
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(element.style.left, 10) || 0;
        startTop = parseInt(element.style.top, 10) || 0;
        currentX = e.clientX;
        currentY = e.clientY;
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        rafId = requestAnimationFrame(doDrag);
      };
    },

    _buildEquipmentDoll(actor) {
      const s = this._combatSidebarSettings;
      const portrait = s.portrait || actor.img || "icons/svg/mystery-man.svg";
      const slots = s.slots || [];
      const isUnlocked = this._combatSlotsUnlocked;

      const renderSlot = (slot) => {
        const size = slot.slotSize || 42;
        const opacity = slot.imageOpacity ?? 0.3;
        const margin = slot.margin ?? 0;
        const padding = slot.padding ?? 0;
        const offsetX = slot.offsetX ?? 0;
        const offsetY = slot.offsetY ?? 0;
        const bgClass = slot.image ? 'ct-doll-slot-has-image' : `ct-doll-slot-bg ct-doll-slot-bg-${slot.id}`;
        const content = slot.image
          ? `<img src="${slot.image}" alt="${slot.label}" style="width:${size-10}px;height:${size-10}px;object-fit:contain;border-radius:3px;position:relative;z-index:2;opacity:${opacity};">`
          : `<i class="fas ${slot.icon}" style="position:relative;z-index:2;"></i>`;
        const style = `width:${size}px;height:${size}px;margin:${margin}px;padding:${padding}px;transform:translate(${offsetX}px,${offsetY}px);`;
        return `<div class="ct-doll-slot ${bgClass}" data-doll-slot="${slot.id}" title="${slot.label}" style="${style}">${content}</div>`;
      };

      const leftSlots = slots.filter(s => s.side === "left").sort((a,b) => (a.row||0)-(b.row||0)).map(renderSlot).join("");
      const rightSlots = slots.filter(s => s.side === "right").sort((a,b) => (a.row||0)-(b.row||0)).map(renderSlot).join("");
      const bottomSlots = slots.filter(s => s.side === "bottom").sort((a,b) => (a.row||0)-(b.row||0)).map(renderSlot).join("");

      // Directional add-slot buttons (only when unlocked)
      const addBtn = (dir, icon, title) => isUnlocked
        ? `<button class="ct-doll-add-slot ct-doll-add-${dir}" data-add-slot-dir="${dir}" title="${title}"><i class="fas ${icon}"></i></button>`
        : "";

      const dollBg = this._getCombatDollStyle();
      return `<div class="ct-equipment-doll ${isUnlocked ? 'ct-doll-unlocked' : ''}" style="${dollBg}background-image:url('${portrait}');">
        <div class="ct-doll-left">${leftSlots}${addBtn('left', 'fa-plus', 'Add slot left')}</div>
        <div class="ct-doll-right">${rightSlots}${addBtn('right', 'fa-plus', 'Add slot right')}</div>
        <div class="ct-doll-bottom">${bottomSlots}${addBtn('bottom', 'fa-plus', 'Add slot bottom')}</div>
      </div>`;
    },

    _loadCombatSettings() {
      const defaults = {
        height: 420,
        portrait: null,
        bgColor: "rgba(18,15,23,0.95)",
        bgImage: { url: "", opacity: 0.3, position: "center", fit: "cover" },
        slots: [
          // Left column (6 slots)
          { id: "head", icon: "fa-helmet-safety", label: "Head", side: "left", row: 1, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "shoulders", icon: "fa-shield-halved", label: "Shoulders", side: "left", row: 2, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "chest", icon: "fa-shirt", label: "Chest", side: "left", row: 3, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "hands", icon: "fa-hand-fist", label: "Hands", side: "left", row: 4, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "waist", icon: "fa-ring", label: "Waist", side: "left", row: 5, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "legs", icon: "fa-socks", label: "Legs", side: "left", row: 6, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          // Right column (6 slots)
          { id: "neck", icon: "fa-gem", label: "Neck", side: "right", row: 1, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "ears", icon: "fa-ear-listen", label: "Ears", side: "right", row: 2, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "ring1", icon: "fa-circle", label: "Ring", side: "right", row: 3, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "ring2", icon: "fa-circle", label: "Ring", side: "right", row: 4, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "trinket1", icon: "fa-star", label: "Trinket", side: "right", row: 5, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "trinket2", icon: "fa-star", label: "Trinket", side: "right", row: 6, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          // Bottom row (6 slots)
          { id: "mainhand", icon: "fa-khanda", label: "Main Hand", side: "bottom", row: 1, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "offhand", icon: "fa-shield", label: "Off Hand", side: "bottom", row: 2, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "feet", icon: "fa-shoe-prints", label: "Feet", side: "bottom", row: 3, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "back", icon: "fa-scroll", label: "Back", side: "bottom", row: 4, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "ranged", icon: "fa-bullseye", label: "Ranged", side: "bottom", row: 5, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
          { id: "ammo", icon: "fa-box", label: "Ammo", side: "bottom", row: 6, itemId: null, image: null, imageOpacity: 0.3, slotSize: 42, margin: 0, padding: 0, offsetX: 0, offsetY: 0 },
        ]
      };
      const saved = this.actor ? getActorPref(this.actor.id, "combatSettings") : null;
      if (!saved) return defaults;
      try {
        const merged = { ...defaults, ...saved, bgImage: { ...defaults.bgImage, ...(saved.bgImage || {}) } };
        // Load persisted floating position/size into instance vars
        if (saved.floatingPos) this._combatFloatingPos = saved.floatingPos;
        if (saved.floatingSize) this._combatFloatingSize = saved.floatingSize;
        if (saved.dialogPositions) this._combatDialogPositions = saved.dialogPositions;
        return merged;
      } catch { return defaults; }
    },

    async _saveCombatSettings() {
      if (!this.actor) return;
      // Persist floating position/size into combat settings
      this._combatSidebarSettings.floatingPos = this._combatFloatingPos || null;
      this._combatSidebarSettings.floatingSize = this._combatFloatingSize || null;
      this._combatSidebarSettings.dialogPositions = this._combatDialogPositions || {};
      await setActorPref(this.actor.id, "combatSettings", this._combatSidebarSettings);
    },

    _toggleCombatLock(bar) {
      this._combatSlotsUnlocked = !this._combatSlotsUnlocked;
      const lockBtn = bar?.querySelector("[data-combat-lock]");
      if (lockBtn) {
        lockBtn.innerHTML = `<i class="fas fa-${this._combatSlotsUnlocked ? "unlock" : "lock"}"></i>`;
        lockBtn.title = this._combatSlotsUnlocked ? "Lock Slots" : "Unlock Slots";
      }
      ui.notifications?.info?.(this._combatSlotsUnlocked ? "Combat slots UNLOCKED — you can now edit placeholders" : "Combat slots LOCKED");
      // Re-render the doll to show/hide add-slot buttons immediately
      this._refreshCombatPanel();
    },

    _openCombatSettings() {
      const s = this._combatSidebarSettings;
      // Get saved position or position above combat panel
      const pos = this._combatDialogPositions?.settings || null;
      const combatPanel = document.getElementById("ct-combat-floating");
      let defaultTop, defaultLeft;
      if (combatPanel) {
        const rect = combatPanel.getBoundingClientRect();
        defaultLeft = rect.left;
        defaultTop = rect.top - 500; // Open above the panel (approx 500px height)
        if (defaultTop < 10) defaultTop = 10; // Don't go off-screen top
      } else {
        defaultTop = Math.round((window.innerHeight - 500) / 2);
        defaultLeft = Math.round((window.innerWidth - 300) / 2);
      }

      const dlg = new Dialog({
        title: "Combat Equipment Settings",
        content: this._buildCombatSettingsDialog(s),
        buttons: {
          done: {
            icon: "<i class='fas fa-check'></i>",
            label: "Done",
            callback: () => {}
          }
        },
        default: "done",
        render: (html) => {
          const root = html[0]?.closest?.(".window-app") || html[0]?.closest?.(".dialog") || html[0];
          if (!root) return;
          // Position the dialog window
          const top = pos?.top ?? defaultTop;
          const left = pos?.left ?? defaultLeft;
          root.style.top = `${top}px`;
          root.style.left = `${left}px`;
          root.style.position = 'fixed';
          // Make draggable
          this._bindDialogDrag(root, 'settings');
          const content = root.querySelector('.dialog') || root;
          this._bindCombatSettingsLive(content);
        },
        close: () => {
          delete this._combatSettingsDialog;
        }
      }, {
        width: 300,
        classes: ["dialog", "ct-combat-settings-window"]
      });
      this._combatSettingsDialog = dlg;
      dlg.render(true);
      // Force dialog to the front
      setTimeout(() => {
        dlg.bringToTop?.();
        const app = document.querySelector('.ct-combat-settings-window');
        if (app) {
          app.style.zIndex = '99999';
        }
      }, 50);
    },

    _buildCombatSettingsDialog(s) {
      const fits = ["cover", "contain", "fill", "none"];
      const positions = ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"];
      const hex = this._rgbaToHex(s.bgColor);
      return `
        <div class="ct-combat-settings-fancy">
          <div class="ct-settings-group">
            <div class="ct-settings-label"><i class="fas fa-image"></i> Portrait</div>
            <div class="ct-settings-input-wrap">
              <input type="text" data-live="portrait" value="${s.portrait || ''}" placeholder="Actor portrait">
              <button class="ct-settings-browse" data-browse-portrait title="Browse"><i class="fas fa-folder-open"></i></button>
            </div>
          </div>
          <div class="ct-settings-group">
            <div class="ct-settings-label"><i class="fas fa-palette"></i> Background</div>
            <div class="ct-settings-color-wrap">
              <input type="color" data-live="bgColor" value="${hex}">
              <span class="ct-settings-hex">${hex}</span>
            </div>
          </div>
          <div class="ct-settings-divider"></div>
          <div class="ct-settings-group">
            <div class="ct-settings-label"><i class="fas fa-photo-film"></i> BG Image URL</div>
            <input type="text" data-live="bgUrl" value="${s.bgImage?.url || ''}" placeholder="https://...">
          </div>
          <div class="ct-settings-row">
            <div class="ct-settings-group" style="flex:1">
              <div class="ct-settings-label">Opacity</div>
              <div class="ct-settings-input-wrap">
                <input type="range" data-live="bgOpacity" min="0" max="1" step="0.05" value="${s.bgImage?.opacity ?? 0.3}">
                <span class="ct-settings-value" data-display="bgOpacity">${Math.round((s.bgImage?.opacity ?? 0.3) * 100)}%</span>
              </div>
            </div>
          </div>
          <div class="ct-settings-row">
            <div class="ct-settings-group" style="flex:1">
              <div class="ct-settings-label">Position</div>
              <select data-live="bgPosition">${positions.map(p => `<option value="${p}" ${(s.bgImage?.position || 'center') === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
            </div>
            <div class="ct-settings-group" style="flex:1">
              <div class="ct-settings-label">Fit</div>
              <select data-live="bgFit">${fits.map(f => `<option value="${f}" ${(s.bgImage?.fit || 'cover') === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
            </div>
          </div>
          <div class="ct-settings-preview" data-settings-preview style="${s.bgImage?.url ? `background-image:url('${s.bgImage.url}');background-position:${s.bgImage.position};background-size:${s.bgImage.fit};opacity:${s.bgImage.opacity}` : ''}">
            ${!s.bgImage?.url ? '<span class="ct-settings-preview-empty"><i class="fas fa-image"></i><br>No image</span>' : ''}
          </div>
        </div>
      `;
    },

    _bindCombatSettingsLive(container) {
      const update = () => {
        const s = this._combatSidebarSettings;
        const getVal = (key) => container.querySelector(`[data-live="${key}"]`)?.value;
        const getNum = (key) => { const v = parseFloat(getVal(key)); return Number.isFinite(v) ? v : null; };
        s.portrait = getVal("portrait")?.trim() || null;
        s.bgColor = this._hexToRgba(getVal("bgColor") ?? "#121217", 0.95);
        s.bgImage = {
          url: getVal("bgUrl")?.trim() || "",
          opacity: Math.max(0, Math.min(1, getNum("bgOpacity") ?? 0.3)),
          position: getVal("bgPosition") || "center",
          fit: getVal("bgFit") || "cover"
        };
        const oDisplay = container.querySelector('[data-display="bgOpacity"]');
        if (oDisplay) oDisplay.textContent = `${Math.round(s.bgImage.opacity * 100)}%`;
        const hexDisplay = container.querySelector('.ct-settings-hex');
        if (hexDisplay) hexDisplay.textContent = this._rgbaToHex(s.bgColor);
        const preview = container.querySelector('[data-settings-preview]');
        if (preview) {
          if (s.bgImage.url) {
            preview.style.backgroundImage = `url('${s.bgImage.url}')`;
            preview.style.backgroundPosition = s.bgImage.position;
            preview.style.backgroundSize = s.bgImage.fit;
            preview.style.opacity = s.bgImage.opacity;
            preview.innerHTML = '';
          } else {
            preview.style.backgroundImage = '';
            preview.innerHTML = '<span class="ct-settings-preview-empty"><i class="fas fa-image"></i><br>No image</span>';
          }
        }
        // Apply live to combat panel
        const combatPanel = document.getElementById("ct-combat-floating");
        if (combatPanel) {
          const doll = combatPanel.querySelector('.ct-equipment-doll');
          if (doll) {
            doll.style.background = s.bgColor;
            if (s.bgImage.url) {
              doll.style.backgroundImage = `url('${s.bgImage.url}')`;
              doll.style.backgroundPosition = s.bgImage.position;
              doll.style.backgroundSize = s.bgImage.fit;
              doll.style.backgroundRepeat = 'no-repeat';
              doll.style.backgroundBlendMode = 'overlay';
            } else {
              doll.style.backgroundImage = '';
            }
          }
        }
        // Save immediately
        void this._saveCombatSettings();
        void this._saveCombatSettings();
      };
      container.querySelectorAll('[data-live]').forEach(el => {
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', update);
      });
      const browseBtn = container.querySelector('[data-browse-portrait]');
      if (browseBtn) {
        browseBtn.onclick = async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const fp = new FilePicker({
            type: "image",
            current: this._combatSidebarSettings.portrait || this.actor?.img || "",
            callback: (path) => {
              const input = container.querySelector('[data-live="portrait"]');
              if (input) { input.value = path; update(); }
            }
          });
          await fp.browse();
        };
      }
    },

    _rgbaToHex(rgba) {
      const m = rgba?.match?.(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return "#121217";
      return "#" + [m[1], m[2], m[3]].map(x => {
        const h = parseInt(x).toString(16);
        return h.length === 1 ? "0" + h : h;
      }).join("");
    },

    _hexToRgba(hex, alpha = 0.95) {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    },

    _getCombatDollStyle() {
      const s = this._combatSidebarSettings;
      const styles = [];
      styles.push(`--ct-combat-height:${s.height}px`);
      styles.push(`background-color:${s.bgColor}`);
      styles.push(`background-size:cover`);
      styles.push(`background-position:top center`);
      styles.push(`background-repeat:no-repeat`);
      if (s.bgImage?.url) {
        styles.push(`background-image:url('${s.bgImage.url}')`);
        styles.push(`background-blend-mode:overlay`);
      }
      return styles.join(";") + ";";
    },

    _bindCombatDollEvents(bar) {
      if (!bar) return;
      // Lock button
      const lockBtn = bar.querySelector("[data-combat-lock]");
      if (lockBtn) {
        lockBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._toggleCombatLock(bar);
        };
      }
      // Settings button
      const settingsBtn = bar.querySelector("[data-combat-settings]");
      if (settingsBtn) {
        settingsBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._openCombatSettings();
        };
      }
      // Slot clicks
      bar.querySelectorAll("[data-doll-slot]").forEach(slot => {
        slot.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this._combatSlotsUnlocked) {
            this._editCombatSlot(slot.dataset.dollSlot);
          } else {
            this._useCombatSlot(slot.dataset.dollSlot);
          }
        };
      });
      // Directional add-slot buttons (when unlocked)
      bar.querySelectorAll("[data-add-slot-dir]").forEach(addBtn => {
        addBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._addNewCombatSlot(addBtn.dataset.addSlotDir);
        };
      });
    },

    _editCombatSlot(slotId) {
      const slot = this._combatSidebarSettings.slots?.find(s => s.id === slotId);
      if (!slot) return;
      
      // Close any existing edit panel
      const existing = document.getElementById("ct-combat-slot-edit");
      if (existing) existing.remove();

      const sides = [
        { value: "topleft", label: "Top Left" },
        { value: "topright", label: "Top Right" },
        { value: "topcenter", label: "Above Portrait" },
        { value: "left", label: "Left" },
        { value: "right", label: "Right" },
        { value: "bottom", label: "Bottom" }
      ];
      const currentOpacity = Math.round((slot.imageOpacity ?? 0.3) * 100);
      const currentSize = slot.slotSize || 38;

      const panel = document.createElement("div");
      panel.className = "ct-combat-slot-edit-panel";
      panel.id = "ct-combat-slot-edit";
      
      // Position: saved position or above combat panel
      const pos = this._combatDialogPositions?.slotEdit || null;
      const combatPanel = document.getElementById("ct-combat-floating");
      let defaultLeft, defaultTop;
      if (combatPanel) {
        const rect = combatPanel.getBoundingClientRect();
        defaultLeft = rect.left;
        defaultTop = rect.top - 420; // Open above the panel
        if (defaultTop < 10) defaultTop = 10;
      } else {
        defaultLeft = Math.round((window.innerWidth - 320) / 2);
        defaultTop = Math.round((window.innerHeight - 450) / 2);
      }
      panel.style.left = `${pos?.left ?? defaultLeft}px`;
      panel.style.top = `${pos?.top ?? defaultTop}px`;
      panel.style.bottom = 'auto';
      panel.style.position = 'fixed';

      panel.innerHTML = `
        <div class="ct-combat-slot-edit-header">
          <i class="fas fa-pen-to-square"></i> <span>Edit ${slot.label}</span>
          <button class="ct-panel-settings-btn ct-combat-btn-sm" data-slot-edit-close title="Close"><i class="fas fa-times"></i></button>
        </div>
        <div class="ct-combat-slot-edit-body">
          <div class="ct-slot-edit-group">
            <label><i class="fas fa-tag"></i> Label</label>
            <input type="text" data-slot-field="label" value="${slot.label}" placeholder="Slot name">
          </div>
          <div class="ct-slot-edit-group">
            <label><i class="fas fa-arrows-alt"></i> Side</label>
            <select data-slot-field="side">
              ${sides.map(s => `<option value="${s.value}" ${slot.side === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="ct-slot-edit-group">
            <label><i class="fas fa-icons"></i> Icon Class</label>
            <input type="text" data-slot-field="icon" value="${slot.icon}" placeholder="fa-shield">
          </div>
          <div class="ct-slot-edit-group">
            <label><i class="fas fa-image"></i> Image URL</label>
            <input type="text" data-slot-field="image" value="${slot.image || ''}" placeholder="https://...">
          </div>
          <div class="ct-slot-edit-group">
            <label><i class="fas fa-eye"></i> Image Opacity <span class="ct-slot-edit-value" data-display="opacity">${currentOpacity}%</span></label>
            <input type="range" data-slot-field="imageOpacity" min="0" max="100" value="${currentOpacity}">
          </div>
          <div class="ct-slot-edit-row">
            <div class="ct-slot-edit-group" style="flex:1">
              <label><i class="fas fa-arrows-alt-h"></i> Width <span class="ct-slot-edit-value" data-display="width">${currentSize}px</span></label>
              <input type="range" data-slot-field="slotSize" data-slot-dimension="width" min="20" max="256" value="${currentSize}">
            </div>
            <div class="ct-slot-edit-group" style="flex:1">
              <label><i class="fas fa-arrows-alt-v"></i> Height <span class="ct-slot-edit-value" data-display="height">${currentSize}px</span></label>
              <input type="range" data-slot-field="slotSize" data-slot-dimension="height" min="20" max="256" value="${currentSize}">
            </div>
          </div>
          <div class="ct-slot-edit-group ct-slot-size-lock">
            <i class="fas fa-lock"></i> 1:1 Aspect Ratio Locked
          </div>
          <div class="ct-slot-edit-row">
            <div class="ct-slot-edit-group" style="flex:1">
              <label><i class="fas fa-arrows-alt-h"></i> Margin <span class="ct-slot-edit-value" data-display="margin">${slot.margin ?? 0}px</span></label>
              <input type="range" data-slot-field="margin" min="0" max="50" value="${slot.margin ?? 0}">
            </div>
            <div class="ct-slot-edit-group" style="flex:1">
              <label><i class="fas fa-expand-arrows-alt"></i> Padding <span class="ct-slot-edit-value" data-display="padding">${slot.padding ?? 0}px</span></label>
              <input type="range" data-slot-field="padding" min="0" max="50" value="${slot.padding ?? 0}">
            </div>
          </div>
          <div class="ct-slot-edit-row">
            <div class="ct-slot-edit-group" style="flex:1">
              <label><i class="fas fa-arrows-alt-h"></i> Offset X <span class="ct-slot-edit-value" data-display="offsetX">${slot.offsetX ?? 0}px</span></label>
              <input type="range" data-slot-field="offsetX" min="-100" max="100" value="${slot.offsetX ?? 0}">
            </div>
            <div class="ct-slot-edit-group" style="flex:1">
              <label><i class="fas fa-arrows-alt-v"></i> Offset Y <span class="ct-slot-edit-value" data-display="offsetY">${slot.offsetY ?? 0}px</span></label>
              <input type="range" data-slot-field="offsetY" min="-100" max="100" value="${slot.offsetY ?? 0}">
            </div>
          </div>
          <div class="ct-slot-edit-preview" data-slot-preview>
            <div class="ct-slot-preview-slot" style="width:${currentSize}px;height:${currentSize}px;">
              ${slot.image ? `<img src="${slot.image}" style="width:100%;height:100%;object-fit:contain;opacity:${currentOpacity/100};">` : `<i class="fas ${slot.icon}"></i>`}
            </div>
          </div>
        </div>
        <div class="ct-combat-slot-edit-footer">
          <button class="ct-slot-edit-btn ct-slot-edit-save" data-slot-edit-save><i class="fas fa-check"></i> Save</button>
          <button class="ct-slot-edit-btn ct-slot-edit-remove" data-slot-edit-remove><i class="fas fa-trash"></i> Remove</button>
          <button class="ct-slot-edit-btn ct-slot-edit-cancel" data-slot-edit-cancel><i class="fas fa-times"></i> Cancel</button>
        </div>
      `;
      document.body.appendChild(panel);
      // Force highest z-index
      panel.style.zIndex = '99999';

      // Make draggable and bind drag
      this._bindDialogDrag(panel, 'slotEdit');

      // Live preview updates
      const updatePreview = () => {
        const label = panel.querySelector('[data-slot-field="label"]')?.value?.trim() || slot.label;
        const icon = panel.querySelector('[data-slot-field="icon"]')?.value?.trim() || slot.icon;
        const image = panel.querySelector('[data-slot-field="image"]')?.value?.trim() || '';
        const opacity = parseInt(panel.querySelector('[data-slot-field="imageOpacity"]')?.value, 10) ?? currentOpacity;
        const size = parseInt(panel.querySelector('[data-slot-field="slotSize"]')?.value, 10) ?? currentSize;
        const margin = parseInt(panel.querySelector('[data-slot-field="margin"]')?.value, 10) ?? (slot.margin ?? 0);
        const padding = parseInt(panel.querySelector('[data-slot-field="padding"]')?.value, 10) ?? (slot.padding ?? 0);
        const offsetX = parseInt(panel.querySelector('[data-slot-field="offsetX"]')?.value, 10) ?? (slot.offsetX ?? 0);
        const offsetY = parseInt(panel.querySelector('[data-slot-field="offsetY"]')?.value, 10) ?? (slot.offsetY ?? 0);
        
        const preview = panel.querySelector('[data-slot-preview]');
        if (preview) {
          preview.innerHTML = `
            <div class="ct-slot-preview-slot" style="width:${size}px;height:${size}px;margin:${margin}px;padding:${padding}px;transform:translate(${offsetX}px,${offsetY}px);">
              ${image ? `<img src="${image}" style="width:100%;height:100%;object-fit:contain;opacity:${opacity/100};">` : `<i class="fas ${icon}"></i>`}
            </div>
          `;
        }
        
        const opacityDisplay = panel.querySelector('[data-display="opacity"]');
        if (opacityDisplay) opacityDisplay.textContent = `${opacity}%`;
        
        const widthDisplay = panel.querySelector('[data-display="width"]');
        if (widthDisplay) widthDisplay.textContent = `${size}px`;
        
        const heightDisplay = panel.querySelector('[data-display="height"]');
        if (heightDisplay) heightDisplay.textContent = `${size}px`;
        
        const marginDisplay = panel.querySelector('[data-display="margin"]');
        if (marginDisplay) marginDisplay.textContent = `${margin}px`;
        
        const paddingDisplay = panel.querySelector('[data-display="padding"]');
        if (paddingDisplay) paddingDisplay.textContent = `${padding}px`;
        
        const offsetXDisplay = panel.querySelector('[data-display="offsetX"]');
        if (offsetXDisplay) offsetXDisplay.textContent = `${offsetX}px`;
        
        const offsetYDisplay = panel.querySelector('[data-display="offsetY"]');
        if (offsetYDisplay) offsetYDisplay.textContent = `${offsetY}px`;
      };

      // Sync width/height sliders together (1:1 aspect ratio lock)
      const widthInput = panel.querySelector('[data-slot-dimension="width"]');
      const heightInput = panel.querySelector('[data-slot-dimension="height"]');
      if (widthInput && heightInput) {
        widthInput.addEventListener('input', (e) => {
          heightInput.value = e.target.value;
          updatePreview();
        });
        heightInput.addEventListener('input', (e) => {
          widthInput.value = e.target.value;
          updatePreview();
        });
      }

      panel.querySelectorAll('input:not([data-slot-dimension]), select').forEach(el => {
        el.addEventListener('input', updatePreview);
        el.addEventListener('change', updatePreview);
      });

      // Close button
      panel.querySelector('[data-slot-edit-close]')?.addEventListener('click', () => panel.remove());
      
      // Cancel button
      panel.querySelector('[data-slot-edit-cancel]')?.addEventListener('click', () => panel.remove());
      
      // Save button
      panel.querySelector('[data-slot-edit-save]')?.addEventListener('click', () => {
        const newLabel = panel.querySelector('[data-slot-field="label"]')?.value?.trim();
        const newSide = panel.querySelector('[data-slot-field="side"]')?.value;
        const newIcon = panel.querySelector('[data-slot-field="icon"]')?.value?.trim();
        const newImage = panel.querySelector('[data-slot-field="image"]')?.value?.trim();
        const newOpacity = parseInt(panel.querySelector('[data-slot-field="imageOpacity"]')?.value, 10);
        const newSize = parseInt(panel.querySelector('[data-slot-field="slotSize"]')?.value, 10);
        const newMargin = parseInt(panel.querySelector('[data-slot-field="margin"]')?.value, 10);
        const newPadding = parseInt(panel.querySelector('[data-slot-field="padding"]')?.value, 10);
        const newOffsetX = parseInt(panel.querySelector('[data-slot-field="offsetX"]')?.value, 10);
        const newOffsetY = parseInt(panel.querySelector('[data-slot-field="offsetY"]')?.value, 10);
        
        if (newLabel) slot.label = newLabel;
        if (newSide) slot.side = newSide;
        if (newIcon) slot.icon = newIcon;
        slot.image = newImage || null;
        if (Number.isFinite(newOpacity)) slot.imageOpacity = newOpacity / 100;
        if (Number.isFinite(newSize)) slot.slotSize = newSize;
        if (Number.isFinite(newMargin)) slot.margin = newMargin;
        if (Number.isFinite(newPadding)) slot.padding = newPadding;
        if (Number.isFinite(newOffsetX)) slot.offsetX = newOffsetX;
        if (Number.isFinite(newOffsetY)) slot.offsetY = newOffsetY;
        
        void this._saveCombatSettings();
        this._refreshCombatPanel();
        panel.remove();
        ui.notifications?.info?.(`${slot.label} slot updated!`);
      });
      
      // Remove button
      panel.querySelector('[data-slot-edit-remove]')?.addEventListener('click', () => {
        this._combatSidebarSettings.slots = this._combatSidebarSettings.slots.filter(s => s.id !== slotId);
        void this._saveCombatSettings();
        this._refreshCombatPanel();
        panel.remove();
        ui.notifications?.info?.("Slot removed.");
      });

      // Close on click outside
      const outsideClick = (e) => {
        if (!panel.contains(e.target)) {
          panel.remove();
          document.removeEventListener('click', outsideClick);
        }
      };
      setTimeout(() => document.addEventListener('click', outsideClick), 50);
    },

    _useCombatSlot(slotId) {
      // Future: equip/unequip item in this slot
      ui.notifications?.info?.(`${slotId} slot clicked — equip functionality coming soon!`);
    },

    _addNewCombatSlot(direction = "left") {
      const slots = this._combatSidebarSettings.slots || [];
      const newId = `custom_${Date.now()}`;
      const validSides = ["topleft", "topright", "topcenter", "left", "right", "bottom"];
      const side = validSides.includes(direction) ? direction : "left";
      const newSlot = {
        id: newId,
        icon: "fa-circle",
        label: "New Slot",
        side: side,
        row: 99,
        itemId: null,
        image: null,
        imageOpacity: 0.3,
        slotSize: 38,
        margin: 0,
        padding: 0,
        offsetX: 0,
        offsetY: 0
      };
      slots.push(newSlot);
      void this._saveCombatSettings();
      this._refreshCombatPanel();
      ui.notifications?.info?.(`New slot added to ${side}! Click it to customize.`);
    },

    _refreshCombatPanel() {
      // If floating combat panel is open, refresh it
      if (this._combatFloatingOpen) {
        this._openCombatFloatingPanel();
      } else if (this.activePanel === "equipment") {
        this._refreshActivePanel();
      }
    },

    _normalizeEquipmentPlacement(actor, categories = this._getEquipmentCategories()) {
      const validCategories = new Set(["menu", ...categories.map(cat => cat.id)]);
      const current = this._getEquipmentPlacement(actor.id);
      const equipment = actor.items.filter(item => ["equipment","artifact","cypher","oddity","material"].includes(item.type)).sort((a, b) => a.name.localeCompare(b.name));
      const normalized = {};
      equipment.forEach((item, index) => {
        const entry = current[item.id] ?? {};
        const category = validCategories.has(entry.category) ? entry.category : "menu";
        const order = Number.isFinite(Number(entry.order)) ? Number(entry.order) : index;
        normalized[item.id] = { category, order };
      });
      return normalized;
    },

    _equipmentMenuStyleVars(overrides = null) {
      const get = (key, fallback) => overrides && Object.prototype.hasOwnProperty.call(overrides, key) ? overrides[key] : (this._gs(key) ?? fallback);
      const dir = get("equipmentMenuShadowDirection", "bottom-right");
      const dirMap = {
        "bottom-right": [1, 1],
        "bottom-left": [-1, 1],
        "top-right": [1, -1],
        "top-left": [-1, -1],
        "bottom": [0, 1],
        "top": [0, -1],
        "left": [-1, 0],
        "right": [1, 0]
      };
      const [dx, dy] = dirMap[dir] ?? [1, 1];
      const dist = Number(get("equipmentMenuShadowDistance", 14));
      const fit = bgFitMap(get("equipmentMenuBgFit", "cover"));
      return [
        `--ct-equipment-shadow:${dist * dx}px ${dist * dy}px ${dist * 1.9}px ${hexToRGBA(get("equipmentMenuShadowColor", "#000000"), get("equipmentMenuShadowOpacity", 0.45))}`,
        `--ct-equipment-title-color:${get("equipmentMenuTitleColor", "#f0d68a")}`,
        `--ct-equipment-title-scale:${get("equipmentMenuTitleSize", 100) / 100}`,
        `--ct-equipment-title-transform:${get("equipmentMenuTitleCaps", false) ? "uppercase" : "none"}`,
        `--ct-equipment-heading-color:${get("equipmentMenuHeadingColor", "#d4a94d")}`,
        `--ct-equipment-heading-opacity:${get("equipmentMenuHeadingOpacity", 0.85)}`,
        `--ct-equipment-bg:${hexToRGBA(get("equipmentMenuBgColor", "#17121f"), get("equipmentMenuBgOpacity", 0.94))}`,
        `--ct-equipment-bg-image:url('${String(get("equipmentMenuBgImage", "")).replace(/'/g, "%27")}')`,
        `--ct-equipment-bg-image-opacity:${get("equipmentMenuBgImageOpacity", 0.2)}`,
        `--ct-equipment-bg-size:${fit.size}`,
        `--ct-equipment-bg-position:${fit.position}`,
        `--ct-equipment-columns:${Math.max(1, Math.min(3, Number(get("equipmentMenuColumns", 1))))}`,
        `--ct-equipment-width-scale:${get("equipmentMenuWidthScale", 100) / 100}`,
        `--ct-equipment-height-scale:${get("equipmentMenuHeightScale", 100) / 100}`,
        `--ct-equipment-font-scale:${get("equipmentMenuFontSize", 100) / 100}`,
        `--ct-equipment-item-padding:${get("equipmentMenuItemPadding", 5)}px`,
        `--ct-equipment-icon-size:${get("equipmentMenuIconSize", 20)}px`
      ].join("; ");
    },

    _buildEquipmentPanel(actor) {
      const subTab = this._equipmentSubTab || "weapon";
      let items = actor.items.filter(i => ["equipment", "artifact", "cypher", "oddity", "material"].includes(i.type)).sort((a, b) => a.name.localeCompare(b.name));

      // Filter by sub-tab
      if (subTab === "weapon") {
        items = items.filter(i => this._isWeaponItem(i));
      } else if (subTab === "armor") {
        items = items.filter(i => this._isArmorItem(i));
      }

      const customCategories = this._getEquipmentCategories();
      const defaultCategory = { id: "menu", name: "UNCATEGORIZED", system: true };
      const allCategories = [defaultCategory, ...customCategories];
      const placement = this._normalizeEquipmentPlacement(actor, customCategories);
      const grouped = new Map(allCategories.map(cat => [cat.id, []]));
      for (const item of items) {
        const place = placement[item.id] ?? { category: "menu", order: 9999 };
        if (!grouped.has(place.category)) grouped.set(place.category, []);
        grouped.get(place.category).push({ item, order: place.order });
      }
      const sectionData = allCategories.map(category => {
        const entries = (grouped.get(category.id) ?? []).sort((a, b) => a.order - b.order || a.item.name.localeCompare(b.item.name));
        const rows = entries.length ? entries.map(({ item }) => {
          const { quantity: qty } = equipmentQuantityInfo(item);
          const level = equipmentLevelValue(item);
          return `<div class="ct-item-row ct-equipment-action-row ct-equipment-draggable" draggable="true" data-equipment-id="${item.id}"><img class="ct-item-img" src="${item.img || 'icons/svg/item-bag.svg'}" alt="" draggable="false"><span class="ct-item-name">${item.name}</span><span class="ct-equipment-row-meta"><span class="ct-equipment-level-pill" title="Item level">${level}</span><span class="ct-item-qty ct-equipment-qty" title="Amount ${qty}">${qty}</span></span><button type="button" class="ct-equipment-use-btn" data-use-equipment="${item.id}" title="Use item" aria-label="Use item ${escapeEquipmentText(item.name)}"><i class="fas fa-hand-sparkles"></i></button></div>`;
        }).join("") : `<div class="ct-equipment-empty-drop">Drop equipment here</div>`;
        const bodyClass = entries.length ? "ct-equipment-category-body" : "ct-equipment-category-body ct-equipment-category-body-empty";
        const categoryStyle = this._getEquipmentCategoryStyle(category.id);
        const html = `<section class="ct-equipment-category-section" data-equipment-category-section="${category.id}" style="--ct-equipment-count:${Math.max(entries.length, 1)}"><div class="ct-equipment-category-header" data-equipment-category-header="${category.id}" style="${this._equipmentCategoryHeaderStyle(categoryStyle)}" title="Right-click to edit category header"><span class="ct-equipment-category-icon-wrap">${this._equipmentCategoryHeaderIconHtml(categoryStyle)}</span><span class="ct-equipment-category-title">${category.name}</span></div><div class="${bodyClass}" data-equipment-category="${category.id}">${rows}</div></section>`;
        return { html, weight: Math.max(entries.length, 1) };
      });
      const sections = buildEquipmentMasonryColumns(sectionData, Math.max(1, Math.min(3, Number(this._gs("equipmentMenuColumns") ?? 1))));

      // Panel title and icon based on sub-tab
      const tabMeta = {
        home:    { title: "Equipment", icon: "fa-house", cls: "" },
        equip:   { title: "Equipment", icon: "fa-shirt", cls: "" },
        weapon:  { title: "Weapons",   icon: "fa-khanda", cls: "" },
        armor:   { title: "Armor",     icon: "fa-shield-halved", cls: "" }
      };
      const meta = tabMeta[subTab] || tabMeta.home;

      // Build main panel content
      let mainContent;
      if (subTab === "equip") {
        mainContent = `<div class="ct-equipment-placeholder"><i class="fas fa-shirt"></i><p>Equipment Doll is open</p><p class="ct-equipment-placeholder-sub">Click the Equip tab to toggle the doll</p></div>`;
      } else {
        mainContent = sections || `<div class="ct-empty-msg">No ${subTab === "home" ? "equipment" : subTab} items found.</div>`;
      }

      const equipmentPanel = `<div class="ct-panel ct-panel-equipment-custom" style="${this._equipmentMenuStyleVars()};${this._getMenuBackgroundVars("equipment")}"><div class="ct-panel-header ct-panel-header-equipment-menu"><div class="ct-panel-title-wrap"><i class="fas ${meta.icon}"></i> <span class="ct-panel-title-text ct-equipment-panel-title-text">${meta.title}</span></div><div class="ct-panel-action-group"><button class="ct-panel-settings-btn" data-equipment-categories title="Equipment Categories"><i class="fas fa-folder-plus"></i></button><button class="ct-panel-settings-btn" data-equipment-settings title="Equipment Menu Settings"><i class="fas fa-sliders-h"></i></button><button class="ct-panel-settings-btn" data-equipment-close title="Close Equipment Menu"><i class="fas fa-times"></i></button></div></div><div class="ct-equipment-panel-body">${mainContent}</div></div>`;

      const isHomeActive = subTab === "home";
      const isEquipActive = subTab === "equip" || this._combatFloatingOpen;
      const isWeaponActive = subTab === "weapon" && !this._combatFloatingOpen;
      const isArmorActive = subTab === "armor";

      return `<div class="ct-equipment-tabs-wrapper"><div class="ct-equipment-main">${equipmentPanel}</div><div class="ct-equipment-side-tabs"><div class="ct-equipment-side-tab${isHomeActive ? ' active' : ''}" data-equipment-tab="home" title="All Equipment"><i class="fas fa-house"></i><span>Home</span></div><div class="ct-equipment-side-tab${isEquipActive ? ' active' : ''}" data-equipment-tab="equip" title="Equipment Doll"><i class="fas fa-shirt"></i><span>Equip</span></div><div class="ct-equipment-side-tab${isWeaponActive ? ' active' : ''}" data-equipment-tab="weapon" title="Weapons & Ammo"><i class="fas fa-khanda"></i><span>Weapon</span></div><div class="ct-equipment-side-tab${isArmorActive ? ' active' : ''}" data-equipment-tab="armor" title="Armor & Shields"><i class="fas fa-shield-halved"></i><span>Armor</span></div></div></div>`;
    },

    _bindEquipmentDnD(bar) {
      if (!this.actor) return;
      const zones = [...bar.querySelectorAll("[data-equipment-category]")];
      const rows = [...bar.querySelectorAll(".ct-equipment-draggable")];
      if (!zones.length || !rows.length) return;
      let dragged = null;

      const getAfterElement = (container, y) => {
        const els = [...container.querySelectorAll(".ct-equipment-draggable:not(.ct-dragging)")];
        return els.reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = y - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) return { offset, element: child };
          return closest;
        }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
      };

      const savePlacement = async () => {
        const placement = {};
        bar.querySelectorAll("[data-equipment-category]").forEach(body => {
          [...body.querySelectorAll(".ct-equipment-draggable")].forEach((row, index) => {
            placement[row.dataset.equipmentId] = {
              category: body.dataset.equipmentCategory ?? "menu",
              order: index
            };
          });
        });
        await this._saveEquipmentPlacement(this.actor.id, placement);
        this._refreshActivePanel();
      };

      rows.forEach(row => {
        row.draggable = true;
        row.ondragstart = (e) => {
          this._equipmentHideTooltip();
          dragged = row;
          row.classList.add("ct-dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.dropEffect = "move";
            e.dataTransfer.setData("text/plain", row.dataset.equipmentId);
          }
        };
        row.ondragend = async () => {
          row.classList.remove("ct-dragging");
          zones.forEach(zone => zone.classList.remove("ct-drop-target"));
          if (dragged) await savePlacement();
          dragged = null;
        };
      });

      zones.forEach(zone => {
        zone.ondragenter = (e) => {
          e.preventDefault();
          zone.classList.add("ct-drop-target");
        };
        zone.ondragover = (e) => {
          e.preventDefault();
          zone.classList.add("ct-drop-target");
          if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
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
          e.stopPropagation();
          zone.classList.remove("ct-drop-target");
          const current = dragged;
          if (current && !zone.contains(current)) zone.appendChild(current);
          await savePlacement();
        };
      });
    },

    openEquipmentUseDialog(itemId) {
      const actor = this.actor;
      if (!actor) return;
      const item = actor.items.get(itemId);
      if (!item) return;
      const qtyInfo = equipmentQuantityInfo(item);
      const content = `
        <div class="ct-equipment-use-dialog">
          <div class="ct-equipment-use-banner">Equipment Action</div>
          <div class="ct-equipment-use-card">
            <img class="ct-equipment-use-icon" src="${escapeEquipmentText(item.img || 'icons/svg/item-bag.svg')}" alt="">
            <div class="ct-equipment-use-copy">
              <div class="ct-equipment-use-title">${escapeEquipmentText(item.name)}</div>
              <div class="ct-equipment-use-sub">Choose how you want to handle this item.</div>
              <div class="ct-equipment-use-badges">
                <span class="ct-equipment-use-badge"><i class="fas fa-layer-group"></i> Level ${escapeEquipmentText(String(equipmentLevelValue(item)))}</span>
                <span class="ct-equipment-use-badge"><i class="fas fa-boxes-stacked"></i> Amount ${qtyInfo.quantity}</span>
              </div>
            </div>
          </div>
        </div>`;
      const dialog = new Dialog({
        title: `Item Action · ${item.name}`,
        content,
        buttons: {
          use: {
            icon: '<i class="fas fa-hand-sparkles"></i>',
            label: 'Use Item',
            callback: async () => { await this.sendEquipmentUseToChat(actor, item); }
          },
          expend: {
            icon: '<i class="fas fa-burst"></i>',
            label: 'Expend Item',
            callback: async () => { await this.expendEquipmentItem(actor, item); }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel'
          }
        },
        default: 'use',
        render: (html) => {
          const root = html[0] ?? html?.element?.[0];
          if (root) root.closest('.app')?.classList.add('ct-equipment-use-dialog-app');
        }
      });
      dialog.render(true);
    },

    async sendEquipmentUseToChat(actor, item) {
      const itemName = escapeEquipmentText(item?.name || 'Item');
      const actorName = escapeEquipmentText(actor?.name || game.user?.name || 'Player');
      const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
      const gmContent = `
        <div class="ct-equipment-chat-card ct-equipment-chat-card-gm">
          <div class="ct-equipment-chat-kicker">GM Notice</div>
          <div class="ct-equipment-chat-body">
            <i class="fas fa-eye"></i>
            <span>Player <strong>${actorName}</strong> is using item <strong>${itemName}</strong>.</span>
          </div>
        </div>`;
      const playerContent = `
        <div class="ct-equipment-chat-card ct-equipment-chat-card-player">
          <div class="ct-equipment-chat-kicker">Equipment Used</div>
          <div class="ct-equipment-chat-body">
            <i class="fas fa-hand-sparkles"></i>
            <span>You used item <strong>${itemName}</strong>.</span>
          </div>
        </div>`;
      if (gmIds.length) {
        await ChatMessage.create({ user: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), content: gmContent, whisper: gmIds });
      }
      await ChatMessage.create({ user: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), content: playerContent, whisper: [game.user.id] });
    },

    async expendEquipmentItem(actor, item) {
      const { quantity, hasQuantity } = equipmentQuantityInfo(item);
      const itemName = escapeEquipmentText(item?.name || 'Item');
      const actorName = escapeEquipmentText(actor?.name || game.user?.name || 'Player');
      const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
      const isLast = !hasQuantity || quantity <= 1;
      const remaining = hasQuantity ? Math.max(0, quantity - 1) : 0;

      // Perform the expend operation
      if (hasQuantity) {
        const next = Math.max(0, quantity - 1);
        if (next <= 0) {
          await item.delete();
        } else {
          const update = {};
          if (Object.prototype.hasOwnProperty.call(item.system?.basic ?? {}, 'quantity')) update['system.basic.quantity'] = next;
          if (Object.prototype.hasOwnProperty.call(item.system?.basic ?? {}, 'amount')) update['system.basic.amount'] = next;
          if (!Object.keys(update).length) update['system.basic.quantity'] = next;
          await item.update(update);
        }
      } else {
        await item.delete();
      }

      // Send stylish chat messages
      const playerMsg = isLast
        ? `<div class="ct-equipment-chat-card ct-equipment-chat-card-player"><div class="ct-equipment-chat-kicker">Item Expended</div><div class="ct-equipment-chat-body"><i class="fas fa-burst"></i><span>You have spent your last <strong>${itemName}</strong>!</span></div></div>`
        : `<div class="ct-equipment-chat-card ct-equipment-chat-card-player"><div class="ct-equipment-chat-kicker">Item Expended</div><div class="ct-equipment-chat-body"><i class="fas fa-burst"></i><span>You have spent 1 <strong>${itemName}</strong> and you have <strong>${remaining}</strong> more.</span></div></div>`;

      const gmMsg = isLast
        ? `<div class="ct-equipment-chat-card ct-equipment-chat-card-gm"><div class="ct-equipment-chat-kicker">GM Notice</div><div class="ct-equipment-chat-body"><i class="fas fa-eye"></i><span><strong>${actorName}</strong> has spent their last <strong>${itemName}</strong>.</span></div></div>`
        : `<div class="ct-equipment-chat-card ct-equipment-chat-card-gm"><div class="ct-equipment-chat-kicker">GM Notice</div><div class="ct-equipment-chat-body"><i class="fas fa-eye"></i><span><strong>${actorName}</strong> has spent one <strong>${itemName}</strong> and has <strong>${remaining}</strong> more.</span></div></div>`;

      if (gmIds.length) {
        await ChatMessage.create({ user: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), content: gmMsg, whisper: gmIds });
      }
      await ChatMessage.create({ user: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), content: playerMsg, whisper: [game.user.id] });

      this._refreshActivePanel();
      this.refresh?.();
    },

    applyLiveEquipmentPanelSettings(preview = null) {
      if (this.activePanel !== "equipment") return;
      const container = this.element?.querySelector("#ct-panel-container");
      const panel = container?.querySelector(".ct-panel-equipment-custom");
      if (!panel) return;
      panel.setAttribute("style", this._equipmentMenuStyleVars(preview));
    },

    _openEquipmentMenuSettings(event) {
      document.querySelector("#ct-equipment-settings-popup")?.remove();
      const state = {
        equipmentMenuShadowColor: this._gs("equipmentMenuShadowColor") ?? "#000000",
        equipmentMenuShadowOpacity: this._gs("equipmentMenuShadowOpacity") ?? 0.45,
        equipmentMenuShadowDistance: this._gs("equipmentMenuShadowDistance") ?? 14,
        equipmentMenuShadowDirection: this._gs("equipmentMenuShadowDirection") ?? "bottom-right",
        equipmentMenuTitleColor: this._gs("equipmentMenuTitleColor") ?? "#f0d68a",
        equipmentMenuTitleSize: this._gs("equipmentMenuTitleSize") ?? 100,
        equipmentMenuTitleCaps: this._gs("equipmentMenuTitleCaps") ?? false,
        equipmentMenuHeadingColor: this._gs("equipmentMenuHeadingColor") ?? "#d4a94d",
        equipmentMenuHeadingOpacity: this._gs("equipmentMenuHeadingOpacity") ?? 0.85,
        equipmentMenuBgColor: this._gs("equipmentMenuBgColor") ?? "#17121f",
        equipmentMenuBgOpacity: this._gs("equipmentMenuBgOpacity") ?? 0.94,
        equipmentMenuBgImage: this._gs("equipmentMenuBgImage") ?? "",
        equipmentMenuBgImageOpacity: this._gs("equipmentMenuBgImageOpacity") ?? 0.2,
        equipmentMenuBgFit: this._gs("equipmentMenuBgFit") ?? "cover",
        equipmentMenuColumns: this._gs("equipmentMenuColumns") ?? 1,
        equipmentMenuWidthScale: this._gs("equipmentMenuWidthScale") ?? 100,
        equipmentMenuHeightScale: this._gs("equipmentMenuHeightScale") ?? 100,
        equipmentMenuFontSize: this._gs("equipmentMenuFontSize") ?? 100,
        equipmentMenuItemPadding: this._gs("equipmentMenuItemPadding") ?? 5,
        equipmentMenuIconSize: this._gs("equipmentMenuIconSize") ?? 20
      };

      const popup = document.createElement("div");
      popup.id = "ct-equipment-settings-popup";
      popup.classList.add("ct-popup");
      popup.style.left = `${Math.max(8, event?.clientX ?? 120)}px`;
      popup.style.top = `${Math.max(8, event?.clientY ?? 120)}px`;
      popup.style.transform = "none";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-sliders-h"></i> Equipment Menu Settings <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-tabs">
          <button class="ct-popup-tab is-active" data-tab="shadow">Shadow</button>
          <button class="ct-popup-tab" data-tab="title">Title</button>
          <button class="ct-popup-tab" data-tab="headings">Headings</button>
          <button class="ct-popup-tab" data-tab="background">Background</button>
          <button class="ct-popup-tab" data-tab="layout">Layout</button>
          <button class="ct-popup-tab" data-tab="equipment">Equipment</button>
        </div>
        <div class="ct-popup-body ct-popup-body-compact">
          <div class="ct-popup-pane is-active" data-pane="shadow">
            <label>Shadow Color <input type="color" id="em-shadow-color" value="${state.equipmentMenuShadowColor}"></label>
            <label>Transparency <span class="ct-val-label" id="em-shadow-op-val">${Math.round(state.equipmentMenuShadowOpacity*100)}%</span><input type="range" id="em-shadow-op" min="0" max="1" step="0.05" value="${state.equipmentMenuShadowOpacity}"></label>
            <label>Distance <span class="ct-val-label" id="em-shadow-dist-val">${state.equipmentMenuShadowDistance}px</span><input type="range" id="em-shadow-dist" min="0" max="40" step="1" value="${state.equipmentMenuShadowDistance}"></label>
            <label>Direction
              <select id="em-shadow-dir">
                <option value="bottom-right" ${state.equipmentMenuShadowDirection==="bottom-right"?"selected":""}>Bottom Right</option>
                <option value="bottom-left" ${state.equipmentMenuShadowDirection==="bottom-left"?"selected":""}>Bottom Left</option>
                <option value="top-right" ${state.equipmentMenuShadowDirection==="top-right"?"selected":""}>Top Right</option>
                <option value="top-left" ${state.equipmentMenuShadowDirection==="top-left"?"selected":""}>Top Left</option>
                <option value="bottom" ${state.equipmentMenuShadowDirection==="bottom"?"selected":""}>Bottom</option>
                <option value="top" ${state.equipmentMenuShadowDirection==="top"?"selected":""}>Top</option>
                <option value="left" ${state.equipmentMenuShadowDirection==="left"?"selected":""}>Left</option>
                <option value="right" ${state.equipmentMenuShadowDirection==="right"?"selected":""}>Right</option>
              </select>
            </label>
          </div>
          <div class="ct-popup-pane" data-pane="title">
            <label>Title Color <input type="color" id="em-title-color" value="${state.equipmentMenuTitleColor}"></label>
            <label>Title Size <span class="ct-val-label" id="em-title-size-val">${state.equipmentMenuTitleSize}%</span><input type="range" id="em-title-size" min="70" max="200" step="5" value="${state.equipmentMenuTitleSize}"></label>
            <label class="ct-toggle-row">Capitalization <input type="checkbox" id="em-title-caps" ${state.equipmentMenuTitleCaps ? "checked" : ""}></label>
          </div>
          <div class="ct-popup-pane" data-pane="headings">
            <label>Heading Color <input type="color" id="em-heading-color" value="${state.equipmentMenuHeadingColor}"></label>
            <label>Heading Transparency <span class="ct-val-label" id="em-heading-op-val">${Math.round(state.equipmentMenuHeadingOpacity*100)}%</span><input type="range" id="em-heading-op" min="0.1" max="1" step="0.05" value="${state.equipmentMenuHeadingOpacity}"></label>
          </div>
          <div class="ct-popup-pane" data-pane="background">
            <label>Menu Color <input type="color" id="em-bg-color" value="${state.equipmentMenuBgColor}"></label>
            <label>Menu Transparency <span class="ct-val-label" id="em-bg-op-val">${Math.round(state.equipmentMenuBgOpacity*100)}%</span><input type="range" id="em-bg-op" min="0.1" max="1" step="0.05" value="${state.equipmentMenuBgOpacity}"></label>
            <label class="ct-popup-wide">Background Image URL <input type="text" id="em-bg-image" value="${state.equipmentMenuBgImage.replace(/"/g, '&quot;')}" placeholder="https://..."></label>
            <label>Image Transparency <span class="ct-val-label" id="em-bg-image-op-val">${Math.round(state.equipmentMenuBgImageOpacity*100)}%</span><input type="range" id="em-bg-image-op" min="0" max="1" step="0.05" value="${state.equipmentMenuBgImageOpacity}"></label>
            <label>Image Fitting
              <select id="em-bg-fit">
                <option value="cover" ${state.equipmentMenuBgFit==="cover"?"selected":""}>Cover</option>
                <option value="contain" ${state.equipmentMenuBgFit==="contain"?"selected":""}>Contain</option>
                <option value="fit" ${state.equipmentMenuBgFit==="fit"?"selected":""}>Fit</option>
                <option value="fit-vertical" ${state.equipmentMenuBgFit==="fit-vertical"?"selected":""}>Fit Vertical</option>
                <option value="fit-horizontal" ${state.equipmentMenuBgFit==="fit-horizontal"?"selected":""}>Fit Horizontal</option>
              </select>
            </label>
          </div>
          <div class="ct-popup-pane" data-pane="layout">
            <label>Menu Columns <span class="ct-val-label" id="em-cols-val">${state.equipmentMenuColumns}</span><input type="range" id="em-cols" min="1" max="3" step="1" value="${state.equipmentMenuColumns}"></label>
            <label>Width Resize <span class="ct-val-label" id="em-width-val">${state.equipmentMenuWidthScale}%</span><input type="range" id="em-width" min="60" max="300" step="5" value="${state.equipmentMenuWidthScale}"></label>
            <label>Height Resize <span class="ct-val-label" id="em-height-val">${state.equipmentMenuHeightScale}%</span><input type="range" id="em-height" min="60" max="300" step="5" value="${state.equipmentMenuHeightScale}"></label>
          </div>
          <div class="ct-popup-pane" data-pane="equipment">
            <label>Equipment Font Size <span class="ct-val-label" id="em-font-size-val">${state.equipmentMenuFontSize}%</span><input type="range" id="em-font-size" min="70" max="180" step="5" value="${state.equipmentMenuFontSize}"></label>
            <label>Item Padding <span class="ct-val-label" id="em-item-padding-val">${state.equipmentMenuItemPadding}px</span><input type="range" id="em-item-padding" min="2" max="24" step="1" value="${state.equipmentMenuItemPadding}"></label>
            <label>Item Icon Size <span class="ct-val-label" id="em-icon-size-val">${state.equipmentMenuIconSize}px</span><input type="range" id="em-icon-size" min="12" max="40" step="2" value="${state.equipmentMenuIconSize}"></label>
          </div>
        </div>`;
      document.body.appendChild(popup);

      requestAnimationFrame(() => {
        const rect = popup.getBoundingClientRect();
        popup.style.left = `${Math.min(Math.max(8, parseFloat(popup.style.left)), Math.max(8, window.innerWidth - rect.width - 8))}px`;
        popup.style.top = `${Math.min(Math.max(8, parseFloat(popup.style.top)), Math.max(8, window.innerHeight - rect.height - 8))}px`;
      });

      const collectState = () => ({
        equipmentMenuShadowColor: popup.querySelector("#em-shadow-color").value,
        equipmentMenuShadowOpacity: parseFloat(popup.querySelector("#em-shadow-op").value),
        equipmentMenuShadowDistance: parseInt(popup.querySelector("#em-shadow-dist").value),
        equipmentMenuShadowDirection: popup.querySelector("#em-shadow-dir").value,
        equipmentMenuTitleColor: popup.querySelector("#em-title-color").value,
        equipmentMenuTitleSize: parseInt(popup.querySelector("#em-title-size").value),
        equipmentMenuTitleCaps: popup.querySelector("#em-title-caps").checked,
        equipmentMenuHeadingColor: popup.querySelector("#em-heading-color").value,
        equipmentMenuHeadingOpacity: parseFloat(popup.querySelector("#em-heading-op").value),
        equipmentMenuBgColor: popup.querySelector("#em-bg-color").value,
        equipmentMenuBgOpacity: parseFloat(popup.querySelector("#em-bg-op").value),
        equipmentMenuBgImage: popup.querySelector("#em-bg-image").value.trim(),
        equipmentMenuBgImageOpacity: parseFloat(popup.querySelector("#em-bg-image-op").value),
        equipmentMenuBgFit: popup.querySelector("#em-bg-fit").value,
        equipmentMenuColumns: parseInt(popup.querySelector("#em-cols").value),
        equipmentMenuWidthScale: parseInt(popup.querySelector("#em-width").value),
        equipmentMenuHeightScale: parseInt(popup.querySelector("#em-height").value),
        equipmentMenuFontSize: parseInt(popup.querySelector("#em-font-size").value),
        equipmentMenuItemPadding: parseInt(popup.querySelector("#em-item-padding").value),
        equipmentMenuIconSize: parseInt(popup.querySelector("#em-icon-size").value)
      });

      const applyPreview = () => {
        const preview = collectState();
        Object.assign(state, preview);
        const panel = this.element?.querySelector(".ct-panel-equipment-custom");
        if (panel) panel.setAttribute("style", this._equipmentMenuStyleVars(preview));
      };

      const applyLiveSettings = async () => {
        const preview = collectState();
        Object.assign(state, preview);
        const panel = this.element?.querySelector(".ct-panel-equipment-custom");
        if (panel) panel.setAttribute("style", this._equipmentMenuStyleVars(preview));
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
        const update = async () => {
          out.textContent = formatter(input.value);
          await applyLiveSettings();
        };
        input.addEventListener("input", () => { void update(); });
        out.textContent = formatter(input.value);
      };
      syncVal("em-shadow-op", v => `${Math.round(parseFloat(v)*100)}%`);
      syncVal("em-shadow-dist", v => `${v}px`);
      syncVal("em-title-size", v => `${v}%`);
      syncVal("em-heading-op", v => `${Math.round(parseFloat(v)*100)}%`);
      syncVal("em-bg-op", v => `${Math.round(parseFloat(v)*100)}%`);
      syncVal("em-bg-image-op", v => `${Math.round(parseFloat(v)*100)}%`);
      syncVal("em-cols", v => `${v}`);
      syncVal("em-width", v => `${v}%`);
      syncVal("em-height", v => `${v}%`);
      syncVal("em-font-size", v => `${v}%`);
      syncVal("em-item-padding", v => `${v}px`);
      syncVal("em-icon-size", v => `${v}px`);

      popup.querySelectorAll('input[type="range"], input[type="color"], input[type="text"], select, input[type="checkbox"]').forEach(el => {
        const eventName = el.matches('input[type="text"]') ? 'input' : (el.matches('select, input[type="checkbox"]') ? 'change' : 'input');
        el.addEventListener(eventName, () => { void applyLiveSettings(); });
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
        this._equipmentsSettingsOpen = false;
        this._refreshActivePanel();
        popup.remove();
      };

      this._equipmentsSettingsOpen = true;
      closeBtn.onclick = () => { closePopup(); };
    },

    _openEquipmentCategoryManager(event) {

      document.querySelector("#ct-equipment-category-popup")?.remove();
      const popup = document.createElement("div");
      popup.id = "ct-equipment-category-popup";
      popup.classList.add("ct-popup");
      popup.style.left = `${Math.max(8, event?.clientX ?? 120)}px`;
      popup.style.top = `${Math.max(8, event?.clientY ?? 120)}px`;
      popup.style.transform = "none";
      popup.innerHTML = `
        <div class="ct-popup-header"><i class="fas fa-folder-plus"></i> Equipment Categories <button class="ct-popup-close"><i class="fas fa-times"></i></button></div>
        <div class="ct-popup-body ct-popup-body-compact">
          <div class="ct-popup-pane is-active" data-pane="categories">
            <label class="ct-popup-wide">New Category Name <input type="text" id="ct-new-equipment-category" placeholder="Enter category name"></label>
            <label><button type="button" class="ct-popup-action-btn" id="ct-add-equipment-category">Add Category</button></label>
            <div class="ct-popup-wide ct-equipment-category-list" id="ct-equipment-category-list"></div>
            <div class="ct-popup-wide ct-popup-note">Manage categories here. Move equipment between categories directly in the main Equipment menu.</div>
          </div>
        </div>`;
      document.body.appendChild(popup);

      const renderCategories = () => {
        const list = popup.querySelector('#ct-equipment-category-list');
        const categories = this._getEquipmentCategories();
        list.innerHTML = categories.length
          ? categories.map(cat => `<div class="ct-skill-category-entry"><span>${cat.name}</span><button type="button" class="ct-skill-category-delete" data-delete-equipment-category="${cat.id}" title="Delete ${cat.name}"><i class="fas fa-trash"></i></button></div>`).join('')
          : `<div class="ct-empty-msg">No custom categories yet.</div>`;
        list.querySelectorAll('[data-delete-equipment-category]').forEach(btn => btn.onclick = async () => {
          const deleteId = btn.dataset.deleteEquipmentCategory;
          const nextCategories = this._getEquipmentCategories().filter(cat => cat.id !== deleteId);
          await this._saveEquipmentCategories(nextCategories);
          if (this.actor) {
            const placement = this._normalizeEquipmentPlacement(this.actor, nextCategories);
            Object.values(placement).forEach(entry => { if (entry.category === deleteId) entry.category = 'menu'; });
            await this._saveEquipmentPlacement(this.actor.id, placement);
          }
          renderCategories();
          this._refreshActivePanel();
        });
      };

      popup.querySelector('#ct-add-equipment-category').onclick = async () => {
        const input = popup.querySelector('#ct-new-equipment-category');
        const name = input.value.trim();
        if (!name) return;
        const categories = this._getEquipmentCategories();
        categories.push({ id: `eq-cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name });
        await this._saveEquipmentCategories(categories);
        input.value = '';
        renderCategories();
        this._refreshActivePanel();
      };

      const header = popup.querySelector('.ct-popup-header');
      const closeBtn = popup.querySelector('.ct-popup-close');
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
        document.body.classList.remove('ct-dragging-popup');
      };
      header.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add('ct-dragging-popup');
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      closeBtn.onclick = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        popup.remove();
      };

      renderCategories();
    },
    _openEquipmentCategoryAppearanceSettings(event, categoryId, options = {}) {
      document.querySelector("#ct-equipment-category-appearance-popup")?.remove();
      const categories = [{ id: "menu", name: "UNCATEGORIZED" }, ...this._getEquipmentCategories()];
      const category = categories.find(cat => cat.id === categoryId) ?? { id: categoryId, name: categoryId };
      const state = { ...this._getEquipmentCategoryStyle(categoryId) };
      const anchorHeader = options?.anchor ?? this.element?.querySelector(`[data-equipment-category-header="${categoryId}"]`);
      const preserveMenu = () => {
        if (this.activePanel !== "equipment") this.activePanel = "equipment";
        if (!this.element?.querySelector(".ct-panel-equipment-custom")) this._refreshActivePanel?.();
      };
      preserveMenu();

      const iconOptions = equipmentCategoryIconChoices.map(choice => `
        <button type="button" class="ct-category-icon-choice ${choice.icon === state.icon ? 'is-selected' : ''}" data-category-icon="${choice.icon}" title="${choice.label}" aria-label="${choice.label}">
          ${choice.icon ? `<i class="${choice.icon}"></i>` : `<span class="ct-category-icon-choice-none">×</span>`}
        </button>`).join("");

      const popup = document.createElement("div");
      popup.id = "ct-equipment-category-appearance-popup";
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
          <div class="ct-popup-wide" style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;">
            <button type="button" class="ct-popup-action-btn" id="ct-equipment-category-dialog-close">Close</button>
          </div>
        </div>`;
      document.body.appendChild(popup);
      this._equipmentPositionPopupAboveEvent(popup, event);

      const previewTarget = () => this.element?.querySelector(`[data-equipment-category-header="${categoryId}"]`) ?? anchorHeader;
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

      let saveTimer = null;
      let savePromise = Promise.resolve();
      const persistState = (immediate = false) => {
        const nextState = collectState();
        clearTimeout(saveTimer);
        const runSave = () => {
          savePromise = this._saveEquipmentCategoryStyle(categoryId, nextState).catch(err => {
            console.warn("[CypherTaskbar] Equipment category style save failed:", err?.message || err);
          });
          return savePromise;
        };
        if (immediate) return runSave();
        saveTimer = setTimeout(runSave, 0);
        return savePromise;
      };

      const applyPreview = () => {
        Object.assign(state, collectState());
        renderIconPreview();
        const headerEl = previewTarget();
        if (headerEl) {
          headerEl.setAttribute("style", this._equipmentCategoryHeaderStyle(state));
          const iconWrap = headerEl.querySelector(".ct-equipment-category-icon-wrap");
          if (iconWrap) iconWrap.innerHTML = this._equipmentCategoryHeaderIconHtml(state);
        }
        persistState(false);
      };

      popup.querySelectorAll('input, select').forEach(el => {
        const ev = el.matches('select') ? 'change' : 'input';
        el.addEventListener(ev, applyPreview);
      });
      popup.querySelectorAll('[data-category-icon]').forEach(btn => {
        btn.addEventListener('click', () => {
          popup.querySelector('#ct-category-header-icon').value = btn.dataset.categoryIcon ?? "";
          applyPreview();
        });
      });
      renderIconPreview();

      const titleBar = popup.querySelector('.ct-popup-header');
      const closeBtn = popup.querySelector('.ct-popup-close');
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
        document.body.classList.remove('ct-dragging-popup');
      };
      titleBar.onmousedown = (ev) => {
        if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
        ev.preventDefault();
        const rect = popup.getBoundingClientRect();
        dragState = { offsetX: ev.clientX - rect.left, offsetY: ev.clientY - rect.top };
        document.body.classList.add('ct-dragging-popup');
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);

      const closePopup = async () => {
        await persistState(true);
        clearTimeout(saveTimer);
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        preserveMenu();
        popup.remove();
      };
      closeBtn.onclick = () => { closePopup(); };
      popup.querySelector('#ct-equipment-category-dialog-close')?.addEventListener('click', () => { closePopup(); });
    }


  });
}
