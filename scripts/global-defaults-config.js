/**
 * Cypher Taskbar — Global Defaults Configuration Dialog
 *
 * GM-only dialog for importing taskbar settings that become
 * the default for ALL actors. Individual actor overrides
 * take precedence.
 */

import { MODULE_ID, readJSONSetting, saveJSONSetting } from "./utils.js";

export class GlobalTaskbarDefaultsConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: game.i18n.localize("CYPHER_TASKBAR.GlobalDefaults.Title") || "Global Taskbar Defaults",
      template: "modules/cypher-taskbar/templates/global-defaults-config.html",
      width: 520,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      resizable: true
    });
  }

  getData() {
    const data = readJSONSetting("globalTaskbarDefaultsData", {});
    const active = game.settings.get(MODULE_ID, "globalTaskbarDefaultsActive");
    const previewKeys = Object.keys(data);
    return {
      active,
      hasData: previewKeys.length > 0,
      dataPreview: previewKeys.length > 0
        ? JSON.stringify(data, null, 2)
        : "",
      settingCount: previewKeys.length
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find("#ct-import-global-defaults").click(this._onImport.bind(this));
    html.find("#ct-clear-global-defaults").click(this._onClear.bind(this));
  }

  async _onImport(event) {
    event.preventDefault();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.style.display = "none";
    input.addEventListener("change", async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);

        // Extract settings from new format (taskbar + portrait + other) or old format
        const defaults = {};
        if (json.taskbarSettings && typeof json.taskbarSettings === "object") {
          Object.assign(defaults, json.taskbarSettings);
        }
        if (json.portraitSettings && typeof json.portraitSettings === "object") {
          Object.assign(defaults, json.portraitSettings);
        }
        if (json.otherSettings && typeof json.otherSettings === "object") {
          Object.assign(defaults, json.otherSettings);
        }
        // Backward-compat: old exports used a flat "settings" key
        if (Object.keys(defaults).length === 0 && json.settings && typeof json.settings === "object") {
          Object.assign(defaults, json.settings);
        }
        // Also try flat keys at root level (very old format)
        if (Object.keys(defaults).length === 0) {
          const knownKeys = [
            "taskbarHeight","bgColor","bgOpacity","accentColor","locked","autoHide",
            "portraitWidth","portraitAreaCollapsed","sectionsExpanded",
            "menuFontSize","menuFontColor","menuFontFamily","menuFontCaps",
            "miniMenuDisplayMode","miniMenuItemSize","miniMenuPadding",
            "menuIconSize","menuLabelSize","menuIconColor","menuLabelColor","menuIconBgColor",
            "menuIconsUnlocked","menuIconSettings",
            "galleryTabsFontSize","galleryTabsFontColor","galleryTabsIconColor","galleryTabsBackground",
            "portraitShadowBlur","portraitShadowColor","portraitShadowOpacity",
            "portraitShadowOffsetX","portraitShadowOffsetY",
            "upperPanelBgColor","upperPanelOpacity",
            "namePanelBgColor","namePanelOpacity","namePanelFontSize","namePanelFontColor","namePanelFontFamily",
            "bar1Color","bar2Color","bar3Color","bar1TextColor","bar2TextColor","bar3TextColor",
            "arcBarColor","arcBarGlow","arcBarTextColor",
            "xpCircleColor","xpCircleSize","xpCircleOffsetX","xpCircleOffsetY",
            "portraitSpaceTransparent","portraitSpaceOpacity"
          ];
          for (const key of knownKeys) {
            if (json[key] !== undefined) defaults[key] = json[key];
          }
        }

        if (Object.keys(defaults).length === 0) {
          ui.notifications.error("Invalid settings file: no recognizable settings.");
          return;
        }

        await saveJSONSetting("globalTaskbarDefaultsData", defaults);
        ui.notifications.info(`Global defaults imported: ${Object.keys(defaults).length} settings.`);
        this.render();
      } catch (err) {
        console.error(`${MODULE_ID} | Global defaults import failed:`, err);
        ui.notifications.error("Failed to import settings. Check file format.");
      }
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  }

  async _onClear(event) {
    event.preventDefault();
    await Dialog.confirm({
      title: "Clear Global Defaults",
      content: "<p>Are you sure you want to remove all global defaults? Actors will revert to built-in defaults.</p>",
      yes: async () => {
        await saveJSONSetting("globalTaskbarDefaultsData", {});
        ui.notifications.info("Global defaults cleared.");
        this.render();
      }
    });
  }

  async _updateObject(event, formData) {
    const wasActive = game.settings.get(MODULE_ID, "globalTaskbarDefaultsActive");
    const nowActive = !!formData.active;

    if (wasActive !== nowActive) {
      await game.settings.set(MODULE_ID, "globalTaskbarDefaultsActive", nowActive);
      ui.notifications.info(`Global defaults ${nowActive ? "activated" : "deactivated"}.`);

      // Refresh all taskbars
      if (game.cypherTaskbar?.instance) {
        game.cypherTaskbar.instance.applySettings();
        game.cypherTaskbar.instance.refresh();
      }
    }
  }
}
