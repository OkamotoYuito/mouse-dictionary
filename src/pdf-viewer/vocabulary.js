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
const SWATCHES = ["#ffc400", "#ff7a59", "#ff5fa2", "#8b6cff", "#3b9eff", "#2fbf71"];

// The record button, popup and panel share the top z-index with Mouse Dictionary's own window,
// so they are moved to the end of the body when shown to stay in front of it.
const STYLE = `
  :root {
    --md-ui-bg: rgba(255, 255, 255, .96); --md-ui-fg: #1d1d1f; --md-ui-muted: #6e6e73; --md-ui-line: rgba(0, 0, 0, .08);
    --md-ui-hover: rgba(0, 0, 0, .05); --md-ui-accent: #0a84ff; --md-ui-strong-bg: #1d1d1f; --md-ui-strong-fg: #fff;
    --md-ui-shadow: 0 1px 2px rgba(0, 0, 0, .06), 0 8px 28px rgba(0, 0, 0, .16);
    --md-ui-font: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --md-ui-bg: rgba(44, 44, 46, .96); --md-ui-fg: #f5f5f7; --md-ui-muted: #a1a1a6; --md-ui-line: rgba(255, 255, 255, .1);
      --md-ui-hover: rgba(255, 255, 255, .08); --md-ui-strong-bg: #f5f5f7; --md-ui-strong-fg: #1d1d1f;
      --md-ui-shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 10px 30px rgba(0, 0, 0, .5);
    }
  }
  @keyframes mdPopIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }

  .mdRecordedLayer { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
  .mdRecordedLayer > div, .mdStyleSample > i { position: absolute; box-sizing: border-box; }
  [data-style="marker"] > div, [data-style="marker"] > i { background: var(--md-recorded-fill); mix-blend-mode: multiply; border-radius: 2px; }
  [data-style="underline"] > div, [data-style="underline"] > i { border-bottom: 2px solid var(--md-recorded-line); }
  [data-style="wavy"] > div, [data-style="wavy"] > i {
    background: linear-gradient(135deg, transparent 35%, var(--md-recorded-line) 35% 60%, transparent 60%) 0 100% / 6px 4px repeat-x,
      linear-gradient(45deg, transparent 35%, var(--md-recorded-line) 35% 60%, transparent 60%) 3px 100% / 6px 4px repeat-x;
  }
  [data-style="box"] > div, [data-style="box"] > i {
    border: 1.5px solid var(--md-recorded-line); border-radius: 4px; background: var(--md-recorded-fill-light);
  }

  #mdRecordedPopup, #mdRecordButton, #mdEmphasisPanel { font-family: var(--md-ui-font); box-sizing: border-box; }
  #mdRecordedPopup { position: fixed; display: none; z-index: 2147483647; padding-top: 6px; }
  #mdRecordedPopup .card {
    min-width: 180px; max-width: 300px; padding: 12px 14px 10px; color: var(--md-ui-fg); background: var(--md-ui-bg);
    border: 1px solid var(--md-ui-line); border-radius: 12px; box-shadow: var(--md-ui-shadow);
    backdrop-filter: blur(16px); animation: mdPopIn .12s ease-out;
  }
  #mdRecordedPopup .word { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 650; letter-spacing: .01em; }
  #mdRecordedPopup .word::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--md-recorded-line); }
  #mdRecordedPopup .meaning { margin-top: 6px; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
  #mdRecordedPopup .meaning.empty { color: var(--md-ui-muted); }
  #mdRecordedPopup .footer {
    display: flex; align-items: center; gap: 4px; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--md-ui-line);
  }
  #mdRecordedPopup .source { flex: 1; font-size: 11px; color: var(--md-ui-muted); }
  #mdRecordedPopup button {
    padding: 3px 8px; font: 500 12px var(--md-ui-font); color: var(--md-ui-accent); background: none; border: 0;
    border-radius: 6px; cursor: pointer;
  }
  #mdRecordedPopup button:hover { background: var(--md-ui-hover); }
  #mdRecordedPopup button.danger { color: #ff453a; }

  #mdRecordButton {
    position: fixed; display: none; z-index: 2147483647; padding: 6px 12px; font-size: 12.5px; font-weight: 600;
    color: var(--md-ui-strong-fg); background: var(--md-ui-strong-bg); border: 0; border-radius: 999px; cursor: pointer;
    box-shadow: var(--md-ui-shadow); animation: mdPopIn .12s ease-out;
  }
  #mdRecordButton:hover { filter: brightness(1.15); }
  #mdRecordButton:disabled { cursor: progress; opacity: .8; }

  #mdEmphasisPanel {
    position: fixed; display: none; right: 10px; top: 42px; z-index: 2147483647; width: 268px; padding: 14px;
    color: var(--md-ui-fg); background: var(--md-ui-bg); border: 1px solid var(--md-ui-line); border-radius: 14px;
    box-shadow: var(--md-ui-shadow); backdrop-filter: blur(16px); animation: mdPopIn .12s ease-out; font-size: 13px;
  }
  #mdEmphasisPanel h2 { margin: 0 0 12px; font-size: 14px; font-weight: 650; }
  #mdEmphasisPanel .label { margin: 12px 0 6px; font-size: 11px; font-weight: 600; color: var(--md-ui-muted); }
  #mdEmphasisPanel .styles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  #mdEmphasisPanel .styles button {
    display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 0 6px; font: 11px var(--md-ui-font);
    color: var(--md-ui-fg); background: var(--md-ui-hover); border: 1.5px solid transparent; border-radius: 9px; cursor: pointer;
  }
  #mdEmphasisPanel .styles button[aria-pressed="true"] { border-color: var(--md-ui-accent); background: none; }
  .mdStyleSample { position: relative; padding: 0 3px; font: 600 14px Georgia, serif; color: var(--md-ui-fg); }
  .mdStyleSample > i { inset: 1px 0; mix-blend-mode: normal !important; }
  .mdStyleSample > span { position: relative; }
  #mdEmphasisPanel .colors { display: flex; align-items: center; gap: 8px; }
  #mdEmphasisPanel .colors button, #mdEmphasisPanel .colors label {
    position: relative; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%; cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .12);
  }
  #mdEmphasisPanel .colors [aria-pressed="true"] { outline: 2px solid var(--md-ui-accent); outline-offset: 2px; }
  #mdEmphasisPanel .colors label { background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red); }
  #mdEmphasisPanel .colors input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  #mdEmphasisPanel .strength { display: flex; align-items: center; gap: 10px; }
  #mdEmphasisPanel .strength input { flex: 1; accent-color: var(--md-ui-accent); }
  #mdEmphasisPanel .strength output { width: 34px; text-align: right; font-variant-numeric: tabular-nums; color: var(--md-ui-muted); }
  #mdEmphasisPanel .count { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--md-ui-line); color: var(--md-ui-muted); font-size: 12px; }
  #mdEmphasisToggle { display: flex; align-items: center; justify-content: center; }
  #mdEmphasisToggle::before { display: none; }
  #mdEmphasisToggle svg { width: 16px; height: 16px; fill: var(--toolbar-icon-bg-color, currentColor); }
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

let popupWord = "";

const button = (textContent, className = "") => create("button", { type: "button", textContent, className });

// The popup touches the word (its top padding bridges the gap), so the cursor can move into it.
const showPopup = (word, rect) => {
  if (popupWord === word && popup.style.display === "block") return;
  popupWord = word;
  const { meaning, source } = recordedWords[word];
  const edit = button("訳を編集");
  edit.addEventListener("click", () => {
    const edited = prompt(`「${word}」の訳`, meaning);
    if (edited === null) return;
    saveWords({ ...recordedWords, [word]: { ...recordedWords[word], meaning: edited.trim(), source: "自分で編集" } });
    hidePopup();
  });
  const remove = button("記録を消す", "danger");
  remove.addEventListener("click", () => {
    const { [word]: _, ...rest } = recordedWords;
    saveWords(rest);
    hidePopup();
  });
  const footer = create("div", { className: "footer" });
  footer.append(create("span", { className: "source", textContent: source }), edit, remove);
  const card = create("div", { className: "card" });
  card.append(
    create("div", { className: "word", textContent: word }),
    create("div", {
      className: meaning ? "meaning" : "meaning empty",
      textContent: meaning || "訳が見つかりませんでした",
    }),
    footer,
  );
  popup.replaceChildren(card);
  document.body.append(popup);
  Object.assign(popup.style, { display: "block", left: `${rect.left}px`, top: `${rect.bottom}px` });
  // Keep it inside the window.
  const { right, bottom, height } = popup.getBoundingClientRect();
  if (right > innerWidth - 8) popup.style.left = `${Math.max(8, rect.left - (right - innerWidth) - 8)}px`;
  if (bottom > innerHeight - 8) {
    Object.assign(popup.style, { top: `${rect.top - height}px`, paddingTop: "0", paddingBottom: "6px" });
  } else {
    Object.assign(popup.style, { paddingTop: "", paddingBottom: "" });
  }
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
  if (popup.contains(event.target)) return;
  const box = findBoxAt(event);
  if (box && recordedWords[box.dataset.word]) {
    showPopup(box.dataset.word, box.getBoundingClientRect());
  } else if (popup.style.display === "block") {
    hidePopup();
  }
};

const updateEmphasis = (change) => {
  emphasis = normalizeEmphasis({ ...emphasis, ...change });
  applyEmphasis();
  storage.local.set({ [EMPHASIS_KEY]: emphasis });
  renderPanel();
};

const styleSample = (style) => {
  const sample = create("span", { className: "mdStyleSample" });
  sample.dataset.style = style;
  sample.append(create("i"), create("span", { textContent: "Aa" }));
  return sample;
};

const renderPanel = () => {
  const styles = create("div", { className: "styles" });
  for (const [style, label] of Object.entries(EMPHASIS_STYLES)) {
    const option = button("");
    option.setAttribute("aria-pressed", String(emphasis.style === style));
    option.append(styleSample(style), label);
    option.addEventListener("click", () => updateEmphasis({ style }));
    styles.append(option);
  }

  const colors = create("div", { className: "colors" });
  for (const color of SWATCHES) {
    const swatch = button("");
    swatch.title = color;
    swatch.style.background = color;
    swatch.setAttribute("aria-pressed", String(emphasis.color === color));
    swatch.addEventListener("click", () => updateEmphasis({ color }));
    colors.append(swatch);
  }
  const custom = create("label", { title: "ほかの色" });
  custom.setAttribute("aria-pressed", String(!SWATCHES.includes(emphasis.color)));
  const picker = create("input", { type: "color", value: emphasis.color });
  picker.addEventListener("change", () => updateEmphasis({ color: picker.value }));
  custom.append(picker);
  colors.append(custom);

  const strength = create("div", { className: "strength" });
  const slider = create("input", { type: "range", min: 10, max: 100, step: 5, value: emphasis.opacity });
  const value = create("output", { textContent: `${emphasis.opacity}%` });
  slider.addEventListener("input", () => {
    value.textContent = `${slider.value}%`;
    emphasis = normalizeEmphasis({ ...emphasis, opacity: Number(slider.value) });
    applyEmphasis();
  });
  slider.addEventListener("change", () => updateEmphasis({ opacity: Number(slider.value) }));
  strength.append(slider, value);

  panel.replaceChildren(
    create("h2", { textContent: "記録した単語の強調" }),
    create("div", { className: "label", textContent: "スタイル" }),
    styles,
    create("div", { className: "label", textContent: "色" }),
    colors,
    create("div", { className: "label", textContent: "濃さ" }),
    strength,
    create("div", { className: "count", textContent: `記録した単語 ${Object.keys(recordedWords).length}語` }),
  );
};

const closePanel = () => {
  panel.style.display = "none";
};

const addToolbarButton = () => {
  const toggle = create("button", {
    id: "mdEmphasisToggle",
    className: "toolbarButton",
    type: "button",
    title: "記録した単語の強調",
  });
  toggle.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 1.3a1 1 0 0 1 1.4 0l2.7 2.7a1 1 0 0 1 0 1.4L8.2 11.9 4.1 7.8zM3.4 8.5l4.1 4.1-1.2 1.2H2.5a.5.5 0 0 1-.35-.85L3.4 11.7z"/><rect x="1" y="14.6" width="14" height="1.4" rx=".7"/></svg>';
  toggle.addEventListener("click", () => {
    if (panel.style.display === "block") {
      closePanel();
      return;
    }
    renderPanel();
    document.body.append(panel);
    panel.style.display = "block";
  });
  document.getElementById("toolbarViewerRight")?.prepend(toggle);
  // Close the panel when clicking elsewhere or pressing Escape.
  document.addEventListener("mousedown", (event) => {
    if (!panel.contains(event.target) && !toggle.contains(event.target)) closePanel();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel();
  });
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
  document.addEventListener("mouseleave", hidePopup);
  document.getElementById("viewerContainer")?.addEventListener("scroll", hidePopup, { passive: true });
};

start().catch((error) => console.error("Mouse Dictionary:", error));
