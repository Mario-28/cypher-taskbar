/**
 * Combat Bar appearance presets.
 * Static, validated presentation data only; combat rules live in combat-bar.js.
 */

const PRESETS = [
  {
    id: "default",
    name: "Classic Gold",
    description: "The original dark-glass and gold combat bar.",
    icons: {
      target: "fa-crosshairs", move: "fa-person-running", attack: "fa-sword",
      ability: "fa-bolt", spell: "fa-wand-magic-sparkles", skill: "fa-brain",
      item: "fa-backpack", other: "fa-ellipsis", end: "fa-forward-step",
      resourceMove: "fa-shoe-prints", resourceAction: "fa-hand-fist", resourceUtility: "fa-screwdriver-wrench"
    }
  },
  {
    id: "aurora",
    name: "Aurora Glass",
    description: "Cool cyan glass, crisp lines, and luminous blue accents.",
    icons: {
      target: "fa-location-crosshairs", move: "fa-person-walking", attack: "fa-burst",
      ability: "fa-bolt-lightning", spell: "fa-wand-sparkles", skill: "fa-lightbulb",
      item: "fa-box-open", other: "fa-bars", end: "fa-forward",
      resourceMove: "fa-route", resourceAction: "fa-hand", resourceUtility: "fa-gear"
    }
  },
  {
    id: "ember",
    name: "Ember Edge",
    description: "Sharp graphite tiles with warm orange and crimson energy.",
    icons: {
      target: "fa-bullseye", move: "fa-fire", attack: "fa-khanda",
      ability: "fa-fire-flame-curved", spell: "fa-fire", skill: "fa-book-open",
      item: "fa-briefcase", other: "fa-ellipsis-vertical", end: "fa-forward-fast",
      resourceMove: "fa-shoe-prints", resourceAction: "fa-hand-fist", resourceUtility: "fa-wrench"
    }
  },
  {
    id: "nebula",
    name: "Nebula Pulse",
    description: "Violet depth, bright orchid highlights, and cosmic iconography.",
    icons: {
      target: "fa-satellite-dish", move: "fa-person-running", attack: "fa-star",
      ability: "fa-bolt", spell: "fa-wand-magic-sparkles", skill: "fa-brain",
      item: "fa-gem", other: "fa-ellipsis", end: "fa-forward-step",
      resourceMove: "fa-route", resourceAction: "fa-hand", resourceUtility: "fa-screwdriver-wrench"
    }
  },
  {
    id: "verdant",
    name: "Verdant Circuit",
    description: "Emerald glass, botanical accents, and clean modern geometry.",
    icons: {
      target: "fa-location-crosshairs", move: "fa-person-walking", attack: "fa-sword",
      ability: "fa-seedling", spell: "fa-leaf", skill: "fa-lightbulb",
      item: "fa-box", other: "fa-bars", end: "fa-forward",
      resourceMove: "fa-shoe-prints", resourceAction: "fa-hand-fist", resourceUtility: "fa-gear"
    }
  },
  {
    id: "monochrome",
    name: "Mono Carbon",
    description: "Minimal carbon panels with precise silver and white details.",
    icons: {
      target: "fa-crosshairs", move: "fa-arrows-up-down-left-right", attack: "fa-sword",
      ability: "fa-bolt", spell: "fa-wand-magic", skill: "fa-brain",
      item: "fa-backpack", other: "fa-ellipsis", end: "fa-forward-step",
      resourceMove: "fa-route", resourceAction: "fa-circle", resourceUtility: "fa-square"
    }
  }
];

export const COMBAT_BAR_PRESETS = Object.freeze(PRESETS.map(preset => Object.freeze({
  ...preset,
  icons: Object.freeze({ ...preset.icons })
})));

export function normalizeCombatBarPreset(value) {
  return COMBAT_BAR_PRESETS.some(preset => preset.id === value) ? value : "default";
}

export function getCombatBarPreset(value) {
  const id = normalizeCombatBarPreset(value);
  return COMBAT_BAR_PRESETS.find(preset => preset.id === id);
}

export function renderCombatBarPresetCards(activeValue) {
  const activeId = normalizeCombatBarPreset(activeValue);
  return COMBAT_BAR_PRESETS.map(preset => {
    const selected = preset.id === activeId;
    const preview = [
      ["target", "ct-cb-target"], ["move", "ct-cb-move"],
      ["attack", "ct-cb-attack"], ["ability", ""]
    ];
    return `<button type="button" class="ct-cb-preset-card ct-cb-theme-${preset.id}${selected ? " is-selected" : ""}"
      data-cb-preset="${preset.id}" aria-pressed="${selected}">
      <span class="ct-cb-preset-preview" aria-hidden="true">${preview.map(([action, className]) =>
        `<span class="ct-cb-preview-icon ${className}"><i class="fas ${preset.icons[action]}"></i></span>`).join("")}</span>
      <span class="ct-cb-preset-copy"><strong>${preset.name}</strong><small>${preset.description}</small></span>
      <span class="ct-cb-preset-state">${selected ? "Selected" : "Use"}</span>
    </button>`;
  }).join("");
}

/** Bind the settings cards without coupling persistence to combat behavior. */
export function bindCombatBarPresetCards(popup, { save, refresh, onError } = {}) {
  const input = popup?.querySelector?.("#ts-combat-bar-preset");
  const grid = popup?.querySelector?.(".ct-cb-preset-grid");
  const buttons = [...(popup?.querySelectorAll?.("[data-cb-preset]") ?? [])];
  let saving = false;

  const paint = value => {
    const selectedId = normalizeCombatBarPreset(value);
    if (input) input.value = selectedId;
    buttons.forEach(button => {
      const selected = button.dataset.cbPreset === selectedId;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      const state = button.querySelector(".ct-cb-preset-state");
      if (state) state.textContent = selected ? "Selected" : "Use";
    });
  };

  const select = async value => {
    if (saving || typeof save !== "function") return false;
    const previousId = normalizeCombatBarPreset(input?.value);
    const nextId = normalizeCombatBarPreset(value);
    if (nextId === previousId) return false;
    saving = true;
    grid?.setAttribute("aria-busy", "true");
    buttons.forEach(button => { button.disabled = true; });
    paint(nextId);
    try {
      const saved = await save(nextId);
      if (!saved) throw new Error("The character preference could not be saved.");
      await refresh?.();
      return true;
    } catch (error) {
      paint(previousId);
      if (typeof onError === "function") onError(error);
      else console.error("cypher-taskbar | combat bar appearance save failed", error);
      return false;
    } finally {
      saving = false;
      grid?.removeAttribute("aria-busy");
      buttons.forEach(button => { button.disabled = false; });
    }
  };

  buttons.forEach(button => {
    button.addEventListener("click", () => { void select(button.dataset.cbPreset); });
  });
  return { paint, select };
}
