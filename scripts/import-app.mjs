/**
 * ApplicationV2 dialog that lets a GM paste Worldsmith JSON or pick one or more
 * exported `.json` files and import them as dnd5e NPC actors.
 */

import { MODULE_ID } from "./constants.mjs";
import { importFromText } from "./importer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export default class WorldsmithImportApp extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: "worldsmith-import",
    tag: "form",
    window: {
      title: "WORLDSMITH.AppTitle",
      icon: "fas fa-dragon",
      resizable: true
    },
    position: {
      width: 560,
      height: "auto"
    },
    form: {
      handler: WorldsmithImportApp.#onSubmit,
      closeOnSubmit: false
    },
    actions: {
      clear: WorldsmithImportApp.#onClear
    }
  };

  /** @override */
  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/import-dialog.hbs`
    }
  };

  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(options) {
    const folders = game.folders
      .filter(f => f.type === "Actor")
      .map(f => ({ id: f.id, name: f.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      folders,
      buttons: [
        { type: "button", action: "clear", icon: "fas fa-eraser", label: "WORLDSMITH.Clear" },
        { type: "submit", icon: "fas fa-file-import", label: "WORLDSMITH.Import" }
      ]
    };
  }

  /* -------------------------------------------- */

  /**
   * Reset the paste area and file picker.
   * @this {WorldsmithImportApp}
   */
  static async #onClear() {
    const textarea = this.element.querySelector("textarea[name=json]");
    const file = this.element.querySelector("input[name=files]");
    if (textarea) textarea.value = "";
    if (file) file.value = "";
  }

  /* -------------------------------------------- */

  /**
   * Gather the pasted text and any selected files, then import each creature.
   * @this {WorldsmithImportApp}
   * @param {SubmitEvent} event
   * @param {HTMLFormElement} form
   * @param {object} formData
   */
  static async #onSubmit(event, form, formData) {
    const data = formData.object;
    const folderId = data.folder || null;
    const renderSheet = !!data.renderSheet;

    /** @type {Array<{label: string, text: string}>} */
    const sources = [];

    const fileInput = form.querySelector("input[name=files]");
    const files = Array.from(fileInput?.files ?? []);
    for (const file of files) {
      sources.push({ label: file.name, text: await file.text() });
    }

    const pasted = (data.json ?? "").trim();
    if (pasted) sources.push({ label: game.i18n.localize("WORLDSMITH.PastedJSON"), text: pasted });

    if (!sources.length) {
      ui.notifications.warn(game.i18n.localize("WORLDSMITH.NoInput"));
      return;
    }

    let totalCreated = 0;
    let totalFailed = 0;
    const createdActors = [];

    for (const source of sources) {
      try {
        const actors = await importFromText(source.text, { folderId, renderSheet, label: source.label });
        totalCreated += actors.length;
        createdActors.push(...actors);
      } catch (err) {
        totalFailed += 1;
        console.error(`${MODULE_ID} |`, err);
        ui.notifications.error(err.message);
      }
    }

    if (totalCreated) {
      ui.notifications.info(
        game.i18n.format("WORLDSMITH.ImportSuccess", { count: totalCreated })
      );
    }
    if (totalCreated && !totalFailed) {
      this.close();
    }
  }

  /* -------------------------------------------- */

  /** @type {WorldsmithImportApp|null} */
  static #instance = null;

  /**
   * Convenience launcher used by the sidebar button and the public API.
   * @returns {WorldsmithImportApp}
   */
  static show() {
    if (!WorldsmithImportApp.#instance || WorldsmithImportApp.#instance.rendered === false) {
      WorldsmithImportApp.#instance = new WorldsmithImportApp();
    }
    WorldsmithImportApp.#instance.render({ force: true });
    return WorldsmithImportApp.#instance;
  }
}
