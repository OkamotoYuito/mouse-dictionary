/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// Translations made in the PDF viewer, newest first, kept per document. A sentence translated
// before is shown again from here. Only the very same sentence is reused as is: a nearly same one
// may differ by a "not", so its old translation is shown just until a new one arrives.

export const HISTORY_LIMIT = 50;
export const SIMILAR_RATIO = 0.9;
const SIMILAR_MIN_WORDS = 6;

export const historyKey = (fingerprint) => `pdfTranslationHistory:${fingerprint}`;

// Ignores what PDF text selection varies in: spacing, line-break hyphens, quotes, dashes and case.
export const normalizeSource = (text) =>
  text
    .replace(/([a-z])-\s*\n\s*([a-z])/gi, "$1$2")
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)\]}])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .trim()
    .toLowerCase();

const words = (normalized) => normalized.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];

// Word-level edit distance, as a share of the longer sentence: 1 is the same.
export const similarity = (a, b) => {
  const x = words(a);
  const y = words(b);
  const longer = Math.max(x.length, y.length);
  if (longer === 0) return 1;
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return 1 - previous[y.length] / longer;
};

// The history entry to show for a sentence: { entry, kind: "same" | "similar" } or null.
export const findInHistory = (entries, text) => {
  const normalized = normalizeSource(text);
  const same = entries.find((entry) => entry.normalized === normalized);
  if (same) return { entry: same, kind: "same" };
  if (words(normalized).length < SIMILAR_MIN_WORDS) return null;
  let best = null;
  for (const entry of entries) {
    // Sentences of very different lengths can't be similar enough; skip the work.
    if (Math.abs(entry.normalized.length - normalized.length) > normalized.length * (1 - SIMILAR_RATIO) + 10) continue;
    const ratio = similarity(entry.normalized, normalized);
    if (ratio >= SIMILAR_RATIO && (!best || ratio > best.ratio)) best = { entry, ratio };
  }
  return best ? { entry: best.entry, kind: "similar" } : null;
};

// Where the sentence is in the PDF: its page and a fraction of the page's width and height.
export const validPlace = (place) =>
  place && Number.isInteger(place.page) && Number.isFinite(place.x) && Number.isFinite(place.y)
    ? { page: place.page, x: place.x, y: place.y }
    : null;

// Puts a translation at the top, replacing an earlier one of the same sentence.
export const addToHistory = (entries, { source, translation, engine, place = null, now = Date.now() }) => {
  const normalized = normalizeSource(source);
  const entry = {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    source,
    normalized,
    translation,
    engine,
    place: validPlace(place),
    at: now,
  };
  return [entry, ...entries.filter((old) => old.normalized !== normalized)].slice(0, HISTORY_LIMIT);
};

export const normalizeHistory = (stored) =>
  (Array.isArray(stored?.entries) ? stored.entries : [])
    .filter((entry) => typeof entry?.source === "string" && typeof entry.translation === "string")
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : String(entry.at ?? Math.random()),
      source: entry.source,
      normalized: normalizeSource(entry.source),
      translation: entry.translation,
      engine: typeof entry.engine === "string" ? entry.engine : "",
      place: validPlace(entry.place),
      at: Number(entry.at) || 0,
    }))
    .slice(0, HISTORY_LIMIT);
