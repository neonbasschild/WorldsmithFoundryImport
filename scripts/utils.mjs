/**
 * Small helpers shared across the module that intentionally avoid depending on
 * the Foundry runtime so they can be exercised by Node-based unit tests.
 */

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Generate a random document id. Uses Foundry's implementation when available
 * so ids match the engine's expectations, otherwise falls back to a local
 * generator (useful for tests run outside of Foundry).
 * @param {number} [length=16]
 * @returns {string}
 */
export function randomID(length = 16) {
  const f = globalThis.foundry;
  if (f?.utils?.randomID) return f.utils.randomID(length);
  let id = "";
  for (let i = 0; i < length; i++) id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  return id;
}

/**
 * Convert a value to a finite number, returning a fallback when it cannot be parsed.
 * @param {*} value
 * @param {number} [fallback=0]
 * @returns {number}
 */
export function toNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Parse a challenge rating string/number into a numeric value, handling
 * fractional ratings such as "1/2".
 * @param {string|number|null} cr
 * @returns {number|null}
 */
export function parseCR(cr) {
  if (cr === null || cr === undefined || cr === "") return null;
  if (typeof cr === "number") return cr;
  const str = String(cr).trim();
  const fraction = str.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const n = Number(str);
  return Number.isFinite(n) ? n : null;
}

/**
 * Escape a plain string so it can be safely embedded inside HTML.
 * @param {string} value
 * @returns {string}
 */
export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Wrap a plain text string in a paragraph, preserving line breaks.
 * @param {string} text
 * @returns {string}
 */
export function textToHTML(text) {
  if (!text) return "";
  return `<p>${escapeHTML(text).replace(/\n+/g, "</p><p>")}</p>`;
}

/**
 * Split a comma/semicolon separated list into trimmed, non-empty entries.
 * @param {string|null} value
 * @returns {string[]}
 */
export function splitList(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(/[;,]/)
    .map(v => v.trim())
    .filter(Boolean);
}
