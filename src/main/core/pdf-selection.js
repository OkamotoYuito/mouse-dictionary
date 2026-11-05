/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

const SCRIPT_SIZE_RATIO = 0.8;

const isInTextLayer = (node) =>
  !!(node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest(".textLayer");

// The word a script is attached to, e.g. "10" in "(10" or "s" in "km s".
const BASE = /[^\s([{,;:$]*$/;

// Writes scripts as inline TeX together with their base word: "M_∗ 10^3" becomes "$M_{∗}$ $10^{3}$".
const toTex = (tokens) => {
  let text = "";
  let inMath = false;
  for (const { mark, text: part } of tokens) {
    if (!mark) {
      text += part;
      inMath = false;
    } else if (inMath) {
      text = `${text.slice(0, -1)}${mark}{${part.trim()}}$`;
    } else {
      const base = text.match(BASE)[0];
      text = `${text.slice(0, text.length - base.length)}$${base}${mark}{${part.trim()}}$`;
      inMath = true;
    }
  }
  return text;
};

// PDF.js draws superscripts and subscripts as separate, smaller text-layer spans, so the plain selection
// text turns "10³ M⊙" into "10 3 M ⊙". Reading the spans' sizes and positions keeps them as TeX scripts.
export const readPdfSelection = (selection = window.getSelection()) => {
  if (!selection?.rangeCount || !isInTextLayer(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0);
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(
    root.nodeType === Node.ELEMENT_NODE ? root : root.parentNode,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );

  const tokens = [];
  let base = null;
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (!range.intersectsNode(node) || !isInTextLayer(node)) continue;
    if (node.nodeName === "BR") {
      tokens.push({ mark: "", text: "\n" });
      continue;
    }
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.data.length;
    const text = node.data.slice(start, end);
    if (!text) continue;
    if (!text.trim()) {
      tokens.push({ mark: "", text });
      continue;
    }

    const rect = node.parentElement.getBoundingClientRect();
    let mark = "";
    if (base && rect.height < base.height * SCRIPT_SIZE_RATIO && Math.abs(rect.top - base.top) < base.height) {
      const shift = (rect.top + rect.bottom - base.top - base.bottom) / 2;
      mark = shift < 0 ? "^" : "_";
    } else {
      base = rect;
    }

    const previous = tokens.at(-1);
    if (mark && previous?.mark === mark) {
      previous.text += text;
    } else {
      // A script belongs to what it follows, so drop the space PDF.js puts between them.
      if (mark) while (tokens.length && !tokens.at(-1).mark && !tokens.at(-1).text.trim()) tokens.pop();
      tokens.push({ mark, text });
    }
  }

  return toTex(tokens);
};
