/**
 * Cypher Taskbar — Shared Utilities
 */

export const MODULE_ID = "cypher-taskbar";

/** Sanitize limited rich text without preserving scripts, event handlers, or active CSS. */
export function sanitizeHTML(html) {
  if (!html) return "";
  const template = document.createElement("template");
  template.innerHTML = String(html);
  // Native browsers store parsed children in content. Lightweight regression
  // DOMs may expose those children on the template itself instead.
  const content = template.querySelectorAll("*").length ? template : template.content;
  content.querySelectorAll(
    "script, style, iframe, object, embed, video, audio, form, input, select, textarea, button, link, meta, base, svg, math, template"
  ).forEach(element => element.remove());
  content.querySelectorAll("*").forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = String(attribute.value);
      const normalizedUrl = value.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase();
      const unsafeUrl = /^(?:javascript|vbscript):/.test(normalizedUrl)
        || (normalizedUrl.startsWith("data:") && !/^data:image\/(?:png|gif|jpeg|webp);base64,/.test(normalizedUrl));
      if (name.startsWith("on") || ["style", "srcdoc", "srcset", "formaction", "target", "id", "class"].includes(name)
        || (["href", "src", "xlink:href", "action", "poster"].includes(name) && unsafeUrl)) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === "A") element.setAttribute("rel", "noopener noreferrer");
  });
  return template.innerHTML;
}

export function hexToRGBA(hex, alpha) {
  const color = typeof hex === "string" && /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#000000";
  const opacity = Number(alpha);
  const safeAlpha = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${safeAlpha})`;
}

export function readJSONSetting(key, fallback) {
  try {
    const raw = game.settings.get(MODULE_ID, key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

export async function saveJSONSetting(key, value) {
  await game.settings.set(MODULE_ID, key, JSON.stringify(value));
}

export function normalizeColumnCount(value, fallback = 1) {
  const parsed = Number(value);
  const safeFallback = Number.isFinite(Number(fallback)) ? Math.trunc(Number(fallback)) : 1;
  return Math.max(1, Math.min(3, Number.isFinite(parsed) ? Math.trunc(parsed) : safeFallback));
}

export function buildMasonryColumns(sections, columnSettingKey, defaultCols = 1, actorId = null) {
  const count = normalizeColumnCount(getActorPref(actorId, columnSettingKey) ?? game.settings.get(MODULE_ID, columnSettingKey), defaultCols);
  const cols = Array.from({ length: count }, () => ({ height: 0, sections: [] }));
  sections.forEach(section => {
    const targetIndex = cols.reduce((best, col, index, arr) => col.height < arr[best].height ? index : best, 0);
    cols[targetIndex].sections.push(section.html);
    cols[targetIndex].height += section.weight;
  });
  return cols.map(col => `<div class="ct-skill-masonry-column">${col.sections.join("")}</div>`).join("");
}

export function buildAbilitiesMasonryColumns(sections, actorId = null) {
  const count = normalizeColumnCount(getActorPref(actorId, "abilitiesMenuColumns") ?? game.settings.get(MODULE_ID, "abilitiesMenuColumns"));
  const cols = Array.from({ length: count }, () => ({ height: 0, sections: [] }));
  sections.forEach(section => {
    const targetIndex = cols.reduce((best, col, index, arr) => col.height < arr[best].height ? index : best, 0);
    cols[targetIndex].sections.push(section.html);
    cols[targetIndex].height += section.weight;
  });
  return cols.map(col => `<div class="ct-ab-masonry-column">${col.sections.join("")}</div>`).join("");
}

export function buildSpellsMasonryColumns(sections, actorId = null) {
  const count = normalizeColumnCount(getActorPref(actorId, "spellsMenuColumns") ?? game.settings.get(MODULE_ID, "spellsMenuColumns"));
  const cols = Array.from({ length: count }, () => ({ height: 0, sections: [] }));
  sections.forEach(section => {
    const targetIndex = cols.reduce((best, col, i, arr) => col.height < arr[best].height ? i : best, 0);
    cols[targetIndex].sections.push(section.html);
    cols[targetIndex].height += section.weight;
  });
  return cols.map(col => `<div class="ct-sp-masonry-column">${col.sections.join("")}</div>`).join("");
}

export function skillCategoryIconChoices() {
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
}

export function equipmentCategoryIconChoices() {
  return [
    { icon: "", label: "No Icon" },
    { icon: "fas fa-backpack", label: "Backpack" },
    { icon: "fas fa-toolbox", label: "Toolbox" },
    { icon: "fas fa-tools", label: "Tools" },
    { icon: "fas fa-hammer", label: "Hammer" },
    { icon: "fas fa-wrench", label: "Wrench" },
    { icon: "fas fa-cog", label: "Gear" },
    { icon: "fas fa-cogs", label: "Gears" },
    { icon: "fas fa-sword", label: "Sword" },
    { icon: "fas fa-shield-alt", label: "Shield" },
    { icon: "fas fa-key", label: "Key" },
    { icon: "fas fa-lock", label: "Lock" },
    { icon: "fas fa-gem", label: "Gem" },
    { icon: "fas fa-ring", label: "Ring" },
    { icon: "fas fa-scroll", label: "Scroll" },
    { icon: "fas fa-book", label: "Book" },
    { icon: "fas fa-map", label: "Map" },
    { icon: "fas fa-compass", label: "Compass" },
    { icon: "fas fa-flask", label: "Flask" },
    { icon: "fas fa-vial", label: "Vial" },
    { icon: "fas fa-medkit", label: "Medkit" },
    { icon: "fas fa-coins", label: "Coins" },
    { icon: "fas fa-crown", label: "Crown" },
    { icon: "fas fa-cube", label: "Cube" },
    { icon: "fas fa-cubes", label: "Crates" },
    { icon: "fas fa-lightbulb", label: "Light" },
    { icon: "fas fa-magnet", label: "Magnet" },
    { icon: "fas fa-anchor", label: "Anchor" },
    { icon: "fas fa-fire", label: "Torch" },
    { icon: "fas fa-bolt", label: "Power" },
    { icon: "fas fa-snowflake", label: "Cold" },
    { icon: "fas fa-leaf", label: "Herbal" }
  ];
}

export function shadowOffset(dir = "top-left", dist = 14) {
  const map = {
    "top-left": [-dist, -dist], "top-right": [dist, -dist],
    "bottom-left": [-dist, dist], "bottom-right": [dist, dist],
    "top": [0, -dist], "bottom": [0, dist],
    "left": [-dist, 0], "right": [dist, 0]
  };
  return map[dir] ?? map["top-left"];
}

export function bgFitMap(bgFit) {
  const fits = {
    cover: { size: "cover", position: "center center" },
    contain: { size: "contain", position: "center center" },
    fit: { size: "100% 100%", position: "center center" },
    "fit-vertical": { size: "auto 100%", position: "center center" },
    "fit-horizontal": { size: "100% auto", position: "center center" }
  };
  return fits[bgFit] ?? fits.cover;
}

/* ── Per-Actor Preferences ── */

/* ── Per-Actor Preferences (stored on actor flags = cross-browser sync) ── */

const FLAG_SCOPE = MODULE_ID;
const PREF_KEY = "taskbarPrefs";
const BLOCKED_PREF_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function getActorPref(actorId, key, fallback = null) {
  // 1. Check actor-specific override
  if (actorId) {
    const actor = game.actors?.get(actorId);
    if (actor) {
      const prefs = actor.getFlag(FLAG_SCOPE, PREF_KEY) ?? {};
      if (prefs[key] !== undefined) return prefs[key];
    }
  }

  // 2. Check global defaults (if active)
  try {
    const globalActive = game.settings?.get?.(MODULE_ID, "globalTaskbarDefaultsActive");
    if (globalActive) {
      const globalDefaults = readJSONSetting("globalTaskbarDefaultsData", {});
      if (globalDefaults[key] !== undefined) return globalDefaults[key];
    }
  } catch {
    /* settings not ready yet */
  }

  return fallback;
}

export async function setActorPref(actorId, key, value) {
  if (!actorId || typeof key !== "string" || !/^[A-Za-z0-9_-]+$/.test(key) || BLOCKED_PREF_KEYS.has(key)) return false;
  const actor = game.actors?.get(actorId);
  if (!actor?.isOwner) {
    ui.notifications?.warn?.("You do not have permission to change this character's taskbar preferences.");
    return false;
  }
  // Write only the changed leaf. Replacing the whole preference object loses
  // unrelated keys when two panels save concurrently.
  await actor.setFlag(FLAG_SCOPE, `${PREF_KEY}.${key}`, value);
  return true;
}

/** One-time migration: copy old client-scoped actorPreferences to actor flags */
export async function migrateActorPreferences() {
  try {
    const oldPrefs = game.settings.get(MODULE_ID, "actorPreferences");
    if (!oldPrefs || oldPrefs === "{}") return;
    const prefs = typeof oldPrefs === "string" ? JSON.parse(oldPrefs) : oldPrefs;
    let migrated = 0;
    for (const [actorId, actorPrefs] of Object.entries(prefs)) {
      const actor = game.actors?.get(actorId);
      if (!actor?.isOwner) continue;
      const existing = actor.getFlag(FLAG_SCOPE, PREF_KEY) ?? {};
      if (!actorPrefs || typeof actorPrefs !== "object" || Array.isArray(actorPrefs)) continue;
      const safeLegacy = Object.fromEntries(Object.entries(actorPrefs).filter(([key]) => /^[A-Za-z0-9_-]+$/.test(key) && !BLOCKED_PREF_KEYS.has(key)));
      // Merge old prefs into flags (skip if already there)
      const merged = { ...safeLegacy, ...existing };
      await actor.setFlag(FLAG_SCOPE, PREF_KEY, merged);
      migrated++;
    }
    if (migrated > 0) {
      if (CONFIG.debug?.cypherTaskbar) console.log(`${MODULE_ID} | Migrated preferences for ${migrated} actor(s) to actor flags.`);
      // Clear old setting so we don't migrate again
      await game.settings.set(MODULE_ID, "actorPreferences", "{}");
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Actor preference migration failed:`, err);
  }
}
