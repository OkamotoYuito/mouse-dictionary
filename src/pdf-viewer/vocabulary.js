/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// Runs inside the bundled PDF.js viewer. Words recorded with their meanings are emphasized
// wherever they appear, and hovering one shows the meaning. Nothing is written into the PDF.

import rule from "../main/core/rule";
import storage from "../main/lib/storage";
import {
  createResolver,
  EMPHASIS_KEY,
  EMPHASIS_STYLES,
  emphasisVariables,
  findOccurrences,
  formsOf,
  lookupMeaning,
  normalizeEmphasis,
  normalizeWord,
  RECORDED_WORDS_KEY,
} from "./recorded-words";

const BUTTON_DELAY = 600;
const POPUP_HIDE_DELAY = 300;

// The record button, popup and panel share the top z-index with Mouse Dictionary's own window,
// so they are moved to the end of the body when shown to stay in front of it.
const STYLE = `
  .mdRecordedLayer { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
  .mdRecordedLayer > div { position: absolute; box-sizing: border-box; }
  .mdRecordedLayer[data-style="marker"] > div { background: var(--md-recorded-fill); mix-blend-mode: multiply; }
  .mdRecordedLayer[data-style="underline"] > div { border-bottom: 2px solid var(--md-recorded-line); }
  .mdRecordedLayer[data-style="wavy"] > div {
    background: linear-gradient(135deg, transparent 35%, var(--md-recorded-line) 35% 60%, transparent 60%) 0 100% / 6px 4px repeat-x,
      linear-gradient(45deg, transparent 35%, var(--md-recorded-line) 35% 60%, transparent 60%) 3px 100% / 6px 4px repeat-x;
  }
  .mdRecordedLayer[data-style="box"] > div {
    border: 1.5px solid var(--md-recorded-line); border-radius: 3px; background: var(--md-recorded-fill-light);
  }
  #mdRecordedPopup {
    position: fixed; display: none; z-index: 2147483647; max-width: 280px; padding: 6px 10px; font: 13px/1.5 sans-serif;
    background: #fffdf5; color: #222; border: 1px solid #e0b040; border-radius: 6px; box-shadow: 0 3px 10px rgba(0,0,0,.25);
  }
  #mdRecordedPopup .word { font-weight: bold; color: #a05a00; }
  #mdRecordedPopup .meaning { white-space: pre-wrap; }
  #mdRecordedPopup .source { color: #888; font-size: 11px; }
  #mdRecordedPopup .actions { display: flex; gap: 6px; margin-top: 4px; }
  #mdRecordedPopup button, #mdRecordButton {
    padding: 2px 8px; font-size: 12px; color: #222; background: #fff; border: 1px solid #aaa; border-radius: 5px; cursor: pointer;
  }
  #mdRecordButton { position: fixed; display: none; z-index: 2147483647; padding: 4px 8px; font-size: 13px; box-shadow: 0 2px 6px rgba(0,0,0,.2); }
  #mdEmphasisPanel {
    position: fixed; display: none; right: 8px; top: 40px; z-index: 2147483647; padding: 8px 12px; font: 13px sans-serif;
    background: #fff; color: #222; border: 1px solid #aaa; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.2);
  }
  #mdEmphasisPanel label { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; }
  #mdEmphasisPanel .count { color: #666; margin-top: 6px; }
  #mdEmphasisToggle { width: auto; padding: 0 6px; font-size: 13px; color: var(--main-color, inherit); }
`;

let recordedWords = {};
const getForms = (word) => formsOf(word, rule.doBase);
let resolve = createResolver(recordedWords, getForms);

const setRecordedWords = (words) => {
  recordedWords = words ?? {};
  resolve = createResolver(recordedWords, getForms);
};
let emphasis = normalizeEmphasis();

const create = (tag, props = {}) => Object.assign(document.createElement(tag), props);

const recordButton = create("button", { id: "mdRecordButton", type: "button", textContent: "単語と訳を記録" });
const popup = create("div", { id: "mdRecordedPopup" });
const panel = create("div", { id: "mdEmphasisPanel" });

// Draw boxes over every occurrence of the recorded words on one page.
const markPage = (pageDiv) => {
  pageDiv.querySelector(".mdRecordedLayer")?.remove();
  const textLayer = pageDiv.querySelector(".textLayer");
  if (!textLayer || !Object.keys(recordedWords).length) return;

  // The page has a border; measure from its padding box, where the layer is placed.
  const outer = pageDiv.getBoundingClientRect();
  const left = outer.left + pageDiv.clientLeft;
  const top = outer.top + pageDiv.clientTop;
  const { clientWidth: width, clientHeight: height } = pageDiv;
  if (!width || !height) return;

  const layer = create("div", { className: "mdRecordedLayer" });
  layer.dataset.style = emphasis.style;
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const { index, length, word } of findOccurrences(node.textContent, resolve)) {
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + length);
      for (const rect of range.getClientRects()) {
        const box = create("div");
        box.dataset.word = word;
        // Percentages keep the boxes in place when zooming.
        Object.assign(box.style, {
          left: `${((rect.left - left) / width) * 100}%`,
          top: `${((rect.top - top) / height) * 100}%`,
          width: `${(rect.width / width) * 100}%`,
          height: `${(rect.height / height) * 100}%`,
        });
        layer.append(box);
      }
    }
  }
  pageDiv.append(layer);
};

const markAllPages = () => {
  for (const pageDiv of document.querySelectorAll("#viewer .page")) markPage(pageDiv);
};

const applyEmphasis = () => {
  for (const [name, value] of Object.entries(emphasisVariables(emphasis))) {
    document.documentElement.style.setProperty(name, value);
  }
  for (const layer of document.querySelectorAll(".mdRecordedLayer")) layer.dataset.style = emphasis.style;
};

const saveWords = (words) => storage.local.set({ [RECORDED_WORDS_KEY]: words });

const getDescriptions = async (entries) => {
  const customKeys = entries.map((entry) => `**** custom word ****:${entry}`);
  const data = await storage.local.get([...entries, ...customKeys]);
  return Object.fromEntries(
    entries.map((entry) => [entry, data[`**** custom word ****:${entry}`] || data[entry]]).filter(([, value]) => value),
  );
};

const suggest = (word) =>
  new Promise((resolve) => chrome.runtime.sendMessage({ type: "suggest_meaning", word }, resolve));

const recordWord = async (word) => {
  recordButton.disabled = true;
  recordButton.textContent = "訳を調べています…";
  try {
    const { head, ...result } = await lookupMeaning(word, { getForms, getDescriptions, suggest });
    await saveWords({ ...recordedWords, [head]: { ...result, recordedAt: Date.now() } });
  } finally {
    recordButton.disabled = false;
    recordButton.textContent = "単語と訳を記録";
    recordButton.style.display = "none";
  }
};

// Show the button only once the selection has settled, instead of following it while dragging.
let buttonTimer;
let mouseIsDown = false;
let selectedWord = "";

const showButtonLater = () => {
  clearTimeout(buttonTimer);
  if (recordButton.disabled) return;
  recordButton.style.display = "none";
  buttonTimer = setTimeout(() => {
    const selection = document.getSelection();
    if (mouseIsDown || !selection || selection.isCollapsed) return;
    if (!selection.anchorNode?.parentElement?.closest(".textLayer")) return;
    selectedWord = normalizeWord(selection.toString());
    if (!selectedWord || resolve(selectedWord)) return;
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    document.body.append(recordButton);
    Object.assign(recordButton.style, { display: "block", left: `${rect.right + 6}px`, top: `${rect.top - 30}px` });
  }, BUTTON_DELAY);
};

let hideTimer;
let popupWord = "";

const showPopup = (word, rect) => {
  clearTimeout(hideTimer);
  if (popupWord === word && popup.style.display === "block") return;
  popupWord = word;
  const { meaning, source } = recordedWords[word];
  popup.replaceChildren(
    create("div", { className: "word", textContent: word }),
    create("div", { className: "meaning", textContent: meaning || "訳が見つかりませんでした" }),
    ...(source ? [create("div", { className: "source", textContent: source })] : []),
    create("div", { className: "actions" }),
  );
  const edit = create("button", { type: "button", textContent: "訳を編集" });
  edit.addEventListener("click", () => {
    const edited = prompt(`「${word}」の訳`, meaning);
    if (edited === null) return;
    saveWords({ ...recordedWords, [word]: { ...recordedWords[word], meaning: edited.trim(), source: "自分で編集" } });
    hidePopup();
  });
  const remove = create("button", { type: "button", textContent: "記録を消す" });
  remove.addEventListener("click", () => {
    const { [word]: _, ...rest } = recordedWords;
    saveWords(rest);
    hidePopup();
  });
  popup.lastChild.append(edit, remove);
  document.body.append(popup);
  Object.assign(popup.style, { display: "block", left: `${rect.left}px`, top: `${rect.bottom + 4}px` });
};

const hidePopup = () => {
  popup.style.display = "none";
  popupWord = "";
};

// The boxes do not take pointer events so that the text stays selectable; hit-test them instead.
const findBoxAt = (event) => {
  const layer = event.target.closest?.(".page")?.querySelector(".mdRecordedLayer");
  if (!layer) return null;
  return [...layer.children].find((box) => {
    const r = box.getBoundingClientRect();
    return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
  });
};

const onMouseMove = (event) => {
  if (mouseIsDown) return;
  if (popup.contains(event.target)) {
    clearTimeout(hideTimer);
    return;
  }
  const box = findBoxAt(event);
  if (box && recordedWords[box.dataset.word]) {
    showPopup(box.dataset.word, box.getBoundingClientRect());
  } else if (popup.style.display === "block") {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePopup, POPUP_HIDE_DELAY);
  }
};

const renderPanel = () => {
  panel.replaceChildren();
  const styleSelect = create("select", { name: "style" });
  for (const [value, label] of Object.entries(EMPHASIS_STYLES))
    styleSelect.append(create("option", { value, textContent: label }));
  const inputs = [
    ["表示", styleSelect],
    ["色", create("input", { name: "color", type: "color" })],
    ["濃さ", create("input", { name: "opacity", type: "range", min: 10, max: 100, step: 5 })],
  ];
  for (const [label, input] of inputs) {
    input.value = emphasis[input.name];
    input.addEventListener("input", () => {
      const value = input.name === "opacity" ? Number(input.value) : input.value;
      emphasis = normalizeEmphasis({ ...emphasis, [input.name]: value });
      applyEmphasis();
      storage.local.set({ [EMPHASIS_KEY]: emphasis });
    });
    const row = create("label", { textContent: label });
    row.append(input);
    panel.append(row);
  }
  panel.append(
    create("div", { className: "count", textContent: `記録した単語: ${Object.keys(recordedWords).length}語` }),
  );
};

const addToolbarButton = () => {
  const toggle = create("button", {
    id: "mdEmphasisToggle",
    className: "toolbarButton",
    type: "button",
    title: "記録した単語の強調",
    textContent: "強調",
  });
  toggle.addEventListener("click", () => {
    const opening = panel.style.display !== "block";
    if (opening) {
      renderPanel();
      document.body.append(panel);
    }
    panel.style.display = opening ? "block" : "none";
  });
  document.getElementById("toolbarViewerRight")?.prepend(toggle);
};

const start = async () => {
  const app = window.PDFViewerApplication;
  if (!app) return;
  await app.initializedPromise;

  document.head.append(create("style", { textContent: STYLE }));
  document.body.append(recordButton, popup, panel);
  addToolbarButton();

  const stored = await storage.local.get([RECORDED_WORDS_KEY, EMPHASIS_KEY]);
  await rule.load();
  setRecordedWords(stored[RECORDED_WORDS_KEY]);
  emphasis = normalizeEmphasis(stored[EMPHASIS_KEY]);
  applyEmphasis();
  markAllPages();

  app.eventBus.on("textlayerrendered", ({ source }) => markPage(source.div));

  // Keep every open viewer in step with the recorded words and settings.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[RECORDED_WORDS_KEY]) {
      setRecordedWords(changes[RECORDED_WORDS_KEY].newValue);
      markAllPages();
      if (panel.style.display === "block") renderPanel();
    }
    if (changes[EMPHASIS_KEY]) {
      emphasis = normalizeEmphasis(changes[EMPHASIS_KEY].newValue);
      applyEmphasis();
    }
  });

  recordButton.addEventListener("mousedown", (event) => event.preventDefault());
  recordButton.addEventListener("click", () => {
    if (!selectedWord) return;
    document.getSelection().removeAllRanges();
    recordWord(selectedWord).catch((error) => console.error("Mouse Dictionary:", error));
  });
  document.addEventListener("mousedown", (event) => {
    if (event.target !== recordButton && !popup.contains(event.target)) mouseIsDown = true;
  });
  document.addEventListener("mouseup", (event) => {
    mouseIsDown = false;
    if (event.target === recordButton) return;
    showButtonLater();
  });
  document.addEventListener("selectionchange", showButtonLater);
  document.addEventListener("mousemove", onMouseMove);
};

start().catch((error) => console.error("Mouse Dictionary:", error));
