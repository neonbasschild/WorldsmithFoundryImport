/**
 * Normalises Worldsmith's structured document export format (rootId + items map
 * with rich-text blocks) into the flat objects expected by the existing
 * converters. Legacy flat exports pass through unchanged.
 */

const ABILITY_KEYS = {
  str: "str", strength: "str",
  dex: "dex", dexterity: "dex",
  con: "con", constitution: "con",
  int: "int", intelligence: "int",
  wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha"
};

const CREATURE_CONTENT_TYPES = new Set([
  "monster", "npc", "familiar", "mount", "companion", "creature"
]);

const QUEST_SECTION_ALIASES = {
  "gm overview": "gm_overview",
  "overview": "gm_overview",
  "hook": "hook",
  "adventure hook": "hook",
  "objectives": "objectives",
  "rewards": "rewards",
  "resolution": "resolution"
};

const STORY_OVERVIEW_SECTIONS = new Set([
  "pitch", "premise", "synopsis", "overview", "gm overview", "summary"
]);

/**
 * @param {object} data
 * @returns {boolean}
 */
export function isStructuredWorldsmith(data) {
  return Boolean(data && typeof data === "object" && data.items && findRootNode(data));
}

/**
 * Return the root section node, supporting exports with or without rootId.
 * @param {object} data
 * @returns {object|null}
 */
function findRootNode(data) {
  if (data.rootId && data.items?.[data.rootId]) return data.items[data.rootId];
  for (const item of Object.values(data.items ?? {})) {
    if (item?.type === "section" && (item.parentId === null || item.parentId === undefined)) {
      return item;
    }
  }
  return null;
}

/**
 * Normalise a Worldsmith export, parsing structured documents when needed.
 * @param {object} data
 * @returns {object}
 */
export function normalizeWorldsmithData(data) {
  if (!data || typeof data !== "object") return data;
  if (!isStructuredWorldsmith(data)) return data;
  return parseStructuredExport(data);
}

/**
 * @param {object} data
 * @returns {object}
 */
function parseStructuredExport(data) {
  const root = findRootNode(data);
  const contentType = String(root.content_type ?? "").toLowerCase();
  const walk = walkSection(root, data.items, root.name);

  if (contentType === "feat") return normalizeFeat(root, walk);
  if (contentType === "spell") return normalizeSpell(root, walk);
  if (contentType === "magicitem") return normalizeItem(root, walk);
  if (contentType === "quest") return normalizeQuest(root, walk, data.items);
  if (contentType === "story") return normalizeStory(root, walk, data.items);
  if (contentType === "shop") return normalizeShop(root, walk, data.items);
  if (contentType === "treasure") return normalizeTreasure(root, walk, data.items);
  if (CREATURE_CONTENT_TYPES.has(contentType)) return normalizeCreature(root, walk);
  if (contentType === "item") return normalizeItem(root, walk);

  // Fall back to creature parsing when the type is unknown but the block
  // looks like a stat block.
  if (walk.statLine || walk.labeledFields["hit points"] || walk.labeledFields["armor class"]) {
    return normalizeCreature(root, walk);
  }
  return normalizeItem(root, walk);
}

/* -------------------------------------------------------------------------- */
/*  Rich-text extraction                                                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {unknown} value
 * @param {string} [fallbackName]
 * @returns {string}
 */
function extractText(value, fallbackName = "") {
  if (value == null) return "";
  if (typeof value === "string") return resolveVariables(value, fallbackName);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(v => extractText(v, fallbackName)).join("");
  if (typeof value === "object") {
    if (Array.isArray(value.text)) return value.text.map(v => String(v)).join(", ");
    if (value.text != null) return resolveVariables(String(value.text), fallbackName);
    if (Array.isArray(value.children)) return value.children.map(v => extractText(v, fallbackName)).join("");
    if (Array.isArray(value.content)) return value.content.map(v => extractText(v, fallbackName)).join("");
  }
  return "";
}

/**
 * @param {string} text
 * @param {string} name
 * @returns {string}
 */
function resolveVariables(text, name) {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, token) => {
    const cleaned = token.replace(/_/g, " ").trim();
    return cleaned || name;
  });
}

/**
 * @param {object} node
 * @returns {string|null}
 */
function getHeaderText(node) {
  const content = node.content;
  if (!Array.isArray(content) || content.length !== 1) return null;
  const block = content[0];
  if (block?.type !== "paragraph" || !Array.isArray(block.children) || block.children.length !== 1) return null;
  const child = block.children[0];
  if (child?.textFormat === "underline-h2" && child.text) return String(child.text).trim();
  return null;
}

/**
 * @param {object} node
 * @returns {string|null}
 */
function getSubtitleText(node) {
  const content = node.content;
  if (!Array.isArray(content) || content.length !== 1) return null;
  const block = content[0];
  if (block?.type !== "paragraph" || !Array.isArray(block.children) || block.children.length !== 1) return null;
  const child = block.children[0];
  if (child?.textFormat === "h4" && child.text && child.text !== "—") return String(child.text).trim();
  return null;
}

/**
 * @param {object} node
 * @param {string} name
 * @returns {string}
 */
function nodePlainText(node, name) {
  if (node.type === "table") return tableToText(node);
  return extractText(node.content, name).trim();
}

/**
 * @param {object} tableNode
 * @returns {string}
 */
function tableToText(tableNode) {
  const rows = tableNode.content?.cells ?? [];
  return rows.map(row => row.map(cell => extractText(cell.content)).filter(Boolean).join(" | ")).join("\n");
}

/**
 * @param {object} statLineNode
 * @returns {Record<string, {value?: number, text: string}>}
 */
function parseStatLine(statLineNode) {
  const stats = {};
  for (const stat of statLineNode.content?.stats ?? []) {
    const name = extractText(stat.name).trim().toLowerCase();
    const text = extractText(stat.description).trim() || String(stat.value ?? "");
    stats[name] = { value: stat.value, text };
  }
  return stats;
}

/**
 * @param {object} node
 * @param {string} name
 * @returns {Record<string, string>}
 */
function parseLabeledBlock(node, name) {
  const fields = {};
  for (const block of node.content ?? []) {
    if (block.type === "paragraph") {
      Object.assign(fields, parseLabeledParagraph(block, name));
      continue;
    }
    if (block.type === "numbered-list" || block.type === "bulleted-list") {
      fields._list ??= [];
      for (const item of block.children ?? []) {
        const text = extractText(item, name).trim();
        if (text) fields._list.push(text);
      }
    }
  }
  return fields;
}

/**
 * @param {object} paragraph
 * @param {string} name
 * @returns {Record<string, string>}
 */
function parseLabeledParagraph(paragraph, name) {
  const fields = {};
  const children = paragraph.children ?? [];
  let label = "";
  let value = "";
  for (const child of children) {
    const text = extractText(child, name);
    if (child.bold && /:\s*$/.test(text)) {
      if (label) fields[normalizeFieldKey(label)] = value.trim();
      label = text;
      value = "";
    } else {
      value += text;
    }
  }
  if (label) fields[normalizeFieldKey(label)] = value.trim();
  return fields;
}

/**
 * @param {string} label
 * @returns {string}
 */
function normalizeFieldKey(label) {
  return label.replace(/:\s*$/, "").trim().toLowerCase();
}

/**
 * Walk a section's children into structured buckets.
 * @param {object} section
 * @param {Record<string, object>} items
 * @param {string} name
 * @returns {object}
 */
function walkSection(section, items, name) {
  const result = {
    name,
    subtitle: null,
    sections: {},
    labeledFields: {},
    statLine: null,
    nestedSections: [],
    looseBlocks: []
  };

  let currentHeader = null;

  for (const childId of section.childrenIds ?? []) {
    const child = items[childId];
    if (!child) continue;

    if (child.type === "line") {
      currentHeader = null;
      continue;
    }

    if (child.type === "StatLine") {
      currentHeader = null;
      result.statLine = parseStatLine(child);
      continue;
    }

    if (child.type === "section") {
      result.nestedSections.push(child);
      currentHeader = null;
      continue;
    }

    if (child.type === "table") {
      const key = currentHeader ?? "_tables";
      result.sections[key] ??= [];
      result.sections[key].push({ kind: "table", node: child });
      continue;
    }

    if (child.type !== "simple") continue;

    const header = getHeaderText(child);
    if (header) {
      currentHeader = header;
      result.sections[currentHeader] ??= [];
      continue;
    }

    const subtitle = getSubtitleText(child);
    if (subtitle && !result.subtitle) {
      result.subtitle = subtitle;
      continue;
    }

    const labeled = parseLabeledBlock(child, name);
    const hasLabels = Object.keys(labeled).some(k => k !== "_list");
    if (!currentHeader && hasLabels) {
      mergeFields(result.labeledFields, labeled);
      continue;
    }

    if (currentHeader) {
      result.sections[currentHeader].push({ kind: "block", node: child, labeled, text: nodePlainText(child, name) });
    } else {
      result.looseBlocks.push({ node: child, labeled, text: nodePlainText(child, name) });
    }
  }

  return result;
}

/**
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} source
 */
function mergeFields(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (key === "_list") {
      target._list ??= [];
      target._list.push(...(value ?? []));
    } else {
      target[key] = value;
    }
  }
}

/**
 * @param {object[]} blocks
 * @param {string} name
 * @returns {string}
 */
function joinBlocks(blocks, name) {
  return (blocks ?? [])
    .map(block => block.text ?? nodePlainText(block.node, name))
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/**
 * @param {object[]} blocks
 * @param {string} name
 * @returns {Array<{name: string, description: string}>}
 */
function parseNamedEntries(blocks, name) {
  const entries = [];
  for (const block of blocks ?? []) {
    const node = block.node;
    for (const para of node?.content ?? []) {
      if (para.type === "paragraph") {
        const entry = parseNamedParagraph(para, name);
        if (entry) entries.push(entry);
        continue;
      }
      if (para.type === "numbered-list" || para.type === "bulleted-list") {
        for (const item of para.children ?? []) {
          const text = extractText(item, name).trim();
          const bullet = parseBulletEntry(text);
          if (bullet) entries.push(bullet);
        }
      }
    }
  }
  return entries;
}

/**
 * @param {object} paragraph
 * @param {string} name
 * @returns {{name: string, description: string}|null}
 */
function parseNamedParagraph(paragraph, name) {
  const children = paragraph.children ?? [];
  if (!children.length) return null;

  const first = children[0];
  if (first.bold) {
    const label = extractText(first, name);
    const match = label.match(/^(.+?):\s*$/);
    if (match) {
      const rest = children.slice(1).map(c => extractText(c, name)).join("").trim();
      if (rest) return { name: match[1].trim(), description: rest };
    }
  }

  const full = extractText(paragraph, name).trim();
  if (!full) return null;
  const bullet = parseBulletEntry(full);
  if (bullet) return bullet;
  return { name: "Feature", description: full };
}

/**
 * @param {string} text
 * @returns {{name: string, description: string}|null}
 */
function parseBulletEntry(text) {
  const match = text.match(/^[•\-*]\s*(.+?)[.:]\s+([\s\S]+)/) || text.match(/^(.+?)[.:]\s+([\s\S]+)/);
  if (!match) return null;
  return { name: match[1].trim(), description: match[2].trim() };
}

/**
 * @param {object[]} blocks
 * @param {string} name
 * @returns {string|null}
 */
function extractMultiattack(blocks, name) {
  for (const block of blocks ?? []) {
    for (const para of block.node?.content ?? []) {
      if (para.type !== "paragraph") continue;
      const children = para.children ?? [];
      const hasBoldName = children.some(c => c.bold && /:\s*$/.test(extractText(c, name)));
      if (hasBoldName) continue;
      const text = extractText(para, name).trim();
      if (/can make|attacks per turn|multiattack/i.test(text)) return text;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Type normalisers                                                          */
/* -------------------------------------------------------------------------- */

/**
 * @param {string|null} line
 * @returns {object}
 */
function parseIdentityLine(line) {
  if (!line) return {};
  const result = {};
  const [mainPart, titlePart] = line.split(/\s•\s/);
  if (titlePart) result.title = titlePart.trim();

  const main = (mainPart ?? line).trim();
  const sizeMatch = main.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
  if (sizeMatch) result.size = sizeMatch[1].toLowerCase();

  const commaParts = main.split(",").map(part => part.trim()).filter(Boolean);
  if (commaParts.length >= 2) {
    result.alignment = commaParts[commaParts.length - 1];
    let typePart = commaParts.slice(0, -1).join(", ");
    if (sizeMatch) typePart = typePart.slice(sizeMatch[0].length).trim();
    const subtypeMatch = typePart.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (subtypeMatch) {
      result.type = subtypeMatch[1].trim();
      result.subtype = subtypeMatch[2].trim();
    } else {
      result.type = typePart;
    }
  } else if (!sizeMatch) {
    result.type = main;
  } else {
    result.type = main.slice(sizeMatch[0].length).trim();
  }

  return result;
}

/**
 * @param {Record<string, string>} fields
 * @returns {object}
 */
function buildAttributes(fields, statLine) {
  const attributes = { proficiencies: { skills: [], languages: null }, senses: {} };

  if (fields["challenge rating"]) attributes.cr = fields["challenge rating"].trim();
  if (fields["experience points"] || fields.xp) {
    attributes.xp = Number(String(fields["experience points"] ?? fields.xp).replace(/[^\d.]/g, "")) || undefined;
  }

  if (fields["armor class"]) {
    const acMatch = fields["armor class"].match(/^(\d+)(?:\s*\(([^)]+)\))?/i);
    attributes.ac = {
      value: Number(acMatch?.[1] ?? fields["armor class"]),
      type: acMatch?.[2]?.trim() ?? ""
    };
  }

  if (fields["hit points"]) {
    const hpMatch = fields["hit points"].match(/^(\d+)(?:\s*\(([^)]+)\))?/i);
    const max = Number(hpMatch?.[1] ?? fields["hit points"]);
    attributes.hp = { current: max, max };
    if (hpMatch?.[2]) {
      const formulaMatch = hpMatch[2].match(/(\d+)d(\d+)(?:\s*\+\s*(\d+))?/i);
      if (formulaMatch) {
        attributes.hitDice = {
          totalDice: Number(formulaMatch[1]),
          dieSize: `d${formulaMatch[2]}`,
          flatBonus: formulaMatch[3] ? Number(formulaMatch[3]) : 0
        };
      }
    }
  }

  if (fields.speed) {
    attributes.speed = parseSpeed(fields.speed);
  }

  if (fields.skills) {
    attributes.proficiencies.skills = fields.skills
      .split(/,|\band\b/i)
      .map(skill => skill.replace(/\([^)]*\)/g, "").replace(/proficient/i, "").trim())
      .filter(Boolean);
  }

  if (fields.languages) {
    attributes.proficiencies.languages = Array.isArray(fields.languages)
      ? fields.languages.join(", ")
      : fields.languages;
  }

  if (fields.senses) {
    const darkvision = fields.senses.match(/darkvision\s+(\d+)/i);
    if (darkvision) attributes.senses.darkvision = Number(darkvision[1]);
    const passive = fields.senses.match(/passive\s+perception\s+(\d+)/i);
    if (passive) attributes.senses.passivePerception = Number(passive[1]);
  }

  if (fields["damage vulnerabilities"] || fields.vulnerabilities) {
    attributes.vulnerabilities = fields["damage vulnerabilities"] ?? fields.vulnerabilities;
  }
  if (fields["damage resistances"] || fields.resistances) {
    attributes.resistances = fields["damage resistances"] ?? fields.resistances;
  }
  if (fields["damage immunities"] || fields.immunities) {
    attributes.immunities = fields["damage immunities"] ?? fields.immunities;
  }
  if (fields["condition immunities"]) attributes.conditionImmunities = fields["condition immunities"];

  if (statLine) {
    attributes.abilities = {};
    for (const [label, stat] of Object.entries(statLine)) {
      const key = ABILITY_KEYS[label.replace(/\s+/g, "")] ?? ABILITY_KEYS[label];
      if (!key) continue;
      const value = Number(stat.value ?? stat.text);
      if (!Number.isNaN(value)) attributes.abilities[key] = { value, saveProficient: false };
    }
  }

  return attributes;
}

/**
 * @param {string} speedText
 * @returns {object}
 */
function parseSpeed(speedText) {
  const speed = {};
  const walk = speedText.match(/^(\d+)\s*ft/i);
  if (walk) speed.walk = Number(walk[1]);
  for (const mode of ["fly", "swim", "climb", "burrow"]) {
    const match = speedText.match(new RegExp(`${mode}\\s+(\\d+)`, "i"));
    if (match) speed[mode] = Number(match[1]);
  }
  if (/hover/i.test(speedText)) speed.hover = true;
  if (!speed.walk) {
    const generic = speedText.match(/(\d+)\s*ft/i);
    if (generic) speed.walk = Number(generic[1]);
  }
  return speed;
}

/**
 * @param {object} root
 * @param {object} walk
 * @returns {object}
 */
function normalizeCreature(root, walk) {
  const identity = parseIdentityLine(walk.subtitle);
  identity.name = root.name;
  if (walk.sections.Description) identity.description = joinBlocks(walk.sections.Description, root.name);
  if (walk.sections.Lore) identity.lore = joinBlocks(walk.sections.Lore, root.name);

  const additionalDetails = {};
  for (const block of walk.sections["Additional Details"] ?? []) {
    mergeFields(additionalDetails, block.labeled ?? parseLabeledBlock(block.node, root.name));
  }

  const result = {
    identity,
    attributes: buildAttributes(walk.labeledFields, walk.statLine),
    features: parseNamedEntries(walk.sections.Features, root.name),
    actions: parseNamedEntries(walk.sections.Actions, root.name),
    reactions: parseNamedEntries(walk.sections.Reactions, root.name),
    loot: parseNamedEntries(walk.sections.Loot, root.name).map(entry => ({
      item: entry.name,
      details: entry.description
    }))
  };

  const multiattack = extractMultiattack(walk.sections.Actions, root.name);
  if (multiattack) result.numberOfAttacks = multiattack;

  if (result.reactions.length) {
    result.actions.push(...result.reactions);
  }

  if (Object.keys(additionalDetails).length) {
    result.additionalDetails = {
      history: additionalDetails.history,
      affiliations: additionalDetails.affiliations,
      fear: additionalDetails.fear,
      secret: additionalDetails.secret
    };
  }

  applyCompanionFields(result, walk);
  return result;
}

/**
 * @param {object} result
 * @param {object} walk
 */
function applyCompanionFields(result, walk) {
  const basics = collectLabeledFields(walk.sections["Familiar Basics"]);
  const care = collectLabeledFields(walk.sections["Care Information"]);
  const fields = { ...basics, ...care, ...walk.labeledFields };

  if (fields["carrying capacity"]) result.carrying_capacity = fields["carrying capacity"];
  if (fields["rider capacity"]) result.rider_capacity = fields["rider capacity"];
  if (fields["summoning method"]) result.summoning_method = fields["summoning method"];
  if (fields["bonding ritual"]) result.bonding_ritual = fields["bonding ritual"];
  if (fields["care level"]) result.care_level = fields["care level"];
  if (fields.intelligence) result.intelligence = fields.intelligence;
  if (fields["preferred environment"]) result.preferred_environment = fields["preferred environment"];
  if (fields["dietary habits"]) result.dietary_habits = fields["dietary habits"];
  if (fields["daily exercise"]) result.daily_exercise = fields["daily exercise"];
  if (fields["housing requirements"]) result.housing_requirements = fields["housing requirements"];
  if (fields["monthly cost"]) {
    const match = fields["monthly cost"].match(/([\d,]+)/);
    if (match) result.monthly_cost_gp = Number(match[1].replace(/,/g, ""));
  }

  const positive = walk.sections["Positive Care Effects"]?.flatMap(block => block.labeled?._list ?? []) ?? [];
  const negative = walk.sections["Negative Care Effects"]?.flatMap(block => block.labeled?._list ?? []) ?? [];
  if (positive.length) result.positive_care = positive;
  if (negative.length) result.negative_care = negative;
}

/**
 * @param {object[]|undefined} blocks
 * @returns {Record<string, string>}
 */
function collectLabeledFields(blocks) {
  const fields = {};
  for (const block of blocks ?? []) {
    mergeFields(fields, block.labeled ?? {});
  }
  return fields;
}

/**
 * @param {object} root
 * @param {object} walk
 * @returns {object}
 */
function normalizeFeat(root, walk) {
  const prerequisites = [];
  for (const block of walk.sections.Prerequisites ?? []) {
    const labeled = block.labeled ?? parseLabeledBlock(block.node, root.name);
    for (const [key, value] of Object.entries(labeled)) {
      if (key === "_list") continue;
      prerequisites.push({ type: titleCase(key), details: value });
    }
  }

  const descriptionBlocks = walk.sections.Description ?? [];
  let lore = "";
  let mechanics = "";
  const fullText = joinBlocks(descriptionBlocks, root.name);
  if (fullText.includes("•")) {
    const parts = fullText.split(/\n\n+/);
    lore = parts[0]?.trim() ?? "";
    mechanics = parts.slice(1).join("\n\n").trim();
  } else {
    lore = fullText;
  }

  return {
    name: root.name,
    subtitle: walk.subtitle ?? "",
    prerequisites,
    lore,
    mechanics: mechanics || fullText
  };
}

/**
 * @param {object} root
 * @param {object} walk
 * @returns {object}
 */
function normalizeSpell(root, walk) {
  const subtitle = walk.subtitle ?? "";
  const subtitleMatch = subtitle.match(/(\d+)(?:st|nd|rd|th)?-level\s+([A-Za-z]+)/i);
  const stat = walk.statLine ?? {};

  const level = Number(stat.level?.text ?? subtitleMatch?.[1] ?? 0);
  const school = stat.school?.text ?? subtitleMatch?.[2] ?? "";
  const castingTime = stat["casting time"]?.text ?? "";
  const duration = stat.duration?.text ?? "";
  const concentrationText = (stat.concentration?.text ?? "").toLowerCase();
  const concentration = concentrationText.startsWith("y") || /concentration/i.test(duration);
  const components = stat.components?.text ?? "";

  return {
    name: root.name,
    subtitle,
    level,
    school,
    castingTime,
    duration,
    concentration,
    ritual: /ritual/i.test(subtitle) || /ritual/i.test(components),
    verbal: /\bV\b/.test(components),
    somatic: /\bS\b/.test(components),
    material: components.replace(/^[VSM,\s]+/i, "").trim() || (/\bM\b/.test(components) ? components : null),
    description: joinBlocks(walk.sections.Description, root.name),
    lore: joinBlocks(walk.sections.Lore, root.name),
    classes: joinBlocks(walk.sections.Classes, root.name),
    species: joinBlocks(walk.sections.Species, root.name)
  };
}

/**
 * @param {object} root
 * @param {object} walk
 * @returns {object}
 */
function normalizeItem(root, walk) {
  const stat = walk.statLine ?? {};
  const typeText = stat.type?.text ?? "";
  const rarity = stat.rarity?.text ?? "";
  const price = stat.price?.text ?? stat.value?.text ?? "";
  const weight = stat.weight?.text ?? "";

  return {
    name: root.name,
    subtitle: walk.subtitle ?? "",
    category: mapItemCategory(typeText),
    rarity,
    value: price,
    price,
    weight: Number(String(weight).replace(/[^\d.]/g, "")) || weight,
    description: joinBlocks(walk.sections.Description, root.name),
    usage: joinBlocks(walk.sections.Usage ?? walk.sections.Properties, root.name),
    lore: joinBlocks(walk.sections.Lore, root.name),
    attunement: /attunement/i.test(joinBlocks(walk.sections.Usage ?? [], root.name))
      ? { required: true, condition: "" }
      : undefined
  };
}

/**
 * @param {string} typeText
 * @returns {string}
 */
function mapItemCategory(typeText) {
  const lower = typeText.toLowerCase();
  if (lower.includes("weapon")) return "Weapon";
  if (lower.includes("armor")) return "Armor";
  if (lower.includes("consumable") || lower.includes("potion") || lower.includes("scroll")) return "Consumable";
  if (lower.includes("tool")) return "Tool";
  return "Wondrous Item";
}

/**
 * @param {object} root
 * @param {object} walk
 * @param {Record<string, object>} items
 * @returns {object}
 */
function normalizeQuest(root, walk, items) {
  const quest = {
    name: root.name,
    subtitle: walk.subtitle ?? "",
    gm_overview: joinBlocks(walk.sections["GM Overview"], root.name),
    hook: joinBlocks(walk.sections.Hook, root.name),
    objectives: parseObjectiveList(walk.sections.Objectives, root.name),
    rewards: parseRewardTables(walk.sections.Rewards, root.name),
    resolution: joinBlocks(walk.sections.Resolution, root.name),
    actors: collectNestedCreatures(root, items)
  };
  return quest;
}

/**
 * @param {object} root
 * @param {object} walk
 * @param {Record<string, object>} items
 * @returns {object}
 */
function normalizeStory(root, walk, items) {
  const quest = normalizeQuest(root, walk, items);
  quest.subtitle = walk.subtitle ?? quest.subtitle;

  const overviewParts = [];
  for (const [header, blocks] of Object.entries(walk.sections)) {
    const lower = header.toLowerCase();
    if (STORY_OVERVIEW_SECTIONS.has(lower) && !quest.gm_overview) {
      overviewParts.push(joinBlocks(blocks, root.name));
    }
  }
  if (overviewParts.length) quest.gm_overview = overviewParts.join("\n\n");

  quest.sections = [];
  for (const [header, blocks] of Object.entries(walk.sections)) {
    const lower = header.toLowerCase();
    if (QUEST_SECTION_ALIASES[lower]) continue;
    if (STORY_OVERVIEW_SECTIONS.has(lower) && quest.gm_overview) continue;
    const content = joinBlocks(blocks, root.name);
    if (content) quest.sections.push({ name: header, content });
  }

  return quest;
}

/**
 * @param {object[]|undefined} blocks
 * @param {string} name
 * @returns {Array<{task: string, quote?: string}>}
 */
function parseObjectiveList(blocks, name) {
  const objectives = [];
  for (const block of blocks ?? []) {
    const labeled = block.labeled ?? parseLabeledBlock(block.node, name);
    if (labeled._list) {
      for (const task of labeled._list) objectives.push({ task });
      continue;
    }
    for (const para of block.node?.content ?? []) {
      if (para.type === "numbered-list" || para.type === "bulleted-list") {
        for (const item of para.children ?? []) {
          const task = extractText(item, name).trim();
          if (task) objectives.push({ task });
        }
      }
    }
  }
  return objectives;
}

/**
 * @param {object[]|undefined} blocks
 * @param {string} name
 * @returns {Array<{item: string, price?: string, details?: string, quantity?: null}>}
 */
function parseRewardTables(blocks, name) {
  const rewards = [];
  for (const block of blocks ?? []) {
    if (block.kind !== "table") continue;
    for (const row of block.node.content?.cells ?? []) {
      const parsed = parseGenericTableRow(row, name);
      if (parsed) rewards.push(parsed);
    }
  }
  return rewards;
}

/**
 * @param {object[]} cells
 * @param {string} name
 * @returns {{item: string, price?: string, details?: string, quantity?: null}|null}
 */
function parseGenericTableRow(cells, name) {
  const texts = cells.map(cell => extractText(cell.content, name).trim());
  if (!texts.some(Boolean)) return null;

  const priceIdx = texts.findIndex(text => /^\d[\d,]*\s*(pp|gp|ep|sp|cp)?(?:\s|$)/i.test(text) || /\d+\s*gp/i.test(text));
  const itemIdx = texts.findIndex((text, idx) => idx !== priceIdx && text && !/^\d[\d,]*\s*(pp|gp|ep|sp|cp)?$/i.test(text));
  const detailsIdx = texts.findIndex((text, idx) => idx !== priceIdx && idx !== itemIdx && text);

  const item = texts[itemIdx >= 0 ? itemIdx : 0];
  if (!item) return null;

  return {
    item,
    price: priceIdx >= 0 ? texts[priceIdx] : "n/a",
    details: detailsIdx >= 0 ? texts[detailsIdx] : "",
    quantity: null
  };
}

/**
 * @param {object} root
 * @param {object} walk
 * @param {Record<string, object>} items
 * @returns {object}
 */
function normalizeShop(root, walk, items) {
  const shop = {
    name: root.name,
    subtitle: walk.subtitle ?? "",
    description: joinBlocks(walk.sections.Description, root.name),
    owners: [],
    standard_items: [],
    magic_items: [],
    services: []
  };

  for (const nested of walk.nestedSections) {
    const resolved = resolveContentSection(nested, items);
    if (!resolved) continue;
    const type = String(resolved.content_type ?? "").toLowerCase();
    if (type === "npc") {
      shop.owners.push({ data: normalizeCreature(resolved, walkSection(resolved, items, resolved.name)) });
    } else if (type === "magicitem") {
      shop.magic_items.push(normalizeItem(resolved, walkSection(resolved, items, resolved.name)));
    }
  }

  shop.standard_items = parseInventoryTables(walk.sections["Standard Items"], root.name);
  shop.services = parseInventoryTables(walk.sections.Services, root.name);
  if (!shop.magic_items.length) {
    shop.magic_items = parseInventoryTables(walk.sections["Magic Items"], root.name).map(entry => ({
      name: entry.item,
      value: entry.price,
      description: entry.details,
      category: "Wondrous Item",
      rarity: "Uncommon"
    }));
  }

  return shop;
}

/**
 * @param {object} root
 * @param {object} walk
 * @param {Record<string, object>} items
 * @returns {object}
 */
function normalizeTreasure(root, walk, items) {
  const treasure = {
    name: root.name,
    subtitle: walk.subtitle ?? "",
    description: joinBlocks(walk.sections.Description, root.name),
    currency: parseCurrencyFields(walk.sections.Currency, walk.labeledFields),
    basic_items: parseInventoryTables(walk.sections["Basic Items"], root.name),
    notable_items: []
  };

  for (const nested of walk.nestedSections) {
    const resolved = resolveContentSection(nested, items);
    if (!resolved) continue;
    if (String(resolved.content_type ?? "").toLowerCase() === "magicitem" || hasItemStatLine(resolved, items)) {
      treasure.notable_items.push(normalizeItem(resolved, walkSection(resolved, items, resolved.name)));
    }
  }

  if (!treasure.notable_items.length) {
    treasure.notable_items = parseInventoryTables(walk.sections["Notable Items"], root.name).map(entry => ({
      name: entry.item,
      value: entry.price,
      description: entry.details,
      category: "Wondrous Item"
    }));
  }

  return treasure;
}

/**
 * @param {object[]|undefined} blocks
 * @param {Record<string, string>} fallbackFields
 * @returns {object}
 */
function parseCurrencyFields(blocks, fallbackFields) {
  const currency = {};
  const fields = { ...fallbackFields, ...collectLabeledFields(blocks) };
  for (const denom of ["cp", "sp", "ep", "gp", "pp"]) {
    if (fields[denom] != null) currency[denom] = Number(String(fields[denom]).replace(/[^\d.]/g, "")) || 0;
  }
  return currency;
}

/**
 * @param {object[]|undefined} blocks
 * @param {string} name
 * @returns {Array<{item: string, price: string, details: string}>}
 */
function parseInventoryTables(blocks, name) {
  const entries = [];
  for (const block of blocks ?? []) {
    if (block.kind !== "table") continue;
    for (const row of block.node.content?.cells ?? []) {
      const texts = row.map(cell => extractText(cell.content, name).trim());
      if (!texts[0]) continue;
      entries.push({
        item: texts[0],
        price: texts[1] ?? "",
        details: texts[2] ?? ""
      });
    }
  }
  return entries;
}

/**
 * @param {object} walk
 * @param {object} section
 * @returns {boolean}
 */
function isCreatureWalk(walk, section) {
  const type = String(section.content_type ?? "").toLowerCase();
  if (CREATURE_CONTENT_TYPES.has(type)) return true;
  return Boolean(
    walk.statLine
    || walk.labeledFields["hit points"]
    || walk.labeledFields["armor class"]
  );
}

/**
 * @param {object} section
 * @param {Record<string, object>} items
 * @returns {object|null}
 */
function findCreatureSection(section, items) {
  const typed = resolveContentSection(section, items);
  if (typed && typed.id !== section.id) return typed;

  for (const childId of section.childrenIds ?? []) {
    const child = items[childId];
    if (child?.type !== "section") continue;
    const found = findCreatureSection(child, items);
    if (found) return found;
  }

  const walk = walkSection(section, items, section.name);
  if (isCreatureWalk(walk, section)) return section;
  return null;
}

/**
 * @param {string} ancestorId
 * @param {object} section
 * @param {Record<string, object>} items
 * @returns {boolean}
 */
function isDescendantOf(ancestorId, section, items) {
  let current = section;
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = items[current.parentId];
  }
  return false;
}

/**
 * Collect NPC/monster stat blocks embedded anywhere in a quest or story.
 * @param {object} root
 * @param {Record<string, object>} items
 * @returns {object[]}
 */
function collectNestedCreatures(root, items) {
  const allSections = collectAllSections(root, items);
  const byId = new Map();

  for (const section of allSections) {
    const creatureSection = findCreatureSection(section, items);
    if (creatureSection) byId.set(creatureSection.id, creatureSection);
  }

  const unique = [...byId.values()].filter(outer =>
    ![...byId.values()].some(inner =>
      inner.id !== outer.id && isDescendantOf(outer.id, inner, items)
    )
  );

  const seenNames = new Set();
  const creatures = [];
  for (const section of unique) {
    const name = section.name?.trim();
    if (!name || seenNames.has(name)) continue;
    seenNames.add(name);
    creatures.push(normalizeCreature(section, walkSection(section, items, section.name)));
  }
  return creatures;
}

/**
 * @param {object} section
 * @param {Record<string, object>} items
 * @param {object[]} [list]
 * @returns {object[]}
 */
function collectAllSections(section, items, list = []) {
  for (const childId of section.childrenIds ?? []) {
    const child = items[childId];
    if (child?.type !== "section") continue;
    list.push(child);
    collectAllSections(child, items, list);
  }
  return list;
}

/**
 * @param {object} section
 * @param {Record<string, object>} items
 * @returns {object|null}
 */
function resolveContentSection(section, items) {
  if (section.content_type) {
    for (const childId of section.childrenIds ?? []) {
      const child = items[childId];
      if (child?.type === "section") {
        const deeper = resolveContentSection(child, items);
        if (deeper?.content_type) return deeper;
      }
    }
    return section;
  }

  for (const childId of section.childrenIds ?? []) {
    const child = items[childId];
    if (child?.type === "section") {
      const resolved = resolveContentSection(child, items);
      if (resolved) return resolved;
    }
  }
  return null;
}

/**
 * @param {object} section
 * @param {Record<string, object>} items
 * @returns {boolean}
 */
function hasItemStatLine(section, items) {
  const walk = walkSection(section, items, section.name);
  return Boolean(walk.statLine?.type || walk.statLine?.rarity);
}

/**
 * @param {string} value
 * @returns {string}
 */
function titleCase(value) {
  return value.replace(/\b\w/g, char => char.toUpperCase());
}
