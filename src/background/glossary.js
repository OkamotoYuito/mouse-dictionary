import rule from "../main/core/rule";
import storage from "../main/lib/storage";
import { createMatcher, formsOf, RECORDED_WORDS_KEY } from "../pdf-viewer/recorded-words";
import { ASTRONOMY_GLOSSARY_KEY, ASTRONOMY_TERMS } from "./astronomy-terms";

export const ASTRONOMY_CONTEXT = "天文学（電波天文学・星間物理学・星形成）の論文の一節。";

const MAX_TERMS = 40;
const MAX_TARGET_LENGTH = 40;

// The first sense of a dictionary or user-written meaning, e.g. "『避けがたい』,免れられない" -> "避けがたい".
export const firstSense = (meaning) =>
  (meaning ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split(/\r?\n|\\n| \/ /)[0]
    .split(/[,;、；]/)[0]
    .replace(/〈[^〉]*〉|《[^》]*》|\{[^}]*\}|[『』]/g, "")
    .replace(/^\s*[(（][^)）]*[)）]/, "")
    .trim();

const usable = (term) => term.source.trim() && term.target && term.target.length <= MAX_TARGET_LENGTH;

// Builds a function that picks the glossary entries for a paragraph: the user's own meanings first,
// then the astronomy terms, then the dictionary meanings of recorded words.
export const createGlossary = async ({ astronomy = true, recordedWords = true } = {}) => {
  const terms = new Map();
  const add = (source, target, priority) => {
    const key = source.toLowerCase();
    if (!terms.has(key) || terms.get(key).priority > priority) terms.set(key, { source, target, priority });
  };
  if (astronomy) {
    // The list edited on the options page replaces the built-in one.
    const edited = await storage.local.pick(ASTRONOMY_GLOSSARY_KEY);
    for (const [source, target] of Array.isArray(edited) ? edited : ASTRONOMY_TERMS) {
      if (source?.trim() && target?.trim()) add(source.trim(), target.trim(), 1);
    }
  }
  if (recordedWords) {
    const words = Object.keys((await storage.local.pick(RECORDED_WORDS_KEY)) ?? {});
    const customKeys = words.map((word) => `**** custom word ****:${word}`);
    const meanings = words.length ? await storage.local.get([...words, ...customKeys]) : {};
    for (const word of words) {
      const custom = meanings[`**** custom word ****:${word}`];
      const target = firstSense(custom || meanings[word]);
      if (target) add(word, target, custom ? 0 : 2);
    }
  }
  if (!terms.size) return () => [];

  await rule.load();
  const matcher = createMatcher([...terms.keys()], (word) => formsOf(word, rule.doBase));
  return (text) => {
    const found = new Set(matcher.find(text).map(({ word }) => word));
    return [...found]
      .map((key) => terms.get(key))
      .filter(usable)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, MAX_TERMS)
      .map(({ source, target }) => ({ source, target }));
  };
};
