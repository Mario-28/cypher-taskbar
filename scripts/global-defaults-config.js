/**
 * Cypher Taskbar — Global Defaults Configuration
 *
 * GM-only ApplicationV2 for importing taskbar defaults. Actor-specific
 * overrides continue to take precedence over these world defaults.
 */

import { MODULE_ID, readJSONSetting, saveJSONSetting } from "./utils.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const LEGACY_ROOT_KEYS = [
  "taskbarHeight", "bgColor", "bgOpacity", "accentColor", "locked", "autoHide",
  "portraitWidth", "portraitAreaCollapsed", "sectionsExpanded",
  "menuFontSize", "menuFontColor", "menuFontFamily", "menuFontCaps",
  "miniMenuDisplayMode", "miniMenuItemSize", "miniMenuPadding",
  "menuIconSize", "menuLabelSize", "menuIconColor", "menuLabelColor", "menuIconBgColor",
  "menuIconsUnlocked", "menuIconSettings",
  "galleryTabsFontSize", "galleryTabsFontColor", "galleryTabsIconColor", "galleryTabsBackground",
  "portraitShadowBlur", "portraitShadowColor", "portraitShadowOpacity",
  "portraitShadowOffsetX", "portraitShadowOffsetY",
  "upperPanelBgColor", "upperPanelOpacity",
  "namePanelBgColor", "namePanelOpacity", "namePanelFontSize", "namePanelFontColor", "namePanelFontFamily",
  "bar1Color", "bar2Color", "bar3Color", "bar1TextColor", "bar2TextColor", "bar3TextColor",
  "arcBarColor", "arcBarGlow", "arcBarTextColor",
  "portraitSpaceTransparent", "portraitSpaceOpacity"
];

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Extract only JSON-safe, valid taskbar setting leaves from an imported file. */
export function normalizeGlobalDefaults(source) {
  if (!isPlainObject(source)) return {};
  const defaults = Object.create(null);
  const copyGroup = group => {
    if (!isPlainObject(group)) return;
    for (const [key, value] of Object.entries(group)) {
      if (!/^[A-Za-z0-9_-]+$/.test(key) || BLOCKED_KEYS.has(key)) continue;
      if (value === undefined || typeof value === "function" || typeof value === "symbol") continue;
      try {
        defaults[key] = JSON.parse(JSON.stringify(value));
      } catch {
        console.warn(`${MODULE_ID} | Ignored non-serializable global default: ${key}`);
      }
    }
  };
  copyGroup(source.taskbarSettings);
  copyGroup(source.portraitSettings);
  copyGroup(source.otherSettings);
  if (!Object.keys(defaults).length) copyGroup(source.settings);
  if (!Object.keys(defaults).length) {
    for (const key of LEGACY_ROOT_KEYS) {
      if (Object.hasOwn(source, key)) copyGroup({ [key]: source[key] });
    }
  }
  return { ...defaults };
}

export class GlobalTaskbarDefaultsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "ct-global-defaults",
    classes: ["cypher-taskbar", "ct-global-defaults"],
    window: { title: "Global Taskbar Defaults", resizable: true },
    position: { width: 560, height: "auto" }
  };

  static PARTS = {
    form: { template: "modules/cypher-taskbar/templates/global-defaults-config.html" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const data = readJSONSetting("globalTaskbarDefaultsData", {});
    const previewKeys = Object.keys(data);
    return {
      ...context,
      active: game.settings.get(MODULE_ID, "globalTaskbarDefaultsActive"),
      hasData: previewKeys.length > 0,
      dataPreview: previewKeys.length ? JSON.stringify(data, null, 2) : "",
      settingCount: previewKeys.length
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    root.querySelector("#ct-import-global-defaults")?.addEventListener("click", event => this._onImport(event));
    root.querySelector("#ct-clear-global-defaults")?.addEventListener("click", event => this._onClear(event));
    root.querySelector("#ct-save-apply-global-defaults")?.addEventListener("click", event => this._onSaveApply(event));
    root.querySelector("#ct-global-active")?.addEventListener("change", async event => {
      if (!this._requireGm()) return;
      const isActive = event.currentTarget.checked;
      try {
        await game.settings.set(MODULE_ID, "globalTaskbarDefaultsActive", isActive);
        ui.notifications.info(`Global defaults ${isActive ? "activated" : "deactivated"}.`);
      } catch (error) {
        console.error(`${MODULE_ID} | Could not update global-defaults state:`, error);
        ui.notifications.error("Could not update global defaults. Your previous setting was restored.");
        event.currentTarget.checked = !isActive;
      }
    });
  }

  _requireGm() {
    if (game.user?.isGM) return true;
    ui.notifications.warn("Only a Game Master can change global taskbar defaults.");
    return false;
  }

  async _onImport(event) {
    event.preventDefault();
    if (!this._requireGm()) return;
    const applyToAll = this.element.querySelector("#ct-apply-to-all-actors")?.checked ?? false;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.hidden = true;
    input.addEventListener("change", async () => {
      try {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) throw new Error("The settings file exceeds the 1 MB limit.");
        const defaults = normalizeGlobalDefaults(JSON.parse(await file.text()));
        if (!Object.keys(defaults).length) {
          ui.notifications.error("Invalid settings file: no recognizable settings.");
          return;
        }
        await saveJSONSetting("globalTaskbarDefaultsData", defaults);
        ui.notifications.info(`Global defaults imported: ${Object.keys(defaults).length} settings.`);
        if (applyToAll) await this._applyToAllActors(defaults);
        await this.render();
      } catch (error) {
        console.error(`${MODULE_ID} | Global defaults import failed:`, error);
        ui.notifications.error("Failed to import settings. Check the file format and size.");
      } finally {
        input.remove();
      }
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }

  async _applyToAllActors(defaults) {
    if (!this._requireGm()) return;
    const actors = game.actors?.contents ?? [];
    if (!actors.length) {
      ui.notifications.info("There are no actors to update.");
      return;
    }
    const confirmed = await DialogV2.confirm({
      window: { title: "Apply Global Defaults" },
      content: `<p>Apply these imported defaults to all <strong>${actors.length}</strong> actors? Existing actor-specific values for the same settings will be overwritten.</p>`,
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;

    let count = 0;
    let failed = 0;
    for (const actor of actors) {
      try {
        const currentActor = game.actors.get(actor.id);
        if (!currentActor) throw new Error("The actor no longer exists.");
        // Actor overrides are read from taskbarPrefs. Write individual leaves so
        // concurrent, unrelated preference changes are not replaced wholesale.
        for (const [key, value] of Object.entries(defaults)) {
          await currentActor.setFlag(MODULE_ID, `taskbarPrefs.${key}`, value);
        }
        count++;
      } catch (error) {
        failed++;
        console.error(`${MODULE_ID} | Could not apply global defaults to ${actor.name}:`, error);
      }
    }
    if (failed) ui.notifications.warn(`Applied defaults to ${count} actor(s); ${failed} update(s) failed. See the GM console for details.`);
    else ui.notifications.info(`Applied defaults to ${count} actor(s).`);
  }

  async _onSaveApply(event) {
    event.preventDefault();
    if (!this._requireGm()) return;
    const defaults = readJSONSetting("globalTaskbarDefaultsData", {});
    if (!Object.keys(defaults).length) {
      ui.notifications.warn("No global defaults loaded. Import settings first.");
      return;
    }
    await this._applyToAllActors(defaults);
  }

  async _onClear(event) {
    event.preventDefault();
    if (!this._requireGm()) return;
    const confirmed = await DialogV2.confirm({
      window: { title: "Clear Global Defaults" },
      content: "<p>Remove all global defaults? Actors will revert to built-in defaults where no actor override exists.</p>",
      rejectClose: false,
      modal: true
    });
    if (!confirmed) return;
    try {
      await saveJSONSetting("globalTaskbarDefaultsData", {});
      ui.notifications.info("Global defaults cleared.");
      await this.render();
    } catch (error) {
      console.error(`${MODULE_ID} | Could not clear global defaults:`, error);
      ui.notifications.error("Could not clear global defaults.");
    }
  }
}
