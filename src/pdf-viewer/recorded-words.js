/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

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

const WORD = /^[a-z]+(?:['’][a-z]+)*$/;
const TOKEN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const MAX_MEANING_LENGTH = 200;
const MAX_MEANING_LINES = 3;

// "Traces," -> "traces". Returns "" for anything that is not a single English word.
export const normalizeWord = (text) => {
  const word = text
    .trim()
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "")
    .toLowerCase();
  return word.length <= 80 && WORD.test(word) ? word : "";
};

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

export const formsOf = (word, doBase) => [word, ...doBase(word).filter((base) => isInflectionOf(word, base))];

// Maps a word in the text to the recorded word it is a form of ("traces" -> "trace"), or "".
export const createResolver = (recordedWords, getForms) => {
  const cache = new Map();
  return (token) => {
    const lower = token.toLowerCase();
    if (!cache.has(lower)) {
      cache.set(lower, getForms(lower).find((form) => Object.hasOwn(recordedWords, form)) ?? "");
    }
    return cache.get(lower);
  };
};

// Finds the words in a piece of text that are forms of recorded words.
export const findOccurrences = (text, resolve) =>
  [...text.matchAll(TOKEN)]
    .map((match) => ({ index: match.index, length: match[0].length, word: resolve(match[0]) }))
    .filter(({ word }) => word);

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
// The result's head is the form to record: "traces" is recorded as "trace" when the dictionary has it.
export const lookupMeaning = async (word, { getForms, getDescriptions, suggest }) => {
  const entries = getForms(word);
  const descriptions = await getDescriptions(entries);
  const head = entries.find((entry) => descriptions[entry]);
  if (head) {
    return { head, meaning: summarizeDescription(descriptions[head]), source: "辞書" };
  }
  const suggestion = await suggest(word).catch(() => null);
  if (suggestion?.meaning) {
    return { head: word, meaning: suggestion.meaning, source: suggestion.source ?? "" };
  }
  return { head: word, meaning: "", source: "" };
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
