/**
 * Pure conversion logic that turns a Worldsmith *shop* export into an
 * Item Piles merchant actor (a dnd5e NPC flagged for Item Piles, with the shop's
 * inventory as embedded items) plus separate NPC actors for each shop owner.
 *
 * The merchant/item flag shapes follow a real Item Piles v3 (dnd5e) export:
 *   actor.flags["item-piles"]      = { data: { enabled: true, type: "merchant" }, version }
 *   item.flags["item-piles"].item  = {}            // regular wares
 *   item.flags["item-piles"].item  = { isService } // services
 * Item Piles fills in all remaining defaults at runtime via its migrations.
 *
 * Foundry-runtime free so it can be unit-tested in plain Node.
 */

import {
  ARMOR_BASE_ITEMS, CURRENCY_MAP, ICONS, ITEM_PILES_FLAG_VERSION, ITEM_PILES_ID, MODULE_ID,
  SHOP_ICON, WEAPON_BASE_ITEMS, WEAPON_KEYWORD_PROPERTIES
} from "./constants.mjs";
import { convertWorldsmith } from "./converter.mjs";
import {
  convertWorldsmithItem, parsePrice, parseWeaponDamage, stepDie
} from "./item-converter.mjs";
import { escapeHTML, textToHTML, toNumber } from "./utils.mjs";

const MODULE_VERSION = "1.0.0";

/** Wrap an item-creation object with the Item Piles "regular ware" flag. */
function withPileItemFlag(itemData, pileItem = {}) {
  itemData.flags ??= {};
  itemData.flags[ITEM_PILES_ID] = { item: pileItem };
  return itemData;
}

/* -------------------------------------------- */
/*  Mundane wares                               */
/* -------------------------------------------- */

/**
 * Find a known base item by checking whether any key appears in the name.
 * @param {string} name
 * @param {object} table
 * @returns {[string, *]|null}
 */
function matchBaseItem(name, table) {
  const lower = name.toLowerCase();
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (lower.includes(key)) return [key, table[key]];
  }
  return null;
}

/**
 * Derive weapon properties present in a free-text description.
 * @param {string} text
 * @returns {string[]}
 */
function keywordProperties(text) {
  const lower = (text ?? "").toLowerCase();
  const keys = new Set();
  for (const [word, key] of Object.entries(WEAPON_KEYWORD_PROPERTIES)) {
    if (lower.includes(word)) keys.add(key);
  }
  return [...keys];
}

/**
 * Convert a mundane shop entry ({ item, price, details }) into the best-fitting
 * dnd5e item: weapon, equipment (armor/shield), or loot.
 * @param {object} entry
 * @returns {object}  Item creation data.
 */
export function convertMundaneShopItem(entry) {
  const name = entry.item || entry.name || "Item";
  const details = entry.details || "";
  const base = {
    name,
    system: {
      description: { value: textToHTML(details) },
      price: parsePrice(entry.price),
      quantity: toNumber(entry.quantity, 1),
      source: { custom: "Imported from Worldsmith" }
    }
  };

  const armorMatch = matchBaseItem(name, ARMOR_BASE_ITEMS);
  const acInText = details.match(/AC\s*\+?\s*(\d+)/i);

  if (armorMatch || /\barmor\b/i.test(details) || /\bshield\b/i.test(name + details)) {
    const cfg = armorMatch?.[1] ?? {};
    let armorType = cfg.type ?? (/shield/i.test(name + details) ? "shield" : "light");
    const ac = acInText ? Number(acInText[1]) : (cfg.ac ?? 0);
    base.type = "equipment";
    base.system.type = { value: armorType };
    base.system.armor = { value: ac };
    if (cfg.strength) base.system.strength = cfg.strength;
    if (/disadvantage on stealth/i.test(details)) base.system.properties = ["stealthDisadvantage"];
    base.img = ICONS.loot;
    return base;
  }

  const weaponMatch = matchBaseItem(name, WEAPON_BASE_ITEMS);
  const damage = parseWeaponDamage(details);
  const props = keywordProperties(details);

  if (weaponMatch || damage || /\bweapon\b/i.test(details)) {
    const baseItem = weaponMatch?.[1] ?? "";
    const ranged = /\bammunition\b/i.test(details) || /\d+\s*\/\s*\d+\s*(?:ft|feet)/i.test(details);
    base.type = "weapon";
    base.system.type = {
      value: ranged ? "martialR" : "martialM",
      baseItem
    };
    if (damage) {
      const { versatile, ...baseDamage } = damage;
      base.system.damage = { base: baseDamage };
      if (versatile) {
        base.system.damage.versatile = { ...versatile, bonus: "", types: baseDamage.types };
        if (!props.includes("ver")) props.push("ver");
      } else if (props.includes("ver")) {
        base.system.damage.versatile = { ...baseDamage, denomination: stepDie(baseDamage.denomination) };
      }
    }
    if (props.length) base.system.properties = props;
    base.img = ICONS.attack;
    return base;
  }

  base.type = "loot";
  base.img = ICONS.loot;
  return base;
}

/* -------------------------------------------- */
/*  Services                                    */
/* -------------------------------------------- */

/**
 * Convert a Worldsmith service entry into a loot item flagged as an Item Piles
 * service.
 * @param {object} entry
 * @returns {object}  Item creation data (already carrying the pile flag).
 */
export function convertServiceItem(entry) {
  const name = entry.service || entry.name || "Service";
  const priceText = entry.price ?? "";
  const description = [
    entry.details ? textToHTML(entry.details) : "",
    priceText ? `<p><strong>Price:</strong> ${escapeHTML(String(priceText))}</p>` : ""
  ].join("");

  const itemData = {
    name,
    type: "loot",
    img: "icons/svg/book.svg",
    system: {
      description: { value: description },
      price: parsePrice(priceText),
      quantity: 1,
      source: { custom: "Imported from Worldsmith" }
    }
  };
  return withPileItemFlag(itemData, { isService: true, keepZeroQuantity: true });
}

/* -------------------------------------------- */
/*  Shop                                        */
/* -------------------------------------------- */

/**
 * Build the merchant actor biography from the shop's flavor text.
 * @param {object} data
 * @returns {string}
 */
function buildShopBiography(data) {
  const sections = [];
  if (data.subtitle) sections.push(`<p><em>${escapeHTML(data.subtitle)}</em></p>`);
  if (data.description) sections.push(textToHTML(data.description));
  const ownerNames = (data.owners ?? [])
    .map(o => o?.data?.identity?.name)
    .filter(Boolean);
  if (ownerNames.length) {
    sections.push(`<p><strong>Proprietor${ownerNames.length > 1 ? "s" : ""}:</strong> ${
      ownerNames.map(escapeHTML).join(", ")}</p>`);
  }
  if (data.lore) sections.push(`<hr><h3>Lore</h3>${textToHTML(data.lore)}`);
  return sections.join("");
}

/**
 * Convert a Worldsmith shop export into an Item Piles merchant actor plus owner
 * actors.
 * @param {object} data  Parsed Worldsmith shop JSON.
 * @returns {{merchant: object, owners: object[], warnings: string[]}}
 */
export function convertWorldsmithShop(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith shop data must be an object.");
  }

  const items = [];

  // Mundane inventory.
  for (const entry of data.standard_items ?? []) {
    items.push(withPileItemFlag(convertMundaneShopItem(entry)));
  }

  // Magic items reuse the standalone item converter.
  for (const wrapper of data.magic_items ?? []) {
    const itemSource = wrapper?.data ?? wrapper;
    try {
      const { itemData, warnings: itemWarnings } = convertWorldsmithItem(itemSource);
      warnings.push(...itemWarnings);
      items.push(withPileItemFlag(itemData));
    } catch (err) {
      warnings.push(`Skipped a magic item: ${err.message}`);
    }
  }

  // Services.
  for (const entry of data.services ?? []) {
    items.push(convertServiceItem(entry));
  }

  const merchant = {
    name: data.name || "Imported Shop",
    type: "npc",
    img: SHOP_ICON,
    system: {
      details: { biography: { value: buildShopBiography(data) } },
      source: { custom: "Imported from Worldsmith" }
    },
    items,
    prototypeToken: {
      name: data.name || "Imported Shop",
      actorLink: true,
      disposition: 0,
      sight: { enabled: false },
      flags: {
        [ITEM_PILES_ID]: {
          data: { enabled: true, type: "merchant" },
          version: ITEM_PILES_FLAG_VERSION
        }
      }
    },
    flags: {
      [ITEM_PILES_ID]: {
        data: { enabled: true, type: "merchant" },
        version: ITEM_PILES_FLAG_VERSION
      },
      [MODULE_ID]: {
        imported: true,
        kind: "shop",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  // Owners become full NPC actors.
  const owners = [];
  for (const owner of data.owners ?? []) {
    const ownerData = owner?.data ?? owner;
    if (!ownerData || typeof ownerData !== "object") continue;
    try {
      const { actorData, warnings: ownerWarnings } = convertWorldsmith(ownerData);
      warnings.push(...ownerWarnings);
      owners.push(actorData);
    } catch (err) {
      warnings.push(`Skipped a shop owner: ${err.message}`);
    }
  }

  return { merchant, owners, warnings };
}

/* -------------------------------------------- */
/*  Treasure / loot piles                       */
/* -------------------------------------------- */

/**
 * Build a dnd5e currency object from a Worldsmith currency block.
 * @param {object|undefined} currency
 * @returns {object}
 */
function buildCurrency(currency) {
  const result = {};
  for (const key of Object.values(CURRENCY_MAP)) {
    if (currency?.[key] !== undefined) result[key] = toNumber(currency[key], 0);
  }
  return result;
}

/**
 * Build the loot pile biography from the treasure's flavor text.
 * @param {object} data
 * @returns {string}
 */
function buildTreasureBiography(data) {
  const sections = [];
  if (data.subtitle) sections.push(`<p><em>${escapeHTML(data.subtitle)}</em></p>`);
  if (data.description) sections.push(textToHTML(data.description));
  if (data.lore) sections.push(`<hr><h3>Lore</h3>${textToHTML(data.lore)}`);
  return sections.join("");
}

/**
 * Convert a Worldsmith treasure/loot export into an Item Piles loot pile actor.
 * @param {object} data  Parsed Worldsmith treasure JSON.
 * @returns {{pile: object, warnings: string[]}}
 */
export function convertWorldsmithTreasure(data) {
  const warnings = [];
  if (!data || typeof data !== "object") {
    throw new Error("Worldsmith treasure data must be an object.");
  }

  const items = [];

  // Basic items (mundane gear, gems, potions, scrolls).
  for (const entry of data.basic_items ?? []) {
    items.push(withPileItemFlag(convertMundaneShopItem(entry)));
  }

  // Notable items reuse the standalone item converter.
  for (const wrapper of data.notable_items ?? []) {
    const itemSource = wrapper?.data ?? wrapper;
    try {
      const { itemData, warnings: itemWarnings } = convertWorldsmithItem(itemSource);
      warnings.push(...itemWarnings);
      if (wrapper?.quantity !== undefined) itemData.system.quantity = toNumber(wrapper.quantity, 1);
      items.push(withPileItemFlag(itemData));
    } catch (err) {
      warnings.push(`Skipped a notable item: ${err.message}`);
    }
  }

  const pileFlag = {
    data: { enabled: true, type: "pile" },
    version: ITEM_PILES_FLAG_VERSION
  };

  const pile = {
    name: data.name || "Imported Treasure",
    type: "npc",
    img: ICONS.loot,
    system: {
      currency: buildCurrency(data.currency),
      details: { biography: { value: buildTreasureBiography(data) } },
      source: { custom: "Imported from Worldsmith" }
    },
    items,
    prototypeToken: {
      name: data.name || "Imported Treasure",
      actorLink: false,
      disposition: 0,
      sight: { enabled: false },
      flags: { [ITEM_PILES_ID]: foundryCloneFlag(pileFlag) }
    },
    flags: {
      [ITEM_PILES_ID]: foundryCloneFlag(pileFlag),
      [MODULE_ID]: {
        imported: true,
        kind: "treasure",
        version: MODULE_VERSION,
        source: data
      }
    }
  };

  return { pile, warnings };
}

/**
 * Shallow clone a flag object so the actor and prototype token do not share the
 * same nested reference.
 * @param {object} flag
 * @returns {object}
 */
function foundryCloneFlag(flag) {
  return { data: { ...flag.data }, version: flag.version };
}
