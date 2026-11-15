import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const { document, window } = parseHTML("<!doctype html><html><head></head><body></body></html>");
globalThis.document = document;
globalThis.window = window;
globalThis.MutationObserver = window.MutationObserver;
globalThis.CustomEvent = window.CustomEvent;
globalThis.localStorage = { getItem() { return null; }, setItem() {} };

const escapeHTML = value => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
let idCounter = 0;
const notifications = [];
globalThis.ui = {
  notifications: Object.fromEntries(["info", "warn", "error"].map(level => [level, message => {
    notifications.push({ level, message });
  }]))
};
globalThis.CONFIG = { debug: {} };
globalThis.Hooks = { on() {}, once() {} };
globalThis.foundry = {
  applications: {
    api: {
      ApplicationV2: class {},
      DialogV2: { confirm: async () => true },
      HandlebarsApplicationMixin: Base => class extends Base {}
    }
  },
  utils: {
    escapeHTML,
    deepClone: value => structuredClone(value),
    randomID: () => `test${String(++idCounter).padStart(12, "0")}`.slice(0, 16),
    getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object),
    mergeObject: (original, other) => ({ ...original, ...other })
  }
};
globalThis.game = {
  user: { id: "player", name: "Player", isGM: false },
  users: [],
  actors: new Map(),
  modules: new Map(),
  settings: { get() { throw new Error("Setting unavailable"); }, set: async () => {} },
  socket: { on() {}, emit() {} }
};

const adapter = await import("../scripts/cypher-system-adapter.js");
const utils = await import("../scripts/utils.js");
const { normalizeGlobalDefaults, GlobalTaskbarDefaultsConfig } = await import("../scripts/global-defaults-config.js");
const { normalizeGallerySharePayload } = await import("../scripts/gallery-tabs.js");
const { resolveEquipmentExpenditure } = await import("../scripts/equipment-panel.js");
const { CypherTaskbar } = await import("../scripts/cypher-taskbar.js");
const { _cbClientToWorld, _cbWorldToClient, registerCombatBarSocket } = await import("../scripts/combat-bar.js");
const {
  COMBAT_BAR_PRESETS, bindCombatBarPresetCards, getCombatBarPreset, normalizeCombatBarPreset, renderCombatBarPresetCards
} = await import("../scripts/combat-bar-appearance.js");

const bareTaskbar = () => Object.create(CypherTaskbar.prototype);
const validRequest = () => ({ type: "gmRestRequest", requestId: "abcdefgh12345678" });

function recoverySystem({
  oneAction = 1,
  tenMinutes = 1,
  recoveries = {}
} = {}) {
  return {
    settings: { combat: {
      numberOneActionRecoveries: oneAction,
      numberTenMinuteRecoveries: tenMinutes
    } },
    combat: { recoveries: {
      oneAction: false, oneAction2: false, oneAction3: false, oneAction4: false,
      oneAction5: false, oneAction6: false, oneAction7: false,
      tenMinutes: false, tenMinutes2: false, oneHour: false, tenHours: false,
      ...recoveries
    } }
  };
}

test("recovery adapter maps native groups and configured additional recoveries", () => {
  const groups = adapter.getRecoveryGroups(recoverySystem({ oneAction: 4, tenMinutes: 2 }));
  assert.equal(groups.length, 4);
  assert.equal(groups[0].enabledCount, 4);
  assert.equal(groups[0].remainingCount, 4);
  assert.equal(groups[0].nextKey, "oneAction");
  assert.equal(groups[1].enabledCount, 2);
  assert.equal(groups[2].nextKey, "oneHour");
  assert.equal(groups[3].nextKey, "tenHours");
});

test("recovery adapter clamps invalid counts and honors spent additional rolls", () => {
  const groups = adapter.getRecoveryGroups(recoverySystem({
    oneAction: 99,
    tenMinutes: -5,
    recoveries: { oneAction: true, oneAction2: true, oneAction3: true }
  }));
  assert.equal(groups[0].enabledCount, 7);
  assert.equal(groups[0].nextKey, "oneAction4");
  assert.equal(groups[0].remainingCount, 4);
  assert.equal(groups[1].enabledCount, 0);
  assert.equal(groups[1].available, false);
});

test("recovery spending selects the next native boolean and enforces order", () => {
  const first = adapter.getRecoverySpendUpdate(recoverySystem({ oneAction: 3, recoveries: { oneAction: true } }), 0);
  assert.deepEqual(first, {
    ok: true,
    key: "oneAction2",
    path: "system.combat.recoveries.oneAction2",
    update: { "system.combat.recoveries.oneAction2": true }
  });
  assert.deepEqual(adapter.getRecoverySpendUpdate(recoverySystem(), 1), { ok: false, reason: "order" });
  const spent = recoverySystem({ oneAction: 0 });
  assert.deepEqual(adapter.getRecoverySpendUpdate(spent, 0), { ok: false, reason: "spent" });
});

test("recovery reset writes every supported native recovery to available", () => {
  const update = adapter.RECOVERY_RESET_UPDATE;
  assert.equal(Object.keys(update).length, 11);
  assert.ok(Object.values(update).every(value => value === false));
  assert.ok(Object.hasOwn(update, "system.combat.recoveries.oneAction7"));
  assert.ok(Object.hasOwn(update, "system.combat.recoveries.tenMinutes2"));
});

test("roll resolution compares final target exactly once and handles natural one", () => {
  assert.deepEqual(adapter.resolveRollOutcome({ natural: 12, finalDifficulty: 4 }), {
    total: 12, target: 12, success: true, naturalOne: false, achievedDifficulty: 4
  });
  assert.equal(adapter.resolveRollOutcome({ natural: 9, bonus: 3, finalDifficulty: 4 }).success, true);
  assert.equal(adapter.resolveRollOutcome({ natural: 20, bonus: 100, finalDifficulty: 0 }).naturalOne, false);
  const one = adapter.resolveRollOutcome({ natural: 1, bonus: 100, finalDifficulty: 0 });
  assert.equal(one.success, false);
  assert.equal(one.naturalOne, true);
});

test("roll resolution bounds malformed numeric input", () => {
  const outcome = adapter.resolveRollOutcome({ natural: 99.9, bonus: -999, finalDifficulty: 99 });
  assert.equal(outcome.total, -80);
  assert.equal(outcome.target, 45);
  assert.equal(outcome.achievedDifficulty, 0);
  assert.equal(outcome.success, false);
});

test("aggregate Effort cost covers first-level, impairment, and Speed armor variants", () => {
  assert.equal(adapter.calculateEffortCost(0), 0);
  assert.equal(adapter.calculateEffortCost(1), 3);
  assert.equal(adapter.calculateEffortCost(3), 7);
  assert.equal(adapter.calculateEffortCost(3, { firstLevelCostsTwo: true }), 6);
  assert.equal(adapter.calculateEffortCost(3, { impaired: true }), 10);
  assert.equal(adapter.calculateEffortCost(3, { impaired: true, speedArmorCost: 2 }), 12);
  assert.equal(adapter.calculateEffortCost(-4), 0);
});

test("color and masonry inputs are bounded and malformed colors fall back", () => {
  assert.equal(utils.hexToRGBA("#ff0080", 0.5), "rgba(255,0,128,0.5)");
  assert.equal(utils.hexToRGBA("red\",evil", 2), "rgba(0,0,0,1)");
  assert.equal(utils.hexToRGBA(null, Number.NaN), "rgba(0,0,0,1)");
  assert.equal(utils.normalizeColumnCount(2.9), 2);
  assert.equal(utils.normalizeColumnCount(999), 3);
  assert.equal(utils.normalizeColumnCount(-2), 1);
  assert.equal(utils.normalizeColumnCount("bad", 2.8), 2);
});

test("rich-text sanitizer removes active content, handlers, and unsafe URLs", () => {
  const cleaned = utils.sanitizeHTML(`<p class="x" style="color:red" onclick="evil()">Safe <strong>text</strong></p><script>evil()</script><a href="java&#x0A;script:evil" target="_blank">bad</a><a href="https://example.com">good</a><img src="data:text/html;base64,AAAA"><img src="data:image/png;base64,AAAA">`);
  assert.ok(cleaned.includes("<strong>text</strong>"));
  assert.ok(!cleaned.includes("script"));
  assert.ok(!cleaned.includes("onclick"));
  assert.ok(!cleaned.includes("style="));
  assert.ok(!cleaned.includes("target="));
  assert.ok(!cleaned.includes("data:text/html"));
  assert.ok(cleaned.includes('href="https://example.com"'));
  assert.ok(cleaned.includes('rel="noopener noreferrer"'));
  assert.ok(cleaned.includes("data:image/png;base64,AAAA"));
});

test("actor preference writes require ownership and update only a safe leaf", async () => {
  const writes = [];
  const actor = {
    isOwner: true,
    setFlag: async (...args) => writes.push(args)
  };
  game.actors = new Map([["a1", actor]]);
  assert.equal(await utils.setActorPref("a1", "menuFontSize", 18), true);
  assert.deepEqual(writes, [["cypher-taskbar", "taskbarPrefs.menuFontSize", 18]]);
  assert.equal(await utils.setActorPref("a1", "__proto__", {}), false);
  assert.equal(await utils.setActorPref("a1", "bad.key", 1), false);
  actor.isOwner = false;
  assert.equal(await utils.setActorPref("a1", "menuFontSize", 20), false);
  assert.equal(writes.length, 1);
});

test("legacy preference migration filters keys, preserves flags, and clears only after success", async () => {
  const writes = [];
  const actor = {
    isOwner: true,
    getFlag: () => ({ existing: 2 }),
    setFlag: async (...args) => writes.push(args)
  };
  const old = JSON.stringify({ a1: { safe_key: 1, "bad.key": 3, constructor: 4 } });
  const settingWrites = [];
  game.actors = new Map([["a1", actor]]);
  game.settings = {
    get: (scope, key) => key === "actorPreferences" ? old : false,
    set: async (...args) => settingWrites.push(args)
  };
  await utils.migrateActorPreferences();
  assert.deepEqual(writes, [["cypher-taskbar", "taskbarPrefs", { safe_key: 1, existing: 2 }]]);
  assert.deepEqual(settingWrites, [["cypher-taskbar", "actorPreferences", "{}"]]);
});

test("global-default import keeps JSON-safe leaves and rejects prototype paths", () => {
  const source = JSON.parse(`{"taskbarSettings":{"safe":1,"__proto__":{"polluted":true},"bad.key":2,"fn":null},"portraitSettings":{"portraitWidth":200},"otherSettings":{"deep":{"ok":true}}}`);
  const normalized = normalizeGlobalDefaults(source);
  assert.deepEqual(normalized, { safe: 1, fn: null, portraitWidth: 200, deep: { ok: true } });
  assert.equal({}.polluted, undefined);
  assert.deepEqual(normalizeGlobalDefaults([]), {});
  assert.deepEqual(normalizeGlobalDefaults({ taskbarHeight: 90, unknown: true }), { taskbarHeight: 90 });
  const cyclic = { taskbarSettings: {} };
  cyclic.taskbarSettings.loop = cyclic;
  assert.deepEqual(normalizeGlobalDefaults(cyclic), {});
});

test("apply-to-all writes current actors' taskbarPrefs leaves, not obsolete settings flags", async () => {
  const writes = [];
  const actor = {
    id: "a1", name: "One",
    setFlag: async (...args) => writes.push(args)
  };
  game.user = { id: "gm", isGM: true };
  game.actors = new Map([["a1", actor]]);
  game.actors.contents = [actor];
  const config = new GlobalTaskbarDefaultsConfig();
  await config._applyToAllActors({ menuFontSize: 17, portraitWidth: 180 });
  assert.deepEqual(writes, [
    ["cypher-taskbar", "taskbarPrefs.menuFontSize", 17],
    ["cypher-taskbar", "taskbarPrefs.portraitWidth", 180]
  ]);
});

test("gallery socket payload validation bounds shape and deduplicates recipients", () => {
  const valid = normalizeGallerySharePayload({
    type: "showImage", src: " https://example.com/a.png ", title: " Title ", senderId: " user1 ",
    userIds: ["u1", "u1", "u2"], shareMode: "selected", sendToGM: false, extra: "discarded"
  });
  assert.deepEqual(valid, {
    type: "showImage", src: "https://example.com/a.png", title: "Title", senderId: "user1",
    userIds: ["u1", "u2"], shareMode: "selected", sendToGM: false
  });
  assert.equal(normalizeGallerySharePayload(null), null);
  assert.equal(normalizeGallerySharePayload({ type: "other" }), null);
  assert.equal(normalizeGallerySharePayload({ ...valid, userIds: [] }), null);
  assert.equal(normalizeGallerySharePayload({ ...valid, src: "bad\u0000src" }), null);
  assert.equal(normalizeGallerySharePayload({ ...valid, userIds: Array(101).fill("u") }), null);
  assert.equal(normalizeGallerySharePayload({ ...valid, sendToGM: "yes" }), null);
});

function equipmentFixture(quantity = 2, field = "quantity") {
  const updates = [];
  const deletions = [];
  const item = {
    id: "i1", type: "equipment",
    system: { basic: { [field]: quantity } },
    update: async update => updates.push(update)
  };
  const actor = {
    id: "a1", isOwner: true,
    items: new Map([["i1", item]]),
    deleteEmbeddedDocuments: async (...args) => deletions.push(args)
  };
  game.actors = new Map([["a1", actor]]);
  return { actor, item, updates, deletions };
}

test("equipment expenditure decrements the current quantity field", async () => {
  const fixture = equipmentFixture(3, "quantity");
  const result = await resolveEquipmentExpenditure(fixture.actor, fixture.item);
  assert.deepEqual(result, { isLast: false, remaining: 2 });
  assert.deepEqual(fixture.updates, [{ "system.basic.quantity": 2 }]);
  assert.equal(fixture.deletions.length, 0);
  const amountFixture = equipmentFixture(2, "amount");
  await resolveEquipmentExpenditure(amountFixture.actor, amountFixture.item);
  assert.deepEqual(amountFixture.updates, [{ "system.basic.amount": 1 }]);
});

test("equipment expenditure deletes only last or explicitly removed items", async () => {
  const last = equipmentFixture(1);
  assert.deepEqual(await resolveEquipmentExpenditure(last.actor, last.item), { isLast: true, remaining: 0 });
  assert.deepEqual(last.deletions, [["Item", ["i1"]]]);
  const removed = equipmentFixture(8);
  await resolveEquipmentExpenditure(removed.actor, removed.item, { remove: true });
  assert.deepEqual(removed.deletions, [["Item", ["i1"]]]);
  assert.equal(removed.updates.length, 0);
});

test("equipment expenditure rejects stale or unowned current documents", async () => {
  const stale = equipmentFixture(2);
  await assert.rejects(() => resolveEquipmentExpenditure(stale.actor, { id: "missing" }), /no longer owned or valid/);
  stale.actor.isOwner = false;
  await assert.rejects(() => resolveEquipmentExpenditure(stale.actor, stale.item), /no longer owned or valid/);
});

test("GM request claims require a well-formed ID, reject replay, and stay bounded", () => {
  const instance = bareTaskbar();
  game.user = { id: "gm", isGM: true };
  const request = validRequest();
  assert.equal(instance._claimGmRequest(request), true);
  assert.equal(instance._claimGmRequest(request), false);
  assert.equal(instance._claimGmRequest({ ...request, requestId: "short" }), false);
  assert.equal(instance._claimGmRequest({ ...request, requestId: "abcdefghijklmn__" }), false);
  assert.equal(instance._claimGmRequest(null), false);
  for (let i = 0; i < 300; i++) instance._claimGmRequest({ type: "x", requestId: `abcdefgh${String(i).padStart(8, "0")}` });
  assert.equal(instance._handledGmRequests.size, 256);
  game.user = { id: "player", isGM: false };
  assert.equal(instance._claimGmRequest({ type: "new", requestId: "abcdefgh87654321" }), false);
});

test("rest approval requires a fresh matching pending request", () => {
  const instance = bareTaskbar();
  instance.actor = { id: "a1" };
  instance.render = () => {};
  instance._pendingRestRequests = new Map([
    ["req1", { actorId: "a1", createdAt: Date.now() }],
    ["old1", { actorId: "a1", createdAt: Date.now() - 600001 }]
  ]);
  game.user = { id: "player", isGM: false };
  instance._onRestApproved({ targetUserId: "other", requestId: "req1", actorId: "a1" });
  assert.equal(instance._pendingRestRequests.size, 2);
  instance._onRestApproved({ targetUserId: "player", requestId: "old1", actorId: "a1" });
  assert.equal(instance._pendingRestRequests.has("old1"), true);
  instance._onRestApproved({ targetUserId: "player", requestId: "req1", actorId: "wrong" });
  assert.equal(instance._pendingRestRequests.has("req1"), true);
  instance._onRestApproved({ targetUserId: "player", requestId: "req1", actorId: "a1" });
  assert.equal(instance._pendingRestRequests.has("req1"), false);
});

test("mini-item normalization removes malformed entries and bounds stored strings", () => {
  const instance = bareTaskbar();
  const normalized = instance._normalizeMiniItems([
    null, [], "bad",
    { uuid: "Actor.a1", name: "A".repeat(250), img: 42, icon: "fas fa-user", color: "#fff", type: "Actor" }
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].name.length, 200);
  assert.equal(normalized[0].img, "icons/svg/book.svg");
  assert.equal(normalized[0].uuid, "Actor.a1");
  assert.deepEqual(instance._normalizeMiniItems({ nope: true }), []);
});

test("mini overrides use a null prototype and tolerate prototype-like keys", () => {
  const instance = bareTaskbar();
  const source = JSON.parse(`{"__proto__":{"name":"Safe"},"constructor":{"description":"Also safe"},"bad":null}`);
  const overrides = instance._normalizeMiniOverrides(source);
  assert.equal(Object.getPrototypeOf(overrides), null);
  assert.equal(overrides.__proto__.name, "Safe");
  assert.equal(overrides.constructor.description, "Also safe");
  assert.equal(Object.hasOwn(overrides, "bad"), false);
  assert.equal({}.name, undefined);
});

test("mini save reports failure and preserves a false persistence result", async () => {
  const instance = bareTaskbar();
  instance._ss = async () => false;
  assert.equal(await instance._saveMiniItems("notes", []), false);
  instance._ss = async () => true;
  assert.equal(await instance._saveMiniItems("notes", []), true);
  instance._ss = async () => { throw new Error("write failed"); };
  assert.equal(await instance._saveMiniItems("notes", []), false);
});

test("mini additions enforce capacity, duplicates, and in-flight deduplication", async () => {
  const instance = bareTaskbar();
  instance.actor = { id: "a1" };
  instance._gjson = () => Array(100).fill({ name: "entry", img: "image.png" });
  assert.equal(await instance._addMiniItem("notes", { img: "new.png" }, "#fff"), false);

  instance._gjson = () => [{ uuid: "Actor.a1", name: "Existing", img: "a.png" }];
  assert.equal(await instance._addMiniItem("notes", { uuid: "Actor.a1" }, "#fff"), false);

  instance._gjson = () => [];
  let release;
  instance._addMiniItemInternal = () => new Promise(resolve => { release = resolve; });
  const first = instance._addMiniItem("notes", { img: "new.png" }, "#fff");
  const second = await instance._addMiniItem("NOTES", { img: "new.png" }, "#fff");
  assert.equal(second, false);
  release(true);
  assert.equal(await first, true);
  assert.equal(instance._miniAddPending.size, 0);
});

test("XP adjustment uses current actor state, clamps, and rejects invalid writes", async () => {
  const instance = bareTaskbar();
  instance.actor = { id: "a1" };
  const updates = [];
  const actor = {
    id: "a1", type: "pc", isOwner: true,
    system: { basic: { xp: 9 } },
    update: async update => updates.push(update)
  };
  game.actors = new Map([["a1", actor]]);
  assert.equal(await instance._adjustXP(5), true);
  assert.deepEqual(updates, [{ "system.basic.xp": 10 }]);
  assert.equal(await instance._adjustXP(-20), false);
  assert.equal(await instance._adjustXP(1.5), false);
  actor.isOwner = false;
  assert.equal(await instance._adjustXP(-1), false);
  actor.isOwner = true;
  actor.type = "npc";
  assert.equal(await instance._adjustXP(-1), false);
  assert.equal(updates.length, 1);
});

test("pool adjustment allowlists pools and clamps to current native maxima", async () => {
  const instance = bareTaskbar();
  instance.actor = { id: "a1" };
  const updates = [];
  const actor = {
    id: "a1", type: "pc", isOwner: true,
    system: { pools: { might: { value: 8, max: 10 }, speed: { value: 0, max: 9 } } },
    update: async update => updates.push(update)
  };
  game.actors = new Map([["a1", actor]]);
  assert.equal(await instance._adjustPool("might", 5), true);
  assert.deepEqual(updates, [{ "system.pools.might.value": 10 }]);
  assert.equal(await instance._adjustPool("speed", -2), true);
  assert.equal(updates.length, 1);
  assert.equal(await instance._adjustPool("basic.xp", 1), false);
  actor.system.pools.might.value = 1.5;
  assert.equal(await instance._adjustPool("might", 1), false);
});

test("ammo expenditure supports disabled integration and validates current linked ammo", async () => {
  const instance = bareTaskbar();
  instance.actor = { id: "a1" };
  const updates = [];
  const ammo = {
    id: "ammo", name: "Arrows", system: { basic: { quantity: 2 } },
    update: async update => updates.push(update)
  };
  const weapon = {
    id: "weapon", name: "Bow", actor: { id: "a1" },
    getFlag: () => ({ ammoEnabled: true, ammoItem: { id: "ammo" } })
  };
  const actor = {
    id: "a1", name: "Archer", isOwner: true,
    items: new Map([["weapon", weapon], ["ammo", ammo]])
  };
  game.actors = new Map([["a1", actor]]);
  assert.equal(await instance._expendAttackAmmo(weapon), true);
  assert.deepEqual(updates, [{ "system.basic.quantity": 1 }]);
  ammo.system.basic.quantity = 0;
  assert.equal(await instance._expendAttackAmmo(weapon), false);
  weapon.getFlag = () => ({ ammoEnabled: false });
  assert.equal(await instance._expendAttackAmmo(weapon), true);
  actor.isOwner = false;
  assert.equal(await instance._expendAttackAmmo(weapon), false);
});

test("rerolls pass reroll mode without repeating ammo costs or forcing damage", async () => {
  const instance = bareTaskbar();
  instance.actor = { id: "a1" };
  const item = { id: "i1", name: "Attack" };
  const actor = { id: "a1", type: "pc", isOwner: true, items: new Map([["i1", item]]) };
  game.actors = new Map([["a1", actor]]);
  let received;
  instance._performNativeAttackRoll = async (_actor, _item, options) => { received = options; return 15; };
  instance._expendAttackAmmo = async () => { throw new Error("Ammo must not be repeated by reroll dispatcher"); };
  const result = await instance._performRerollFromData({
    rollType: "attack", skillItemId: "i1", timestamp: Date.now(), pool: "speed", baseDamage: 3
  });
  assert.equal(result, 15);
  assert.equal(received.reroll, true);
  assert.equal(received.baseDamage, 3);
  const before = received;
  await instance._performRerollFromData({ rollType: "attack", skillItemId: "i1", timestamp: "bad" });
  assert.equal(received, before);
});

test("task persistence re-fetches the actor and rejects malformed or unowned writes", async () => {
  const instance = bareTaskbar();
  instance.actor = { id: "a1" };
  const writes = [];
  const actor = { isOwner: true, setFlag: async (...args) => writes.push(args) };
  game.actors = new Map([["a1", actor]]);
  await instance._setMyTasks([{ id: "t1", name: "Task" }]);
  assert.deepEqual(writes, [["cypher-taskbar", "myTasks", [{ id: "t1", name: "Task" }]]]);
  await assert.rejects(() => instance._setMyTasks({}), /permission|invalid/);
  actor.isOwner = false;
  await assert.rejects(() => instance._setGMTasks([]), /permission|invalid/);
});

test("rest reset re-fetches current ownership and resets all recoveries", async () => {
  const instance = bareTaskbar();
  const updates = [];
  instance.render = () => {};
  const actor = { id: "a1", type: "pc", isOwner: true, update: async update => updates.push(update) };
  game.actors = new Map([["a1", actor]]);
  assert.equal(await instance._doRest({ id: "a1", type: "pc", isOwner: false }), true);
  assert.deepEqual(updates, [{ ...adapter.RECOVERY_RESET_UPDATE }]);
  actor.isOwner = false;
  assert.equal(await instance._doRest(actor), false);
});

test("static safety invariants cover dynamic execution, core patches, chat authority, and selector safety", () => {
  const root = fileURLToPath(new URL("../scripts/", import.meta.url));
  const sourceFiles = [
    "cypher-taskbar.js", "equipment-panel.js", "gallery-tabs.js", "persona-panel.js", "combat-bar.js",
    "combat-bar-appearance.js"
  ];
  const sources = Object.fromEntries(sourceFiles.map(name => [name, readFileSync(`${root}${name}`, "utf8")]));
  for (const [name, source] of Object.entries(sources)) {
    assert.ok(!/\beval\s*\(|new\s+Function\b/.test(source), `${name} contains dynamic execution`);
    assert.ok(!/foundry\.utils\.logCompatibilityWarning\s*=/.test(source), `${name} patches the core logger`);
  }
  assert.ok(sources["cypher-taskbar.js"].includes('Hooks.on("renderChatMessageHTML"'));
  assert.ok(sources["cypher-taskbar.js"].includes("requesterOwnsActor"));
  assert.ok(sources["cypher-taskbar.js"].includes("cashSpend"));
  assert.ok(sources["equipment-panel.js"].includes('header.dataset.equipmentCategoryHeader === categoryId'));
  assert.ok(!/querySelector\([^\n]*\$\{[^}]*category/i.test(sources["equipment-panel.js"]));
});


test("combat bar offers six unique presets with complete allowlisted icon maps", () => {
  const requiredIcons = [
    "target", "move", "attack", "ability", "spell", "skill", "item", "other", "end",
    "resourceMove", "resourceAction", "resourceUtility"
  ];
  assert.equal(COMBAT_BAR_PRESETS.length, 6);
  assert.equal(new Set(COMBAT_BAR_PRESETS.map(preset => preset.id)).size, 6);
  assert.deepEqual(COMBAT_BAR_PRESETS.map(preset => preset.id), [
    "default", "aurora", "ember", "nebula", "verdant", "monochrome"
  ]);
  for (const preset of COMBAT_BAR_PRESETS) {
    for (const key of requiredIcons) {
      assert.match(preset.icons[key], /^fa-[a-z0-9-]+$/, `${preset.id}.${key} must be a fixed icon class`);
    }
  }
  assert.equal(normalizeCombatBarPreset("aurora"), "aurora");
  assert.equal(normalizeCombatBarPreset("not-a-preset"), "default");
  assert.equal(normalizeCombatBarPreset(null), "default");
  assert.equal(getCombatBarPreset("invalid").id, "default");
});

test("combat bar preset cards expose selection through text and aria-pressed", () => {
  const container = document.createElement("div");
  container.innerHTML = renderCombatBarPresetCards("nebula");
  const cards = [...container.querySelectorAll("[data-cb-preset]")];
  assert.equal(cards.length, 6);
  for (const card of cards) {
    const selected = card.dataset.cbPreset === "nebula";
    assert.equal(card.getAttribute("aria-pressed"), String(selected));
    assert.equal(card.classList.contains("is-selected"), selected);
    assert.equal(card.querySelector(".ct-cb-preset-state").textContent, selected ? "Selected" : "Use");
    assert.equal(card.querySelectorAll(".ct-cb-preview-icon").length, 4);
  }
  container.innerHTML = renderCombatBarPresetCards("unknown");
  assert.equal(container.querySelector('[data-cb-preset="default"]').getAttribute("aria-pressed"), "true");
});

test("combat bar preset saving deduplicates clicks, refreshes once, and rolls back failures", async () => {
  const container = document.createElement("div");
  container.innerHTML = `<input type="hidden" id="ts-combat-bar-preset" value="default">
    <div class="ct-cb-preset-grid">${renderCombatBarPresetCards("default")}</div>`;
  const input = container.querySelector("#ts-combat-bar-preset");
  const grid = container.querySelector(".ct-cb-preset-grid");
  const saves = [];
  const errors = [];
  let refreshes = 0;
  let saveImpl = async () => true;
  const binder = bindCombatBarPresetCards(container, {
    save: value => { saves.push(value); return saveImpl(); },
    refresh: () => { refreshes++; },
    onError: error => errors.push(error)
  });

  let releaseSave;
  saveImpl = () => new Promise(resolve => { releaseSave = resolve; });
  const pending = binder.select("aurora");
  assert.equal(grid.getAttribute("aria-busy"), "true");
  assert.ok([...container.querySelectorAll("[data-cb-preset]")].every(button => button.disabled));
  assert.equal(await binder.select("ember"), false, "an in-flight selection must ignore later clicks");
  assert.equal(input.value, "aurora");
  releaseSave(true);
  assert.equal(await pending, true);
  assert.deepEqual(saves, ["aurora"]);
  assert.equal(refreshes, 1);
  assert.equal(grid.hasAttribute("aria-busy"), false);
  assert.equal(container.querySelector('[data-cb-preset="aurora"]').getAttribute("aria-pressed"), "true");
  assert.equal(container.querySelector('[data-cb-preset="aurora"] .ct-cb-preset-state').textContent, "Selected");

  saveImpl = async () => false;
  assert.equal(await binder.select("ember"), false);
  assert.equal(input.value, "aurora", "a rejected write restores the previous selection");
  assert.equal(container.querySelector('[data-cb-preset="aurora"]').getAttribute("aria-pressed"), "true");
  assert.equal(container.querySelector('[data-cb-preset="ember"]').getAttribute("aria-pressed"), "false");
  assert.equal(refreshes, 1, "a failed save does not rebuild the bar");
  assert.equal(errors.length, 1);
  assert.ok([...container.querySelectorAll("[data-cb-preset]")].every(button => !button.disabled));
});

test("combat bar markup and render key update immediately with the selected preset", () => {
  let selected = "default";
  const tb = bareTaskbar();
  tb._cbState = () => ({ combatId: "combat1", combatantId: "combatant1", needInitiative: false });
  tb._gs = key => key === "combatBarPreset" ? selected : 98;
  tb._hasSpellCategory = () => true;
  const classic = tb._buildCombatBar(null);
  const classicKey = tb._cbKey(tb._cbState());
  assert.ok(classic.includes("ct-cb-theme-default"));
  assert.ok(classic.includes(`fas ${getCombatBarPreset("default").icons.target}`));

  selected = "aurora";
  const aurora = tb._buildCombatBar(null);
  assert.ok(aurora.includes("ct-cb-theme-aurora"));
  assert.ok(aurora.includes('data-cb-theme="aurora"'));
  assert.ok(aurora.includes(`fas ${getCombatBarPreset("aurora").icons.target}`));
  assert.ok(aurora.includes(`fas ${getCombatBarPreset("aurora").icons.resourceUtility}`));
  assert.notEqual(tb._cbKey(tb._cbState()), classicKey);
  assert.ok(!aurora.includes("ct-cb-theme-default"));

  selected = "invalid";
  assert.ok(tb._buildCombatBar(null).includes("ct-cb-theme-default"));
});

test("canvas coordinate helpers use the event-specific V14 API and a scaled inverse-transform fallback", () => {
  const previousCanvas = globalThis.canvas;
  const view = document.createElement("canvas");
  view.width = 800;
  view.height = 600;
  view.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 300 });
  globalThis.canvas = {
    app: { view, renderer: { width: 800, height: 600 } },
    stage: { worldTransform: { a: 2, b: 0, c: 0, d: 2, tx: 100, ty: 50 } },
    mousePosition: { x: 9999, y: 9999 },
    canvasCoordinatesFromClient: (x, y) => ({ x: x + 1, y: y + 2 }),
    clientCoordinatesFromCanvas: (x, y) => ({ x: x - 1, y: y - 2 })
  };
  try {
    assert.deepEqual(_cbClientToWorld(85, 95), { x: 86, y: 97 });
    assert.deepEqual(_cbWorldToClient(150, 150), { x: 149, y: 148 });

    delete globalThis.canvas.canvasCoordinatesFromClient;
    delete globalThis.canvas.clientCoordinatesFromCanvas;
    assert.deepEqual(_cbWorldToClient(150, 150), { x: 210, y: 195 });
    assert.deepEqual(_cbClientToWorld(210, 195), { x: 150, y: 150 });
    assert.equal(_cbClientToWorld(Number.NaN, 20), null);
  } finally {
    globalThis.canvas = previousCanvas;
  }
});

test("MOVE acquires the visible token from pointerdown, drags it, and restores interaction on exit", () => {
  const previousCanvas = globalThis.canvas;
  const previousAdd = window.addEventListener;
  const previousRemove = window.removeEventListener;
  const handlers = new Map();
  window.addEventListener = (type, handler) => handlers.set(type, handler);
  window.removeEventListener = type => handlers.delete(type);

  const view = document.createElement("canvas");
  view.id = "board";
  view.width = 800;
  view.height = 600;
  view.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 300 });
  view.setPointerCapture = () => {};
  view.releasePointerCapture = () => {};
  document.body.appendChild(view);

  const token = {
    id: "token1",
    eventMode: "static",
    interactive: true,
    position: {
      x: 100,
      y: 100,
      set(x, y) { this.x = x; this.y = y; }
    },
    document: { id: "token1", x: 100, y: 100, detached: false }
  };
  globalThis.canvas = {
    ready: true,
    app: { view, renderer: { width: 800, height: 600, resolution: 2 } },
    stage: { eventMode: "static", worldTransform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } },
    tokens: { placeables: [token] },
    scene: { grid: { units: "m" } },
    mousePosition: { x: 9999, y: 9999 },
    canvasCoordinatesFromClient: (x, y) => ({ x: (x - 10) * 2, y: (y - 20) * 2 }),
    clientCoordinatesFromCanvas: (x, y) => ({ x: x / 2 + 10, y: y / 2 + 20 })
  };

  const overlay = document.createElement("div");
  overlay.innerHTML = `<div class="ct-move-window">
    <div class="ct-move-live"></div>
    <button class="ct-move-undo"></button>
    <button class="ct-move-finish"></button>
  </div>`;
  document.body.appendChild(overlay);
  const tb = bareTaskbar();
  const mode = {
    token,
    start: { x: 100, y: 100 },
    cur: { x: 100, y: 100 },
    docStart: { x: 100, y: 100 },
    tw: 100,
    th: 100,
    dragging: false,
    grab: null,
    maxMeters: 15,
    maxPx: 750,
    thresholdMeters: 1,
    gridSize: 50,
    gridDist: 1,
    mPerUnit: 1,
    overlay,
    liveEl: overlay.querySelector(".ct-move-live"),
    undoBtn: overlay.querySelector(".ct-move-undo"),
    finishBtn: overlay.querySelector(".ct-move-finish"),
    prevInteractive: [],
    prevStageEventMode: null,
    dragHandlers: null,
    esc: () => {}
  };
  tb._cbMoveMode = mode;

  const pointer = (type, clientX, clientY) => ({
    type,
    target: view,
    button: 0,
    pointerId: 7,
    clientX,
    clientY,
    preventDefault() {},
    stopImmediatePropagation() {}
  });

  try {
    tb._cbArmMoveDrag(mode);
    mode.rulerEl.querySelector(".ct-mr-label").getBBox = () => ({ width: 30, height: 10 });
    assert.equal(token.eventMode, "none");
    assert.equal(globalThis.canvas.stage.eventMode, "none");
    assert.ok(handlers.has("pointerdown"));

    handlers.get("pointerdown")(pointer("pointerdown", 85, 95));
    assert.equal(mode.dragging, true, "the token must acquire despite stale canvas.mousePosition");
    assert.deepEqual(mode.grab, { dx: 50, dy: 50 });

    handlers.get("pointermove")(pointer("pointermove", 110, 120));
    assert.deepEqual(mode.cur, { x: 150, y: 150 });
    assert.equal(token.position.x, 150);
    assert.equal(token.position.y, 150);
    assert.equal(mode.liveEl.textContent, "1.4 / 15 m");

    handlers.get("pointerup")(pointer("pointerup", 110, 120));
    assert.equal(mode.dragging, false);
    tb._cbExitMoveMode(false);
    assert.equal(token.eventMode, "static");
    assert.equal(globalThis.canvas.stage.eventMode, "static");
    assert.equal(handlers.size, 0);
    assert.equal(tb._cbMoveMode, null);
  } finally {
    tb._cbMoveMode = null;
    overlay.remove();
    view.remove();
    globalThis.canvas = previousCanvas;
    window.addEventListener = previousAdd;
    window.removeEventListener = previousRemove;
  }
});


test("combat bar END button dispatches the end-turn action", async () => {
  const tb = bareTaskbar();
  tb._cbSyncMoveBtn = () => {};
  tb._cbSyncAttackBtn = () => {};
  tb._cbSyncAbilityBtn = () => {};
  tb._cbSyncSpellBtn = () => {};
  let dispatched = "";
  tb._cbDispatch = async action => { dispatched = action; };
  const node = document.createElement("div");
  node.innerHTML = `<button data-cb-action="move"></button><button data-cb-action="end"><span>END</span></button>`;
  tb._bindCombatBar(node);
  const event = { preventDefault() {}, stopPropagation() {} };
  await node.querySelector('[data-cb-action="end"]').onclick(event);
  assert.equal(dispatched, "end");
});

test("END TURN socket advances and rejects replay with a headless GM taskbar", async () => {
  const previous = {
    user: game.user, users: game.users, combats: game.combats, socket: game.socket,
    instance: CypherTaskbar.instance, endTurnHandler: CypherTaskbar._endTurnHandler
  };
  const requester = { id: "player", active: true, isGM: false };
  const gm = { id: "gm", active: true, isGM: true };
  const users = [requester, gm];
  users.get = id => users.find(user => user.id === id);
  users.activeGM = gm;
  const actor = {
    id: "actor1",
    testUserPermission: (user, level) => user.id === requester.id && level === "OWNER"
  };
  let turns = 0;
  const combat = {
    id: "combat1", started: true,
    combatant: { id: "combatant1", actor },
    nextTurn: async () => {
      turns++;
      combat.combatant = { id: "combatant2", actor: { id: "actor2" } };
    }
  };
  let channel = "";
  let listener = null;
  game.user = gm;
  game.users = users;
  game.combats = new Map([[combat.id, combat]]);
  game.socket = {
    on: (name, handler) => { channel = name; listener = handler; },
    emit: () => { throw new Error("the GM must not relay the request"); }
  };
  CypherTaskbar.instance = null;
  delete CypherTaskbar._endTurnHandler;
  const payload = {
    type: "endTurn", requestId: "abcdefgh12345678", userId: requester.id,
    combatId: combat.id, combatantId: "combatant1"
  };
  try {
    assert.equal(registerCombatBarSocket(CypherTaskbar), true);
    assert.equal(channel, "module.cypher-taskbar");
    assert.equal(typeof listener, "function");
    await listener(payload);
    assert.equal(turns, 1);
    assert.equal(combat.combatant.id, "combatant2");
    await listener(payload);
    assert.equal(turns, 1, "the cached headless handler must retain replay history");
    await listener({ ...payload, requestId: "abcdefgh12345679" });
    assert.equal(turns, 1, "a stale instruction must not advance the new combatant");
  } finally {
    Object.assign(game, {
      user: previous.user, users: previous.users, combats: previous.combats, socket: previous.socket
    });
    CypherTaskbar.instance = previous.instance;
    if (previous.endTurnHandler === undefined) delete CypherTaskbar._endTurnHandler;
    else CypherTaskbar._endTurnHandler = previous.endTurnHandler;
  }
});

test("END TURN advances directly to the next tracked combatant for a GM without a socket request", async () => {
  const previous = { user: game.user, combats: game.combats, socket: game.socket };
  let turns = 0;
  let emits = 0;
  const actor = { id: "actor1", isOwner: true };
  const combat = {
    id: "combat1",
    started: true,
    combatant: { id: "combatant1", actor },
    nextTurn: async () => {
      turns++;
      combat.combatant = { id: "combatant2", actor: { id: "actor2", isOwner: false } };
    }
  };
  game.user = { id: "gm", isGM: true };
  game.combats = new Map([[combat.id, combat]]);
  game.socket = { emit: () => { emits++; } };
  try {
    const tb = bareTaskbar();
    assert.equal(await tb._cbEndTurn({ combatId: combat.id, combatantId: "combatant1" }), true);
    assert.equal(turns, 1);
    assert.equal(combat.combatant.id, "combatant2");
    assert.equal(emits, 0);
  } finally {
    Object.assign(game, previous);
  }
});

test("player END TURN emits one automatic instruction and no approval notification", async () => {
  const previous = { user: game.user, users: game.users, combats: game.combats, socket: game.socket };
  let turns = 0;
  const emitted = [];
  const actor = { id: "actor1", isOwner: true };
  const combat = {
    id: "combat1",
    started: true,
    combatant: { id: "combatant1", actor },
    nextTurn: async () => { turns++; }
  };
  game.user = { id: "player", isGM: false };
  game.users = [{ id: "gm", active: true, isGM: true }];
  game.combats = new Map([[combat.id, combat]]);
  game.socket = { emit: (...args) => emitted.push(args) };
  try {
    const tb = bareTaskbar();
    const state = { combatId: combat.id, combatantId: "combatant1" };
    assert.equal(await tb._cbEndTurn(state), true);
    assert.equal(await tb._cbEndTurn(state), false, "immediate duplicate clicks must be suppressed");
    assert.equal(turns, 0, "a player does not mutate the Combat document directly");
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0][0], "module.cypher-taskbar");
    assert.equal(emitted[0][1].type, "endTurn");
    assert.equal(emitted[0][1].userId, "player");
    assert.equal(emitted[0][1].combatantId, "combatant1");
  } finally {
    Object.assign(game, previous);
  }
});

test("player END TURN rejects an unowned current combatant", async () => {
  const previous = { user: game.user, users: game.users, combats: game.combats, socket: game.socket };
  let emits = 0;
  const combat = {
    id: "combat1",
    started: true,
    combatant: { id: "combatant1", actor: { id: "actor1", isOwner: false } },
    nextTurn: async () => { throw new Error("must not advance"); }
  };
  game.user = { id: "player", isGM: false };
  game.users = [{ id: "gm", active: true, isGM: true }];
  game.combats = new Map([[combat.id, combat]]);
  game.socket = { emit: () => { emits++; } };
  try {
    const tb = bareTaskbar();
    assert.equal(await tb._cbEndTurn({ combatId: combat.id, combatantId: "combatant1" }), false);
    assert.equal(emits, 0);
  } finally {
    Object.assign(game, previous);
  }
});

test("GM end-turn processing needs no modal and validates ownership, current turn, and replay", async () => {
  const previous = { user: game.user, users: game.users, combats: game.combats };
  const requester = { id: "player", name: "Player", active: true, isGM: false };
  const users = [requester, { id: "gm", name: "GM", active: true, isGM: true }];
  users.get = id => users.find(user => user.id === id);
  let turns = 0;
  let modals = 0;
  const actor = {
    id: "actor1",
    testUserPermission: (user, level) => user.id === requester.id && level === "OWNER"
  };
  const combat = {
    id: "combat1",
    started: true,
    combatant: { id: "combatant1", actor },
    nextTurn: async () => { turns++; }
  };
  game.user = { id: "gm", isGM: true };
  game.users = users;
  game.combats = new Map([[combat.id, combat]]);
  const payload = {
    type: "endTurn",
    requestId: "abcdefgh12345678",
    userId: requester.id,
    combatId: combat.id,
    combatantId: "combatant1"
  };
  try {
    const tb = bareTaskbar();
    tb._showCustomModal = async () => { modals++; return "deny"; };
    assert.equal(await tb._processGMEndTurn(payload), true);
    assert.equal(turns, 1);
    assert.equal(modals, 0);
    assert.equal(await tb._processGMEndTurn(payload), false, "the same request ID must not advance twice");
    assert.equal(turns, 1);

    combat.combatant = { id: "combatant2", actor };
    assert.equal(await tb._processGMEndTurn({ ...payload, requestId: "abcdefgh12345679" }), false);
    assert.equal(turns, 1, "a stale combatant must not advance a later turn");

    combat.combatant = { id: "combatant1", actor };
    assert.equal(await tb._processGMEndTurn({ ...payload, requestId: "abcdefgh12345670", userId: "stranger" }), false);
    assert.equal(turns, 1, "the claimed requester must own the current actor");
    assert.equal(modals, 0);
  } finally {
    Object.assign(game, previous);
  }
});
