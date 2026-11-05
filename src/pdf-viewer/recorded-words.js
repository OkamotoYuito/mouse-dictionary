/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { americanize } from "../main/core/rule/british";
import template from "../main/lib/template";

export const RECORDED_WORDS_KEY = "**** recorded words ****";
export const EMPHASIS_KEY = "**** recorded word emphasis ****";

export const EMPHASIS_STYLES = {
  marker: "蛍光ペン",
  underline: "下線",
  wavy: "波線",
  box: "枠",
};

export const DEFAULT_EMPHASIS = { style: "marker", color: "#ffc400", opacity: 40 };

export const POPUP_KEY = "**** recorded word popup ****";

export const POPUP_FONT_SIZES = { small: ["小", 12], medium: ["中", 13], large: ["大", 15], xlarge: ["特大", 17] };
export const POPUP_WIDTHS = { narrow: ["狭い", 240], medium: ["標準", 300], wide: ["広い", 400] };
export const POPUP_THEMES = { auto: "自動", light: "ライト", dark: "ダーク" };

export const DEFAULT_POPUP = {
  fontSize: "medium",
  width: "medium",
  theme: "auto",
  showSource: true,
  showActions: true,
};

const TOKEN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const MAX_MEANING_LENGTH = 200;
const MAX_MEANING_LINES = 3;
const MAX_PHRASE_WORDS = 8;
const MAX_SLOT_WORDS = 4;

// "Traces," -> "traces", " Took  into account. " -> "took into account".
// Returns "" unless the text is a word or a phrase of a few words.
export const normalizeText = (text) => {
  const trimmed = text
    .trim()
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (trimmed.length > 80 || !/^[a-z]+(?:(?:['’]|[ \-‐])[a-z]+)*$/.test(trimmed)) return "";
  return (trimmed.match(TOKEN) ?? []).length <= MAX_PHRASE_WORDS ? trimmed : "";
};

// Widens [start, end) of a text to whole words when either end falls inside a word.
export const expandToWords = (text, start, end) => {
  const isLetter = (ch) => /[A-Za-z'’]/.test(ch ?? "");
  let from = start;
  let to = end;
  if (isLetter(text[from])) while (isLetter(text[from - 1])) from--;
  if (isLetter(text[to - 1])) while (isLetter(text[to])) to++;
  return [from, to];
};

export const isPhrase = (text) => (text.match(TOKEN) ?? []).length >= 2;

export const normalizeEmphasis = (emphasis) => {
  const { style, color, opacity } = { ...DEFAULT_EMPHASIS, ...emphasis };
  return {
    style: style in EMPHASIS_STYLES ? style : DEFAULT_EMPHASIS.style,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_EMPHASIS.color,
    opacity: Number.isFinite(opacity) ? Math.min(100, Math.max(10, opacity)) : DEFAULT_EMPHASIS.opacity,
  };
};

export const normalizePopup = (settings) => {
  const { fontSize, width, theme, showSource, showActions } = { ...DEFAULT_POPUP, ...settings };
  return {
    fontSize: fontSize in POPUP_FONT_SIZES ? fontSize : DEFAULT_POPUP.fontSize,
    width: width in POPUP_WIDTHS ? width : DEFAULT_POPUP.width,
    theme: theme in POPUP_THEMES ? theme : DEFAULT_POPUP.theme,
    showSource: showSource !== false,
    showActions: showActions !== false,
  };
};

const toRgba = (hex, alpha) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha)})`;
};

export const emphasisVariables = (emphasis) => {
  const { color, opacity } = normalizeEmphasis(emphasis);
  return {
    "--md-recorded-line": toRgba(color, opacity / 50),
    "--md-recorded-fill": toRgba(color, opacity / 100),
    "--md-recorded-fill-light": toRgba(color, opacity / 400),
  };
};

// The rule's base forms also strip derivational endings ("interpreter" -> "interpret");
// keep only inflections and irregular forms ("traces" -> "trace", "ran" -> "run").
const isInflectionOf = (token, base) => /(?:s|ed|ing|en|['’]s)$/.test(token) || !token.startsWith(base.slice(0, -1));

const inflectedForms = (word, doBase) => [word, ...doBase(word).filter((base) => isInflectionOf(word, base))];

// Includes the American spelling, so "centre" and "center" match each other.
export const formsOf = (word, doBase) => {
  const american = americanize(word);
  const forms = inflectedForms(word, doBase);
  return american ? [...new Set([...forms, ...inflectedForms(american, doBase)])] : forms;
};

const POSSESSIVES = new Set(["my", "your", "his", "her", "its", "our", "their", "one's", "one’s"]);
// "carry out" is also written "carry the tests out". Particles that are often prepositions
// ("on", "in", ...) are left out, and so are gaps with a preposition, to keep "go to the store on" apart.
const PARTICLES = new Set(["up", "down", "out", "off", "away", "back"]);
const PREPOSITIONS = new Set([
  ...PARTICLES,
  "to",
  "at",
  "for",
  "with",
  "from",
  "of",
  "into",
  "by",
  "about",
  "on",
  "in",
]);
const SEPARATED_WORDS = 3;
const REFLEXIVES = new Set([
  "myself",
  "yourself",
  "himself",
  "herself",
  "itself",
  "oneself",
  "ourselves",
  "yourselves",
  "themselves",
]);

// Dictionary phrases have slots: "take ~ into account", "provide A with B", "make up one's mind".
const toPart = (word, getForms) => {
  if (word === "~" || word === "__" || /^[A-E]$/.test(word)) return { slot: "any" };
  const lower = word.toLowerCase();
  if (/^(?:some)?one['’]s$/.test(lower)) return { slot: "possessive" };
  if (lower === "oneself") return { slot: "reflexive" };
  if (lower === "a" || lower === "an") return { forms: new Set(["a", "an"]) };
  return { forms: new Set(getForms(lower)) };
};

// Slots at either end are left out: "look forward to ~" is emphasized as "look forward to".
const compile = (key, getForms) => {
  const parts = key
    .split(/[\s\-‐]+/)
    .filter(Boolean)
    .map((word) => toPart(word, getForms));
  while (parts[0]?.slot === "any") parts.shift();
  while (parts.at(-1)?.slot === "any") parts.pop();
  const [verb, last] = parts;
  if (parts.length === 2 && verb.forms && [...(last.forms ?? [])].some((form) => PARTICLES.has(form))) {
    parts.splice(1, 0, { slot: "any", optional: true });
  }
  return parts.length ? { key, parts } : null;
};

// Words of a phrase may be separated by spaces, line breaks and hyphens, but not by punctuation.
const tokenize = (text) =>
  [...text.matchAll(TOKEN)].map((match, i, all) => {
    const end = match.index + match[0].length;
    const next = all[i + 1];
    return {
      lower: match[0].toLowerCase(),
      index: match.index,
      end,
      joined: !!next && /^[\s\-‐\u00ad]*$/.test(text.slice(end, next.index)),
    };
  });

const isPossessive = (lower) => POSSESSIVES.has(lower) || /['’]s$/.test(lower);

// Returns the indices of the tokens the parts are matched to (slots of "any" excluded), or null.
const matchParts = (parts, p, tokens, t, formsFor) => {
  if (p === parts.length) return [];
  if (t >= tokens.length || (p > 0 && !tokens[t - 1].joined)) return null;
  const part = parts[p];
  const tryRun = (accept, keep, min = 1, max = MAX_SLOT_WORDS) => {
    if (min === 0) {
      const rest = matchParts(parts, p + 1, tokens, t, formsFor);
      if (rest) return rest;
    }
    for (let n = 1; n <= max && t + n <= tokens.length; n++) {
      if (n > 1 && !tokens[t + n - 2].joined) break;
      if (!accept(t + n - 1)) continue;
      const rest = matchParts(parts, p + 1, tokens, t + n, formsFor);
      if (rest) return keep ? [...Array.from({ length: n }, (_, i) => t + i), ...rest] : rest;
    }
    return null;
  };
  if (part.slot === "any")
    return part.optional
      ? tryRun(
          (last) => tokens.slice(t, last + 1).every(({ lower }) => !PREPOSITIONS.has(lower)),
          false,
          0,
          SEPARATED_WORDS,
        )
      : tryRun(() => true, false);
  // "his", "the company's"
  if (part.slot === "possessive") return tryRun((last) => isPossessive(tokens[last].lower), true);
  if (part.slot === "reflexive") {
    return REFLEXIVES.has(tokens[t].lower) ? withRest([t], parts, p, tokens, t, formsFor) : null;
  }
  return formsFor(tokens[t].lower).some((form) => part.forms.has(form))
    ? withRest([t], parts, p, tokens, t, formsFor)
    : null;
};

const withRest = (matched, parts, p, tokens, t, formsFor) => {
  const rest = matchParts(parts, p + 1, tokens, t + 1, formsFor);
  return rest ? [...matched, ...rest] : null;
};

// Consecutive matched words make one stretch to emphasize.
const toSegments = (indices, tokens) => {
  const segments = [];
  for (const i of indices) {
    const last = segments.at(-1);
    if (last && last.lastToken === i - 1) {
      last.length = tokens[i].end - last.index;
      last.lastToken = i;
    } else {
      segments.push({ index: tokens[i].index, length: tokens[i].end - tokens[i].index, lastToken: i });
    }
  }
  return segments.map(({ index, length }) => ({ index, length }));
};

// Finds the recorded words and phrases in a text, including their inflected forms ("traces" for
// "trace", "took it into account" for "take ~ into account"). A longer match wins where they overlap.
export const createMatcher = (keys, getForms) => {
  const cache = new Map();
  const formsFor = (lower) => {
    if (!cache.has(lower)) cache.set(lower, getForms(lower));
    return cache.get(lower);
  };
  const byForm = new Map();
  const startingWithSlot = [];
  for (const pattern of keys.map((key) => compile(key, formsFor)).filter(Boolean)) {
    const { forms } = pattern.parts[0];
    if (!forms) {
      startingWithSlot.push(pattern);
      continue;
    }
    for (const form of forms) byForm.set(form, [...(byForm.get(form) ?? []), pattern]);
  }

  const find = (text) => {
    const tokens = tokenize(text);
    const used = new Set();
    const found = [];
    for (let t = 0; t < tokens.length; t++) {
      if (used.has(t)) continue;
      const candidates = new Set([
        ...formsFor(tokens[t].lower).flatMap((form) => byForm.get(form) ?? []),
        ...startingWithSlot,
      ]);
      let best = null;
      for (const { key, parts } of candidates) {
        const indices = matchParts(parts, 0, tokens, t, formsFor);
        if (indices?.some((i) => used.has(i))) continue;
        if (indices && (!best || indices.at(-1) > best.indices.at(-1))) best = { key, indices };
      }
      if (!best) continue;
      for (const i of best.indices) used.add(i);
      found.push({
        word: best.key,
        first: best.indices[0],
        last: best.indices.at(-1),
        segments: toSegments(best.indices, tokens),
      });
    }
    return found;
  };

  // Whether a recorded word or phrase spans the whole text.
  const covers = (text) => {
    const count = tokenize(text).length;
    return find(text).some(({ first, last }) => first === 0 && last === count - 1);
  };

  return { find, covers };
};

// Dictionary entries can be long; keep the first few lines for the popup.
export const summarizeDescription = (description) => {
  const lines = description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .split(/\r?\n|\\n| \/ /)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_MEANING_LINES)
    .join("\n");
  return lines.length > MAX_MEANING_LENGTH ? `${lines.slice(0, MAX_MEANING_LENGTH)}…` : lines;
};

// Looks the word up in the installed dictionary (trying its base forms), then in the online suggestions.
// The result's head is the form to record: "traces" is recorded as "trace" when the dictionary has it,
// and "took it into account" as "take ~ into account". getEntries lists the dictionary's candidates for a phrase.
export const lookupMeaning = async (text, { getForms, getEntries, getDescriptions, suggest }) => {
  const entries = isPhrase(text)
    ? [...new Set(getEntries(text))].filter((entry) => createMatcher([entry], getForms).covers(text))
    : getForms(text);
  const descriptions = entries.length ? await getDescriptions(entries) : {};
  const head = entries.find((entry) => descriptions[entry]);
  if (head) {
    return { head, meaning: summarizeDescription(descriptions[head]), source: "辞書" };
  }
  // Online dictionaries know phrases by their base form: "take into account", "make up one's mind".
  const candidates = isPhrase(text) ? suggestionCandidates(text, entries, getForms) : [text];
  const suggestions = await Promise.all(candidates.map((candidate) => suggest(candidate).catch(() => null)));
  const found = suggestions.findIndex((suggestion) => suggestion?.meaning);
  if (found >= 0) {
    const { meaning, source } = suggestions[found];
    return { head: candidates[found], meaning, source: source ?? "" };
  }
  return { head: text, meaning: "", source: "" };
};

const MAX_SUGGESTION_CANDIDATES = 4;

const suggestionCandidates = (text, entries, getForms) => {
  const [first] = text.split(" ");
  const bases = new Set(getForms(first).slice(1));
  const score = (entry) => (bases.has(entry.split(" ")[0]) ? 2 : 0) + (/\bone(?:self|['’]s)\b/.test(entry) ? 1 : 0);
  const usable = entries.filter((entry) => entry !== text && /^[a-z'’ -]+$/.test(entry) && !/\bsomeone/.test(entry));
  // Array.prototype.sort is stable, so entries keep the dictionary's order within a score.
  return [text, ...usable.sort((a, b) => score(b) - score(a))].slice(0, MAX_SUGGESTION_CANDIDATES);
};

const escapeHtml = (text) =>
  text.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

// Colors a meaning with the dialog's replace rules (part of speech, notes, ...), as Mouse Dictionary does.
// The meaning may come from the web, so it is escaped before the rules add their markup.
export const createColorizer = (replaceRules = []) => {
  const rules = replaceRules.flatMap(({ search, replace }) => {
    try {
      return search ? [{ search: new RegExp(search, "g"), replace: template.render(replace, { cssReset: "" }) }] : [];
    } catch (error) {
      console.error(error);
      return [];
    }
  });
  return (meaning) => rules.reduce((html, { search, replace }) => html.replace(search, replace), escapeHtml(meaning));
};
