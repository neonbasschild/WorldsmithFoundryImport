/**
 * Pure conversion logic that turns a Worldsmith *quest* export into the data
 * needed to create a Foundry JournalEntry (with one text page per quest
 * section). Foundry-runtime free so it can be unit-tested in plain Node.
 */

import { MODULE_ID } from "./constants.mjs";
import { escapeHTML, textToHTML } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";

/** Foundry's HTML journal-page format constant (CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML). */
const HTML_FORMAT = 1;

/**
 * Build a single text journal page.
 * @param {string} name
 * @param {string} content  HTML content.
 * @param {number} sort
 * @returns {object}
 */
function buildPage(name, content, sort) {
  return {
    name,
    type: "text",
    title: { show: true, level: 1 },
    text: { content, format: HTML_FORMAT },
    sort
  };
}

/**
 * Determine whether a reward price string is meaningful (i.e. not "n/a").
 * @param {string|number|null|undefined} price
 * @returns {boolean}
 */
function hasMeaningfulPrice(price) {
  if (price === null || price === undefined || price === "") return false;
  return !/^\s*(n\/?a|none|null|varies)\s*$/i.test(String(price));
}

/**
 * Render the objectives list, including any associated quotes.
 * @param {object[]} objectives
 * @returns {string}
 */
function renderObjectives(objectives) {
  const items = objectives
    .map(o => {
      const task = o?.task ? escapeHTML(o.task) : "";
      if (!task) return "";
      const quote = o?.quote ? `<blockquote>${escapeHTML(o.quote)}</blockquote>` : "";
      return `<li>${task}${quote}</li>`;
    })
    .filter(Boolean)
    .join("");
  return items ? `<ol>${items}</ol>` : "";
}

/**
 * Render the rewards list with optional prices and details.
 * @param {object[]} rewards
 * @returns {string}
 */
function renderRewards(rewards) {
  const items = rewards
    .map(r => {
      const name = r?.item ?? r?.name;
      if (!name) return "";
      const price = hasMeaningfulPrice(r.price) ? ` <em>(${escapeHTML(String(r.price))})</em>` : "";
      const qty = (r?.quantity !== null && r?.quantity !== undefined && r.quantity !== "")
        ? ` &times;${escapeHTML(String(r.quantity))}` : "";
      const details = r?.details ? ` &mdash; ${escapeHTML(r.details)}` : "";
      return `<li><strong>${escapeHTML(name)}</strong>${qty}${price}${details}</li>`;
    })
    .filter(Boolean)
    .join("");
  return items ? `<ul>${items}</ul>` : "";
}

/**
 * Convert a Worldsmith quest export into Foundry JournalEntry creation data.
 * Accepts either a top-level quest object or a `{ data: {...} }` wrapper (the
 * shape embedded inside creatures and shop owners).
 * @param {object} data  Parsed Worldsmith quest JSON.
 * @returns {{journalData: object, warnings: string[]}}
 */
export function convertWorldsmithQuest(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith quest data must be an object.");
  }
  const quest = data.data && typeof data.data === "object" ? data.data : data;

  const pages = [];
  let sort = 0;
  const addPage = (name, content) => {
    if (content) pages.push(buildPage(name, content, (sort += 100)));
  };

  if (quest.documentKind === "dungeon") {
    const overviewParts = [];
    if (quest.subtitle) overviewParts.push(`<p><em>${escapeHTML(quest.subtitle)}</em></p>`);
    addPage("Overview", overviewParts.join(""));
    if (quest.lore) addPage("Lore", textToHTML(quest.lore));
    if (quest.layout) addPage("Layout", textToHTML(quest.layout));
    if (Array.isArray(quest.objectives) && quest.objectives.length) {
      addPage("Objectives", renderObjectives(quest.objectives));
    }
    for (const room of quest.rooms ?? []) {
      if (room?.name && room?.content) addPage(room.name, textToHTML(room.content));
    }
    if (!pages.length) addPage(quest.name || "Dungeon", textToHTML(quest.lore ?? ""));

    const journalData = {
      name: quest.name || "Imported Dungeon",
      pages,
      flags: {
        [MODULE_ID]: {
          imported: true,
          kind: "dungeon",
          version: MODULE_VERSION,
          source: data
        }
      }
    };
    return { journalData, warnings };
  }

  // Overview (subtitle + GM overview).
  const overviewParts = [];
  if (quest.subtitle) overviewParts.push(`<p><em>${escapeHTML(quest.subtitle)}</em></p>`);
  if (quest.gm_overview) overviewParts.push(textToHTML(quest.gm_overview));
  addPage("Overview", overviewParts.join(""));

  if (quest.hook) {
    const hookTitle = quest.documentKind === "session" ? "Key Details" : "Adventure Hook";
    addPage(hookTitle, textToHTML(quest.hook));
  }

  if (Array.isArray(quest.objectives) && quest.objectives.length) {
    addPage("Objectives", renderObjectives(quest.objectives));
  }

  if (Array.isArray(quest.rewards) && quest.rewards.length) {
    addPage("Rewards", renderRewards(quest.rewards));
  }

  if (quest.resolution) addPage("Resolution", textToHTML(quest.resolution));

  if (Array.isArray(quest.sections)) {
    for (const section of quest.sections) {
      if (section?.name && section?.content) addPage(section.name, textToHTML(section.content));
    }
  }

  // Always guarantee at least one page so the entry is usable.
  if (!pages.length) {
    addPage(quest.name || "Quest", textToHTML(quest.description ?? ""));
  }

  const journalData = {
    name: quest.name || "Imported Quest",
    pages,
    flags: {
      [MODULE_ID]: {
        imported: true,
        kind: quest.documentKind ?? "quest",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return { journalData, warnings };
}
