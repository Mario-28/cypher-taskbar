import { MODULE_ID } from "./utils.js";

export function applyPersonaPanel(CypherTaskbar) {
  Object.assign(CypherTaskbar.prototype, {

    _getPersonaTraits(actor) {
      const raw = foundry.utils.deepClone(actor?.getFlag(MODULE_ID, "personaTraits") ?? []);
      if (!Array.isArray(raw)) return [];
      return raw.slice(0, 6).map((entry) => ({
        name: String(entry?.name ?? "").trim().slice(0, 120),
        description: String(entry?.description ?? "").trim().slice(0, 1000),
        level: Math.max(-3, Math.min(3, Number(entry?.level ?? 0) || 0)),
        imageUrl: String(entry?.imageUrl ?? "").trim().slice(0, 2048),
        imageOpacity: Math.max(0, Math.min(100, Number(entry?.imageOpacity ?? 35) || 35)),
        imagePosition: String(entry?.imagePosition ?? "center center").trim().slice(0, 60),
        imageFit: String(entry?.imageFit ?? "cover").trim().slice(0, 20)
      })).filter((entry) => entry.name || entry.description || entry.imageUrl);
    },

    _personaTraitLevelLabel(level) {
      const value = Math.max(-3, Math.min(3, Number(level) || 0));
      return value > 0 ? `+${value}` : `${value}`;
    },

    _personaTraitPreviewText(text) {
      const value = String(text ?? "").trim();
      if (value.length <= 250) return value;
      return `${value.slice(0, 250).trimEnd()}\u2026`;
    },

    _buildPersonaPersonalitySection(actor) {
      const traits = this._getPersonaTraits(actor);
      const hasRoom = traits.length < 6;
      const cards = traits.map((trait, index) => {
        const imageStyle = trait.imageUrl
          ? `--ct-trait-image:url('${trait.imageUrl.replace(/'/g, "%27")}');--ct-trait-image-opacity:${trait.imageOpacity / 100};--ct-trait-image-position:${foundry.utils.escapeHTML(trait.imagePosition)};--ct-trait-image-fit:${foundry.utils.escapeHTML(trait.imageFit)};`
          : '';
        const preview = foundry.utils.escapeHTML(this._personaTraitPreviewText(trait.description || 'No description provided.')).replace(/\n/g, '<br>');
        const fullText = foundry.utils.escapeHTML(trait.description || 'No description provided.').replace(/\n/g, '<br>');
        return `
        <article class="ct-persona-trait-card${trait.imageUrl ? ' has-bg-image' : ''}" data-persona-trait-card="${index}" style="${imageStyle}">
          <div class="ct-persona-trait-head">
            <div>
              <div class="ct-persona-trait-title">${foundry.utils.escapeHTML(trait.name || `Trait ${index + 1}`)}</div>
              <div class="ct-persona-trait-level ct-trait-level-${trait.level}">Level ${this._personaTraitLevelLabel(trait.level)}</div>
            </div>
            <div class="ct-persona-trait-actions">
              <button type="button" class="ct-panel-settings-btn" data-persona-trait-edit="${index}" title="Edit trait"><i class="fas fa-pen"></i></button>
              <button type="button" class="ct-panel-settings-btn" data-persona-trait-delete="${index}" title="Delete trait"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          <div class="ct-persona-trait-body"><span class="ct-persona-trait-text-preview">${preview}</span><span class="ct-persona-trait-text-full">${fullText}</span></div>
        </article>`;
      }).join("");
      return `
        <div class="ct-persona-personality-layout">
          <div class="ct-persona-personality-toolbar">
            <button type="button" class="ct-panel-settings-btn ct-persona-add-trait-btn" data-persona-trait-add ${hasRoom ? '' : 'disabled'} title="${hasRoom ? 'Add personality trait' : 'Maximum of 6 traits reached'}" aria-label="${hasRoom ? 'Add personality trait' : 'Maximum of 6 traits reached'}"><i class="fas fa-plus"></i></button>
          </div>
          <div class="ct-persona-traits-grid">${cards || `<div class="ct-persona-empty-state"><div class="ct-persona-empty-title">PERSONALITY</div><div class="ct-persona-empty-text">No personality traits yet. Use the plus button to create up to six.</div></div>`}</div>
        </div>`;
    },

    async _openPersonaTraitViewer(index) {
      const actor = this.actor;
      if (!actor) return;
      const traits = this._getPersonaTraits(actor);
      const trait = traits[Number(index)];
      if (!trait) return;

      const imageBlock = trait.imageUrl
        ? `<div class="ct-persona-trait-viewer-image-wrap"><div class="ct-persona-trait-viewer-image" style="background-image:url('${trait.imageUrl.replace(/'/g, "%27")}'); background-position:${foundry.utils.escapeHTML(trait.imagePosition || 'center center')}; background-size:${foundry.utils.escapeHTML(trait.imageFit || 'cover')}; opacity:${Math.max(0, Math.min(100, Number(trait.imageOpacity ?? 35) || 35)) / 100};"></div></div>`
        : '';
      const content = `
        <div class="ct-persona-trait-viewer">
          ${imageBlock}
          <div class="ct-persona-trait-viewer-header">
            <div class="ct-persona-trait-viewer-title">${foundry.utils.escapeHTML(trait.name || `Trait ${Number(index) + 1}`)}</div>
            <div class="ct-persona-trait-viewer-level">Level ${this._personaTraitLevelLabel(trait.level)}</div>
          </div>
          <div class="ct-persona-trait-viewer-body">${foundry.utils.escapeHTML(trait.description || 'No description provided.').replace(/\n/g, '<br>')}</div>
        </div>`;

      new Dialog({
        title: 'Personality Trait',
        content,
        buttons: {
          close: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Close'
          }
        },
        default: 'close'
      }).render(true);
    },

    async _openPersonaTraitDialog(index = null) {
      const actor = this.actor;
      if (!actor) return;
      const traits = this._getPersonaTraits(actor);
      const editing = Number.isInteger(index) && traits[index];
      if (!editing && traits.length >= 6) {
        ui.notifications?.warn?.("You can add up to 6 personality traits.");
        return;
      }
      const current = editing ? traits[index] : { name: "", description: "", level: 0, imageUrl: "", imageOpacity: 35, imagePosition: "center center", imageFit: "cover" };
      const title = editing ? 'Edit Personality Trait' : 'Add Personality Trait';
      const fitOptions = ['cover', 'contain', 'auto', '100% 100%', 'cover no-repeat'];
      const positionOptions = ['center center', 'top center', 'bottom center', 'left center', 'right center', 'top left', 'top right', 'bottom left', 'bottom right'];
      const dialogContent = `
        <form class="ct-persona-trait-form">
          <div class="form-group">
            <label>Trait Name</label>
            <input type="text" name="traitName" maxlength="120" value="${foundry.utils.escapeHTML(current.name || "")}" placeholder="Trait name" />
          </div>
          <div class="form-group">
            <label>Level</label>
            <select name="traitLevel">${Array.from({length: 7}, (_, idx) => idx - 3).map((level) => `<option value="${level}" ${Number(current.level) === level ? 'selected' : ''}>${this._personaTraitLevelLabel(level)}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label>Trait Description</label>
            <textarea name="traitDescription" rows="8" maxlength="1000" placeholder="Describe this personality trait (up to 1000 characters).">${foundry.utils.escapeHTML(current.description || "")}</textarea>
            <p class="notes">Up to 1000 characters.</p>
          </div>
          <div class="form-group">
            <label>Background Image URL</label>
            <input type="url" name="traitImageUrl" maxlength="2048" value="${foundry.utils.escapeHTML(current.imageUrl || "")}" placeholder="https://example.com/image.webp" />
          </div>
          <div class="form-group">
            <label>Image Transparency</label>
            <input type="range" name="traitImageOpacity" min="0" max="100" step="1" value="${Number(current.imageOpacity ?? 35)}" />
            <p class="notes">0 = hidden, 100 = fully visible.</p>
          </div>
          <div class="form-group">
            <label>Image Position</label>
            <select name="traitImagePosition">${positionOptions.map((pos) => `<option value="${pos}" ${current.imagePosition === pos ? 'selected' : ''}>${pos}</option>`).join('')}</select>
          </div>
          <div class="form-group">
            <label>Image Fitting</label>
            <select name="traitImageFit">${fitOptions.map((fit) => `<option value="${fit}" ${current.imageFit === fit ? 'selected' : ''}>${fit}</option>`).join('')}</select>
          </div>
        </form>`;

      const saveFromRoot = async (root) => {
        if (!root) return false;
        const name = String(root.querySelector('[name="traitName"]')?.value ?? "").trim().slice(0, 120);
        const description = String(root.querySelector('[name="traitDescription"]')?.value ?? "").trim().slice(0, 1000);
        const level = Math.max(-3, Math.min(3, Number(root.querySelector('[name="traitLevel"]')?.value ?? 0) || 0));
        const imageUrl = String(root.querySelector('[name="traitImageUrl"]')?.value ?? "").trim().slice(0, 2048);
        const imageOpacity = Math.max(0, Math.min(100, Number(root.querySelector('[name="traitImageOpacity"]')?.value ?? 35) || 35));
        const imagePosition = String(root.querySelector('[name="traitImagePosition"]')?.value ?? 'center center').trim().slice(0, 60);
        const imageFit = String(root.querySelector('[name="traitImageFit"]')?.value ?? 'cover').trim().slice(0, 20);
        if (!name) {
          ui.notifications?.warn?.("Trait name is required.");
          root.querySelector('[name="traitName"]')?.focus?.();
          return false;
        }
        const next = this._getPersonaTraits(actor);
        const entry = { name, description, level, imageUrl, imageOpacity, imagePosition, imageFit };
        if (editing) next[index] = entry;
        else next.push(entry);
        await actor.setFlag(MODULE_ID, 'personaTraits', next.slice(0, 6));
        this.render();
        return true;
      };

      const dlg = new Dialog({
        title,
        content: dialogContent,
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: 'Save',
            callback: async (html) => {
              const root = html?.[0] ?? html;
              await saveFromRoot(root);
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel'
          }
        },
        default: 'save',
        render: (html) => {
          const root = html?.[0] ?? html;
          root?.querySelector('[name="traitName"]')?.focus?.();
        }
      });
      dlg.render(true);
    },

    async _deletePersonaTrait(index) {
      const actor = this.actor;
      if (!actor) return;
      const traits = this._getPersonaTraits(actor);
      if (!Number.isInteger(index) || !traits[index]) return;

      const traitName = traits[index]?.name || `Trait ${index + 1}`;
      const confirmed = await new Promise((resolve) => {
        new Dialog({
          title: 'Delete Personality Trait',
          content: `<p>Delete <strong>${foundry.utils.escapeHTML(traitName)}</strong>?</p>`,
          buttons: {
            yes: {
              icon: '<i class="fas fa-trash"></i>',
              label: 'Delete',
              callback: () => resolve(true)
            },
            no: {
              icon: '<i class="fas fa-times"></i>',
              label: 'Cancel',
              callback: () => resolve(false)
            }
          },
          default: 'no',
          close: () => resolve(false)
        }).render(true);
      });

      if (!confirmed) return;
      traits.splice(index, 1);
      await actor.setFlag(MODULE_ID, 'personaTraits', traits);
      this.render();
    },

    _getPersonaArcs(actor) {
      const raw = foundry.utils.deepClone(actor?.getFlag(MODULE_ID, "personaArcs") ?? []);
      if (!Array.isArray(raw)) return [];
      return raw.map((entry) => ({
        title: String(entry?.title ?? "").trim().slice(0, 140),
        opening: String(entry?.opening ?? "").trim().slice(0, 4000),
        steps: Array.isArray(entry?.steps) ? entry.steps.map((step) => ({
          text: String(step?.text ?? "").trim().slice(0, 1000),
          done: !!step?.done
        })).filter((step) => step.text) : [],
        climax: String(entry?.climax ?? "").trim().slice(0, 4000),
        climaxXp: [2, 4].includes(Number(entry?.climaxXp)) ? Number(entry?.climaxXp) : 4,
        resolution: String(entry?.resolution ?? "").trim().slice(0, 4000),
        imageUrl: String(entry?.imageUrl ?? "").trim().slice(0, 2048),
        imageOpacity: Math.max(0, Math.min(100, Number(entry?.imageOpacity ?? 28) || 28)),
        imagePosition: String(entry?.imagePosition ?? "center center").trim().slice(0, 60),
        imageFit: String(entry?.imageFit ?? "cover").trim().slice(0, 20)
      })).filter((entry) => entry.title || entry.opening || entry.steps.length || entry.climax || entry.resolution || entry.imageUrl);
    },

    _getFocusedPersonaArcIndex(actor) {
      const value = Number(actor?.getFlag?.(MODULE_ID, 'personaFocusedArc'));
      return Number.isInteger(value) && value >= 0 ? value : null;
    },

    _buildPersonaArcSection(actor) {
      const arcs = this._getPersonaArcs(actor);
      const focusedArcIndex = this._getFocusedPersonaArcIndex(actor);
      const cards = arcs.map((arc, index) => {
        const total = arc.steps.length;
        const completed = arc.steps.filter(step => step.done).length;
        const imageStyle = arc.imageUrl
          ? `--ct-arc-image:url('${arc.imageUrl.replace(/'/g, "%27")}');--ct-arc-image-opacity:${arc.imageOpacity / 100};--ct-arc-image-position:${foundry.utils.escapeHTML(arc.imagePosition)};--ct-arc-image-fit:${foundry.utils.escapeHTML(arc.imageFit)};`
          : '';
        const steps = arc.steps.length
          ? `<div class="ct-persona-arc-steps">${arc.steps.map((step, stepIndex) => `<label class="ct-persona-arc-step${step.done ? ' is-done' : ''}"><input type="checkbox" data-persona-arc-step-toggle="${index}" data-persona-arc-step-index="${stepIndex}" ${step.done ? 'checked' : ''}><span>${foundry.utils.escapeHTML(step.text)}</span></label>`).join("")}</div>`
          : `<div class="ct-persona-empty-text">No steps added yet.</div>`;
        return `<article class="ct-persona-arc-card${arc.imageUrl ? ' has-bg-image' : ''}${focusedArcIndex === index ? ' is-focused' : ''}" data-persona-arc-card="${index}" style="${imageStyle}">
          <div class="ct-persona-arc-head">
            <div class="ct-persona-arc-title-wrap">
              <button type="button" class="ct-persona-arc-focus-toggle${focusedArcIndex === index ? ' is-active' : ''}" data-persona-arc-focus="${index}" title="${focusedArcIndex === index ? 'Clear focused ARC' : 'Set focused ARC'}" aria-label="${focusedArcIndex === index ? 'Clear focused ARC' : 'Set focused ARC'}"><i class="fas fa-bullseye"></i></button>
              <div>
                <div class="ct-persona-arc-title">${foundry.utils.escapeHTML(arc.title || `Arc ${index + 1}`)}</div>
                <div class="ct-persona-arc-progress">${completed}/${total} steps finished</div>
              </div>
            </div>
            <div class="ct-persona-trait-actions">
              <button type="button" class="ct-panel-settings-btn" data-persona-arc-edit="${index}" title="Edit arc"><i class="fas fa-pen"></i></button>
              <button type="button" class="ct-panel-settings-btn" data-persona-arc-delete="${index}" title="Delete arc"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          <div class="ct-persona-arc-stage"><div class="ct-persona-arc-stage-head"><span class="ct-persona-arc-stage-label">Opening</span><button type="button" class="ct-persona-arc-stage-info" title="0 XP" aria-label="Opening XP: 0 XP"><i class="fas fa-info-circle"></i></button></div><div class="ct-persona-arc-copy">${foundry.utils.escapeHTML(arc.opening || 'No opening added yet.').replace(/\n/g, '<br>')}</div></div>
          <div class="ct-persona-arc-stage"><div class="ct-persona-arc-stage-head"><span class="ct-persona-arc-stage-label">Steps</span><button type="button" class="ct-persona-arc-stage-info" title="2 XP / step" aria-label="Steps XP: 2 XP per step"><i class="fas fa-info-circle"></i></button></div>${steps}</div>
          <div class="ct-persona-arc-stage-grid">
            <div class="ct-persona-arc-stage"><div class="ct-persona-arc-stage-head"><span class="ct-persona-arc-stage-label">Climax</span><button type="button" class="ct-persona-arc-stage-info" title="${arc.climaxXp} XP" aria-label="Climax XP: ${arc.climaxXp} XP"><i class="fas fa-info-circle"></i></button></div><div class="ct-persona-arc-copy">${foundry.utils.escapeHTML(arc.climax || 'No climax added yet.').replace(/\n/g, '<br>')}</div></div>
            <div class="ct-persona-arc-stage"><div class="ct-persona-arc-stage-head"><span class="ct-persona-arc-stage-label">Resolution</span><button type="button" class="ct-persona-arc-stage-info" title="1 XP" aria-label="Resolution XP: 1 XP"><i class="fas fa-info-circle"></i></button></div><div class="ct-persona-arc-copy">${foundry.utils.escapeHTML(arc.resolution || 'No resolution added yet.').replace(/\n/g, '<br>')}</div></div>
          </div>
        </article>`;
      }).join("");

      const arcShortcuts = arcs.length
        ? `<div class="ct-persona-arc-shortcuts">${arcs.map((arc, index) => `<button type="button" class="ct-persona-arc-jump" data-persona-arc-jump="${index}" title="Jump to ${foundry.utils.escapeHTML(arc.title || `Arc ${index + 1}`)}">${foundry.utils.escapeHTML(arc.title || `Arc ${index + 1}`)}</button>`).join("")}</div>`
        : '';

      return `<div class="ct-persona-arc-layout">
        <div class="ct-persona-personality-toolbar ct-persona-arc-toolbar">
          ${arcShortcuts}
          <button type="button" class="ct-panel-settings-btn ct-persona-add-trait-btn" data-persona-arc-add title="Add arc"><i class="fas fa-plus"></i></button>
        </div>
        <div class="ct-persona-arc-grid">${cards || `<div class="ct-persona-empty-state"><div class="ct-persona-empty-title">ARC</div><div class="ct-persona-empty-text">No arcs yet. Use the plus button to create the first story arc.</div></div>`}</div>
      </div>`;
    },

    async _openPersonaArcDialog(index = null) {
      const actor = this.actor;
      if (!actor) return;
      const arcs = this._getPersonaArcs(actor);
      const editing = Number.isInteger(index) && index >= 0 && index < arcs.length;
      const current = editing ? foundry.utils.deepClone(arcs[index]) : {
        title: "",
        opening: "",
        steps: [{ text: "", done: false }],
        climax: "",
        climaxXp: 4,
        resolution: "",
        imageUrl: "",
        imageOpacity: 28,
        imagePosition: "center center",
        imageFit: "cover"
      };

      const stepRows = (current.steps.length ? current.steps : [{ text: "", done: false }]).map((step, stepIndex) => `
        <div class="ct-persona-arc-step-editor${step.done ? ' is-done' : ''}" data-arc-step-row="${stepIndex}">
          <label class="ct-persona-arc-step-check"><input type="checkbox" data-arc-step-done ${step.done ? 'checked' : ''}></label>
          <textarea rows="2" data-arc-step-text placeholder="Describe this arc step...">${foundry.utils.escapeHTML(step.text || '')}</textarea>
          <button type="button" class="ct-panel-settings-btn ct-arc-step-icon-btn" data-arc-step-remove title="Remove step"><i class="fas fa-trash"></i></button>
        </div>`).join('');

      const content = `
        <form class="ct-persona-arc-dialog">
          <div class="ct-persona-arc-dialog-hero">
            <div class="ct-persona-arc-dialog-kicker">Story Arc Editor</div>
            <div class="ct-persona-arc-dialog-title">${editing ? 'Edit ARC' : 'Create New ARC'}</div>
          </div>
          <label class="ct-arc-field ct-arc-field-full"><span>TITLE</span><input type="text" name="title" maxlength="140" value="${foundry.utils.escapeHTML(current.title)}" placeholder="Name the arc"></label>
          <div class="ct-arc-section-divider"></div>
          <label class="ct-arc-field ct-arc-field-full"><span>OPENING (0 XP)</span><textarea name="opening" rows="3" placeholder="Describe the inciting beat or opening state.">${foundry.utils.escapeHTML(current.opening)}</textarea></label>
          <section class="ct-arc-steps-editor">
            <div class="ct-arc-steps-head"><span>STEPS (2 XP per step)</span><button type="button" class="ct-panel-settings-btn ct-arc-step-icon-btn" data-arc-step-add title="Add step"><i class="fas fa-plus"></i></button></div>
            <div class="ct-arc-steps-wrap">${stepRows}</div>
          </section>
          <div class="ct-arc-dual-fields">
            <label class="ct-arc-field ct-arc-field-full"><span>CLIMAX (4/2 XP)</span><textarea name="climax" rows="3" placeholder="Describe the climax of the arc.">${foundry.utils.escapeHTML(current.climax)}</textarea></label>
          </div>
          <label class="ct-arc-field ct-arc-field-full"><span>RESOLUTION (1 XP)</span><textarea name="resolution" rows="3" placeholder="Describe how the arc resolves.">${foundry.utils.escapeHTML(current.resolution)}</textarea></label>
          <div class="ct-arc-section-divider"></div>
          <div class="ct-persona-arc-dialog-title ct-persona-arc-dialog-title-small">Background Image</div>
          <label class="ct-arc-field ct-arc-field-full"><span>IMAGE URL</span><input type="url" name="imageUrl" value="${foundry.utils.escapeHTML(current.imageUrl)}" placeholder="https://..."></label>
          <div class="ct-arc-triple-fields">
            <label class="ct-arc-field"><span>TRANSPARENCY</span><input type="range" name="imageOpacity" min="0" max="100" step="1" value="${Number(current.imageOpacity) || 28}"><em data-arc-image-opacity-label>${Number(current.imageOpacity) || 28}%</em></label>
            <label class="ct-arc-field"><span>POSITION</span><input type="text" name="imagePosition" value="${foundry.utils.escapeHTML(current.imagePosition || 'center center')}" placeholder="center center"></label>
            <label class="ct-arc-field"><span>FIT</span><select name="imageFit"><option value="cover" ${(current.imageFit || 'cover') === 'cover' ? 'selected' : ''}>Cover</option><option value="contain" ${(current.imageFit || 'cover') === 'contain' ? 'selected' : ''}>Contain</option><option value="fill" ${(current.imageFit || 'cover') === 'fill' ? 'selected' : ''}>Fill</option><option value="none" ${(current.imageFit || 'cover') === 'none' ? 'selected' : ''}>None</option><option value="scale-down" ${(current.imageFit || 'cover') === 'scale-down' ? 'selected' : ''}>Scale-down</option></select></label>
          </div>
        </form>`;

      new Dialog({
        title: editing ? 'Edit ARC' : 'Add ARC',
        content,
        classes: ['ct-persona-arc-dialog-app'],
        buttons: {
          save: {
            icon: '<i class="fas fa-save"></i>',
            label: editing ? 'Save ARC' : 'Create ARC',
            callback: async (html) => {
              const root = html?.[0] ?? html;
              if (!root) return;
              const form = root.querySelector('.ct-persona-arc-dialog');
              if (!form) return;
              const steps = [...form.querySelectorAll('[data-arc-step-row]')].map((row) => ({
                text: String(row.querySelector('[data-arc-step-text]')?.value ?? '').trim().slice(0, 1000),
                done: !!row.querySelector('[data-arc-step-done]')?.checked
              })).filter((step) => step.text);
              const nextArc = {
                title: String(form.querySelector('[name="title"]')?.value ?? '').trim().slice(0, 140),
                opening: String(form.querySelector('[name="opening"]')?.value ?? '').trim().slice(0, 4000),
                steps,
                climax: String(form.querySelector('[name="climax"]')?.value ?? '').trim().slice(0, 4000),
                climaxXp: [2, 4].includes(Number(current.climaxXp)) ? Number(current.climaxXp) : 4,
                resolution: String(form.querySelector('[name="resolution"]')?.value ?? '').trim().slice(0, 4000),
                imageUrl: String(form.querySelector('[name="imageUrl"]')?.value ?? '').trim().slice(0, 2048),
                imageOpacity: Math.max(0, Math.min(100, Number(form.querySelector('[name="imageOpacity"]')?.value ?? 28) || 28)),
                imagePosition: String(form.querySelector('[name="imagePosition"]')?.value ?? 'center center').trim().slice(0, 60) || 'center center',
                imageFit: String(form.querySelector('[name="imageFit"]')?.value ?? 'cover').trim().slice(0, 20) || 'cover'
              };
              if (!nextArc.title && !nextArc.opening && !nextArc.steps.length && !nextArc.climax && !nextArc.resolution && !nextArc.imageUrl) return;
              if (editing) arcs[index] = nextArc;
              else arcs.push(nextArc);
              await actor.setFlag(MODULE_ID, 'personaArcs', arcs);
              this.render();
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: 'Cancel'
          }
        },
        default: 'save',
        render: (html) => {
          const root = html?.[0] ?? html;
          if (!root) return;
          const app = root.closest('.app.dialog');
          if (app) {
            app.classList.add('ct-persona-arc-dialog-app');
            app.style.width = 'min(860px, calc(100vw - 32px))';
            app.style.maxWidth = 'calc(100vw - 32px)';
            app.style.height = 'auto';
            app.style.maxHeight = 'calc(100vh - 32px)';
          }
          const contentEl = root.querySelector('.window-content');
          if (contentEl) {
            contentEl.style.overflow = 'hidden';
            contentEl.style.display = 'flex';
            contentEl.style.flexDirection = 'column';
          }
          const dialogButtons = root.querySelector('.dialog-buttons');
          const hero = root.querySelector('.ct-persona-arc-dialog-hero');
          if (dialogButtons && hero) hero.insertAdjacentElement('beforebegin', dialogButtons);
          const stepsWrap = root.querySelector('.ct-arc-steps-wrap');
          const addButton = root.querySelector('[data-arc-step-add]');
          const opacityInput = root.querySelector('[name="imageOpacity"]');
          const opacityLabel = root.querySelector('[data-arc-image-opacity-label]');
          const syncStepStyles = () => {
            stepsWrap?.querySelectorAll('[data-arc-step-row]').forEach((row) => {
              const checked = !!row.querySelector('[data-arc-step-done]')?.checked;
              row.classList.toggle('is-done', checked);
            });
          };
          const makeRow = (step = { text: '', done: false }) => {
            const row = document.createElement('div');
            row.className = `ct-persona-arc-step-editor${step.done ? ' is-done' : ''}`;
            row.dataset.arcStepRow = 'new';
            row.innerHTML = `<label class="ct-persona-arc-step-check"><input type="checkbox" data-arc-step-done ${step.done ? 'checked' : ''}></label><textarea rows="2" data-arc-step-text placeholder="Describe this arc step...">${foundry.utils.escapeHTML(step.text || '')}</textarea><button type="button" class="ct-panel-settings-btn ct-arc-step-icon-btn" data-arc-step-remove title="Remove step"><i class="fas fa-trash"></i></button>`;
            return row;
          };
          addButton?.addEventListener('click', (event) => {
            event.preventDefault();
            const row = makeRow();
            stepsWrap?.appendChild(row);
            row.querySelector('[data-arc-step-text]')?.focus();
            row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          });
          stepsWrap?.addEventListener('click', (event) => {
            const btn = event.target.closest('[data-arc-step-remove]');
            if (!btn) return;
            event.preventDefault();
            btn.closest('[data-arc-step-row]')?.remove();
          });
          stepsWrap?.addEventListener('change', (event) => {
            if (event.target.matches('[data-arc-step-done]')) syncStepStyles();
          });
          opacityInput?.addEventListener('input', () => {
            if (opacityLabel) opacityLabel.textContent = `${opacityInput.value}%`;
          });
          syncStepStyles();
        }
      }).render(true);
    },

    async _deletePersonaArc(index) {
      const actor = this.actor;
      if (!actor) return;
      const arcs = this._getPersonaArcs(actor);
      if (!Number.isInteger(index) || index < 0 || index >= arcs.length) return;
      const confirmed = await new Promise((resolve) => {
        new Dialog({
          title: 'Delete ARC',
          content: `<p>Delete <strong>${foundry.utils.escapeHTML(arcs[index].title || `Arc ${index + 1}`)}</strong>?</p>`,
          buttons: {
            yes: { icon: '<i class="fas fa-trash"></i>', label: 'Delete', callback: () => resolve(true) },
            no: { icon: '<i class="fas fa-times"></i>', label: 'Cancel', callback: () => resolve(false) }
          },
          default: 'no',
          close: () => resolve(false)
        }).render(true);
      });
      if (!confirmed) return;
      arcs.splice(index, 1);
      await actor.setFlag(MODULE_ID, 'personaArcs', arcs);
      this.render();
    },

    _buildPersonaPanel(actor) {
      const tabs = [
        { key: "personality", label: "PERSONALITY", icon: "fas fa-masks-theater" },
        { key: "arc", label: "ARC", icon: "fas fa-route" }
      ];
      const renderContent = (tab) => {
        if (tab.key === "personality") return this._buildPersonaPersonalitySection(actor);
        if (tab.key === "arc") return this._buildPersonaArcSection(actor);
        return `<div class="ct-persona-empty-state"><div class="ct-persona-empty-title">${tab.label}</div><div class="ct-persona-empty-text">This tab is ready for future content.</div></div>`;
      };
      return `<div class="ct-panel ct-panel-persona-custom" style="${this._getMenuBackgroundVars("persona")}"><div class="ct-panel-header ct-panel-header-persona-menu"><div class="ct-panel-title-wrap"><i class="fas fa-user-circle"></i> <span class="ct-panel-title-text ct-persona-panel-title-text">Persona</span></div><div class="ct-panel-action-group ct-panel-action-group-persona"><div class="ct-persona-header-tabs" role="tablist" aria-orientation="horizontal">${tabs.map((tab, index) => `<button class="ct-persona-tab ct-persona-tab-header${index === 0 ? ' is-active' : ''}" type="button" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}" data-persona-tab="${tab.key}" title="${tab.label}"><i class="${tab.icon}"></i><span>${tab.label}</span></button>`).join("")}</div><button class="ct-panel-settings-btn" data-persona-close title="Close Persona Menu"><i class="fas fa-times"></i></button></div></div><div class="ct-persona-panel-body"><div class="ct-persona-content-wrap">${tabs.map((tab, index) => `<section class="ct-persona-content${index === 0 ? ' is-active' : ''}" data-persona-content="${tab.key}" role="tabpanel" ${index === 0 ? '' : 'hidden'}>${renderContent(tab)}</section>`).join("")}</div></div></div>`;
    },

    _bindPersonaTabs(root = this.element) {
      const scope = root instanceof Element ? root : this.element;
      const panel = scope?.querySelector('.ct-panel-persona-custom');
      if (!panel || panel.dataset.personaBound === 'true') return;
      panel.dataset.personaBound = 'true';

      panel.querySelector('[data-persona-close]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._closePanel();
      });

      const tabs = [...panel.querySelectorAll('[data-persona-tab]')];
      const contents = [...panel.querySelectorAll('[data-persona-content]')];
      const activate = (key) => {
        this._personaActiveTab = key;
        tabs.forEach((tab) => {
          const active = tab.dataset.personaTab === key;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        contents.forEach((content) => {
          const active = content.dataset.personaContent === key;
          content.classList.toggle('is-active', active);
          content.hidden = !active;
        });
      };

      const initialKey = tabs.some(tab => tab.dataset.personaTab === this._personaActiveTab)
        ? this._personaActiveTab
        : tabs[0]?.dataset.personaTab;
      if (initialKey) activate(initialKey);

      tabs.forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          activate(tab.dataset.personaTab);
        });
      });

      panel.querySelector('[data-persona-trait-add]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openPersonaTraitDialog();
      });

      panel.querySelectorAll('[data-persona-trait-edit]').forEach((button) => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._openPersonaTraitDialog(Number(button.dataset.personaTraitEdit));
        });
      });

      panel.querySelectorAll('[data-persona-trait-delete]').forEach((button) => {
        button.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this._deletePersonaTrait(Number(button.dataset.personaTraitDelete));
        });
      });

      panel.querySelectorAll('[data-persona-trait-card]').forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('[data-persona-trait-edit], [data-persona-trait-delete]')) return;
          e.preventDefault();
          e.stopPropagation();
          this._openPersonaTraitViewer(Number(card.dataset.personaTraitCard));
        });
      });

      panel.querySelector('[data-persona-arc-rules]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = e.currentTarget;
        const content = `
          <div class="ct-persona-arc-rules-tooltip">
            <div><strong>Opening</strong> sets the arc premise and awards 0 XP.</div>
            <div><strong>Steps</strong> are repeatable progress beats worth 2 XP each.</div>
            <div><strong>Climax</strong> is the big turning point worth 4 XP or 2 XP, depending on how your table resolves it.</div>
            <div><strong>Resolution</strong> closes the arc and awards 1 XP.</div>
          </div>`;
        game.tooltip.activate(target, { text: content, direction: 'DOWN', cssClass: 'ct-persona-arc-rules-popover' });
        window.setTimeout(() => game.tooltip.dismiss(target), 5000);
      });

      panel.querySelector('[data-persona-arc-add]')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openPersonaArcDialog();
      });


      panel.querySelectorAll('[data-persona-arc-jump]').forEach((button) => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetIndex = Number(button.dataset.personaArcJump);
          const card = panel.querySelector(`[data-persona-arc-card="${targetIndex}"]`);
          if (!card) return;
          panel.querySelectorAll('[data-persona-arc-card]').forEach((entry) => entry.classList.remove('is-arc-target'));
          card.classList.add('is-arc-target');
          card.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
          window.setTimeout(() => card.classList.remove('is-arc-target'), 1800);
        });
      });

      panel.querySelectorAll('[data-persona-arc-focus]').forEach((button) => {
        button.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!this.actor) return;
          const index = Number(button.dataset.personaArcFocus);
          const current = this._getFocusedPersonaArcIndex(this.actor);
          if (current === index) await this.actor.unsetFlag(MODULE_ID, 'personaFocusedArc');
          else await this.actor.setFlag(MODULE_ID, 'personaFocusedArc', index);
          this.render();
        });
      });

      panel.querySelectorAll('[data-persona-arc-edit]').forEach((button) => {
        button.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._openPersonaArcDialog(Number(button.dataset.personaArcEdit));
        });
      });

      panel.querySelectorAll('[data-persona-arc-delete]').forEach((button) => {
        button.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this._deletePersonaArc(Number(button.dataset.personaArcDelete));
        });
      });

      panel.querySelectorAll('[data-persona-arc-step-toggle]').forEach((input) => {
        input.addEventListener('change', async (e) => {
          e.stopPropagation();
          if (!this.actor) return;
          const arcIndex = Number(input.dataset.personaArcStepToggle);
          const stepIndex = Number(input.dataset.personaArcStepIndex);
          const arcs = this._getPersonaArcs(this.actor);
          if (!arcs[arcIndex]?.steps?.[stepIndex]) return;
          arcs[arcIndex].steps[stepIndex].done = !!input.checked;
          await this.actor.setFlag(MODULE_ID, 'personaArcs', arcs);
          this.render();
        });
      });
    },

    async _openFocusedArcWidgetDialog(actor) {
      if (!actor) return;
      const focusedArcIndex = this._getFocusedPersonaArcIndex(actor);
      const arcs = this._getPersonaArcs(actor);
      if (focusedArcIndex === null || !arcs[focusedArcIndex]) {
        ui.notifications?.info?.("No focused ARC selected.");
        return;
      }
      await this._openPersonaArcDialog(focusedArcIndex);
    },

  });
}
