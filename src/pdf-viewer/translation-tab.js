/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// The translation tab of the PDF viewer's side panel: the translation of the selected sentence on
// top and this PDF's earlier translations below. A sentence translated before comes from the
// history at once; a nearly same one shows its old translation, marked, until the new one arrives.

import { renderTextWithMath } from "../main/core/math";
import { createTranslateEngine, engineLabel } from "../main/core/translate-engine";
import storage from "../main/lib/storage";
import { DEFAULT_POPUP_POSITION, POPUP_POSITIONS } from "./popup-position";
import { addToHistory, findInHistory, historyKey, normalizeHistory } from "./translation-history";
import { applyStyle, DEFAULT_STYLE, normalizeStyle, STYLE_KEYS } from "./translation-style";

const create = (tag, props = {}, children = []) => {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
};

const HISTORY_OPEN_KEY = "pdfTranslationHistoryOpen";
const POPUP_KEY = "pdfTranslationPopup";
const POPUP_POSITION_KEY = "pdfTranslationPopupPosition";
const OPTIONS_PAGE = "options/options.html#translation";

const SVG_NS = "http://www.w3.org/2000/svg";

// Little pictures of where the popup goes: the selected text as a gray bar, the popup as a blue
// box. Automatic shows the right, left and under places all dashed.
const POSITION_ICONS = {
  auto: [
    ["text", 7, 7, 6, 3],
    ["dash", 14, 5, 5, 7],
    ["dash", 1, 5, 5, 7],
    ["dash", 6, 11, 8, 4],
  ],
  below: [
    ["text", 5, 3, 10, 3],
    ["box", 4, 8, 12, 7],
  ],
  above: [
    ["box", 4, 1, 12, 7],
    ["text", 5, 11, 10, 3],
  ],
  right: [
    ["text", 1, 7, 8, 3],
    ["box", 11, 3, 8, 11],
  ],
  left: [
    ["box", 1, 3, 8, 11],
    ["text", 11, 7, 8, 3],
  ],
};

const positionIcon = (name) => {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 20 16");
  svg.setAttribute("aria-hidden", "true");
  for (const [kind, x, y, width, height] of POSITION_ICONS[name]) {
    const rect = document.createElementNS(SVG_NS, "rect");
    for (const [attribute, value] of Object.entries({ x, y, width, height, rx: kind === "text" ? 1 : 1.5 })) {
      rect.setAttribute(attribute, String(value));
    }
    rect.setAttribute("class", `mdIcon-${kind}`);
    svg.append(rect);
  }
  return svg;
};

const button = (textContent, onClick, className = "") => {
  const element = create("button", { type: "button", textContent, className });
  element.addEventListener("click", onClick);
  return element;
};

// onMakeNote({ quote, text, place }) puts a note. onModeChange(popup) tells the viewer whether
// translations of selections also pop up beside the text.
export const createTranslationTab = ({ onMakeNote, showToast, onModeChange = () => {} }) => {
  const translate = createTranslateEngine();
  let key = null;
  let history = [];
  let current = null; // { source, place, translation, engine, status, kind }
  let requestId = 0;
  let popupMode = false;
  let popupPlace = DEFAULT_POPUP_POSITION;
  const listeners = new Set();

  const status = create("div", { className: "mdTrStatus", role: "status" });
  status.setAttribute("aria-live", "polite");
  // The English, folded to two lines unless opened; the Japanese is what's read.
  const source = create("div", { className: "mdTrSource" });
  const sourceToggle = create("button", { type: "button", className: "mdTrSourceToggle", textContent: "原文" });
  sourceToggle.setAttribute("aria-expanded", "false");
  sourceToggle.addEventListener("click", () => {
    const open = !source.classList.contains("mdExpanded");
    source.classList.toggle("mdExpanded", open);
    sourceToggle.setAttribute("aria-expanded", String(open));
  });
  const result = create("div", { className: "mdTrResult", lang: "ja" });

  const popupToggle = create("button", {
    type: "button",
    className: "mdTrPopupToggle",
    textContent: "ポップアップ",
    title: "選んだ文の横にも翻訳を出す（パネルを閉じていても訳します）",
  });
  popupToggle.addEventListener("click", () => setPopupMode(!popupMode));

  // Where the popup goes, picked by its picture; shown while popups are on.
  const positionButtons = Object.entries(POPUP_POSITIONS).map(([name, label]) => {
    const positionButton = create("button", { type: "button", title: `ポップアップの位置: ${label}` }, [
      positionIcon(name),
    ]);
    positionButton.setAttribute("aria-label", label);
    positionButton.dataset.position = name;
    positionButton.addEventListener("click", () => {
      setPopupPlace(name);
      storage.local.set({ [POPUP_POSITION_KEY]: name });
    });
    return positionButton;
  });
  const positionGroup = create("div", { className: "mdTrPositions", role: "group" }, positionButtons);
  positionGroup.setAttribute("aria-label", "ポップアップの位置");
  const setPopupPlace = (value) => {
    popupPlace = POPUP_POSITIONS[value] ? value : DEFAULT_POPUP_POSITION;
    for (const positionButton of positionButtons) {
      positionButton.setAttribute("aria-pressed", String(positionButton.dataset.position === popupPlace));
    }
  };

  const setPopupMode = (value, { remember = true } = {}) => {
    popupMode = value;
    positionGroup.hidden = !value;
    popupToggle.setAttribute("aria-pressed", String(value));
    if (remember) storage.local.set({ [POPUP_KEY]: value });
    onModeChange(value);
  };

  // Text size, face and line spacing are set on the options page.
  const settingsButton = create("button", {
    type: "button",
    className: "mdTrSettings",
    title: "訳文の表示設定（文字サイズ・フォント・行間）",
  });
  settingsButton.setAttribute("aria-label", settingsButton.title);
  settingsButton.addEventListener("click", () => window.open(chrome.runtime.getURL(OPTIONS_PAGE), "_blank"));

  const retry = button("訳し直す", () => current && run(current.source, current.place, { force: true }));
  const copy = button("コピー", async () => {
    try {
      await navigator.clipboard.writeText(current?.translation ?? "");
      showToast("訳をコピーしました");
    } catch {
      showToast("コピーできませんでした");
    }
  });
  const toNote = button("付箋にする", () => {
    if (!current?.translation || !current.place) return;
    onMakeNote({ quote: current.source, text: current.translation, place: current.place });
    showToast("付箋にしました");
  });
  const actions = create("div", { className: "mdTrActions" }, [retry, copy, toNote]);
  const card = create("section", { className: "mdTrCurrent" }, [
    create("div", { className: "mdTrHead" }, [sourceToggle]),
    source,
    result,
    create("div", { className: "mdTrFoot" }, [status, actions]),
  ]);

  const historyTitle = create("span");
  const clear = button("消去", () => {
    if (!history.length || !confirm("このPDFの翻訳履歴を消去しますか？")) return;
    history = [];
    save();
    render();
  });
  const list = create("div", { className: "mdTrHistory" });
  // Folded away by default so the current translation has the room.
  const historyBox = create("details", { className: "mdTrHistoryBox" }, [
    create("summary", { className: "mdTrHistoryHead" }, [historyTitle, clear]),
    list,
  ]);
  historyBox.addEventListener("toggle", () => storage.local.set({ [HISTORY_OPEN_KEY]: historyBox.open }));
  clear.addEventListener("click", (event) => event.preventDefault()); // don't fold the history
  const empty = create("div", { className: "mdPanelEmpty" }, [
    create("p", { textContent: "本文の英文を選ぶと、ここに翻訳が出ます。" }),
    create("p", { textContent: "一度訳した文はこのPDFの履歴に残り、同じ文を選ぶと履歴からすぐに出します。" }),
  ]);

  // Always in view, also before the first translation.
  const bar = create("div", { className: "mdTrBar" }, [popupToggle, positionGroup, settingsButton]);
  const element = create("div", { className: "mdTrTab" }, [bar, card, empty, historyBox]);

  // The look follows the options page, also when it's changed there while this PDF is open.
  applyStyle(DEFAULT_STYLE);
  setPopupMode(false, { remember: false });
  setPopupPlace(DEFAULT_POPUP_POSITION);
  storage.local.get([...STYLE_KEYS, HISTORY_OPEN_KEY, POPUP_KEY, POPUP_POSITION_KEY]).then((stored) => {
    applyStyle(normalizeStyle(stored ?? {}));
    setPopupPlace(stored?.[POPUP_POSITION_KEY]);
    historyBox.open = stored?.[HISTORY_OPEN_KEY] === true;
    setPopupMode(stored?.[POPUP_KEY] === true, { remember: false });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !STYLE_KEYS.some((name) => name in changes)) return;
    storage.local.get(STYLE_KEYS).then((stored) => applyStyle(normalizeStyle(stored ?? {})));
  });

  const save = () => {
    if (!key) return;
    const entries = history.map(({ normalized, ...entry }) => entry);
    if (entries.length) storage.local.set({ [key]: { entries } });
    else storage.local.remove(key);
  };

  // Every translation run has its own id, so a popup keeps to the sentence it was opened for.
  const notify = () => {
    if (!current) return;
    const view = { ...current, statusText: statusText() };
    for (const listener of listeners) listener(view);
  };

  const show = (values) => {
    current = { ...current, ...values, runId: requestId };
    render();
    notify();
  };

  const run = async (text, place, { force = false } = {}) => {
    const request = ++requestId;
    const found = force ? null : findInHistory(history, text);
    if (found?.kind === "same") {
      const { entry } = found;
      history = addToHistory(history, { ...entry, source: text, place: place ?? entry.place });
      save();
      show({
        source: text,
        place: history[0].place,
        translation: entry.translation,
        engine: entry.engine,
        kind: "same",
      });
      return;
    }
    if (found?.kind === "similar") {
      const { entry } = found;
      // Azure is paid for by the character, so a nearly same sentence waits for "訳し直す".
      const wait = entry.engine === "Azure";
      show({
        source: text,
        place,
        translation: entry.translation,
        engine: entry.engine,
        kind: "similar",
        waiting: wait,
      });
      if (wait) return;
    } else {
      show({ source: text, place, translation: null, engine: null, kind: null, status: "翻訳しています…" });
    }

    const translated = await translate(text, (message) => {
      if (request === requestId && current.kind !== "similar") show({ status: message });
    });
    if (request !== requestId) return;
    if (translated.error) {
      show({ status: translated.error, kind: current.kind === "similar" ? "similar-failed" : null });
      return;
    }
    history = addToHistory(history, {
      source: text,
      translation: translated.translation,
      engine: translated.engine,
      place,
    });
    save();
    show({ translation: translated.translation, engine: translated.engine, note: translated.note, kind: "new" });
  };

  const statusText = () => {
    if (!current) return "";
    switch (current.kind) {
      case "same":
        return `履歴から（${current.engine || "翻訳"}）`;
      case "similar":
        return current.waiting
          ? "履歴から（ほぼ同じ文）。違う箇所があれば「訳し直す」"
          : "履歴から（ほぼ同じ文）。訳し直しています…";
      case "similar-failed":
        return `履歴から（ほぼ同じ文）。${current.status}`;
      case "new":
        return engineLabel({ engine: current.engine, note: current.note ?? "" });
      default:
        return current.status ?? "";
    }
  };

  const render = () => {
    card.hidden = !current;
    empty.hidden = !!current || history.length > 0;
    if (current) {
      status.textContent = statusText();
      card.classList.toggle("mdTrSimilar", current.kind === "similar" || current.kind === "similar-failed");
      renderTextWithMath(source, current.source);
      if (current.translation) renderTextWithMath(result, current.translation);
      else result.textContent = "";
      retry.hidden = !current.translation && !current.status;
      copy.hidden = !current.translation;
      toNote.hidden = !current.translation || !current.place;
    }

    historyTitle.textContent = `翻訳履歴 ${history.length}件`;
    historyBox.hidden = history.length === 0;
    clear.hidden = history.length === 0;
    list.replaceChildren(
      ...history.map((entry) => {
        const itemSource = create("div", { className: "mdTrItemSource" });
        const itemText = create("div", { className: "mdTrItemText" });
        // The English keeps its sub- and superscripts as TeX, and translations may hold TeX too.
        renderTextWithMath(itemSource, entry.source);
        renderTextWithMath(itemText, entry.translation);
        const item = create("button", { type: "button", className: "mdTrItem" }, [
          itemSource,
          itemText,
          create("div", {
            className: "mdTrItemMeta",
            textContent: [entry.place ? `p.${entry.place.page}` : "", entry.engine].filter(Boolean).join(" ・ "),
          }),
        ]);
        // Shows that translation on top; the pages stay where they are.
        item.addEventListener("click", () => {
          requestId++;
          show({
            source: entry.source,
            place: entry.place ?? null,
            translation: entry.translation,
            engine: entry.engine,
            kind: "same",
          });
          element.scrollTo({ top: 0, behavior: "smooth" });
        });
        return item;
      }),
    );
  };

  return {
    element,
    // Loads the history of the PDF with this fingerprint.
    async load(fingerprint) {
      key = historyKey(fingerprint);
      const stored = await storage.local.get([key]);
      history = normalizeHistory(stored?.[key]);
      current = null;
      render();
    },
    // Translates a sentence and returns the id of that run.
    translateSelection(text, place) {
      run(text, place).catch((error) => console.error("Mouse Dictionary:", error));
      return requestId;
    },
    retranslate: () => current && run(current.source, current.place, { force: true }),
    subscribe: (listener) => listeners.add(listener),
    // Sends the current translation to the listeners again, e.g. to a popup opened just now.
    notify,
    isPopupMode: () => popupMode,
    popupPlace: () => popupPlace,
    setPopupMode,
    render,
  };
};
