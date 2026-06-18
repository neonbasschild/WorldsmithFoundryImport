/**
 * ApplicationV2 dialog that lets a GM paste Worldsmith JSON or pick one or more
 * exported `.json` files and import them as dnd5e NPC actors.
 *
 * The interface is built directly as DOM (rather than via Handlebars parts) to
 * keep it resilient across Foundry v13/v14 and to avoid template-loading and
 * handler-binding edge cases.
 */

import { MODULE_ID } from "./constants.mjs";
import { importFromText } from "./importer.mjs";

const { ApplicationV2 } = foundry.applications.api;

export default class WorldsmithImportApp extends ApplicationV2 {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "worldsmith-import",
    classes: ["worldsmith-import-app"],
    tag: "div",
    window: {
      title: "WORLDSMITH.AppTitle",
      icon: "fas fa-dragon",
      resizable: true
    },
    position: {
      width: 560,
      height: "auto"
    }
  };

  /* -------------------------------------------- */

  /** Whether an import is currently running. */
  #importing = false;

  /* -------------------------------------------- */

  /** @override */
  async _renderHTML(context, options) {
    const t = key => game.i18n.localize(key);

    const folders = game.folders
      .filter(f => f.type === "Actor")
      .map(f => ({ id: f.id, name: f.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const folderOptions = [`<option value="">${t("WORLDSMITH.NoFolder")}</option>`]
      .concat(folders.map(f => `<option value="${f.id}">${foundry.utils.escapeHTML?.(f.name) ?? f.name}</option>`))
      .join("");

    const wrapper = document.createElement("div");
    wrapper.className = "worldsmith-import standard-form";
    wrapper.innerHTML = `
      <p class="hint">${t("WORLDSMITH.Intro")}</p>

      <div class="form-group">
        <label>${t("WORLDSMITH.Files")}</label>
        <div class="form-fields">
          <input type="file" name="files" accept=".json,application/json" multiple>
        </div>
        <p class="hint">${t("WORLDSMITH.FilesHint")}</p>
      </div>

      <div class="form-group stacked">
        <label>${t("WORLDSMITH.Paste")}</label>
        <textarea name="json" rows="10" placeholder="${t("WORLDSMITH.PastePlaceholder")}"></textarea>
      </div>

      <div class="form-group">
        <label>${t("WORLDSMITH.Folder")}</label>
        <div class="form-fields">
          <select name="folder">${folderOptions}</select>
        </div>
      </div>

      <div class="form-group">
        <label>${t("WORLDSMITH.OpenSheet")}</label>
        <div class="form-fields">
          <input type="checkbox" name="renderSheet">
        </div>
      </div>

      <footer class="form-footer">
        <button type="button" data-action="clear">
          <i class="fas fa-eraser"></i> ${t("WORLDSMITH.Clear")}
        </button>
        <button type="button" data-action="import">
          <i class="fas fa-file-import"></i> ${t("WORLDSMITH.Import")}
        </button>
      </footer>
    `;
    return wrapper;
  }

  /* -------------------------------------------- */

  /** @override */
  _replaceHTML(result, content, options) {
    content.replaceChildren(result);
  }

  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    const root = this.element;
    root.querySelector("[data-action=clear]")?.addEventListener("click", () => this.#onClear());
    root.querySelector("[data-action=import]")?.addEventListener("click", () => this.#onImport());
  }

  /* -------------------------------------------- */

  /** Reset the paste area and file picker. */
  #onClear() {
    const textarea = this.element.querySelector("textarea[name=json]");
    const file = this.element.querySelector("input[name=files]");
    if (textarea) textarea.value = "";
    if (file) file.value = "";
  }

  /* -------------------------------------------- */

  /** Gather the pasted text and any selected files, then import each creature. */
  async #onImport() {
    if (this.#importing) return;
    const root = this.element;

    const folderId = root.querySelector("select[name=folder]")?.value || null;
    const renderSheet = !!root.querySelector("input[name=renderSheet]")?.checked;

    /** @type {Array<{label: string, text: string}>} */
    const sources = [];

    const fileInput = root.querySelector("input[name=files]");
    const files = Array.from(fileInput?.files ?? []);
    for (const file of files) {
      sources.push({ label: file.name, text: await file.text() });
    }

    const pasted = (root.querySelector("textarea[name=json]")?.value ?? "").trim();
    if (pasted) sources.push({ label: game.i18n.localize("WORLDSMITH.PastedJSON"), text: pasted });

    if (!sources.length) {
      ui.notifications.warn(game.i18n.localize("WORLDSMITH.NoInput"));
      return;
    }

    this.#importing = true;
    let totalCreated = 0;
    let totalFailed = 0;

    try {
      for (const source of sources) {
        try {
          const actors = await importFromText(source.text, { folderId, renderSheet, label: source.label });
          totalCreated += actors.length;
        } catch (err) {
          totalFailed += 1;
          console.error(`${MODULE_ID} |`, err);
          ui.notifications.error(err.message);
        }
      }
    } finally {
      this.#importing = false;
    }

    if (totalCreated) {
      ui.notifications.info(game.i18n.format("WORLDSMITH.ImportSuccess", { count: totalCreated }));
    }
    if (totalCreated && !totalFailed) this.close();
  }

  /* -------------------------------------------- */

  /** @type {WorldsmithImportApp|null} */
  static #instance = null;

  /**
   * Convenience launcher used by the sidebar button and the public API.
   * @returns {WorldsmithImportApp}
   */
  static show() {
    if (!WorldsmithImportApp.#instance || !WorldsmithImportApp.#instance.rendered) {
      WorldsmithImportApp.#instance = new WorldsmithImportApp();
    }
    WorldsmithImportApp.#instance.render({ force: true });
    return WorldsmithImportApp.#instance;
  }
}
