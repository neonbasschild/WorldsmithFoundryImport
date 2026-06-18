/**
 * Foundry runtime glue around the pure {@link convertWorldsmith} logic. These
 * helpers actually create the documents and surface notifications, so they are
 * only ever called from inside a running Foundry world.
 */

import { MODULE_ID } from "./constants.mjs";
import { convertWorldsmith } from "./converter.mjs";

/**
 * Create a single dnd5e NPC actor from a parsed Worldsmith object.
 * @param {object} data                    Parsed Worldsmith JSON.
 * @param {object} [options]
 * @param {string|null} [options.folderId] Folder to place the actor in.
 * @param {boolean} [options.renderSheet]  Open the actor sheet after creation.
 * @returns {Promise<Actor|null>}
 */
export async function createActorFromWorldsmith(data, { folderId = null, renderSheet = false } = {}) {
  const { actorData, warnings } = convertWorldsmith(data);
  if (folderId) actorData.folder = folderId;

  const actor = await Actor.create(actorData, { renderSheet });
  if (!actor) return null;

  for (const warning of warnings) {
    console.warn(`${MODULE_ID} | ${actor.name}: ${warning}`);
  }
  return actor;
}

/**
 * Parse and import one or more Worldsmith creatures from a JSON string. The
 * string may contain a single creature object or an array of creature objects.
 * @param {string} text                    Raw JSON text.
 * @param {object} [options]
 * @param {string|null} [options.folderId]
 * @param {boolean} [options.renderSheet]
 * @param {string} [options.label]         Friendly label used in error messages.
 * @returns {Promise<Actor[]>}
 */
export async function importFromText(text, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`${options.label ? `${options.label}: ` : ""}Invalid JSON \u2013 ${err.message}`);
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const created = [];
  for (const entry of entries) {
    const actor = await createActorFromWorldsmith(entry, options);
    if (actor) created.push(actor);
  }
  return created;
}
