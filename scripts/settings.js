/**
 * Cypher Taskbar — Settings Registration
 */

import { MODULE_ID } from "./utils.js";
import { GlobalTaskbarDefaultsConfig } from "./global-defaults-config.js";

export function registerSettings() {
  // ── Core Settings ──
  game.settings.register(MODULE_ID, "autoHide", {
    name: "CYPHER_TASKBAR.Settings.AutoHide.Name",
    hint: "CYPHER_TASKBAR.Settings.AutoHide.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => CypherTaskbar.instance?.updateAutoHide()
  });
  game.settings.register(MODULE_ID, "taskbarHeight", {
    name: "CYPHER_TASKBAR.Settings.Height.Name",
    scope: "client", config: true, type: Number,
    range: { min: 50, max: 110, step: 5 }, default: 60,
    onChange: () => CypherTaskbar.instance?.applySettings()
  });
  game.settings.register(MODULE_ID, "bgColor", { scope: "client", config: true, type: String, default: "#0f0c16", onChange: () => CypherTaskbar.instance?.applySettings() });
  game.settings.register(MODULE_ID, "bgOpacity", { scope: "client", config: true, type: Number, range: { min: 0.3, max: 1, step: 0.05 }, default: 0.95, onChange: () => CypherTaskbar.instance?.applySettings() });
  game.settings.register(MODULE_ID, "accentColor", { scope: "client", config: true, type: String, default: "#c8a96e", onChange: () => CypherTaskbar.instance?.applySettings() });
  game.settings.register(MODULE_ID, "loadOnlyForPlayers", {
    name: "CYPHER_TASKBAR.Settings.LoadOnlyForPlayers.Name",
    hint: "CYPHER_TASKBAR.Settings.LoadOnlyForPlayers.Hint",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(MODULE_ID, "actorPreferences", {
    scope: "client", config: false, type: String, default: "{}"
  });

  // ── Gallery Tabs Settings ──
  game.settings.register(MODULE_ID, "galleryTabsEnabled", {
    name: "CYPHER_TASKBAR.Settings.GalleryTabsEnabled.Name",
    hint: "CYPHER_TASKBAR.Settings.GalleryTabsEnabled.Hint",
    scope: "client", config: false, type: Boolean, default: true,
    onChange: () => CypherTaskbar.instance?.render()
  });
  game.settings.register(MODULE_ID, "galleryTabsOffsetX", {
    name: "CYPHER_TASKBAR.Settings.GalleryTabsOffsetX.Name",
    hint: "CYPHER_TASKBAR.Settings.GalleryTabsOffsetX.Hint",
    scope: "client", config: false, type: Number,
    range: { min: 0, max: 150, step: 1 }, default: 0,
    onChange: (v) => {
      document.querySelectorAll(".cgt-strip-wrapper").forEach(el => {
        el.style.setProperty("--ct-gallery-offset-x", `${v}%`);
        el.dataset.galleryOffset = v;
      });
    }
  });

  game.settings.register(MODULE_ID, "selectedActorId", {
    name: "CYPHER_TASKBAR.Settings.SelectedActor.Name",
    hint: "CYPHER_TASKBAR.Settings.SelectedActor.Hint",
    scope: "client", config: false, type: String, default: ""
  });
  game.settings.register(MODULE_ID, "sectionsExpanded", { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "stuffItems", { scope: "client", config: false, type: String, default: "[]" });

  // ── Stuff Menu Settings ──
  game.settings.register(MODULE_ID, "stuffMenuShadowColor", { scope: "client", config: false, type: String, default: "#000000" });
  game.settings.register(MODULE_ID, "stuffMenuShadowOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.45 });
  game.settings.register(MODULE_ID, "stuffMenuShadowDistance", { scope: "client", config: false, type: Number, range: { min: 0, max: 40, step: 1 }, default: 14 });
  game.settings.register(MODULE_ID, "stuffMenuShadowDirection", { scope: "client", config: false, type: String, default: "bottom-right" });
  game.settings.register(MODULE_ID, "stuffMenuTitleColor", { scope: "client", config: false, type: String, default: "#f0d68a" });
  game.settings.register(MODULE_ID, "stuffMenuTitleSize", { scope: "client", config: false, type: Number, range: { min: 70, max: 200, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "stuffMenuTitleCaps", { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "stuffMenuHeadingColor", { scope: "client", config: false, type: String, default: "#d4a94d" });
  game.settings.register(MODULE_ID, "stuffMenuHeadingOpacity", { scope: "client", config: false, type: Number, range: { min: 0.1, max: 1, step: 0.05 }, default: 0.85 });
  game.settings.register(MODULE_ID, "stuffMenuBgColor", { scope: "client", config: false, type: String, default: "#17121f" });
  game.settings.register(MODULE_ID, "stuffMenuBgOpacity", { scope: "client", config: false, type: Number, range: { min: 0.1, max: 1, step: 0.05 }, default: 0.94 });
  game.settings.register(MODULE_ID, "stuffMenuBgImage", { scope: "client", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "stuffMenuBgImageOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.2 });
  game.settings.register(MODULE_ID, "stuffMenuBgFit", { scope: "client", config: false, type: String, default: "cover" });
  game.settings.register(MODULE_ID, "stuffMenuColumns", { scope: "client", config: false, type: Number, range: { min: 1, max: 3, step: 1 }, default: 1 });
  game.settings.register(MODULE_ID, "stuffMenuWidthScale", { scope: "client", config: false, type: Number, range: { min: 100, max: 1200, step: 10 }, default: 320 });
  game.settings.register(MODULE_ID, "stuffMenuHeightScale", { scope: "client", config: false, type: Number, range: { min: 100, max: 1200, step: 10 }, default: 300 });
  game.settings.register(MODULE_ID, "stuffMenuFontSize", { scope: "client", config: false, type: Number, range: { min: 70, max: 180, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "stuffMenuItemPadding", { scope: "client", config: false, type: Number, range: { min: 2, max: 24, step: 1 }, default: 5 });
  game.settings.register(MODULE_ID, "stuffMenuItemSize", { scope: "client", config: false, type: Number, range: { min: 16, max: 128, step: 1 }, default: 32 });
  game.settings.register(MODULE_ID, "stuffDefaultTab", { scope: "client", config: false, type: Number, range: { min: 0, max: 4, step: 1 }, default: 0 });
  // ── Stuff Button Icon Settings ──
  game.settings.register(MODULE_ID, "stuffBtnIconSize", { scope: "client", config: false, type: Number, range: { min: 50, max: 200, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "stuffBtnIconColor", { scope: "client", config: false, type: String, default: "#c8a96e" });
  game.settings.register(MODULE_ID, "stuffBtnBorderOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.25 });
  game.settings.register(MODULE_ID, "stuffBtnBorderThickness", { scope: "client", config: false, type: Number, range: { min: 0, max: 4, step: 0.5 }, default: 1 });
  game.settings.register(MODULE_ID, "stuffBtnBorderColor", { scope: "client", config: false, type: String, default: "#c8a96e" });
  game.settings.register(MODULE_ID, "stuffBtnIconHPos", { scope: "client", config: false, type: String, default: "center" });
  game.settings.register(MODULE_ID, "stuffBtnIconVPos", { scope: "client", config: false, type: String, default: "center" });
  game.settings.register(MODULE_ID, "stuffBtnIconOffset", { scope: "client", config: false, type: Number, range: { min: -50, max: 50, step: 1 }, default: 0 });
  game.settings.register(MODULE_ID, "bookGlobalLinks", { scope: "world", config: false, type: String, default: "[]" });
  game.settings.register(MODULE_ID, "bookJournalOverrides", { scope: "client", config: false, type: String, default: "{}" });
  // ── Book Button Icon Settings ──
  game.settings.register(MODULE_ID, "bookBtnIconSize", { scope: "client", config: false, type: Number, range: { min: 50, max: 200, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "bookBtnIconColor", { scope: "client", config: false, type: String, default: "#c8a96e" });
  game.settings.register(MODULE_ID, "bookBtnBorderOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.25 });
  game.settings.register(MODULE_ID, "bookBtnBorderThickness", { scope: "client", config: false, type: Number, range: { min: 0, max: 4, step: 0.5 }, default: 1 });
  game.settings.register(MODULE_ID, "bookBtnBorderColor", { scope: "client", config: false, type: String, default: "#c8a96e" });
  game.settings.register(MODULE_ID, "bookBtnIconHPos", { scope: "client", config: false, type: String, default: "center" });
  game.settings.register(MODULE_ID, "bookBtnIconVPos", { scope: "client", config: false, type: String, default: "center" });
  game.settings.register(MODULE_ID, "bookBtnIconOffset", { scope: "client", config: false, type: Number, range: { min: -50, max: 50, step: 1 }, default: 0 });
  // ── Book Menu Settings ──
  game.settings.register(MODULE_ID, "bookMenuWidth", { scope: "client", config: false, type: Number, range: { min: 200, max: 1200, step: 10 }, default: 480 });
  game.settings.register(MODULE_ID, "bookMenuHeight", { scope: "client", config: false, type: Number, range: { min: 150, max: 1200, step: 10 }, default: 420 });
  game.settings.register(MODULE_ID, "bookMenuBgColor", { scope: "client", config: false, type: String, default: "#17121f" });
  game.settings.register(MODULE_ID, "bookMenuBgOpacity", { scope: "client", config: false, type: Number, range: { min: 0.1, max: 1, step: 0.05 }, default: 0.94 });
  game.settings.register(MODULE_ID, "bookMenuShadowColor", { scope: "client", config: false, type: String, default: "#000000" });
  game.settings.register(MODULE_ID, "bookMenuShadowOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.45 });
  game.settings.register(MODULE_ID, "bookMenuShadowDistance", { scope: "client", config: false, type: Number, range: { min: 0, max: 40, step: 1 }, default: 14 });
  game.settings.register(MODULE_ID, "bookMenuFontSize", { scope: "client", config: false, type: Number, range: { min: 70, max: 180, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "bookMenuViewMode", { scope: "client", config: false, type: String, default: "list" });
  game.settings.register(MODULE_ID, "stuffTabs", { scope: "client", config: false, type: String, default: '[{"name":"All","icon":"fas fa-box-open","fontColor":"#f0d68a","caps":false,"fontSize":100,"iconSize":100,"iconColor":"#c8a96e"}]' });
  game.settings.register(MODULE_ID, "stuffTabItems", { scope: "client", config: false, type: String, default: "{}" });
  game.settings.register(MODULE_ID, "menuFontSize", { scope: "client", config: false, type: Number, range: { min: 50, max: 150, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "menuFontColor", { scope: "client", config: false, type: String, default: "#e8e8e8" });
  game.settings.register(MODULE_ID, "menuFontCaps", { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "menuFontFamily", { scope: "client", config: false, type: String, default: "inherit" });

  // ── Portrait Settings ──
  game.settings.register(MODULE_ID, "portraitWidth", { scope: "client", config: false, type: Number, range: { min: 80, max: 400, step: 10 }, default: 180 });
  game.settings.register(MODULE_ID, "portraitAreaCollapsed", { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, "portraitShadow", { scope: "client", config: false, type: Boolean, default: true });
  game.settings.register(MODULE_ID, "portraitShadowBlur", { scope: "client", config: false, type: Number, default: 12 });
  game.settings.register(MODULE_ID, "portraitShadowColor", { scope: "client", config: false, type: String, default: "#000000" });
  game.settings.register(MODULE_ID, "portraitShadowOpacity", { scope: "client", config: false, type: Number, default: 0.85 });
  game.settings.register(MODULE_ID, "portraitShadowDistance", { scope: "client", config: false, type: Number, default: 6 });
  game.settings.register(MODULE_ID, "portraitShadowDirection", { scope: "client", config: false, type: String, default: "bottom-right" });

  // ── Attribute Bar Settings ──
  game.settings.register(MODULE_ID, "attributeBarScale", { scope: "client", config: false, type: Number, range: { min: 60, max: 180, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "attributeBarRightOffset", { scope: "client", config: false, type: Number, range: { min: -100, max: 300, step: 1 }, default: 55 });
  game.settings.register(MODULE_ID, "attributeBarVerticalOffset", { scope: "client", config: false, type: Number, range: { min: -600, max: 600, step: 1 }, default: 0 });
  game.settings.register(MODULE_ID, "attributeBarGap", { scope: "client", config: false, type: Number, range: { min: 0, max: 40, step: 1 }, default: 4 });
  game.settings.register(MODULE_ID, "attributeBarTopPadding", { scope: "client", config: false, type: Number, range: { min: -500, max: 500, step: 1 }, default: 0 });
  game.settings.register(MODULE_ID, "attributeValueColor", { scope: "client", config: false, type: String, default: "#ffffff" });
  game.settings.register(MODULE_ID, "attributeValueSize", { scope: "client", config: false, type: Number, range: { min: 70, max: 220, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "attributeTitleColor", { scope: "client", config: false, type: String, default: "#ffffff" });
  game.settings.register(MODULE_ID, "attributeTitleStrokeColor", { scope: "client", config: false, type: String, default: "#ffffff" });
  game.settings.register(MODULE_ID, "attributeTitleStrokeThickness", { scope: "client", config: false, type: Number, range: { min: 0, max: 4, step: 0.1 }, default: 0.5 });
  game.settings.register(MODULE_ID, "attributeTitleBoldness", { scope: "client", config: false, type: Number, range: { min: 100, max: 900, step: 100 }, default: 800 });
  game.settings.register(MODULE_ID, "attributeTitleSize", { scope: "client", config: false, type: Number, range: { min: 70, max: 220, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "attributeTitleSpacing", { scope: "client", config: false, type: Number, range: { min: -2, max: 8, step: 0.5 }, default: 0.5 });

  // ── Upper Panel Settings ──
  game.settings.register(MODULE_ID, "upperPanelBgColor", { scope: "client", config: false, type: String, default: "#16121e" });
  game.settings.register(MODULE_ID, "upperPanelOpacity", { scope: "client", config: false, type: Number, range: { min: 0.1, max: 1, step: 0.05 }, default: 0.9 });
  game.settings.register(MODULE_ID, "upperPanelFontColor", { scope: "client", config: false, type: String, default: "#f0d68a" });
  game.settings.register(MODULE_ID, "upperPanelNameSize", { scope: "client", config: false, type: Number, range: { min: 70, max: 220, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "upperPanelScale", { scope: "client", config: false, type: Number, range: { min: 60, max: 180, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, "upperPanelOffsetX", { scope: "client", config: false, type: Number, range: { min: -100, max: 100, step: 1 }, default: 0 });
  game.settings.register(MODULE_ID, "upperPanelOffsetY", { scope: "client", config: false, type: Number, range: { min: -100, max: 100, step: 1 }, default: 0 });

  // ── XP Circle Settings ──
  game.settings.register(MODULE_ID, "xpCircleOffsetX", { scope: "client", config: false, type: Number, range: { min: -100, max: 100, step: 1 }, default: 0 });
  game.settings.register(MODULE_ID, "xpCircleOffsetY", { scope: "client", config: false, type: Number, range: { min: -100, max: 100, step: 1 }, default: 0 });

  // ── Recovery Drop Settings ──
  game.settings.register(MODULE_ID, "recoveryDropColor", { scope: "client", config: false, type: String, default: "#3a8fd4" });
  game.settings.register(MODULE_ID, "recoveryBgColor", { scope: "client", config: false, type: String, default: "#808080" });
  game.settings.register(MODULE_ID, "recoveryBgOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.25 });
  game.settings.register(MODULE_ID, "recoverySpace", { scope: "client", config: false, type: Number, range: { min: 0, max: 300, step: 1 }, default: 98 });

  // ── ARC Widget Settings ──
  game.settings.register(MODULE_ID, "arcWidgetOffsetX", { scope: "client", config: false, type: Number, range: { min: -100, max: 150, step: 1 }, default: 82 });
  game.settings.register(MODULE_ID, "arcWidgetOffsetY", { scope: "client", config: false, type: Number, range: { min: -100, max: 150, step: 1 }, default: 64 });
  game.settings.register(MODULE_ID, "arcWidgetScale", { scope: "client", config: false, type: Number, range: { min: 50, max: 160, step: 1 }, default: 74 });
  game.settings.register(MODULE_ID, "arcWidgetBgOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.28 });
  game.settings.register(MODULE_ID, "arcWidgetFontColor", { scope: "client", config: false, type: String, default: "#fff0d0" });
  game.settings.register(MODULE_ID, "arcWidgetFontSize", { scope: "client", config: false, type: Number, range: { min: 60, max: 160, step: 1 }, default: 84 });

  // ── Lock Setting ──
  game.settings.register(MODULE_ID, "locked", { scope: "client", config: false, type: Boolean, default: false });

  // ── Skills Menu Settings ──
  _registerMenuSettings("skills");
  // ── Equipment Menu Settings ──
  _registerMenuSettings("equipment");
  game.settings.register(MODULE_ID, "equipmentMenuIconSize", { scope: "client", config: false, type: Number, range: { min: 12, max: 40, step: 2 }, default: 20 });
  // ── Abilities Menu Settings ──
  _registerMenuSettings("abilities");
  // ── Spells Menu Settings ──
  _registerMenuSettings("spells");

  // ── Combat Placeholder Settings ──
  game.settings.register(MODULE_ID, "combatPlaceholderBgColor", { scope: "client", config: false, type: String, default: "#ff2414" });
  game.settings.register(MODULE_ID, "combatPlaceholderBgOpacity", { scope: "client", config: false, type: Number, range: { min: 0.1, max: 1, step: 0.05 }, default: 0.98 });
  game.settings.register(MODULE_ID, "combatPlaceholderWidthScale", { scope: "client", config: false, type: Number, range: { min: 40, max: 140, step: 1 }, default: 100 });
  game.settings.register(MODULE_ID, "combatPlaceholderHeightScale", { scope: "client", config: false, type: Number, range: { min: 60, max: 180, step: 1 }, default: 100 });
  game.settings.register(MODULE_ID, "combatPlaceholderBorderWidth", { scope: "client", config: false, type: Number, range: { min: 0, max: 8, step: 1 }, default: 1 });
  game.settings.register(MODULE_ID, "combatPlaceholderBorderColor", { scope: "client", config: false, type: String, default: "#fff4dc" });
  game.settings.register(MODULE_ID, "combatPlaceholderBorderOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.18 });
  game.settings.register(MODULE_ID, "combatPlaceholderShadowOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.28 });
  game.settings.register(MODULE_ID, "combatPlaceholderShadowDir", { scope: "client", config: false, type: String, default: "top-left" });
  game.settings.register(MODULE_ID, "combatPlaceholderShadowBlur", { scope: "client", config: false, type: Number, range: { min: 0, max: 60, step: 1 }, default: 28 });
  game.settings.register(MODULE_ID, "combatPlaceholderPosition", { scope: "client", config: false, type: Number, range: { min: 0, max: 100, step: 1 }, default: 50 });
  game.settings.register(MODULE_ID, "combatPlaceholderOffset", { scope: "client", config: false, type: Number, range: { min: -200, max: 200, step: 1 }, default: 0 });
  game.settings.register(MODULE_ID, "combatPlaceholderGradientColor2", { scope: "client", config: false, type: String, default: "#990000" });
  game.settings.register(MODULE_ID, "combatPlaceholderGradientStretch", { scope: "client", config: false, type: Number, range: { min: 0, max: 100, step: 1 }, default: 50 });
  game.settings.register(MODULE_ID, "combatPlaceholderSeparatorMargin", { scope: "client", config: false, type: Number, range: { min: 0, max: 20, step: 1 }, default: 4 });
  game.settings.register(MODULE_ID, "combatPlaceholderSeparatorColor", { scope: "client", config: false, type: String, default: "#ffffff" });
  game.settings.register(MODULE_ID, "combatPlaceholderGradientType", { scope: "client", config: false, type: String, default: "none" });
  game.settings.register(MODULE_ID, "combatPlaceholderGradientDir", { scope: "client", config: false, type: String, default: "to-right" });
  game.settings.register(MODULE_ID, "combatPlaceholderBgImage", { scope: "client", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, "combatPlaceholderBgImageOpacity", { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.5 });
  game.settings.register(MODULE_ID, "combatPlaceholderBgImageSize", { scope: "client", config: false, type: String, default: "cover" });
  game.settings.register(MODULE_ID, "combatPlaceholderBgImagePos", { scope: "client", config: false, type: String, default: "center" });
  game.settings.register(MODULE_ID, "combatPlaceholderSeparator", { scope: "client", config: false, type: String, default: "thin" });

  // ── Combat Action Icon Settings ──
  game.settings.register(MODULE_ID, "combatActionIconColor", { scope: "client", config: false, type: String, default: "#c8a96e" });
  game.settings.register(MODULE_ID, "combatActionIconBgColor", { scope: "client", config: false, type: String, default: "rgba(0,0,0,0.22)" });
  game.settings.register(MODULE_ID, "combatActionIconSize", { scope: "client", config: false, type: Number, default: 100 });
  game.settings.register(MODULE_ID, "combatActionIconPadding", { scope: "client", config: false, type: Number, range: { min: 0, max: 20, step: 1 }, default: 3 });
  game.settings.register(MODULE_ID, "combatActionIconMargin", { scope: "client", config: false, type: Number, range: { min: 0, max: 20, step: 1 }, default: 4 });

  console.log(`${MODULE_ID} | Settings registered`);

  // ── Mini Menu Settings ──
  game.settings.register(MODULE_ID, "miniMenuDisplayMode", {
    name: "CYPHER_TASKBAR.Settings.MiniMenu.DisplayMode.Name",
    hint: "CYPHER_TASKBAR.Settings.MiniMenu.DisplayMode.Hint",
    scope: "client", config: false, type: String,
    choices: { grid: "Grid", list: "List", "list-no-title": "List (no title)" },
    default: "list",
    onChange: () => { /* live update handled in container */ }
  });
  game.settings.register(MODULE_ID, "miniMenuWidth", {
    name: "CYPHER_TASKBAR.Settings.MiniMenu.Width.Name",
    hint: "CYPHER_TASKBAR.Settings.MiniMenu.Width.Hint",
    scope: "client", config: false, type: Number,
    range: { min: 150, max: 800, step: 10 }, default: 250,
    onChange: () => { /* live update */ }
  });
  game.settings.register(MODULE_ID, "miniMenuHeight", {
    name: "CYPHER_TASKBAR.Settings.MiniMenu.Height.Name",
    hint: "CYPHER_TASKBAR.Settings.MiniMenu.Height.Hint",
    scope: "client", config: false, type: Number,
    range: { min: 150, max: 800, step: 10 }, default: 350,
    onChange: () => { /* live update */ }
  });

  // ── Mini Menu Settings ──
  game.settings.register(MODULE_ID, "miniMenuItemSize", {
    name: "CYPHER_TASKBAR.Settings.MiniMenu.ItemSize.Name",
    hint: "CYPHER_TASKBAR.Settings.MiniMenu.ItemSize.Hint",
    scope: "client", config: false, type: Number,
    range: { min: 8, max: 256, step: 8 }, default: 32,
    onChange: () => { /* live update handled in container */ }
  });
  game.settings.register(MODULE_ID, "miniMenuPadding", {
    name: "CYPHER_TASKBAR.Settings.MiniMenu.Padding.Name",
    hint: "CYPHER_TASKBAR.Settings.MiniMenu.Padding.Hint",
    scope: "client", config: false, type: Number,
    range: { min: 0, max: 20, step: 1 }, default: 0,
    onChange: () => { /* live update handled in container */ }
  });
  game.settings.register(MODULE_ID, "miniMenuShowTitle", {
    name: "CYPHER_TASKBAR.Settings.MiniMenu.ShowTitle.Name",
    hint: "CYPHER_TASKBAR.Settings.MiniMenu.ShowTitle.Hint",
    scope: "client", config: false, type: Boolean, default: true,
    onChange: () => { /* live update */ }
  });
  game.settings.register(MODULE_ID, "miniMenuShowDescription", {
    name: "CYPHER_TASKBAR.Settings.MiniMenu.ShowDescription.Name",
    hint: "CYPHER_TASKBAR.Settings.MiniMenu.ShowDescription.Hint",
    scope: "client", config: false, type: Boolean, default: true,
    onChange: () => { /* live update */ }
  });
  // ── Global UI Settings ──
  game.settings.register(MODULE_ID, "hideMacroBar", {
    name: "Hide Macro Bar",
    hint: "Hide the Foundry macro hotbar at the bottom of the screen.",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: (v) => {
      const hb = document.getElementById("hotbar");
      if (hb) hb.style.display = v ? "none" : "";
    }
  });
  game.settings.register(MODULE_ID, "pushSidebarUp", {
    name: "Push Sidebar Up",
    hint: "Raise the Foundry sidebar so it sits above the taskbar instead of behind it.",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => {
      const tb = CypherTaskbar.instance;
      if (tb) tb._adjustCanvasPadding(tb._gs("locked") || !tb._gs("autoHide"));
    }
  });
}

function _registerMenuSettings(prefix) {
  const isSpells = prefix === "spells";
  const headingColor = isSpells ? "#7c6cfa" : prefix === "abilities" ? "#a07cda" : "#d4a94d";
  const bgColor = isSpells ? "#0f0e1f" : "#17121f";
  const titleColor = isSpells ? "#b8aaff" : prefix === "abilities" ? "#f0d68a" : "#f0d68a";
  const widthMax = prefix === "equipment" || prefix === "spells" ? 300 : 180;

  game.settings.register(MODULE_ID, `${prefix}MenuShadowColor`, { scope: "client", config: false, type: String, default: "#000000" });
  game.settings.register(MODULE_ID, `${prefix}MenuShadowOpacity`, { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.45 });
  game.settings.register(MODULE_ID, `${prefix}MenuShadowDistance`, { scope: "client", config: false, type: Number, range: { min: 0, max: 40, step: 1 }, default: 14 });
  game.settings.register(MODULE_ID, `${prefix}MenuShadowDirection`, { scope: "client", config: false, type: String, default: "bottom-right" });
  game.settings.register(MODULE_ID, `${prefix}MenuTitleColor`, { scope: "client", config: false, type: String, default: titleColor });
  game.settings.register(MODULE_ID, `${prefix}MenuTitleSize`, { scope: "client", config: false, type: Number, range: { min: 70, max: 200, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, `${prefix}MenuTitleCaps`, { scope: "client", config: false, type: Boolean, default: false });
  game.settings.register(MODULE_ID, `${prefix}MenuHeadingColor`, { scope: "client", config: false, type: String, default: headingColor });
  game.settings.register(MODULE_ID, `${prefix}MenuHeadingOpacity`, { scope: "client", config: false, type: Number, range: { min: 0.1, max: 1, step: 0.05 }, default: 0.85 });
  game.settings.register(MODULE_ID, `${prefix}MenuBgColor`, { scope: "client", config: false, type: String, default: bgColor });
  game.settings.register(MODULE_ID, `${prefix}MenuBgOpacity`, { scope: "client", config: false, type: Number, range: { min: 0.1, max: 1, step: 0.05 }, default: 0.94 });
  game.settings.register(MODULE_ID, `${prefix}MenuBgImage`, { scope: "client", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, `${prefix}MenuBgImageOpacity`, { scope: "client", config: false, type: Number, range: { min: 0, max: 1, step: 0.05 }, default: 0.2 });
  game.settings.register(MODULE_ID, `${prefix}MenuBgFit`, { scope: "client", config: false, type: String, default: "cover" });
  game.settings.register(MODULE_ID, `${prefix}MenuColumns`, { scope: "client", config: false, type: Number, range: { min: 1, max: 3, step: 1 }, default: 1 });
  game.settings.register(MODULE_ID, `${prefix}MenuWidthScale`, { scope: "client", config: false, type: Number, range: { min: 60, max: widthMax, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, `${prefix}MenuHeightScale`, { scope: "client", config: false, type: Number, range: { min: 60, max: widthMax, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, `${prefix}MenuFontSize`, { scope: "client", config: false, type: Number, range: { min: 70, max: 180, step: 5 }, default: 100 });
  game.settings.register(MODULE_ID, `${prefix}MenuItemPadding`, { scope: "client", config: false, type: Number, range: { min: 2, max: 24, step: 1 }, default: 5 });
  game.settings.register(MODULE_ID, `${prefix}MenuCategories`, { scope: "client", config: false, type: String, default: "[]" });
  game.settings.register(MODULE_ID, `${prefix}MenuPlacement`, { scope: "client", config: false, type: String, default: "{}" });
  game.settings.register(MODULE_ID, `${prefix}CategoryStyles`, { scope: "client", config: false, type: String, default: "{}" });
  if (prefix === "abilities" || prefix === "spells") {
    game.settings.register(MODULE_ID, `${prefix}HiddenCategories`, { scope: "client", config: false, type: String, default: "[]" });
  }
  if (prefix === "spells") {
    game.settings.register(MODULE_ID, "spellsReadyMemorized", { scope: "client", config: false, type: String, default: "{}" });
    game.settings.register(MODULE_ID, "spellsReadyFontSize", { scope: "client", config: false, type: Number, range: { min: 70, max: 180, step: 5 }, default: 100 });
    game.settings.register(MODULE_ID, "spellsReadyPadding", { scope: "client", config: false, type: Number, range: { min: 2, max: 24, step: 1 }, default: 5 });
    game.settings.register(MODULE_ID, "spellsReadyMargin", { scope: "client", config: false, type: Number, range: { min: 0, max: 20, step: 1 }, default: 4 });
    game.settings.register(MODULE_ID, "spellsReadyCastIconSize", { scope: "client", config: false, type: Number, range: { min: 16, max: 40, step: 2 }, default: 26 });
    game.settings.register(MODULE_ID, "spellsIconSize", { scope: "client", config: false, type: Number, range: { min: 12, max: 40, step: 2 }, default: 20 });
  }

  // ── Global Menu Backgrounds ──
  game.settings.register(MODULE_ID, "menuBackgrounds", {
    name: "Menu Backgrounds",
    hint: "Global background images for all taskbar menus.",
    scope: "world", config: false, type: String, default: "{}"
  });

  // ── Global Taskbar Defaults ──
  game.settings.register(MODULE_ID, "globalTaskbarDefaultsActive", {
    name: "CYPHER_TASKBAR.Settings.GlobalDefaultsActive.Name",
    hint: "CYPHER_TASKBAR.Settings.GlobalDefaultsActive.Hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => {
      if (game.cypherTaskbar?.instance) {
        game.cypherTaskbar.instance.applySettings();
        game.cypherTaskbar.instance.refresh();
      }
    }
  });
  game.settings.register(MODULE_ID, "globalTaskbarDefaultsData", {
    scope: "world", config: false, type: String, default: "{}"
  });
  game.settings.registerMenu(MODULE_ID, "globalTaskbarDefaultsMenu", {
    name: "CYPHER_TASKBAR.Settings.GlobalDefaultsMenu.Name",
    label: "CYPHER_TASKBAR.Settings.GlobalDefaultsMenu.Label",
    icon: "fas fa-globe",
    type: GlobalTaskbarDefaultsConfig,
    restricted: true
  });
}
