/**
 * Worldsmith Foundry Import \u2013 module entry point.
 *
 * Registers the public API, adds an "Import Worldsmith" button to the Actors
 * sidebar, and wires up the import dialog.
 */

import { MODULE_ID } from "./constants.mjs";
import { convertWorldsmith } from "./converter.mjs";
import { createActorFromWorldsmith, importFromText } from "./importer.mjs";
import WorldsmithImportApp from "./import-app.mjs";

/**
 * Public API exposed on the module and as a global for macros.
 */
const api = {
  open: () => WorldsmithImportApp.show(),
  convertWorldsmith,
  createActorFromWorldsmith,
  importFromText
};

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initialising Worldsmith Foundry Import`);
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = api;
  globalThis.WorldsmithImport = api;
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") {
    console.warn(`${MODULE_ID} | This module is designed for the dnd5e system; the active system is "${game.system.id}".`);
  }
});

/**
 * Inject the import button into the Actors sidebar header. Supports both the
 * jQuery (v12) and HTMLElement (v13+) render signatures.
 */
Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user?.isGM) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  if (root.querySelector(".worldsmith-import-button")) return;

  const header = root.querySelector(".directory-header .header-actions")
    ?? root.querySelector(".directory-header .action-buttons")
    ?? root.querySelector(".directory-header")
    ?? root.querySelector("header.directory-header");
  if (!header) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "worldsmith-import-button";
  button.innerHTML = `<i class="fas fa-dragon"></i> ${game.i18n.localize("WORLDSMITH.SidebarButton")}`;
  button.addEventListener("click", () => WorldsmithImportApp.show());

  header.appendChild(button);
});
