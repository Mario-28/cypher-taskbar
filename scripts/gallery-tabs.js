/**
 * gallery-tabs.js — Cypher Taskbar Gallery Tabs Integration
 *
 * Full-featured module that reads/writes gallery tab data from the
 * cypher-gallery-tabs actor flags. Provides a strip of tab buttons above
 * the taskbar and a floating gallery panel for each tab.
 *
 * Compatible with: Foundry VTT v14+
 * Module namespace: cypher-gallery-tabs (actor flags)
 */

import { MODULE_ID } from "./utils.js";

/* ------------------------------------------------------------------ */
/*  CONSTANTS                                                          */
/* ------------------------------------------------------------------ */

const GALLERY_MODULE_ID = "cypher-gallery-tabs";
const MAX_TABS = 10;
const FAVORITES_TAB_ID = "__cgt_favorites__";
const CLOTHES_TAB_ID = "__cgt_clothes__";
const VIDEO_TAB_ID = "__cgt_videos__";
const WARDROBE_ALL = "all";
const WARDROBE_DEFAULT_SUBTABS = ["All", "Casual", "Fancy", "Work", "Special"];
const WARDROBE_MAX_CUSTOM = 3;
const DEFAULT_BG = ["#2c6fad", "#b03060", "#2d7a2d", "#c47900", "#6a3090"];
const DEFAULT_IC = "#f0e6d3";
const DEFAULT_FAVORITES_LAYOUT = { columns: 3, gap: 8, fit: "natural" };
const LAZY_BATCH_SIZE = 10;

const ICON_POOL = [
  "fa-solid fa-image", "fa-solid fa-images", "fa-solid fa-book",
  "fa-solid fa-book-open", "fa-solid fa-scroll", "fa-solid fa-map",
  "fa-solid fa-map-location-dot", "fa-solid fa-star",
  "fa-solid fa-heart", "fa-solid fa-shield-halved",
  "fa-solid fa-skull", "fa-solid fa-skull-crossbones",
  "fa-solid fa-dragon", "fa-solid fa-feather-pointed",
  "fa-solid fa-compass", "fa-solid fa-gem",
  "fa-solid fa-crown", "fa-solid fa-flask",
  "fa-solid fa-vial", "fa-solid fa-music",
  "fa-solid fa-fire", "fa-solid fa-fire-flame-curved",
  "fa-solid fa-bolt", "fa-solid fa-eye",
  "fa-solid fa-eye-slash", "fa-solid fa-user",
  "fa-solid fa-users", "fa-solid fa-tree",
  "fa-solid fa-mountain", "fa-solid fa-sun",
  "fa-solid fa-moon", "fa-solid fa-cloud",
  "fa-solid fa-dungeon", "fa-solid fa-dice",
  "fa-solid fa-dice-d20", "fa-solid fa-hat-wizard",
  "fa-solid fa-wand-magic-sparkles", "fa-solid fa-chess-knight",
  "fa-solid fa-horse", "fa-solid fa-paw",
  "fa-solid fa-leaf", "fa-solid fa-seedling",
  "fa-solid fa-tornado", "fa-solid fa-droplet",
  "fa-solid fa-snowflake", "fa-solid fa-flag",
  "fa-solid fa-building", "fa-solid fa-coins",
  "fa-solid fa-bag-shopping", "fa-solid fa-key",
  "fa-solid fa-lock", "fa-solid fa-door-open",
  "fa-solid fa-magnifying-glass", "fa-solid fa-note-sticky",
  "fa-solid fa-pen", "fa-solid fa-palette",
  "fa-solid fa-camera", "fa-solid fa-hourglass-half",
  "fa-solid fa-person-running", "fa-solid fa-handshake",
  "fa-solid fa-khanda", "fa-solid fa-bow-arrow"
];

/* ------------------------------------------------------------------ */
/*  UTILITY FUNCTIONS                                                  */
/* ------------------------------------------------------------------ */

/** Escape HTML special characters */
function esc(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Check if the current user can manage the given actor */
function canManageActor(actor) {
  if (!actor) return false;
  return actor.isOwner || game.user.isGM;
}

/** Deep-clone an object safely */
function deepClone(obj) {
  return foundry.utils.deepClone(obj);
}

/** Generate a random ID */
function randomID() {
  return foundry.utils.randomID();
}

/** Normalize a single image object */
function normalizeImageData(img) {
  return {
    id: img?.id || randomID(),
    url: img?.url || "",
    name: img?.name || "",
    caption: img?.caption || "",
    note: img?.note || "",
    tags: Array.isArray(img?.tags) ? img.tags.filter(t => typeof t === "string" && t.trim()) : [],
    favorite: !!img?.favorite,
    createdAt: img?.createdAt || Date.now(),
    updatedAt: img?.updatedAt || Date.now(),
    wardrobeSubtab: img?.wardrobeSubtab || ""
  };
}

/** Normalize a single tab object */
function normalizeTabData(tab) {
  return {
    id: tab?.id || randomID(),
    title: tab?.title || "New Tab",
    bgColor: tab?.bgColor || DEFAULT_BG[0],
    iconColor: tab?.iconColor || DEFAULT_IC,
    iconClass: tab?.iconClass || "fa-solid fa-image",
    hideNames: !!tab?.hideNames,
    hideCaptions: !!tab?.hideCaptions,
    hideNotes: !!tab?.hideNotes,
    hideTags: !!tab?.hideTags,
    columns: Math.max(1, Math.min(5, Number(tab?.columns) || 3)),
    gap: [0, 4, 8, 12, 18].includes(Number(tab?.gap)) ? Number(tab.gap) : 8,
    fit: ["natural", "cover", "contain"].includes(tab?.fit) ? tab.fit : "natural",
    images: Array.isArray(tab?.images) ? tab.images.map(normalizeImageData) : []
  };
}

/** Build a display title from image data */
function makeImageDisplayTitle(img) {
  if (!img) return "Image";
  return img.name?.trim() || img.caption?.trim() || "Image";
}

/** Normalize tags input (string or array) to an array of clean strings */
function normalizeTagsInput(raw) {
  if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean);
  if (typeof raw === "string") return raw.split(",").map(t => t.trim()).filter(Boolean);
  return [];
}

/** Clamp a popup position so it stays inside the viewport */
function clampMenuToViewport(x, y, width, height) {
  return {
    x: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
    y: Math.max(4, Math.min(y, window.innerHeight - height - 4))
  };
}

/** Normalize the full tabs array */
function normalizeTabsData(data) {
  const arr = Array.isArray(data) ? data : [];
  return arr.map(normalizeTabData);
}

/** Get a fresh default tab */
function getDefaultTab(index) {
  return normalizeTabData({
    id: randomID(),
    title: `Tab ${index + 1}`,
    bgColor: DEFAULT_BG[index % DEFAULT_BG.length],
    iconClass: ICON_POOL[index % ICON_POOL.length]
  });
}

/** Get a fresh default layout */
function getDefaultLayout() {
  return { columns: 3, gap: 8, fit: "natural" };
}

/** Collect all unique tags from an array of images */
function collectAllTags(images) {
  const tagSet = new Set();
  (images || []).forEach(img => {
    (img.tags || []).forEach(tag => {
      if (tag && typeof tag === "string") tagSet.add(tag.trim());
    });
  });
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}

/** Count total favorites across all tabs */
function countFavorites(actor) {
  const tabs = getTabs(actor);
  let count = 0;
  tabs.forEach(tab => {
    (tab.images || []).forEach(img => { if (img.favorite) count++; });
  });
  // Also count clothes favorites
  const clothes = getClothesImages(actor);
  clothes.forEach(img => { if (img.favorite) count++; });
  return count;
}

/** Check if any favorites exist */
function hasFavorites(actor) {
  return countFavorites(actor) > 0;
}

/** Check if any clothes exist */
function hasClothes(actor) {
  const images = getClothesImages(actor);
  return images.length > 0;
}

/** Check if any videos exist */
function hasVideos(actor) {
  const videos = getVideoItems(actor);
  return videos.length > 0;
}

/** Compute an icon for a tab (fallback to default) */
function tabIcon(tab) {
  return tab.iconClass || "fa-solid fa-image";
}

/** Format a timestamp for display */
function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Debounce helper */
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ------------------------------------------------------------------ */
/*  DATA HELPERS — Actor flag getters/setters                          */
/* ------------------------------------------------------------------ */

function getTabs(actor) {
  const data = actor.getFlag(GALLERY_MODULE_ID, "tabs");
  return normalizeTabsData(data);
}

async function saveTabs(actor, tabs) {
  await actor.setFlag(GALLERY_MODULE_ID, "tabs", tabs.map(normalizeTabData));
}

function getClothesImages(actor) {
  const raw = foundry.utils.deepClone(actor.getFlag(GALLERY_MODULE_ID, "clothesImages") ?? []);
  return (Array.isArray(raw) ? raw : []).map((img, i) => normalizeImageData(img, i)).filter(img => img.url);
}

async function saveClothesImages(actor, images) {
  return actor.setFlag(GALLERY_MODULE_ID, "clothesImages", images.map((img, i) => normalizeImageData(img, i)));
}

function getClothesLayout(actor) {
  const data = actor.getFlag(GALLERY_MODULE_ID, "clothesLayout");
  if (data && typeof data === "object") {
    return {
      columns: Math.max(1, Math.min(5, Number(data.columns) || 3)),
      gap: [0, 4, 8, 12, 18].includes(Number(data.gap)) ? Number(data.gap) : 8,
      fit: ["natural", "cover", "contain"].includes(data.fit) ? data.fit : "natural"
    };
  }
  return getDefaultLayout();
}

async function saveClothesLayout(actor, layout) {
  await actor.setFlag(GALLERY_MODULE_ID, "clothesLayout", {
    columns: Math.max(1, Math.min(5, Number(layout.columns) || 3)),
    gap: [0, 4, 8, 12, 18].includes(Number(layout.gap)) ? Number(layout.gap) : 8,
    fit: ["natural", "cover", "contain"].includes(layout.fit) ? layout.fit : "natural"
  });
}

function getWardrobeSubtabs(actor) {
  const data = actor.getFlag(GALLERY_MODULE_ID, "wardrobeSubtabs");
  if (Array.isArray(data) && data.length > 0) {
    return data.filter(s => s && typeof s === "object" && s.id && s.name);
  }
  return WARDROBE_DEFAULT_SUBTABS.map(name => ({ id: name.toLowerCase(), name }));
}

async function saveWardrobeSubtabs(actor, subtabs) {
  await actor.setFlag(GALLERY_MODULE_ID, "wardrobeSubtabs", subtabs);
}

function getWardrobeActiveSubtab(actor) {
  return actor.getFlag(GALLERY_MODULE_ID, "wardrobeActiveSubtab") || WARDROBE_ALL;
}

async function saveWardrobeActiveSubtab(actor, subtabId) {
  await actor.setFlag(GALLERY_MODULE_ID, "wardrobeActiveSubtab", subtabId);
}

function getVideoItems(actor) {
  const data = actor.getFlag(GALLERY_MODULE_ID, "videoItems");
  return Array.isArray(data) ? data.map(normalizeImageData) : [];
}

async function saveVideoItems(actor, items) {
  await actor.setFlag(GALLERY_MODULE_ID, "videoItems", items.map(normalizeImageData));
}

function getFavoritesLayout(actor) {
  const raw = foundry.utils.deepClone(actor.getFlag(GALLERY_MODULE_ID, "favoritesLayout") ?? DEFAULT_FAVORITES_LAYOUT);
  return {
    columns: Math.min(5, Math.max(1, parseInt(raw?.columns, 10) || DEFAULT_FAVORITES_LAYOUT.columns)),
    gap: [0, 4, 8, 12, 18].includes(parseInt(raw?.gap, 10)) ? parseInt(raw?.gap, 10) : DEFAULT_FAVORITES_LAYOUT.gap,
    fit: ["natural", "cover", "contain"].includes(raw?.fit) ? raw.fit : DEFAULT_FAVORITES_LAYOUT.fit
  };
}

async function saveFavoritesLayout(actor, layout) {
  await actor.setFlag(GALLERY_MODULE_ID, "favoritesLayout", {
    columns: Math.max(1, Math.min(5, Number(layout.columns) || 3)),
    gap: [0, 4, 8, 12, 18].includes(Number(layout.gap)) ? Number(layout.gap) : 8,
    fit: ["natural", "cover", "contain"].includes(layout.fit) ? layout.fit : "natural"
  });
}

function getTabSortOrders(actor) {
  const data = actor.getFlag(GALLERY_MODULE_ID, "tabSortOrders");
  return data && typeof data === "object" ? data : {};
}

async function setTabSortOrder(actor, tabId, order) {
  const orders = getTabSortOrders(actor);
  orders[tabId] = order;
  await actor.setFlag(GALLERY_MODULE_ID, "tabSortOrders", orders);
}

/* ------------------------------------------------------------------ */
/*  SORTING                                                            */
/* ------------------------------------------------------------------ */

function sortImages(images, order) {
  const list = [...images];
  switch (order) {
    case "name-asc":
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      break;
    case "name-desc":
      list.sort((a, b) => (b.name || "").localeCompare(a.name || ""));
      break;
    case "date-asc":
      list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      break;
    case "date-desc":
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      break;
    default:
      // "default" — keep original order
      break;
  }
  return list;
}

function sortOrderLabel(order) {
  switch (order) {
    case "name-asc": return "Name A\u2192Z";
    case "name-desc": return "Name Z\u2192A";
    case "date-asc": return "Oldest";
    case "date-desc": return "Newest";
    default: return "Default";
  }
}

/* ------------------------------------------------------------------ */
/*  STRIP — Tab buttons above the taskbar                              */
/* ------------------------------------------------------------------ */

export function buildGalleryStrip(taskbar) {
  try {
    // Ensure CSS is injected before building the strip
    _injectGalleryCSS();

    const enabled = taskbar._gs("galleryTabsEnabled") ?? true;
    if (!enabled) return "";

    const actor = taskbar.actor;
    if (!actor) return "";

    const tabs = getTabs(actor);
    const favCount = countFavorites(actor);
    const showFav = favCount > 0;
    const showVideos = hasVideos(actor);
    const canAdd = tabs.length < MAX_TABS && canManageActor(actor);
    const offsetPct = taskbar._gs("galleryTabsOffsetX") ?? 0;

    let html = `<div class="cgt-strip-wrapper" style="--ct-gallery-offset-x:${offsetPct}%;" data-gallery-offset="${offsetPct}">`;

  // Regular tabs
  tabs.forEach(tab => {
    html += _renderTabButton(tab, taskbar);
  });

  // Favorites button (only when favorites exist)
  if (showFav) {
    html += `
      <button class="cgt-strip-btn cgt-strip-fav"
              data-cgt-tab="${FAVORITES_TAB_ID}"
              style="background:#c44b4b;"
              title="Favorites (${favCount})">
        <i class="fa-solid fa-heart" style="color:#f0e6d3;"></i>
        <span class="cgt-strip-badge">${favCount}</span>
      </button>`;
  }

  // Wardrobe / Clothes button — ALWAYS show
  html += `
    <button class="cgt-strip-btn cgt-strip-clothes"
            data-cgt-tab="${CLOTHES_TAB_ID}"
            style="background:#8a5a3a;"
            title="Wardrobe">
      <i class="fa-solid fa-shirt" style="color:#f0e6d3;"></i>
    </button>`;

  // Videos button
  if (showVideos) {
    html += `
      <button class="cgt-strip-btn cgt-strip-videos"
              data-cgt-tab="${VIDEO_TAB_ID}"
              style="background:#3a5a8a;"
              title="Videos">
        <i class="fa-solid fa-film" style="color:#f0e6d3;"></i>
      </button>`;
  }

  // Add tab button
  if (canAdd) {
    html += `
      <button class="cgt-strip-btn cgt-strip-add"
              data-cgt-action="add-tab"
              style="background:#555;"
              title="Add Tab">
        <i class="fa-solid fa-plus" style="color:#f0e6d3;"></i>
      </button>`;
  }

    html += `</div>`;
    return html;
  } catch (err) {
    console.error("[cypher-taskbar] buildGalleryStrip error:", err);
    return ""; // graceful fallback: no strip
  }
}

function _renderTabButton(tab, taskbar) {
  const actor = taskbar.actor;
  const imgCount = (tab.images || []).length;
  return `
    <button class="cgt-strip-btn"
            data-cgt-tab="${tab.id}"
            style="background:${esc(tab.bgColor)};"
            title="${esc(tab.title)} (${imgCount})">
      <i class="${esc(tabIcon(tab))}" style="color:${esc(tab.iconColor)};"></i>
      ${imgCount > 0 ? `<span class="cgt-strip-badge">${imgCount}</span>` : ""}
    </button>`;
}

/* ------------------------------------------------------------------ */
/*  STRIP EVENT BINDING                                                */
/* ------------------------------------------------------------------ */

export function bindGalleryStripEvents(taskbar) {
  const enabled = taskbar._gs("galleryTabsEnabled") ?? true;
  if (!enabled) return;

  const bar = taskbar.element;
  if (!bar) return;

  // Left-click on tab button → open panel
  bar.addEventListener("click", async (e) => {
    const btn = e.target.closest(".cgt-strip-btn[data-cgt-tab]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const tabId = btn.dataset.cgtTab;
    const actor = taskbar.actor;
    if (!actor) return;

    // Close existing panel if clicking same tab
    const existing = document.querySelector(".cgt-panel");
    if (existing && existing.dataset.cgtTabId === tabId) {
      existing.remove();
      return;
    }

    // Open new panel, passing button rect for positioning
    const btnRect = btn.getBoundingClientRect();
    const panel = new GalleryPanel({ actor, tabId, taskbar, btnRect });
    await panel.render(true);
  });

  // Right-click on tab button → tab settings
  bar.addEventListener("contextmenu", async (e) => {
    const btn = e.target.closest(".cgt-strip-btn[data-cgt-tab]");
    if (!btn) return;
    const tabId = btn.dataset.cgtTab;
    if (tabId === FAVORITES_TAB_ID || tabId === CLOTHES_TAB_ID || tabId === VIDEO_TAB_ID) return;
    e.preventDefault();
    e.stopPropagation();

    const actor = taskbar.actor;
    if (!canManageActor(actor)) return;

    _openTabSettingsDialog(actor, tabId);
  });

  // Add tab button
  bar.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-cgt-action='add-tab']");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const actor = taskbar.actor;
    if (!canManageActor(actor)) return;

    const tabs = getTabs(actor);
    if (tabs.length >= MAX_TABS) {
      ui.notifications.warn("Maximum number of gallery tabs reached.");
      return;
    }
    const newTab = getDefaultTab(tabs.length);
    tabs.push(newTab);
    await saveTabs(actor, tabs);
    taskbar.renderGallery();
  });
}

/* ------------------------------------------------------------------ */
/*  TAB SETTINGS DIALOG                                                */
/* ------------------------------------------------------------------ */

async function _openTabSettingsDialog(actor, tabId) {
  const tabs = getTabs(actor);
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  const content = `
    <form class="cgt-dialog-form">
      <div class="form-group">
        <label>Title</label>
        <input type="text" name="title" value="${esc(tab.title)}" />
      </div>
      <div class="form-group">
        <label>Background Color</label>
        <input type="color" name="bgColor" value="${esc(tab.bgColor)}" />
      </div>
      <div class="form-group">
        <label>Icon Color</label>
        <input type="color" name="iconColor" value="${esc(tab.iconColor)}" />
      </div>
      <div class="form-group">
        <label>Icon</label>
        <select name="iconClass">
          ${ICON_POOL.map(ic => `
            <option value="${esc(ic)}" ${tab.iconClass === ic ? "selected" : ""}>
              ${esc(ic.replace("fa-solid fa-", ""))}
            </option>
          `).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>Default Columns</label>
        <select name="columns">
          ${[1,2,3,4,5].map(n => `<option value="${n}" ${tab.columns === n ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label>Default Gap</label>
        <select name="gap">
          <option value="0" ${tab.gap === 0 ? "selected" : ""}>None</option>
          <option value="4" ${tab.gap === 4 ? "selected" : ""}>Small</option>
          <option value="8" ${tab.gap === 8 ? "selected" : ""}>Medium</option>
          <option value="12" ${tab.gap === 12 ? "selected" : ""}>Large</option>
          <option value="18" ${tab.gap === 18 ? "selected" : ""}>X-Large</option>
        </select>
      </div>
      <div class="form-group">
        <label>Default Fit</label>
        <select name="fit">
          <option value="natural" ${tab.fit === "natural" ? "selected" : ""}>Natural</option>
          <option value="cover" ${tab.fit === "cover" ? "selected" : ""}>Cover</option>
          <option value="contain" ${tab.fit === "contain" ? "selected" : ""}>Contain</option>
        </select>
      </div>
      <hr/>
      <div class="form-group cgt-checkbox">
        <input type="checkbox" name="hideNames" id="ts-hideNames" ${tab.hideNames ? "checked" : ""} />
        <label for="ts-hideNames">Hide Names</label>
      </div>
      <div class="form-group cgt-checkbox">
        <input type="checkbox" name="hideCaptions" id="ts-hideCaptions" ${tab.hideCaptions ? "checked" : ""} />
        <label for="ts-hideCaptions">Hide Captions</label>
      </div>
      <div class="form-group cgt-checkbox">
        <input type="checkbox" name="hideNotes" id="ts-hideNotes" ${tab.hideNotes ? "checked" : ""} />
        <label for="ts-hideNotes">Hide Notes</label>
      </div>
      <div class="form-group cgt-checkbox">
        <input type="checkbox" name="hideTags" id="ts-hideTags" ${tab.hideTags ? "checked" : ""} />
        <label for="ts-hideTags">Hide Tags</label>
      </div>
    </form>`;

  new Dialog({
    title: `Tab Settings — ${tab.title}`,
    content,
    buttons: {
      save: {
        icon: '<i class="fa-solid fa-save"></i>',
        label: "Save",
        callback: async (html) => {
          const form = html[0].querySelector("form");
          const fd = new FormDataExtended(form).object;
          tab.title = fd.title || tab.title;
          tab.bgColor = fd.bgColor || tab.bgColor;
          tab.iconColor = fd.iconColor || tab.iconColor;
          tab.iconClass = fd.iconClass || tab.iconClass;
          tab.columns = Number(fd.columns) || tab.columns;
          tab.gap = Number(fd.gap);
          tab.fit = fd.fit || tab.fit;
          tab.hideNames = !!fd.hideNames;
          tab.hideCaptions = !!fd.hideCaptions;
          tab.hideNotes = !!fd.hideNotes;
          tab.hideTags = !!fd.hideTags;
          await saveTabs(actor, tabs);
          ui.notifications.info("Tab settings saved.");
          // Refresh strip and panel
          _refreshGallery(actor);
        }
      },
      delete: {
        icon: '<i class="fa-solid fa-trash"></i>',
        label: "Delete",
        callback: async () => {
          const confirmed = await Dialog.confirm({
            title: "Delete Tab",
            content: `<p>Delete tab "${esc(tab.title)}" and all its images? This cannot be undone.</p>`,
            yes: { label: "Delete", callback: async () => {
              const idx = tabs.findIndex(t => t.id === tabId);
              if (idx >= 0) tabs.splice(idx, 1);
              await saveTabs(actor, tabs);
              ui.notifications.info("Tab deleted.");
              _refreshGallery(actor);
            }}
          });
          if (!confirmed) return;
        }
      },
      cancel: { icon: '<i class="fa-solid fa-times"></i>', label: "Cancel" }
    },
    default: "save"
  }).render(true);
}

/** Refresh the gallery strip and any open panel */
async function _refreshGallery(actor) {
  // Find any taskbar instance for this actor and re-render the strip
  if (window.cypherTaskbar && window.cypherTaskbar.instances) {
    for (const t of window.cypherTaskbar.instances) {
      if (t.actor?.id === actor.id) {
        t.renderGallery();
      }
    }
  }
  // Refresh open panel
  const panel = document.querySelector(".cgt-panel");
  if (panel) {
    const tabId = panel.dataset.cgtTabId;
    if (tabId) {
      panel.remove();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  GALLERY PANEL CLASS                                                */
/* ------------------------------------------------------------------ */

class GalleryPanel {
  constructor({ actor, tabId, taskbar, btnRect = null }) {
    this.actor = actor;
    this.tabId = tabId;
    this.taskbar = taskbar;
    this._btnRect = btnRect; // rect of the tab button clicked
    this.element = null;
    this._sortOrder = "default";
    this._filterText = "";
    this._activeTags = [];
    this._panelId = randomID();
    this._observers = [];
    this._dragSrc = null;
    this._closed = false;
    this._clickOutsideHandler = null;
    this._escHandler = null;
  }

  get isClothesPanel() { return this.tabId === CLOTHES_TAB_ID; }
  get isFavoritesPanel() { return this.tabId === FAVORITES_TAB_ID; }
  get isVideoPanel() { return this.tabId === VIDEO_TAB_ID; }

  /* -- Public API -- */

  async render(open = true) {
    if (!open) return;

    // Remove any existing panel
    const existing = document.querySelector(".cgt-panel");
    if (existing) existing.remove();

    // Build and position
    const html = await this._buildHTML();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    this.element = wrapper.firstElementChild;
    document.body.appendChild(this.element);

    this._positionPanel();
    this._bindEvents();
    this._initLazyLoad();
    this._applySort();
  }

  close() {
    if (this._closed) return;
    this._closed = true;

    // Remove click-outside handler
    if (this._clickOutsideHandler) {
      document.removeEventListener("click", this._clickOutsideHandler, true);
      this._clickOutsideHandler = null;
    }

    // Remove Escape handler
    if (this._escHandler) {
      document.removeEventListener("keydown", this._escHandler);
      this._escHandler = null;
    }

    // Disconnect observers
    this._observers.forEach(obs => { try { obs.disconnect(); } catch (_) {} });
    this._observers = [];

    // Remove element
    if (this.element) {
      try { this.element.remove(); } catch (_) {}
      this.element = null;
    }
  }

  /* -- HTML generation -- */

  async _buildHTML() {
    const { title, isFav, isClothes, isVideos, config, images } = await this._resolveTabData();

    let toolbar = this._buildToolbar(title, isFav, isClothes, isVideos, config);
    let sortPanel = this._buildSortPanel();
    let infoPanel = this._buildInfoPanel();
    let filterPanel = this._buildFilterPanel(images);
    let optionsPanel = this._buildOptionsPanel(config, images.length);
    let grid = this._buildGrid(images, config);

    return `
      <div class="cgt-panel ct-popup" data-cgt-panel-id="${this._panelId}" data-cgt-tab-id="${esc(this.tabId)}">
        ${toolbar}
        <div class="cgt-panel-panels">
          ${sortPanel}
          ${infoPanel}
          ${filterPanel}
          ${optionsPanel}
        </div>
        ${grid}
      </div>`;
  }

  async _resolveTabData() {
    let title = "Gallery";
    let isFav = this.tabId === FAVORITES_TAB_ID;
    let isClothes = this.tabId === CLOTHES_TAB_ID;
    let isVideos = this.tabId === VIDEO_TAB_ID;
    let config = getDefaultLayout();
    let images = [];

    if (isFav) {
      title = "Favorites";
      config = getFavoritesLayout(this.actor);
      const tabs = getTabs(this.actor);
      tabs.forEach(t => {
        (t.images || []).forEach(img => { if (img.favorite) images.push({ ...img, _sourceTabId: t.id, _sourceTabTitle: t.title }); });
      });
      const clothes = getClothesImages(this.actor);
      clothes.forEach(img => { if (img.favorite) images.push({ ...img, _sourceTabId: CLOTHES_TAB_ID, _sourceTabTitle: "Wardrobe" }); });
    } else if (isClothes) {
      title = "Wardrobe";
      config = getClothesLayout(this.actor);
      images = getClothesImages(this.actor);
      const activeSub = getWardrobeActiveSubtab(this.actor);
      if (activeSub && activeSub !== WARDROBE_ALL) {
        images = images.filter(img => img.wardrobeSubtab === activeSub);
      }
    } else if (isVideos) {
      title = "Videos";
      config = { columns: 2, gap: 8, fit: "contain" };
      images = getVideoItems(this.actor);
    } else {
      const tabs = getTabs(this.actor);
      const tab = tabs.find(t => t.id === this.tabId);
      if (tab) {
        title = tab.title;
        config = { columns: tab.columns, gap: tab.gap, fit: tab.fit };
        images = tab.images || [];
      }
    }

    // Apply sort order
    const sortOrders = getTabSortOrders(this.actor);
    this._sortOrder = sortOrders[this.tabId] || "default";

    // Store images for click handlers
    this._currentImages = images;

    return { title, isFav, isClothes, isVideos, config, images };
  }

  _buildToolbar(title, isFav, isClothes, isVideos, config) {
    let subtitle = "";
    if (isFav) {
      subtitle = `<span class="cgt-panel-subtitle">Across all tabs</span>`;
    }

    let wardrobeTabs = "";
    if (isClothes) {
      wardrobeTabs = this._buildWardrobeTabs();
    }

    return `
      <div class="cgt-panel-toolbar">
        <div class="cgt-panel-titlebar">
          <h2>${esc(title)}</h2>
          ${subtitle}
          ${wardrobeTabs}
        </div>
        <div class="cgt-panel-float">
          <button class="cgt-float-btn" data-cgt-panel="sort" title="Sort">
            <i class="fa-solid fa-arrow-down-wide-short"></i>
          </button>
          <button class="cgt-float-btn" data-cgt-panel="info" title="Info">
            <i class="fa-solid fa-circle-info"></i>
          </button>
          <button class="cgt-float-btn" data-cgt-panel="filter" title="Filter">
            <i class="fa-solid fa-filter"></i>
          </button>
          <button class="cgt-float-btn" data-cgt-panel="options" title="Options">
            <i class="fa-solid fa-gear"></i>
          </button>
          <button class="cgt-float-btn cgt-float-close" data-cgt-action="close-panel" title="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>`;
  }

  _buildWardrobeTabs() {
    const actor = this.actor;
    // We'll populate this dynamically; for now just return a container
    return `<div class="cgt-wardrobe-tabs" data-cgt-wardrobe-tabs></div>`;
  }

  _buildSortPanel() {
    const orders = [
      { key: "default", label: "Default" },
      { key: "name-asc", label: "Name A\u2192Z" },
      { key: "name-desc", label: "Name Z\u2192A" },
      { key: "date-asc", label: "Oldest" },
      { key: "date-desc", label: "Newest" }
    ];
    return `
      <div class="cgt-flyout cgt-flyout-sort" data-cgt-flyout="sort">
        <div class="cgt-flyout-title">Sort Order</div>
        <div class="cgt-flyout-body">
          ${orders.map(o => `
            <button class="cgt-sort-btn ${this._sortOrder === o.key ? "active" : ""}"
                    data-sort="${o.key}">
              ${o.label}
            </button>
          `).join("")}
        </div>
      </div>`;
  }

  _buildInfoPanel() {
    return `
      <div class="cgt-flyout cgt-flyout-info" data-cgt-flyout="info">
        <div class="cgt-flyout-title">Controls</div>
        <div class="cgt-flyout-body cgt-help-text">
          <p><strong>Left-click</strong> an image to view it in the lightbox.</p>
          <p><strong>Right-click</strong> an image for options: edit, favorite, share, remove.</p>
          <p><strong>Drag and drop</strong> images to reorder them.</p>
          <p>Use the toolbar buttons for sort, filter, and display options.</p>
          <p>The <strong>Add via URL</strong> button lets you paste an image link.</p>
          <p>The <strong>Browse Files</strong> button (GM only) opens the file picker.</p>
        </div>
      </div>`;
  }

  _buildFilterPanel(images) {
    const allTags = collectAllTags(images);
    return `
      <div class="cgt-flyout cgt-flyout-filter" data-cgt-flyout="filter">
        <div class="cgt-flyout-title">Filter</div>
        <div class="cgt-flyout-body">
          <div class="cgt-filter-search">
            <input type="text" placeholder="Search..." data-cgt-filter-search />
            <i class="fa-solid fa-magnifying-glass"></i>
          </div>
          <div class="cgt-filter-tags">
            ${allTags.map(tag => `
              <button class="cgt-tag-chip" data-tag="${esc(tag)}">${esc(tag)}</button>
            `).join("")}
          </div>
        </div>
      </div>`;
  }

  _buildOptionsPanel(config, count) {
    const canAdd = canManageActor(this.actor);
    return `
      <div class="cgt-flyout cgt-flyout-options" data-cgt-flyout="options">
        <div class="cgt-flyout-title">Options</div>
        <div class="cgt-flyout-body">
          ${canAdd ? `
            <div class="cgt-opt-buttons">
              <button data-cgt-action="add-url"><i class="fa-solid fa-link"></i> Add via URL</button>
              ${game.user.isGM ? `<button data-cgt-action="browse-files"><i class="fa-solid fa-folder-open"></i> Browse Files</button>` : ""}
            </div>
            <hr/>
          ` : ""}
          <div class="cgt-opt-group">
            <label>Columns</label>
            <div class="cgt-opt-segment" data-opt="columns">
              ${[1,2,3,4,5].map(n => `
                <button class="${config.columns === n ? "active" : ""}" data-val="${n}">${n}</button>
              `).join("")}
            </div>
          </div>
          <div class="cgt-opt-group">
            <label>Gap</label>
            <select data-opt="gap">
              <option value="0" ${config.gap === 0 ? "selected" : ""}>None</option>
              <option value="4" ${config.gap === 4 ? "selected" : ""}>Small</option>
              <option value="8" ${config.gap === 8 ? "selected" : ""}>Medium</option>
              <option value="12" ${config.gap === 12 ? "selected" : ""}>Large</option>
              <option value="18" ${config.gap === 18 ? "selected" : ""}>X-Large</option>
            </select>
          </div>
          <div class="cgt-opt-group">
            <label>Fit</label>
            <select data-opt="fit">
              <option value="natural" ${config.fit === "natural" ? "selected" : ""}>Natural</option>
              <option value="cover" ${config.fit === "cover" ? "selected" : ""}>Cover</option>
              <option value="contain" ${config.fit === "contain" ? "selected" : ""}>Contain</option>
            </select>
          </div>
          <hr/>
          <div class="cgt-opt-checks">
            <label><input type="checkbox" data-opt="hideNames" /> Hide Names</label>
            <label><input type="checkbox" data-opt="hideCaptions" /> Hide Captions</label>
            <label><input type="checkbox" data-opt="hideNotes" /> Hide Notes</label>
            <label><input type="checkbox" data-opt="hideTags" /> Hide Tags</label>
          </div>
          <div class="cgt-opt-count">${count} item${count !== 1 ? "s" : ""}</div>
        </div>
      </div>`;
  }

  _buildGrid(images, config) {
    const fit = config.fit || "natural";
    const cols = config.columns || 3;
    const gap = config.gap ?? 8;

    if (!images.length) {
      return `<div class="cgt-grid cgt-grid-empty" style="--cols:${cols};--gap:${gap}px;" data-fit="${fit}">
        <div class="cgt-empty-msg">No images yet.</div>
      </div>`;
    }

    let items = "";
    images.forEach((img, idx) => {
      const isVid = this._isVideoUrl(img.url);
      // First batch loads immediately (src), rest lazy (data-src)
      const useLazy = idx >= LAZY_BATCH_SIZE;
      const mediaTag = isVid
        ? `<video src="${esc(img.url)}" preload="metadata" muted playsinline></video>`
        : useLazy
          ? `<img data-src="${esc(img.url)}" alt="${esc(img.name)}" />`
          : `<img src="${esc(img.url)}" alt="${esc(img.name)}" loading="eager" />`;
      const nameEl = img.name ? `<div class="cgt-item-name">${esc(img.name)}</div>` : "";
      const captionEl = img.caption ? `<div class="cgt-item-caption">${esc(img.caption)}</div>` : "";
      const noteEl = img.note ? `<div class="cgt-item-note">${esc(img.note)}</div>` : "";
      const tagsEl = (img.tags || []).length
        ? `<div class="cgt-item-tags">${img.tags.map(t => `<span class="cgt-tag-chip-sm">${esc(t)}</span>`).join("")}</div>`
        : "";
      const favClass = img.favorite ? " favorited" : "";
      const lazyClass = idx >= LAZY_BATCH_SIZE ? " cgt-lazy" : "";

      items += `
        <div class="cgt-item${favClass}${lazyClass}" data-img-id="${esc(img.id)}" draggable="true" style="${idx >= LAZY_BATCH_SIZE ? "opacity:0;" : ""}">
          <div class="cgt-item-media">
            ${mediaTag}
            <div class="cgt-item-veil"></div>
            <div class="cgt-item-tools">
              <button class="cgt-tool-btn" data-action="favorite" title="Toggle Favorite">
                <i class="fa-solid fa-heart"></i>
              </button>
              <button class="cgt-tool-btn" data-action="edit" title="Edit Details">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="cgt-tool-btn" data-action="share" title="Share">
                <i class="fa-solid fa-share-nodes"></i>
              </button>
            </div>
          </div>
          <div class="cgt-item-meta">
            ${nameEl}
            ${captionEl}
            ${noteEl}
            ${tagsEl}
          </div>
        </div>`;
    });

    return `<div class="cgt-grid" style="--cols:${cols};--gap:${gap}px;" data-fit="${fit}">
      ${items}
    </div>`;
  }

  _isVideoUrl(url) {
    if (!url) return false;
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
    return ["mp4", "webm", "ogg", "mov"].includes(ext);
  }

  /* -- Positioning -- */

  _positionPanel() {
    if (!this.element || !this.taskbar?.element) return;

    const panelWidth = Math.min(520, window.innerWidth - 32);

    // Compute left: center panel above the clicked tab button
    let left;
    if (this._btnRect) {
      // Center panel above the specific tab button
      left = this._btnRect.left + this._btnRect.width / 2 - panelWidth / 2;
    } else {
      // Fallback: center over taskbar
      const tbRect = this.taskbar.element.getBoundingClientRect();
      left = tbRect.left + tbRect.width / 2 - panelWidth / 2;
    }
    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));

    // Compute bottom: position just above the strip
    const strip = this.taskbar.element.querySelector(".cgt-strip-wrapper");
    let anchorTop;
    if (strip) {
      anchorTop = strip.getBoundingClientRect().top;
    } else {
      anchorTop = this.taskbar.element.getBoundingClientRect().top;
    }

    this.element.style.position = "fixed";
    this.element.style.bottom = `${window.innerHeight - anchorTop + 4}px`;
    this.element.style.left = `${left}px`;
    this.element.style.width = `${panelWidth}px`;
    this.element.style.maxHeight = `${Math.min(480, window.innerHeight * 0.5)}px`;
    this.element.style.zIndex = "200";
  }

  /* -- Event binding -- */

  _bindEvents() {
    if (!this.element) return;
    const panel = this.element;

    // Float widget toggles + close button
    panel.querySelectorAll(".cgt-float-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (btn.dataset.cgtAction === "close-panel") {
          this.close();
          return;
        }
        const flyoutName = btn.dataset.cgtPanel;
        this._toggleFlyout(flyoutName);
      });
    });

    // Sort buttons
    panel.querySelectorAll(".cgt-sort-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const order = btn.dataset.sort;
        this._sortOrder = order;
        await setTabSortOrder(this.actor, this.tabId, order);
        panel.querySelectorAll(".cgt-sort-btn").forEach(b => b.classList.toggle("active", b.dataset.sort === order));
        this._applySort();
        this._toggleFlyout(null);
      });
    });

    // Filter search
    const searchInput = panel.querySelector("[data-cgt-filter-search]");
    if (searchInput) {
      searchInput.addEventListener("input", debounce((e) => {
        this._filterText = e.target.value.toLowerCase();
        this._applyFilter();
      }, 200));
    }

    // Filter tag chips
    panel.querySelectorAll(".cgt-filter-tags .cgt-tag-chip").forEach(chip => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const tag = chip.dataset.tag;
        chip.classList.toggle("active");
        if (this._activeTags.includes(tag)) {
          this._activeTags = this._activeTags.filter(t => t !== tag);
        } else {
          this._activeTags.push(tag);
        }
        this._applyFilter();
      });
    });

    // Options: columns
    panel.querySelectorAll("[data-opt='columns'] button").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const val = Number(btn.dataset.val);
        panel.querySelectorAll("[data-opt='columns'] button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        await this._saveLayoutOption("columns", val);
        const grid = panel.querySelector(".cgt-grid");
        if (grid) grid.style.setProperty("--cols", val);
      });
    });

    // Options: gap
    const gapSelect = panel.querySelector("[data-opt='gap']");
    if (gapSelect) {
      gapSelect.addEventListener("change", async (e) => {
        const val = Number(e.target.value);
        await this._saveLayoutOption("gap", val);
        const grid = panel.querySelector(".cgt-grid");
        if (grid) grid.style.setProperty("--gap", `${val}px`);
      });
    }

    // Options: fit
    const fitSelect = panel.querySelector("[data-opt='fit']");
    if (fitSelect) {
      fitSelect.addEventListener("change", async (e) => {
        const val = e.target.value;
        await this._saveLayoutOption("fit", val);
        const grid = panel.querySelector(".cgt-grid");
        if (grid) grid.dataset.fit = val;
      });
    }

    // Options: hide toggles
    panel.querySelectorAll(".cgt-opt-checks input").forEach(chk => {
      chk.addEventListener("change", async (e) => {
        const opt = e.target.dataset.opt;
        const val = e.target.checked;
        await this._saveDisplayOption(opt, val);
        const grid = panel.querySelector(".cgt-grid");
        if (grid) grid.classList.toggle(opt, val);
      });
    });

    // Add via URL
    const addUrlBtn = panel.querySelector("[data-cgt-action='add-url']");
    if (addUrlBtn) {
      addUrlBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._openAddImageDialog();
      });
    }

    // Browse files
    const browseBtn = panel.querySelector("[data-cgt-action='browse-files']");
    if (browseBtn) {
      browseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._browseFiles();
      });
    }

    // Bind grid events (click, context menu, drag)
    this._bindGridEvents();

    // Wardrobe subtabs
    this._bindWardrobeTabs(panel);

    // Close panel on Escape
    this._escHandler = (e) => {
      if (e.key === "Escape") {
        // Only close if lightbox is not open
        if (!document.querySelector(".cgt-lightbox")) {
          this.close();
        }
      }
    };
    document.addEventListener("keydown", this._escHandler);

    // Close panel when clicking outside (but not on tab strip)
    this._clickOutsideHandler = (e) => {
      if (panel.contains(e.target)) return;
      // Don't close if clicking on the tab strip
      const strip = this.taskbar?.element?.querySelector(".cgt-strip-wrapper");
      if (strip?.contains(e.target)) return;
      this.close();
    };
    // Use capture phase to run before taskbar's document click handler
    document.addEventListener("click", this._clickOutsideHandler, true);
  }

  _bindGridEvents() {
    if (!this.element) return;
    const grid = this.element.querySelector(".cgt-grid");
    if (!grid) return;

    // Click to open lightbox (delegated)
    grid.addEventListener("click", (e) => {
      const item = e.target.closest(".cgt-item");
      if (!item) return;
      // If clicking tool buttons, let them handle it
      if (e.target.closest(".cgt-tool-btn")) return;
      const imgId = item.dataset.imgId;
      if (!imgId) return;
      this._openLightbox(imgId);
    });

    // Tool buttons (favorite, edit, share)
    grid.addEventListener("click", (e) => {
      const tool = e.target.closest(".cgt-tool-btn");
      if (!tool) return;
      e.stopPropagation();
      const item = tool.closest(".cgt-item");
      const imgId = item?.dataset.imgId;
      const action = tool.dataset.action;
      if (!imgId || !action) return;

      switch (action) {
        case "favorite": this._toggleFavorite(imgId); break;
        case "edit": this._openEditDialog(imgId); break;
        case "share": this._shareImage(imgId); break;
      }
    });

    // Right-click context menu
    grid.addEventListener("contextmenu", (e) => {
      const item = e.target.closest(".cgt-item");
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      const imgId = item.dataset.imgId;
      if (!imgId) return;
      this._showContextMenu(e, imgId);
    });

    // Drag and drop
    this._bindDragAndDrop(grid);
  }

  _toggleFlyout(name) {
    if (!this.element) return;
    this.element.querySelectorAll(".cgt-flyout").forEach(f => {
      f.classList.toggle("active", f.dataset.cgtFlyout === name);
    });
  }

  /* -- Wardrobe subtabs -- */

  async _bindWardrobeTabs(panel) {
    if (this.tabId !== CLOTHES_TAB_ID) return;
    const container = panel.querySelector("[data-cgt-wardrobe-tabs]");
    if (!container) return;

    const subtabs = getWardrobeSubtabs(this.actor);
    const activeSub = getWardrobeActiveSubtab(this.actor);

    let html = "";
    subtabs.forEach(sub => {
      const isActive = (activeSub === sub.id) || (!activeSub && sub.id === WARDROBE_ALL);
      html += `<button class="cgt-wardrobe-tab ${isActive ? "active" : ""}" data-subtab="${esc(sub.id)}">${esc(sub.name)}</button>`;
    });
    container.innerHTML = html;

    container.querySelectorAll(".cgt-wardrobe-tab").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const subtabId = btn.dataset.subtab;
        await saveWardrobeActiveSubtab(this.actor, subtabId);
        container.querySelectorAll(".cgt-wardrobe-tab").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        // Refresh grid
        this._refreshGrid();
      });
    });
  }

  /* -- Layout & display persistence -- */

  async _saveLayoutOption(key, value) {
    if (this.tabId === FAVORITES_TAB_ID) {
      const layout = getFavoritesLayout(this.actor);
      layout[key] = value;
      await saveFavoritesLayout(this.actor, layout);
    } else if (this.tabId === CLOTHES_TAB_ID) {
      const layout = getClothesLayout(this.actor);
      layout[key] = value;
      await saveClothesLayout(this.actor, layout);
    } else if (this.tabId !== VIDEO_TAB_ID) {
      const tabs = getTabs(this.actor);
      const tab = tabs.find(t => t.id === this.tabId);
      if (tab) {
        tab[key] = value;
        await saveTabs(this.actor, tabs);
      }
    }
  }

  async _saveDisplayOption(key, value) {
    if (this.tabId === FAVORITES_TAB_ID || this.tabId === CLOTHES_TAB_ID || this.tabId === VIDEO_TAB_ID) return;
    const tabs = getTabs(this.actor);
    const tab = tabs.find(t => t.id === this.tabId);
    if (tab) {
      tab[key] = value;
      await saveTabs(this.actor, tabs);
    }
  }

  /* -- Sorting and filtering -- */

  _applySort() {
    if (!this.element) return;
    const grid = this.element.querySelector(".cgt-grid");
    if (!grid) return;
    const items = Array.from(grid.querySelectorAll(".cgt-item"));
    // We need to re-fetch images in sorted order, then rebuild
    // For performance, we'll just sort the DOM elements based on data attributes
    // Actually, better to rebuild the grid entirely
    this._refreshGrid();
  }

  _applyFilter() {
    if (!this.element) return;
    const grid = this.element.querySelector(".cgt-grid");
    if (!grid) return;
    grid.querySelectorAll(".cgt-item").forEach(item => {
      const imgId = item.dataset.imgId;
      const img = this._currentImages?.find(i => i.id === imgId);
      if (!img) return;
      const textMatch = !this._filterText ||
        (img.name || "").toLowerCase().includes(this._filterText) ||
        (img.caption || "").toLowerCase().includes(this._filterText) ||
        (img.note || "").toLowerCase().includes(this._filterText);
      const tagMatch = this._activeTags.length === 0 ||
        this._activeTags.every(t => (img.tags || []).includes(t));
      item.style.display = (textMatch && tagMatch) ? "" : "none";
    });
  }

  /* -- Grid refresh -- */

  async _refreshGrid() {
    if (!this.element) return;
    const { config, images } = await this._resolveTabData();
    this._currentImages = images;
    const sorted = sortImages(images, this._sortOrder);
    const newGrid = this._buildGrid(sorted, config);
    const oldGrid = this.element.querySelector(".cgt-grid");
    if (oldGrid) {
      oldGrid.outerHTML = newGrid;
    }
    this._initLazyLoad();
    this._bindGridEvents();
    this._applyFilter();
  }

  /* -- Lazy loading -- */

  _initLazyLoad() {
    if (!this.element) return;
    const lazyItems = this.element.querySelectorAll(".cgt-item.cgt-lazy");
    if (!lazyItems.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const item = entry.target;
          item.style.opacity = "1";
          const img = item.querySelector("img[data-src]");
          if (img) {
            img.src = img.dataset.src;
            img.removeAttribute("data-src");
          }
          observer.unobserve(item);
        }
      });
    }, { root: this.element, rootMargin: "100px" });

    lazyItems.forEach(item => observer.observe(item));
    this._observers.push(observer);
  }

  /* -- Drag and drop -- */

  _bindDragAndDrop(grid) {
    if (!grid) return;
    const items = grid.querySelectorAll(".cgt-item");

    items.forEach(item => {
      item.addEventListener("dragstart", (e) => {
        this._dragSrc = item;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.dataset.imgId);
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        items.forEach(i => i.classList.remove("drag-over"));
        this._dragSrc = null;
      });

      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        item.classList.add("drag-over");
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("drag-over");
      });

      item.addEventListener("drop", async (e) => {
        e.preventDefault();
        item.classList.remove("drag-over");
        if (!this._dragSrc || this._dragSrc === item) return;

        const srcId = this._dragSrc.dataset.imgId;
        const dstId = item.dataset.imgId;
        await this._reorderImage(srcId, dstId);
      });
    });
  }

  async _reorderImage(srcId, dstId) {
    if (this.tabId === FAVORITES_TAB_ID) return; // Can't reorder favorites
    if (this.tabId === VIDEO_TAB_ID) {
      const items = getVideoItems(this.actor);
      const srcIdx = items.findIndex(i => i.id === srcId);
      const dstIdx = items.findIndex(i => i.id === dstId);
      if (srcIdx < 0 || dstIdx < 0) return;
      const [moved] = items.splice(srcIdx, 1);
      items.splice(dstIdx, 0, moved);
      await saveVideoItems(this.actor, items);
    } else if (this.tabId === CLOTHES_TAB_ID) {
      const items = getClothesImages(this.actor);
      const srcIdx = items.findIndex(i => i.id === srcId);
      const dstIdx = items.findIndex(i => i.id === dstId);
      if (srcIdx < 0 || dstIdx < 0) return;
      const [moved] = items.splice(srcIdx, 1);
      items.splice(dstIdx, 0, moved);
      await saveClothesImages(this.actor, items);
    } else {
      const tabs = getTabs(this.actor);
      const tab = tabs.find(t => t.id === this.tabId);
      if (!tab) return;
      const items = tab.images || [];
      const srcIdx = items.findIndex(i => i.id === srcId);
      const dstIdx = items.findIndex(i => i.id === dstId);
      if (srcIdx < 0 || dstIdx < 0) return;
      const [moved] = items.splice(srcIdx, 1);
      items.splice(dstIdx, 0, moved);
      await saveTabs(this.actor, tabs);
    }
    this._refreshGrid();
  }

  /* -- Context menu -- */

  _showContextMenu(event, imgId) {
    document.querySelectorAll(".cgt-context-menu, #cgt-ctx-menu, #cgt-ctx-submenu").forEach(m => m.remove());

    const img = this._findImageSync(imgId);
    if (!img) return;

    const canRemove = canManageActor(this.actor);
    const canEdit = canManageActor(this.actor);
    const canShare = true;

    // Wardrobe-specific: build rows array
    const rows = [];
    const wardrobeSubtabs = this.isClothesPanel ? getWardrobeSubtabs(this.actor).filter(st => st.id !== WARDROBE_ALL) : [];

    // Wardrobe: Categorize submenu
    if (this.isClothesPanel && wardrobeSubtabs.length) {
      const subtabData = wardrobeSubtabs.map(st => `${esc(st.id)}:${esc(st.name)}`).join("|");
      rows.push(`<div class="cgt-ctx-item cgt-ctx-has-sub js-ctx-categorize" data-subtabs="${subtabData}"><span class="cgt-ctx-main"><i class="fa-solid fa-tags"></i> Categorize</span><i class="fa-solid fa-chevron-right cgt-ctx-caret"></i></div>`);
      if (img.wardrobeSubtab) {
        rows.push(`<div class="cgt-ctx-item js-ctx-remove-subtab"><i class="fa-solid fa-xmark"></i> Remove from Category</div>`);
      }
    }

    // Show Image
    rows.push(`<div class="cgt-ctx-item js-ctx-show"><i class="fa-solid fa-expand"></i> Show Image</div>`);

    // Favorite/Unfavorite
    rows.push(`<div class="cgt-ctx-item js-ctx-favorite"><i class="fa-solid fa-heart"></i> ${img.favorite ? "Unfavorite" : "Favorite"}</div>`);

    // Edit Details
    if (canEdit) {
      rows.push(`<div class="cgt-ctx-item js-ctx-edit"><i class="fa-solid fa-pen"></i> Edit Details</div>`);
    }

    // Copy URL
    rows.push(`<div class="cgt-ctx-item js-ctx-copy-url"><i class="fa-solid fa-copy"></i> Copy Image URL</div>`);

    // Send to Tab submenu
    rows.push(`<div class="cgt-ctx-item cgt-ctx-submenu" data-action="send-to-tab"><i class="fa-solid fa-share"></i> Send to Tab<div class="cgt-ctx-submenu-popup"></div></div>`);

    // Show to Players
    if (canShare) {
      rows.push(`<div class="cgt-ctx-item js-ctx-show-players"><i class="fa-solid fa-eye"></i> Show to Players</div>`);
    }

    // Wardrobe: Change Portrait / Token / Hover
    if (this.isClothesPanel && canManageActor(this.actor)) {
      rows.push(`<div class="cgt-ctx-item js-ctx-portrait"><i class="fa-solid fa-user"></i> Change Character Portrait</div>`);
      rows.push(`<div class="cgt-ctx-item js-ctx-token-art"><i class="fa-solid fa-chess-pawn"></i> Change Current Token Art</div>`);
      rows.push(`<div class="cgt-ctx-item js-ctx-hover-art"><i class="fa-solid fa-image"></i> Change Hover Art</div>`);
    }

    // Close Image
    rows.push(`<div class="cgt-ctx-item js-ctx-close"><i class="fa-solid fa-xmark"></i> Close Image</div>`);

    // Remove
    if (canRemove) {
      rows.push(`<div class="cgt-ctx-item cgt-ctx-danger js-ctx-remove"><i class="fa-solid fa-trash"></i> Remove Image</div>`);
    }

    const menu = document.createElement("div");
    menu.id = "cgt-ctx-menu";
    menu.className = "cgt-context-menu";
    menu.innerHTML = rows.join("");

    const menuWidth = this.isClothesPanel ? 236 : 196;
    const menuHeight = rows.length * 42 + 12;
    const pos = clampMenuToViewport(event.clientX, event.clientY, menuWidth, menuHeight);
    menu.style.position = "fixed";
    menu.style.left = `${pos.x}px`;
    menu.style.top = `${pos.y}px`;
    menu.style.zIndex = "99999";
    document.body.appendChild(menu);

    // --- Send-to-tab submenu (static) ---
    const submenuPopup = menu.querySelector(".cgt-ctx-submenu-popup");
    if (submenuPopup) {
      const tabs = getTabs(this.actor);
      let subHtml = "";
      tabs.forEach(t => {
        if (t.id !== this.tabId) {
          subHtml += `<div class="cgt-ctx-item" data-sub-action="send" data-target-tab="${esc(t.id)}">${esc(t.title)}</div>`;
        }
      });
      if (this.tabId !== CLOTHES_TAB_ID) {
        subHtml += `<div class="cgt-ctx-item" data-sub-action="send" data-target-tab="${CLOTHES_TAB_ID}">Wardrobe</div>`;
      }
      submenuPopup.innerHTML = subHtml || '<div class="cgt-ctx-item disabled">No other tabs</div>';
    }

    // --- Categorize hover submenu ---
    const categorizeEl = menu.querySelector(".js-ctx-categorize");
    if (categorizeEl) {
      const showSubMenu = (e) => {
        e.stopPropagation();
        document.getElementById("cgt-ctx-submenu")?.remove();
        const rawData = String(categorizeEl.dataset.subtabs ?? "");
        if (!rawData) return;
        const subtabs = rawData.split("|").map(s => {
          const [id, ...nameParts] = s.split(":");
          return { id, name: nameParts.join(":") };
        }).filter(st => st.id);
        if (!subtabs.length) return;

        const sub = document.createElement("div");
        sub.id = "cgt-ctx-submenu";
        sub.className = "cgt-context-menu";
        sub.style.position = "fixed";
        sub.style.zIndex = "100001";
        sub.innerHTML = subtabs.map(st => `<div class="cgt-ctx-item cgt-ctx-subitem-dyn" data-subtab="${st.id}">${esc(st.name)}</div>`).join("");
        document.body.appendChild(sub);

        const rect = categorizeEl.getBoundingClientRect();
        const subW = 180;
        const subH = subtabs.length * 42 + 12;
        let sx = rect.right + 4;
        let sy = rect.top;
        if (sx + subW > window.innerWidth) sx = rect.left - subW - 4;
        if (sy + subH > window.innerHeight) sy = window.innerHeight - subH - 8;
        sub.style.left = `${Math.max(8, sx)}px`;
        sub.style.top = `${Math.max(8, sy)}px`;

        sub.querySelectorAll(".cgt-ctx-subitem-dyn").forEach(el2 => {
          el2.addEventListener("click", async (ev2) => {
            ev2.stopPropagation();
            ev2.preventDefault();
            const subtabId = String(el2.dataset.subtab ?? "").toLowerCase();
            sub.remove();
            menu.remove();
            await this._categorizeClothesImage(imgId, subtabId);
          });
        });

        setTimeout(() => {
          const closeSubmenu = (ev3) => {
            if (sub.contains(ev3.target) || categorizeEl.contains(ev3.target)) return;
            sub.remove();
            document.removeEventListener("pointerdown", closeSubmenu, true);
          };
          document.addEventListener("pointerdown", closeSubmenu, true);
        }, 0);
      };
      categorizeEl.addEventListener("mouseenter", showSubMenu);
      categorizeEl.addEventListener("click", showSubMenu);
    }

    // --- Click handlers for all menu items ---
    menu.querySelector(".js-ctx-show")?.addEventListener("click", () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); this._openLightbox(imgId); });
    menu.querySelector(".js-ctx-favorite")?.addEventListener("click", async () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); await this._toggleFavorite(imgId); });
    menu.querySelector(".js-ctx-edit")?.addEventListener("click", async () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); await this._openEditDialog(imgId); });
    menu.querySelector(".js-ctx-copy-url")?.addEventListener("click", () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); this._copyImageUrl(imgId); });
    menu.querySelector(".js-ctx-show-players")?.addEventListener("click", () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); this._showToPlayers(imgId); });
    menu.querySelector(".js-ctx-close")?.addEventListener("click", () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); this.close(); });
    menu.querySelector(".js-ctx-remove")?.addEventListener("click", () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); this._confirmRemoveImage(imgId); });
    menu.querySelector(".js-ctx-remove-subtab")?.addEventListener("click", async () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); await this._removeFromSubtab(imgId); });
    menu.querySelector(".js-ctx-portrait")?.addEventListener("click", async () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); await this._setActorPortraitFromImage(img); });
    menu.querySelector(".js-ctx-token-art")?.addEventListener("click", async () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); await this._setCurrentTokenArtFromImage(img); });
    menu.querySelector(".js-ctx-hover-art")?.addEventListener("click", async () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); await this._setActorHoverArtFromImage(img); });

    // Send-to-tab items (delegated)
    menu.addEventListener("click", async (e) => {
      const item = e.target.closest("[data-sub-action='send']");
      if (!item) return;
      const targetTabId = item.dataset.targetTab;
      await this._sendImageToTab(imgId, targetTabId);
      menu.remove();
      document.getElementById("cgt-ctx-submenu")?.remove();
    });

    // Close on outside click
    setTimeout(() => {
      document.addEventListener("click", () => { menu.remove(); document.getElementById("cgt-ctx-submenu")?.remove(); }, { once: true });
    }, 0);
  }

  /* -- Image actions -- */

  async _findImage(imgId) {
    if (this._currentImages) {
      const found = this._currentImages.find(i => i.id === imgId);
      if (found) return found;
    }
    // Search all sources
    const tabs = getTabs(this.actor);
    for (const t of tabs) {
      const img = (t.images || []).find(i => i.id === imgId);
      if (img) return img;
    }
    const clothes = getClothesImages(this.actor);
    const cImg = clothes.find(i => i.id === imgId);
    if (cImg) return cImg;
    const videos = getVideoItems(this.actor);
    const vImg = videos.find(i => i.id === imgId);
    if (vImg) return vImg;
    return null;
  }

  async _findImageSource(imgId) {
    const tabs = getTabs(this.actor);
    for (const t of tabs) {
      if ((t.images || []).some(i => i.id === imgId)) return { type: "tab", tabId: t.id, tab: t };
    }
    const clothes = getClothesImages(this.actor);
    if (clothes.some(i => i.id === imgId)) return { type: "clothes" };
    const videos = getVideoItems(this.actor);
    if (videos.some(i => i.id === imgId)) return { type: "videos" };
    return null;
  }

  async _toggleFavorite(imgId) {
    const src = await this._findImageSource(imgId);
    if (!src) return;

    if (src.type === "tab") {
      const tabs = getTabs(this.actor);
      const tab = tabs.find(t => t.id === src.tabId);
      const img = tab.images.find(i => i.id === imgId);
      if (img) img.favorite = !img.favorite;
      await saveTabs(this.actor, tabs);
    } else if (src.type === "clothes") {
      const items = getClothesImages(this.actor);
      const img = items.find(i => i.id === imgId);
      if (img) img.favorite = !img.favorite;
      await saveClothesImages(this.actor, items);
    } else if (src.type === "videos") {
      // Videos don't have favorites
      return;
    }

    this._refreshGrid();
    _refreshGallery(this.actor);
  }

  async _removeImage(imgId) {
    const src = await this._findImageSource(imgId);
    if (!src) return;

    const confirmed = await Dialog.confirm({
      title: "Remove Image",
      content: "<p>Remove this image from the gallery?</p>",
      yes: { label: "Remove", callback: async () => {
        if (src.type === "tab") {
          const tabs = getTabs(this.actor);
          const tab = tabs.find(t => t.id === src.tabId);
          tab.images = (tab.images || []).filter(i => i.id !== imgId);
          await saveTabs(this.actor, tabs);
        } else if (src.type === "clothes") {
          const items = getClothesImages(this.actor);
          await saveClothesImages(this.actor, items.filter(i => i.id !== imgId));
        } else if (src.type === "videos") {
          const items = getVideoItems(this.actor);
          await saveVideoItems(this.actor, items.filter(i => i.id !== imgId));
        }
        this._refreshGrid();
        _refreshGallery(this.actor);
      }}
    });
    if (!confirmed) return;
  }

  _findImageSync(imgId) {
    // Synchronous lookup for context menu (avoids async in event handler)
    if (this._currentImages) {
      const found = this._currentImages.find(i => i.id === imgId);
      if (found) return found;
    }
    const tabs = getTabs(this.actor);
    for (const t of tabs) {
      const img = (t.images || []).find(i => i.id === imgId);
      if (img) return img;
    }
    const clothes = getClothesImages(this.actor);
    const cImg = clothes.find(i => i.id === imgId);
    if (cImg) return cImg;
    const videos = getVideoItems(this.actor);
    const vImg = videos.find(i => i.id === imgId);
    if (vImg) return vImg;
    return null;
  }

  _confirmRemoveImage(imgId) {
    if (!canManageActor(this.actor)) {
      ui.notifications.warn("You do not have permission to remove images from this gallery.");
      return;
    }
    const img = this._findImageSync(imgId);
    const title = img ? makeImageDisplayTitle(img) : "this image";
    new Dialog({
      title: "Remove Image",
      content: `<p>Remove <strong>${esc(title)}</strong> from its gallery?</p>`,
      buttons: {
        yes: {
          icon: `<i class="fa-solid fa-trash"></i>`,
          label: "Remove",
          callback: async () => {
            if (this.isClothesPanel) {
              const check = getClothesImages(this.actor);
              if (!check.some(i => i.id === imgId)) { ui.notifications.warn("This image no longer exists."); return; }
              await this._removeImageClothes(imgId);
            } else if (this.isVideoPanel) {
              const check = getVideoItems(this.actor);
              if (!check.some(i => i.id === imgId)) { ui.notifications.warn("This video no longer exists."); return; }
              await this._removeVideoItem(imgId);
            } else {
              await this._removeImage(imgId);
            }
            this.close();
            _refreshGallery(this.actor);
          }
        },
        no: { label: "Cancel" }
      },
      default: "no"
    }).render(true);
  }

  async _removeImageClothes(imgId) {
    const images = getClothesImages(this.actor).filter(img => img.id !== imgId);
    await saveClothesImages(this.actor, images);
    this._refreshGrid();
    _refreshGallery(this.actor);
  }

  async _removeVideoItem(imgId) {
    await saveVideoItems(this.actor, getVideoItems(this.actor).filter(i => i.id !== imgId));
    this._refreshGrid();
    _refreshGallery(this.actor);
  }

  /* -- Wardrobe-specific actions -- */

  async _setActorPortraitFromImage(img) {
    if (!this.isClothesPanel || !canManageActor(this.actor)) {
      ui.notifications.warn("Only the actor owner or Game Master can change portrait art from the Wardrobe tab.");
      return;
    }
    const src = String(img?.url ?? "").trim();
    if (!src) { ui.notifications.warn("This image has no valid source."); return; }
    await this.actor.update({ img: src });
    ui.notifications.info(`Portrait updated for ${this.actor.name}.`);
    _refreshGallery(this.actor);
  }

  async _setCurrentTokenArtFromImage(img) {
    if (!this.isClothesPanel || !canManageActor(this.actor)) {
      ui.notifications.warn("Only the actor owner or Game Master can change current token art from the Wardrobe tab.");
      return;
    }
    const src = String(img?.url ?? "").trim();
    if (!src) { ui.notifications.warn("This image has no valid source."); return; }
    const controlled = canvas?.tokens?.controlled ?? [];
    const matching = controlled.filter(t => t.actor?.id === this.actor.id);
    if (!matching.length) { ui.notifications.warn("Select the current token for this actor on the canvas first."); return; }
    for (const token of matching) { await token.document.update({ "texture.src": src }); }
    ui.notifications.info(`Current token art updated for ${matching.length} selected token${matching.length === 1 ? "" : "s"}.`);
  }

  async _setActorHoverArtFromImage(img) {
    if (!this.isClothesPanel || !canManageActor(this.actor)) {
      ui.notifications.warn("Only the actor owner or Game Master can change hover art from the Wardrobe tab.");
      return;
    }
    const src = String(img?.url ?? "").trim();
    if (!src) { ui.notifications.warn("This image has no valid source."); return; }
    await this.actor.update({ "prototypeToken.flags.image-hover.specificArt": src });
    const activeTokens = canvas?.tokens?.placeables?.filter(t => t.actor?.id === this.actor.id) ?? [];
    for (const token of activeTokens) {
      await token.document.update({ "flags.image-hover.specificArt": src });
    }
    ui.notifications.info(`Hover art updated for ${this.actor.name}${activeTokens.length ? ` and ${activeTokens.length} active token${activeTokens.length === 1 ? "" : "s"}` : ""}.`);
    _refreshGallery(this.actor);
  }

  async _categorizeClothesImage(imgId, targetSubtab) {
    const subtabId = String(targetSubtab ?? "").toLowerCase();
    if (!subtabId || subtabId === WARDROBE_ALL) return;
    const images = getClothesImages(this.actor);
    const index = images.findIndex(img => img.id === imgId);
    if (index === -1) return;
    images[index] = { ...images[index], wardrobeSubtab: subtabId, updatedAt: Date.now() };
    await saveClothesImages(this.actor, images);
    this._refreshGrid();
    _refreshGallery(this.actor);
  }

  async _removeFromSubtab(imgId) {
    const images = getClothesImages(this.actor);
    const index = images.findIndex(img => img.id === imgId);
    if (index === -1) return;
    const updated = { ...images[index] };
    delete updated.wardrobeSubtab;
    updated.updatedAt = Date.now();
    images[index] = updated;
    await saveClothesImages(this.actor, images);
    this._refreshGrid();
    _refreshGallery(this.actor);
  }

  async _copyImageUrl(imgId) {
    const img = await this._findImage(imgId);
    if (!img?.url) return;
    try {
      await navigator.clipboard.writeText(img.url);
      ui.notifications.info("Image URL copied to clipboard.");
    } catch {
      ui.notifications.error("Failed to copy URL.");
    }
  }

  async _sendImageToTab(imgId, targetTabId) {
    const img = await this._findImage(imgId);
    if (!img) return;

    // Remove from source
    const src = await this._findImageSource(imgId);
    if (src?.type === "tab") {
      const tabs = getTabs(this.actor);
      const tab = tabs.find(t => t.id === src.tabId);
      tab.images = (tab.images || []).filter(i => i.id !== imgId);
      await saveTabs(this.actor, tabs);
    } else if (src?.type === "clothes") {
      const items = getClothesImages(this.actor);
      await saveClothesImages(this.actor, items.filter(i => i.id !== imgId));
    }

    // Add to target
    const newImg = deepClone(img);
    newImg.id = randomID(); // New ID in target
    newImg.updatedAt = Date.now();

    if (targetTabId === CLOTHES_TAB_ID) {
      const items = getClothesImages(this.actor);
      items.push(newImg);
      await saveClothesImages(this.actor, items);
    } else {
      const tabs = getTabs(this.actor);
      const tab = tabs.find(t => t.id === targetTabId);
      if (tab) {
        tab.images = tab.images || [];
        tab.images.push(newImg);
        await saveTabs(this.actor, tabs);
      }
    }

    ui.notifications.info("Image moved to tab.");
    this._refreshGrid();
    _refreshGallery(this.actor);
  }

  async _showToPlayers(imgId) {
    const img = await this._findImage(imgId);
    if (!img?.url) return;
    _shareImageToPlayers(img.url, img.name || "Shared Image");
  }

  async _shareImage(imgId) {
    const img = await this._findImage(imgId);
    if (!img?.url) return;
    _openShareDialog(img.url, img.name || "Shared Image");
  }

  /* -- Lightbox -- */

  async _openLightbox(imgId) {
    const images = this._currentImages || [];
    const idx = images.findIndex(i => i.id === imgId);
    if (idx < 0) {
      console.warn(`[cypher-taskbar] Lightbox: image ${imgId} not found in current set (${images.length} images)`);
      return;
    }
    const img = images[idx];
    openLightboxBase(img.url, makeImageDisplayTitle(img), {
      caption: img.caption || "",
      note: img.note || "",
      tags: img.tags || [],
      sourceLine: img.sourceTabTitle || "",
      onContextMenu: (e, lb) => this._showContextMenu(e, imgId)
    });
  }

  /* -- Dialogs -- */

  _openAddImageDialog() {
    _openImageDialog({ actor: this.actor, tabId: this.tabId, mode: "add", onSave: () => {
      this._refreshGrid();
      _refreshGallery(this.actor);
    }});
  }

  _openEditDialog(imgId) {
    _openImageDialog({ actor: this.actor, tabId: this.tabId, mode: "edit", imgId, onSave: () => {
      this._refreshGrid();
      _refreshGallery(this.actor);
    }});
  }

  _browseFiles() {
    const fp = new FilePicker({
      type: "imagevideo",
      current: "",
      callback: async (path) => {
        if (!path) return;
        await this._addImageFromUrl(path);
      }
    });
    fp.render(true);
  }

  async _addImageFromUrl(url, extraData = {}) {
    if (!url) return;
    const img = normalizeImageData({
      id: randomID(),
      url,
      name: extraData.name || url.split("/").pop()?.split("?")[0] || "Untitled",
      caption: extraData.caption || "",
      note: extraData.note || "",
      tags: extraData.tags || [],
      favorite: !!extraData.favorite,
      wardrobeSubtab: extraData.wardrobeSubtab || "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    if (this.tabId === CLOTHES_TAB_ID) {
      const items = getClothesImages(this.actor);
      items.push(img);
      await saveClothesImages(this.actor, items);
    } else if (this.tabId === VIDEO_TAB_ID) {
      const items = getVideoItems(this.actor);
      items.push(img);
      await saveVideoItems(this.actor, items);
    } else {
      const tabs = getTabs(this.actor);
      const tab = tabs.find(t => t.id === this.tabId);
      if (tab) {
        tab.images = tab.images || [];
        tab.images.push(img);
        await saveTabs(this.actor, tabs);
      }
    }

    ui.notifications.info("Image added.");
    this._refreshGrid();
    _refreshGallery(this.actor);
  }
}


/* ------------------------------------------------------------------ */
/*  ADD / EDIT IMAGE DIALOG                                            */
/* ------------------------------------------------------------------ */

/**
 * Open a dialog to add or edit an image.
 * @param {Object} opts
 * @param {Actor} opts.actor
 * @param {string} opts.tabId
 * @param {string} opts.mode — "add" or "edit"
 * @param {string} [opts.imgId] — for edit mode
 * @param {Function} [opts.onSave]
 */
function _openImageDialog({ actor, tabId, mode, imgId, onSave }) {
  const isAdd = mode === "add";
  let img = null;

  const allTabsPromise = getTabs(actor);
  const clothesPromise = getClothesImages(actor);

  Promise.all([allTabsPromise, clothesPromise]).then(([tabs, clothes]) => {
    // Collect all tags for autocomplete
    const allTags = new Set();
    tabs.forEach(t => (t.images || []).forEach(i => (i.tags || []).forEach(tag => allTags.add(tag))));
    clothes.forEach(i => (i.tags || []).forEach(tag => allTags.add(tag)));
    const tagSuggestions = Array.from(allTags).sort();

    if (!isAdd && imgId) {
      for (const t of tabs) {
        img = (t.images || []).find(i => i.id === imgId);
        if (img) break;
      }
      if (!img) img = clothes.find(i => i.id === imgId);
      if (!img) {
        const videos = []; // We don't have videos tags but try anyway
        // Actually videos aren't stored with full image data, skip
      }
    }

    const data = isAdd
      ? { url: "", name: "", caption: "", note: "", tags: [], favorite: false }
      : { url: img?.url || "", name: img?.name || "", caption: img?.caption || "",
          note: img?.note || "", tags: [...(img?.tags || [])], favorite: !!img?.favorite };

    const tagsHtml = (data.tags || []).map((tag, idx) => `
      <span class="cgt-tag-pill" data-idx="${idx}">
        ${esc(tag)}
        <button type="button" class="cgt-tag-remove" data-idx="${idx}" title="Remove">&times;</button>
      </span>
    `).join("");

    const content = `
      <form class="cgt-dialog-form cgt-image-dialog" data-cgt-img-mode="${mode}">
        <div class="form-group">
          <label>Image URL ${isAdd ? "" : "(read-only)"}</label>
          <input type="text" name="url" value="${esc(data.url)}" ${isAdd ? "" : "readonly"}
                 placeholder="https://example.com/image.jpg" />
          ${isAdd ? `<button type="button" class="cgt-btn-check" data-action="check-url"><i class="fa-solid fa-check"></i> Check</button>` : ""}
        </div>
        <div class="form-group">
          <label>Title</label>
          <input type="text" name="name" value="${esc(data.name)}" placeholder="Image title" />
        </div>
        <div class="form-group">
          <label>Caption</label>
          <input type="text" name="caption" value="${esc(data.caption)}" placeholder="Short caption" />
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea name="note" rows="3" placeholder="Additional notes">${esc(data.note)}</textarea>
        </div>
        <div class="form-group">
          <label>Favorite</label>
          <input type="checkbox" name="favorite" ${data.favorite ? "checked" : ""} />
        </div>
        <div class="form-group cgt-tag-group">
          <label>Tags</label>
          <div class="cgt-tag-input-wrap">
            <input type="text" class="cgt-tag-input" placeholder="Add tag..." list="cgt-tag-suggestions" />
            <datalist id="cgt-tag-suggestions">
              ${tagSuggestions.map(t => `<option value="${esc(t)}">`).join("")}
            </datalist>
            <button type="button" class="cgt-btn-add-tag"><i class="fa-solid fa-plus"></i></button>
          </div>
          <div class="cgt-tag-pills">${tagsHtml}</div>
          <input type="hidden" name="tags" value="${esc(JSON.stringify(data.tags))}" />
        </div>
        <div class="cgt-img-preview" style="margin-top:8px;max-height:200px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#1a1a2e;border-radius:4px;">
          ${data.url ? `<img src="${esc(data.url)}" style="max-width:100%;max-height:200px;object-fit:contain;" onerror="this.style.display='none'" />` : ""}
        </div>
      </form>`;

    const d = new Dialog({
      title: isAdd ? "Add Image" : "Edit Image",
      content,
      buttons: {
        save: {
          icon: '<i class="fa-solid fa-save"></i>',
          label: isAdd ? "Add" : "Save",
          callback: async (html) => {
            const form = html[0].querySelector("form");
            const fd = new FormDataExtended(form).object;
            const hiddenTags = form.querySelector("input[name='tags']");
            let tags = [];
            try { tags = JSON.parse(hiddenTags?.value || "[]"); } catch { tags = []; }

            const url = fd.url?.trim();
            if (!url) {
              ui.notifications.error("URL is required.");
              return;
            }

            const imageData = {
              url,
              name: fd.name?.trim() || url.split("/").pop()?.split("?")[0] || "Untitled",
              caption: fd.caption?.trim() || "",
              note: fd.note?.trim() || "",
              tags,
              favorite: !!fd.favorite,
              updatedAt: Date.now()
            };

            if (isAdd) {
              imageData.id = randomID();
              imageData.createdAt = Date.now();
              await _addImageToTab(actor, tabId, normalizeImageData(imageData));
            } else {
              imageData.id = imgId;
              imageData.createdAt = img?.createdAt || Date.now();
              await _updateImageInTab(actor, tabId, normalizeImageData(imageData));
            }

            ui.notifications.info(isAdd ? "Image added." : "Image updated.");
            if (onSave) onSave();
          }
        },
        cancel: { icon: '<i class="fa-solid fa-times"></i>', label: "Cancel" }
      },
      default: "save",
      render: (html) => {
        const form = html[0].querySelector("form");
        const tagInput = form.querySelector(".cgt-tag-input");
        const addTagBtn = form.querySelector(".cgt-btn-add-tag");
        const pillsContainer = form.querySelector(".cgt-tag-pills");
        const hiddenTags = form.querySelector("input[name='tags']");
        let currentTags = [...(data.tags || [])];

        function renderPills() {
          pillsContainer.innerHTML = currentTags.map((tag, idx) => `
            <span class="cgt-tag-pill" data-idx="${idx}">
              ${esc(tag)}
              <button type="button" class="cgt-tag-remove" data-idx="${idx}" title="Remove">&times;</button>
            </span>
          `).join("");
          hiddenTags.value = JSON.stringify(currentTags);
        }

        function addTag(tag) {
          tag = tag.trim().toLowerCase();
          if (!tag) return;
          if (currentTags.includes(tag)) return;
          currentTags.push(tag);
          renderPills();
          tagInput.value = "";
        }

        tagInput?.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addTag(tagInput.value);
          }
        });

        addTagBtn?.addEventListener("click", () => {
          addTag(tagInput.value);
        });

        pillsContainer?.addEventListener("click", (e) => {
          const btn = e.target.closest(".cgt-tag-remove");
          if (!btn) return;
          const idx = Number(btn.dataset.idx);
          currentTags.splice(idx, 1);
          renderPills();
        });

        // Check URL button
        const checkBtn = form.querySelector("[data-action='check-url']");
        if (checkBtn) {
          checkBtn.addEventListener("click", () => {
            const url = form.querySelector("input[name='url']")?.value?.trim();
            if (!url) return;
            const preview = form.querySelector(".cgt-img-preview");
            preview.innerHTML = `<img src="${esc(url)}" style="max-width:100%;max-height:200px;object-fit:contain;" onerror="this.parentElement.innerHTML='<span style=\\'color:#888;padding:16px\\'>Failed to load image</span>'" />`;
          });
        }

        // Live preview on URL change
        const urlInput = form.querySelector("input[name='url']");
        if (urlInput && isAdd) {
          urlInput.addEventListener("change", () => {
            const url = urlInput.value.trim();
            if (!url) return;
            const preview = form.querySelector(".cgt-img-preview");
            preview.innerHTML = `<img src="${esc(url)}" style="max-width:100%;max-height:200px;object-fit:contain;" onerror="this.style.display='none'" />`;
          });
        }
      }
    });
    d.render(true);
  });
}

/* ------------------------------------------------------------------ */
/*  IMAGE CRUD HELPERS                                                 */
/* ------------------------------------------------------------------ */

async function _addImageToTab(actor, tabId, imageData) {
  if (tabId === CLOTHES_TAB_ID) {
    const items = getClothesImages(actor);
    items.push(imageData);
    await saveClothesImages(actor, items);
  } else if (tabId === VIDEO_TAB_ID) {
    const items = getVideoItems(actor);
    items.push(imageData);
    await saveVideoItems(actor, items);
  } else {
    const tabs = getTabs(actor);
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      tab.images = tab.images || [];
      tab.images.push(imageData);
      await saveTabs(actor, tabs);
    }
  }
}

async function _updateImageInTab(actor, tabId, imageData) {
  // Find the image across all sources and update it
  const tabs = getTabs(actor);
  for (const t of tabs) {
    const idx = (t.images || []).findIndex(i => i.id === imageData.id);
    if (idx >= 0) {
      t.images[idx] = imageData;
      await saveTabs(actor, tabs);
      return;
    }
  }
  const clothes = getClothesImages(actor);
  const cIdx = clothes.findIndex(i => i.id === imageData.id);
  if (cIdx >= 0) {
    clothes[cIdx] = imageData;
    await saveClothesImages(actor, clothes);
    return;
  }
  const videos = getVideoItems(actor);
  const vIdx = videos.findIndex(i => i.id === imageData.id);
  if (vIdx >= 0) {
    videos[vIdx] = imageData;
    await saveVideoItems(actor, videos);
  }
}

/* ------------------------------------------------------------------ */
/*  SHARE DIALOG                                                       */
/* ------------------------------------------------------------------ */

function _openShareDialog(src, title) {
  const users = game.users.filter(u => !u.isSelf && u.active);
  if (!users.length) {
    ui.notifications.warn("No other active users to share with.");
    return;
  }

  const content = `
    <form class="cgt-dialog-form">
      <div class="form-group">
        <label>Share Mode</label>
        <select name="shareMode">
          <option value="all">All Players</option>
          <option value="select">Selected Players</option>
        </select>
      </div>
      <div class="form-group cgt-user-select" style="display:none;">
        <label>Select Users</label>
        <div class="cgt-user-list">
          ${users.map(u => `
            <label class="cgt-user-check">
              <input type="checkbox" name="userIds" value="${u.id}" />
              ${esc(u.name)}
            </label>
          `).join("")}
        </div>
      </div>
      <div class="form-group cgt-checkbox">
        <input type="checkbox" name="sendToGM" id="share-gm" checked />
        <label for="share-gm">Also notify GM</label>
      </div>
    </form>`;

  const d = new Dialog({
    title: "Share Image",
    content,
    buttons: {
      share: {
        icon: '<i class="fa-solid fa-share-nodes"></i>',
        label: "Share",
        callback: async (html) => {
          const form = html[0].querySelector("form");
          const fd = new FormDataExtended(form).object;
          const shareMode = fd.shareMode || "all";
          const sendToGM = !!fd.sendToGM;
          let userIds = [];
          if (shareMode === "select") {
            const checkboxes = form.querySelectorAll("input[name='userIds']:checked");
            userIds = Array.from(checkboxes).map(cb => cb.value);
            if (!userIds.length) {
              ui.notifications.warn("No users selected.");
              return;
            }
          } else {
            userIds = users.map(u => u.id);
          }

          _shareImageToPlayers(src, title, userIds, sendToGM);
        }
      },
      cancel: { icon: '<i class="fa-solid fa-times"></i>', label: "Cancel" }
    },
    default: "share",
    render: (html) => {
      const form = html[0].querySelector("form");
      const modeSelect = form.querySelector("[name='shareMode']");
      const userSelect = form.querySelector(".cgt-user-select");
      modeSelect?.addEventListener("change", () => {
        userSelect.style.display = modeSelect.value === "select" ? "" : "none";
      });
    }
  });
  d.render(true);
}

function _shareImageToPlayers(src, title, userIds, sendToGM = true) {
  if (!game.socket) {
    ui.notifications.error("Socket not available.");
    return;
  }

  const payload = {
    type: "showImage",
    src,
    title: title || "Shared Image",
    userIds: userIds || [],
    senderId: game.user.id,
    senderName: game.user.name,
    shareMode: userIds?.length ? "select" : "all",
    sendToGM: sendToGM !== false
  };

  game.socket.emit("module.cypher-gallery-tabs", payload);

  if (sendToGM && !game.user.isGM) {
    const gmUsers = game.users.filter(u => u.isGM && u.active);
    gmUsers.forEach(gm => {
      gm.sendWhisper({
        content: `<p><strong>${esc(game.user.name)}</strong> shared an image with players: <a href="${esc(src)}" target="_blank">${esc(title || "Image")}</a></p>`
      });
    });
  }

  ui.notifications.info("Image shared with selected players.");
}

/* ------------------------------------------------------------------ */
/*  SOCKET HANDLER                                                     */
/* ------------------------------------------------------------------ */

export function initGallerySocket() {
  try {
    _injectGalleryCSS();
  } catch (e) {
    console.error("[cypher-taskbar] CSS injection failed:", e);
  }

  if (!game.socket) return;

  game.socket.on("module.cypher-gallery-tabs", (data) => {
    if (!data || data.type !== "showImage") return;

    // Only show if we're in the target users list (or if it's "all" and we're a player)
    const isTarget = !data.userIds?.length || data.userIds.includes(game.user.id);
    if (!isTarget) return;

    // GM gets a chat message instead of popup if sendToGM is true
    if (game.user.isGM && data.sendToGM) {
      ChatMessage.create({
        content: `<div class="cgt-share-notice">
          <p><i class="fa-solid fa-share-nodes"></i> <strong>${esc(data.senderName)}</strong> shared an image:</p>
          <p><a href="${esc(data.src)}" target="_blank">${esc(data.title || "Image")}</a></p>
          <img src="${esc(data.src)}" style="max-width:200px;max-height:150px;border-radius:4px;" onerror="this.style.display='none'" />
        </div>`,
        whisper: [game.user.id]
      });
      return;
    }

    // Show lightbox for the shared image
    _showSharedImageLightbox(data.src, data.title);
  });
}

function destroyLightbox(lb) {
  if (!lb) return;
  lb._cgtCleanup?.();
  document.getElementById("cgt-ctx-menu")?.remove();
  if (lb.isConnected) lb.remove();
}

function closeExistingLightbox() {
  destroyLightbox(document.getElementById("cgt-lightbox"));
}

/**
 * Open a lightbox for a single image.
 * Matches the original cypher-gallery-tabs openLightboxBase exactly.
 */
function openLightboxBase(src, title, {
  caption = "",
  note = "",
  tags = [],
  sourceLine = "",
  onContextMenu = null
} = {}) {
  closeExistingLightbox();

  const titleText = String(title ?? "").trim();
  const captionText = String(caption ?? "").trim();
  const noteText = String(note ?? "").trim();
  const sourceText = String(sourceLine ?? "").trim();
  const tagList = normalizeTagsInput(tags);

  const metaHtml = (titleText || captionText || noteText || tagList.length || sourceText) ? `
    <div class="cgt-lb-meta">
      ${titleText ? `<div class="cgt-lb-row cgt-lb-title">${esc(titleText)}</div>` : ""}
      ${captionText ? `<div class="cgt-lb-row cgt-lb-caption">${esc(captionText)}</div>` : ""}
      ${noteText ? `<div class="cgt-lb-row cgt-lb-note">${esc(noteText)}</div>` : ""}
      ${tagList.length ? `<div class="cgt-lb-row cgt-lb-tags">${tagList.map(tag => `<span class="cgt-lb-tag">${esc(tag)}</span>`).join("")}</div>` : ""}
      ${sourceText ? `<div class="cgt-lb-row cgt-lb-source">${esc(sourceText)}</div>` : ""}
    </div>
  ` : "";

  const lb = document.createElement("div");
  lb.id = "cgt-lightbox";
  lb.className = "cgt-lightbox";
  lb.innerHTML = `
    <div class="cgt-lb-stage">
      <div class="cgt-lb-controls">
        <button
          type="button"
          class="cgt-lb-btn cgt-lb-reset"
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
        >100%</button>

        <button
          type="button"
          class="cgt-lb-btn cgt-lb-drag"
          aria-label="Drag image to menu"
          title="Drag image to People/Places/Assets/Secrets"
          draggable="true"
        >
          <i class="fa-solid fa-hand-paper" style="color:#4a9eff;"></i>
        </button>

        <button
          type="button"
          class="cgt-lb-btn cgt-lb-close"
          aria-label="Close image"
          title="Close image"
        >
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <img src="${esc(src)}" alt="${esc(title)}" class="cgt-lb-img" id="cgt-lb-img" />
      ${metaHtml}
    </div>
  `;

  const onKey = (e) => {
    if (e.key === "Escape") destroyLightbox(lb);
  };

  lb._cgtCleanup = () => {
    document.removeEventListener("keydown", onKey);
  };

  document.addEventListener("keydown", onKey);

  lb.addEventListener("click", (e) => {
    if (
      !e.target.closest(".cgt-lb-img") &&
      !e.target.closest(".cgt-lb-meta") &&
      !e.target.closest(".cgt-lb-btn")
    ) {
      destroyLightbox(lb);
    }
  });

  const closeBtn = lb.querySelector(".cgt-lb-close");
  const dragBtn = lb.querySelector(".cgt-lb-drag");
  const resetBtn = lb.querySelector(".cgt-lb-reset");
  const imgEl = lb.querySelector("#cgt-lb-img");

  const minScale = Math.max(
    0.05,
    Number(game.settings?.get(GALLERY_MODULE_ID, "lightboxMaxZoomOut") ?? 50) / 100
  );

  const maxScale = Math.max(
    1,
    minScale,
    Number(game.settings?.get(GALLERY_MODULE_ID, "lightboxMaxZoomIn") ?? 150) / 100
  );

  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;

  const clampScale = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return scale;
    return Math.min(maxScale, Math.max(minScale, n));
  };

  const resetPan = () => {
    offsetX = 0;
    offsetY = 0;
  };

  const applyTransform = () => {
    imgEl.style.setProperty("--cgt-lb-scale", String(scale));
    imgEl.style.setProperty("--cgt-lb-x", `${offsetX}px`);
    imgEl.style.setProperty("--cgt-lb-y", `${offsetY}px`);

    const pannable = scale > 1.001;
    imgEl.classList.toggle("cgt-is-pannable", pannable);

    const isDefaultView =
      Math.abs(scale - 1) < 0.001 &&
      Math.abs(offsetX) < 0.5 &&
      Math.abs(offsetY) < 0.5;

    resetBtn.disabled = isDefaultView;
    resetBtn.setAttribute("aria-disabled", isDefaultView ? "true" : "false");
  };

  const setScale = (value) => {
    scale = clampScale(Math.round(Number(value) * 100) / 100);
    if (scale <= 1.001) {
      scale = 1;
      resetPan();
    }
    applyTransform();
  };

  const endDrag = () => {
    dragPointerId = null;
    imgEl.classList.remove("cgt-is-dragging");
  };

  closeBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    destroyLightbox(lb);
  });

  // Drag hand: close lightbox on drag, keep image data for drop
  dragBtn?.addEventListener("dragstart", (e) => {
    e.stopPropagation();
    const payload = { uuid: null, name: titleText || "Image", img: src, type: "Image" };
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
    // Close the lightbox after a brief delay so drag continues
    requestAnimationFrame(() => destroyLightbox(lb));
  });
  dragBtn?.addEventListener("mousedown", (e) => e.stopPropagation());

  resetBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    scale = 1;
    resetPan();
    applyTransform();
  });

  imgEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const step = e.deltaY < 0 ? 0.10 : -0.10;
    setScale(scale + step);
  }, { passive: false });

  imgEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (scale <= 1.001) return;

    e.preventDefault();
    e.stopPropagation();

    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragOriginX = offsetX;
    dragOriginY = offsetY;

    imgEl.classList.add("cgt-is-dragging");
    imgEl.setPointerCapture?.(dragPointerId);
  });

  imgEl.addEventListener("pointermove", (e) => {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return;
    e.preventDefault();
    e.stopPropagation();
    offsetX = dragOriginX + (e.clientX - dragStartX);
    offsetY = dragOriginY + (e.clientY - dragStartY);
    applyTransform();
  });

  const finishPointerDrag = (e) => {
    if (dragPointerId === null) return;
    if (e.pointerId !== dragPointerId) return;
    try {
      imgEl.releasePointerCapture?.(dragPointerId);
    } catch (_) {}
    endDrag();
  };

  imgEl.addEventListener("pointerup", finishPointerDrag);
  imgEl.addEventListener("pointercancel", finishPointerDrag);
  imgEl.addEventListener("lostpointercapture", () => endDrag());

  imgEl.addEventListener("error", () => {
    ui.notifications.error("The image could not be loaded.");
    destroyLightbox(lb);
  });

  if (onContextMenu) {
    imgEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu(e, lb);
    });
  }

  applyTransform();
  document.body.appendChild(lb);
  return lb;
}

function _showSharedImageLightbox(src, title) {
  openLightboxBase(src, title || "Shared Image", {
    onContextMenu: (e, lb) => {
      document.getElementById("cgt-ctx-menu")?.remove();

      const menu = document.createElement("div");
      menu.id = "cgt-ctx-menu";
      menu.className = "cgt-ctx-menu";

      const pos = clampMenuToViewport(e.clientX, e.clientY, 182, 96);
      menu.style.left = `${pos.x}px`;
      menu.style.top = `${pos.y}px`;

      menu.innerHTML = `
        <div class="cgt-ctx-item js-ctx-show">
          <i class="fa-solid fa-eye"></i> Show Image
        </div>
        <div class="cgt-ctx-item js-ctx-close">
          <i class="fa-solid fa-xmark"></i> Close Image
        </div>
      `;

      document.body.appendChild(menu);

      menu.querySelector(".js-ctx-show")?.addEventListener("click", () => {
        menu.remove();
        _openShowToPlayersDialogFromLightbox(src, title);
      });

      menu.querySelector(".js-ctx-close")?.addEventListener("click", () => {
        menu.remove();
        destroyLightbox(lb);
      });

      setTimeout(() => {
        document.addEventListener("click", () => menu.remove(), { once: true });
      }, 0);
    }
  });
}

function _openShowToPlayersDialogFromLightbox(src, title) {
  // Find current image data from any open panel
  const panel = document.querySelector(".cgt-panel");
  if (panel) {
    // If a panel is open, try to find the image
    const imgEl = panel.querySelector(`[data-src="${src}"]`);
    if (imgEl) {
      const imgId = imgEl.closest("[data-img-id]")?.dataset.imgId;
      if (imgId) {
        // Get the panel instance and share
        for (const p of openPanels.values()) {
          if (!p._closed) { p._shareImage(imgId); return; }
        }
      }
    }
  }
  // Fallback: basic share with just URL
  const img = { url: src, name: title || "Image", caption: "", note: "" };
  _showShareDialog(img, null);
}


/* ------------------------------------------------------------------ */
/*  GALLERY PANEL — additional methods (append to class)               */
/* ------------------------------------------------------------------ */

// Set _currentImages during initial render
const _originalRender = GalleryPanel.prototype.render;
GalleryPanel.prototype.render = async function(open = true) {
  if (!open) return;
  // Resolve images early so _currentImages is available
  const { images } = await this._resolveTabData();
  this._currentImages = images;
  return _originalRender.call(this, open);
};

// Ensure cleanup removes global listeners
const _originalClose = GalleryPanel.prototype.close;
GalleryPanel.prototype.close = function() {
  if (this._escHandler) {
    document.removeEventListener("keydown", this._escHandler);
    this._escHandler = null;
  }
  if (this._clickOutsideHandler) {
    document.removeEventListener("click", this._clickOutsideHandler);
    this._clickOutsideHandler = null;
  }
  return _originalClose.call(this);
};

/* ------------------------------------------------------------------ */
/*  CSS INJECTION                                                      */
/* ------------------------------------------------------------------ */

const GALLERY_CSS = `
/* ── Gallery Strip ── */
.cgt-strip-wrapper {
  position: absolute;
  bottom: var(--ct-height, 48px);
  right: 0;
  transform: translateX(calc(var(--ct-gallery-offset-x, 0%) * -1));
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  padding: 3px 6px;
  z-index: 100;
  pointer-events: auto;
}
.cgt-strip-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: transform 0.1s, opacity 0.15s;
  padding: 0;
}
.cgt-strip-btn:hover { transform: scale(1.08); opacity: 0.9; }
.cgt-strip-btn i { font-size: 14px; }
.cgt-strip-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #e74c3c;
  color: #fff;
  font-size: 9px;
  font-weight: bold;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  pointer-events: none;
}

/* ── Gallery Panel ── */
.cgt-panel {
  background: rgba(20, 20, 35, 0.96);
  border: 1px solid rgba(100, 100, 140, 0.3);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--font-primary), sans-serif;
  color: #e0e0e0;
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.cgt-panel-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px 12px 6px;
  border-bottom: 1px solid rgba(100, 100, 140, 0.2);
  flex-shrink: 0;
}
.cgt-panel-titlebar { flex: 1; min-width: 0; }
.cgt-panel-titlebar h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #f0e6d3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cgt-panel-subtitle {
  font-size: 11px;
  color: #888;
  margin-top: 2px;
  display: block;
}
.cgt-panel-float {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.cgt-float-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(80, 80, 120, 0.4);
  color: #c0c0d0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s;
}
.cgt-float-btn:hover { background: rgba(100, 100, 150, 0.6); }
.cgt-float-btn.cgt-float-close:hover { background: rgba(180, 60, 60, 0.6); }
.cgt-float-btn i { font-size: 12px; }

/* ── Flyout Panels ── */
.cgt-panel-panels { position: relative; flex-shrink: 0; }
.cgt-flyout {
  display: none;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(100, 100, 140, 0.2);
  background: rgba(15, 15, 30, 0.9);
}
.cgt-flyout.active { display: block; }
.cgt-flyout-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #a0a0c0;
  margin-bottom: 6px;
}
.cgt-flyout-body { display: flex; flex-direction: column; gap: 4px; }

/* Sort */
.cgt-sort-btn {
  background: rgba(60, 60, 90, 0.5);
  border: 1px solid rgba(100, 100, 140, 0.2);
  border-radius: 4px;
  color: #c0c0d0;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  transition: background 0.15s;
}
.cgt-sort-btn:hover { background: rgba(80, 80, 120, 0.6); }
.cgt-sort-btn.active { background: rgba(44, 111, 173, 0.5); border-color: #2c6fad; }

/* Info */
.cgt-help-text p { margin: 2px 0; font-size: 12px; color: #b0b0c0; }
.cgt-help-text strong { color: #d0d0e0; }

/* Filter */
.cgt-filter-search { position: relative; }
.cgt-filter-search input {
  width: 100%;
  background: rgba(30, 30, 50, 0.8);
  border: 1px solid rgba(100, 100, 140, 0.3);
  border-radius: 4px;
  padding: 4px 28px 4px 8px;
  color: #e0e0e0;
  font-size: 12px;
}
.cgt-filter-search i {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: #888;
  font-size: 11px;
}
.cgt-filter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.cgt-filter-tags .cgt-tag-chip {
  background: rgba(60, 60, 90, 0.5);
  border: 1px solid rgba(100, 100, 140, 0.25);
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 11px;
  color: #b0b0c0;
  cursor: pointer;
  transition: all 0.15s;
}
.cgt-filter-tags .cgt-tag-chip:hover { background: rgba(80, 80, 120, 0.6); }
.cgt-filter-tags .cgt-tag-chip.active { background: rgba(44, 111, 173, 0.5); border-color: #2c6fad; color: #d0e0f0; }

/* Options */
.cgt-opt-buttons {
  display: flex;
  gap: 6px;
  margin-bottom: 6px;
}
.cgt-opt-buttons button {
  flex: 1;
  background: rgba(44, 111, 173, 0.5);
  border: 1px solid rgba(44, 111, 173, 0.4);
  border-radius: 4px;
  color: #d0e0f0;
  padding: 5px 8px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}
.cgt-opt-buttons button:hover { background: rgba(44, 111, 173, 0.7); }
.cgt-opt-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 3px 0;
}
.cgt-opt-group label {
  font-size: 11px;
  color: #a0a0c0;
  min-width: 60px;
}
.cgt-opt-group select {
  flex: 1;
  background: rgba(30, 30, 50, 0.8);
  border: 1px solid rgba(100, 100, 140, 0.3);
  border-radius: 4px;
  padding: 3px 6px;
  color: #e0e0e0;
  font-size: 11px;
}
.cgt-opt-segment {
  display: flex;
  gap: 2px;
}
.cgt-opt-segment button {
  background: rgba(50, 50, 80, 0.5);
  border: 1px solid rgba(100, 100, 140, 0.2);
  border-radius: 3px;
  color: #b0b0c0;
  padding: 2px 8px;
  font-size: 11px;
  cursor: pointer;
}
.cgt-opt-segment button.active { background: rgba(44, 111, 173, 0.5); border-color: #2c6fad; color: #d0e0f0; }
.cgt-opt-checks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.cgt-opt-checks label {
  font-size: 11px;
  color: #b0b0c0;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.cgt-opt-count {
  text-align: right;
  font-size: 11px;
  color: #888;
  margin-top: 4px;
}

/* ── Wardrobe Tabs ── */
.cgt-wardrobe-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 6px;
}
.cgt-wardrobe-tab {
  background: rgba(50, 50, 80, 0.4);
  border: 1px solid rgba(100, 100, 140, 0.2);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 10px;
  color: #b0b0c0;
  cursor: pointer;
  transition: all 0.15s;
}
.cgt-wardrobe-tab:hover { background: rgba(70, 70, 110, 0.5); }
.cgt-wardrobe-tab.active { background: rgba(138, 90, 58, 0.6); border-color: #8a5a3a; color: #f0e6d3; }

/* ── Grid ── */
.cgt-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols, 3), 1fr);
  gap: var(--gap, 8px);
  padding: 10px 12px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.cgt-grid[data-fit="cover"] .cgt-item-media img,
.cgt-grid[data-fit="cover"] .cgt-item-media video { object-fit: cover; }
.cgt-grid[data-fit="contain"] .cgt-item-media img,
.cgt-grid[data-fit="contain"] .cgt-item-media video { object-fit: contain; }
.cgt-grid[data-fit="natural"] .cgt-item-media img,
.cgt-grid[data-fit="natural"] .cgt-item-media video { object-fit: scale-down; }
.cgt-grid-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
}
.cgt-empty-msg {
  color: #666;
  font-size: 13px;
  font-style: italic;
}

/* ── Grid Item ── */
.cgt-item {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(30, 30, 50, 0.5);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}
.cgt-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.cgt-item.dragging { opacity: 0.4; }
.cgt-item.drag-over { outline: 2px dashed #2c6fad; outline-offset: -2px; }
.cgt-item.favorited .cgt-item-veil { border: 2px solid rgba(231, 76, 60, 0.5); }
.cgt-item-media {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: #151525;
}
.cgt-item-media img,
.cgt-item-media video {
  width: 100%;
  height: 100%;
  display: block;
}
.cgt-item-veil {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 50%);
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}
.cgt-item:hover .cgt-item-veil { opacity: 1; }
.cgt-item-tools {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 3px;
  opacity: 0;
  transition: opacity 0.2s;
}
.cgt-item:hover .cgt-item-tools { opacity: 1; }
.cgt-tool-btn {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(0,0,0,0.5);
  color: #e0e0e0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 10px;
}
.cgt-tool-btn:hover { background: rgba(44, 111, 173, 0.7); }
.cgt-item-meta {
  padding: 5px 7px;
  font-size: 11px;
}
.cgt-item-name {
  font-weight: 600;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cgt-item-caption {
  color: #a0a0c0;
  font-size: 10px;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cgt-item-note {
  color: #888;
  font-size: 10px;
  margin-top: 1px;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cgt-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 3px;
}
.cgt-tag-chip-sm {
  background: rgba(44, 111, 173, 0.3);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 9px;
  color: #90b0d0;
}

/* Hide toggles */
.cgt-grid.hideNames .cgt-item-name { display: none; }
.cgt-grid.hideCaptions .cgt-item-caption { display: none; }
.cgt-grid.hideNotes .cgt-item-note { display: none; }
.cgt-grid.hideTags .cgt-item-tags { display: none; }

/* ── Context Menu ── */
.cgt-context-menu {
  position: fixed;
  background: rgba(25, 25, 45, 0.98);
  border: 1px solid rgba(100, 100, 140, 0.3);
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
  z-index: 10000;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  backdrop-filter: blur(8px);
}
.cgt-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #d0d0e0;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.1s;
}
.cgt-ctx-item:hover { background: rgba(60, 60, 100, 0.5); }
.cgt-ctx-item.disabled { opacity: 0.4; pointer-events: none; }
.cgt-ctx-item i { width: 14px; text-align: center; font-size: 11px; }
.cgt-ctx-danger { color: #e74c3c; }
.cgt-ctx-danger:hover { background: rgba(231, 76, 60, 0.2); }
.cgt-ctx-sep {
  height: 1px;
  background: rgba(100, 100, 140, 0.2);
  margin: 3px 6px;
}
.cgt-ctx-submenu { position: relative; }
.cgt-ctx-submenu-popup {
  display: none;
  position: absolute;
  left: 100%;
  top: 0;
  background: rgba(25, 25, 45, 0.98);
  border: 1px solid rgba(100, 100, 140, 0.3);
  border-radius: 8px;
  padding: 4px;
  min-width: 140px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
}
.cgt-ctx-submenu:hover .cgt-ctx-submenu-popup { display: block; }
.cgt-ctx-has-sub {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.cgt-ctx-main {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cgt-ctx-caret {
  font-size: 10px;
  opacity: 0.5;
  margin-left: 4px;
}
.cgt-ctx-has-sub:hover .cgt-ctx-caret { opacity: 1; }

/* ── Lightbox ── */
/* ══════════ LIGHTBOX (matches original cypher-gallery-tabs) ══════════ */
.cgt-lightbox {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99990;
  cursor: zoom-out;
  isolation: isolate;
}
.cgt-lightbox::before {
  content: "";
  position: absolute;
  inset: 0;
  background: transparent;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  pointer-events: none;
}
.cgt-lb-stage {
  position: relative;
  z-index: 1;
  max-width: 92vw;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.cgt-lb-img {
  --cgt-lb-scale: 1;
  --cgt-lb-x: 0px;
  --cgt-lb-y: 0px;
  max-width: 90vw;
  max-height: calc(90vh - 110px);
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 0 80px rgba(0, 0, 0, 0.90);
  cursor: context-menu;
  user-select: none;
  -webkit-user-drag: none;
  touch-action: none;
  transform: translate(var(--cgt-lb-x), var(--cgt-lb-y)) scale(var(--cgt-lb-scale));
  transform-origin: center center;
  transition: transform 0.08s ease;
  will-change: transform;
}
.cgt-lb-img.cgt-is-pannable { cursor: grab; }
.cgt-lb-img.cgt-is-dragging {
  cursor: grabbing;
  transition: none;
}
.cgt-lb-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  gap: 8px;
}
.cgt-lb-btn {
  min-width: 30px;
  height: 30px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  background: rgba(10, 12, 22, 0.84);
  color: #ffffff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.14s ease, transform 0.14s ease, opacity 0.14s ease;
}
.cgt-lb-btn:hover {
  background: rgba(40, 48, 78, 0.94);
  border-color: rgba(255, 255, 255, 0.28);
  transform: translateY(-1px);
}
.cgt-lb-btn:disabled,
.cgt-lb-btn[aria-disabled="true"] {
  opacity: 0.55;
  cursor: default;
  transform: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.cgt-lb-reset {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.cgt-lb-drag {
  padding: 0;
  min-width: 30px;
  width: 30px;
  cursor: grab;
  color: #4a9eff;
}
.cgt-lb-drag:hover {
  color: #6bb8ff;
  border-color: rgba(74, 158, 255, 0.45);
}
.cgt-lb-drag:active {
  cursor: grabbing;
}
.cgt-lb-drag i {
  font-size: 13px;
  pointer-events: none;
}
.cgt-lb-meta {
  position: absolute;
  left: calc(100% + 14px);
  right: auto;
  bottom: 18px;
  width: min(340px, 28vw);
  max-width: min(340px, calc(100vw - 48px));
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.56);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
  color: #ffffff;
  cursor: default;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.cgt-lb-row + .cgt-lb-row { margin-top: 6px; }
.cgt-lb-title {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.4;
}
.cgt-lb-caption {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #d8b3b3;
  text-transform: uppercase;
}
.cgt-lb-note {
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
  white-space: pre-wrap;
  word-break: break-word;
}
.cgt-lb-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cgt-lb-tag {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(100, 160, 255, 0.12);
  border: 1px solid rgba(120, 170, 255, 0.18);
  color: rgba(200, 220, 255, 0.85);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}
.cgt-lb-source {
  font-size: 11px;
  color: rgba(200, 169, 110, 0.72);
}

/* ── Dialog Forms ── */
.cgt-dialog-form .form-group {
  margin: 6px 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.cgt-dialog-form .form-group > label {
  font-size: 12px;
  font-weight: 600;
  color: #b0b0c0;
}
.cgt-dialog-form .form-group input[type="text"],
.cgt-dialog-form .form-group input[type="number"],
.cgt-dialog-form .form-group select,
.cgt-dialog-form .form-group textarea {
  background: rgba(30, 30, 50, 0.8);
  border: 1px solid rgba(100, 100, 140, 0.3);
  border-radius: 4px;
  padding: 5px 8px;
  color: #e0e0e0;
  font-size: 12px;
}
.cgt-dialog-form .form-group input[type="color"] {
  width: 48px;
  height: 28px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.cgt-dialog-form .form-group input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #2c6fad;
}
.cgt-dialog-form .cgt-checkbox {
  flex-direction: row !important;
  align-items: center;
  gap: 6px;
}
.cgt-dialog-form .cgt-checkbox label { font-weight: normal !important; }

/* Tag editor in dialog */
.cgt-tag-group .cgt-tag-input-wrap {
  display: flex;
  gap: 4px;
}
.cgt-tag-group .cgt-tag-input {
  flex: 1;
}
.cgt-btn-add-tag {
  width: 28px;
  border: none;
  border-radius: 4px;
  background: rgba(44, 111, 173, 0.5);
  color: #e0e0e0;
  cursor: pointer;
}
.cgt-tag-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.cgt-tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(44, 111, 173, 0.3);
  border: 1px solid rgba(44, 111, 173, 0.4);
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 11px;
  color: #90b0d0;
}
.cgt-tag-remove {
  background: none;
  border: none;
  color: #c07070;
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0;
}
.cgt-tag-remove:hover { color: #e74c3c; }

.cgt-btn-check {
  background: rgba(44, 111, 173, 0.5);
  border: 1px solid rgba(44, 111, 173, 0.4);
  border-radius: 4px;
  color: #e0e0e0;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

/* User select in share dialog */
.cgt-user-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 120px;
  overflow-y: auto;
  padding: 4px;
  background: rgba(30, 30, 50, 0.5);
  border-radius: 4px;
}
.cgt-user-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #d0d0e0;
  cursor: pointer;
}

/* Share notice in chat */
.cgt-share-notice {
  background: rgba(30, 30, 50, 0.7);
  border: 1px solid rgba(100, 100, 140, 0.3);
  border-radius: 6px;
  padding: 8px 12px;
}
.cgt-share-notice img { margin-top: 6px; }
`;

/** Inject gallery CSS into the document head */
function _injectGalleryCSS() {
  if (document.getElementById("cgt-gallery-styles")) return;
  const style = document.createElement("style");
  style.id = "cgt-gallery-styles";
  style.textContent = GALLERY_CSS;
  document.head.appendChild(style);
}

// Auto-inject CSS on first panel open
const _originalRenderInject = GalleryPanel.prototype.render;
GalleryPanel.prototype.render = async function(open = true) {
  _injectGalleryCSS();
  return _originalRenderInject.call(this, open);
};

/* ------------------------------------------------------------------ */
/*  EXPORTS                                                            */
/* ------------------------------------------------------------------ */

export { GALLERY_MODULE_ID, MAX_TABS, FAVORITES_TAB_ID, CLOTHES_TAB_ID, VIDEO_TAB_ID };
