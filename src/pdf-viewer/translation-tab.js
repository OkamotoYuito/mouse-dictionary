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

const create = (tag, props = {}, children = []) => {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
};

const SIZE_KEY = "pdfTranslationSize";
const HISTORY_OPEN_KEY = "pdfTranslationHistoryOpen";
const POPUP_KEY = "pdfTranslationPopup";
const POPUP_POSITION_KEY = "pdfTranslationPopupPosition";
const SIZES = { small: { label: "小", px: 13 }, medium: { label: "中", px: 15 }, large: { label: "大", px: 17.5 } };

// Faces and line spacing for translations, kept across PDFs. A face that isn't installed falls
// back to Noto Sans JP, then Hiragino.
const FONT_KEY = "pdfTranslationFont";
const LINE_KEY = "pdfTranslationLine";
const FALLBACK = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';
const FONTS = {
  noto: { label: "Noto Sans JP", stack: FALLBACK },
  hiragino: { label: "ヒラギノ角ゴ", stack: `"Hiragino Sans", "Hiragino Kaku Gothic ProN", ${FALLBACK}` },
  yu: { label: "游ゴシック", stack: `"Yu Gothic UI", YuGothic, "Yu Gothic Medium", "Yu Gothic", ${FALLBACK}` },
  biz: { label: "BIZ UDPゴシック", stack: `"BIZ UDPGothic", "BIZ UDGothic", ${FALLBACK}` },
  system: { label: "システム", stack: `system-ui, -apple-system, ${FALLBACK}` },
  notoSerif: {
    label: "Noto Serif JP",
    stack: `"Noto Serif JP", "Noto Serif CJK JP", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, serif`,
  },
  mincho: {
    label: "明朝（ヒラギノ・游）",
    stack: `"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP", serif`,
  },
};
const LINES = {
  tight: { label: "狭い", value: 1.3 },
  normal: { label: "標準", value: 1.45 },
  wide: { label: "広い", value: 1.7 },
};

// A small row of buttons where one is chosen.
const segmented = (choices, label, onChoose) => {
  const buttons = Object.entries(choices).map(([name, choice]) => {
    const choiceButton = create("button", {
      type: "button",
      textContent: choice.label,
      title: `${label}: ${choice.label}`,
    });
    choiceButton.dataset.choice = name;
    choiceButton.addEventListener("click", () => onChoose(name));
    return choiceButton;
  });
  const group = create("div", { className: "mdTrSize", role: "group" }, buttons);
  group.setAttribute("aria-label", label);
  const select = (name) => {
    for (const choiceButton of buttons)
      choiceButton.setAttribute("aria-pressed", String(choiceButton.dataset.choice === name));
  };
  return { group, select };
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

  // Text size of the translations, kept across PDFs.
  const sizeButtons = Object.entries(SIZES).map(([name, { label }]) => {
    const sizeButton = create("button", { type: "button", textContent: label, title: `文字サイズ: ${label}` });
    sizeButton.addEventListener("click", () => {
      setSize(name);
      storage.local.set({ [SIZE_KEY]: name });
    });
    sizeButton.dataset.size = name;
    return sizeButton;
  });
  const sizeSwitch = create("div", { className: "mdTrSize", role: "group" }, sizeButtons);
  sizeSwitch.setAttribute("aria-label", "文字サイズ");

  const popupToggle = create("button", {
    type: "button",
    className: "mdTrPopupToggle",
    textContent: "ポップアップ",
    title: "選んだ文の横にも翻訳を出す（パネルを閉じていても訳します）",
  });
  popupToggle.addEventListener("click", () => setPopupMode(!popupMode));
  // Where the popup goes, shown while popups are on.
  const positionSelect = create(
    "select",
    { className: "mdTrPositionSelect" },
    Object.entries(POPUP_POSITIONS).map(([value, label]) => create("option", { value, textContent: label })),
  );
  positionSelect.addEventListener("change", () => {
    popupPlace = positionSelect.value;
    storage.local.set({ [POPUP_POSITION_KEY]: popupPlace });
  });
  const positionRow = create("label", { className: "mdTrPositionRow" }, [
    create("span", { textContent: "位置" }),
    positionSelect,
  ]);
  const setPopupPlace = (value) => {
    popupPlace = POPUP_POSITIONS[value] ? value : DEFAULT_POPUP_POSITION;
    positionSelect.value = popupPlace;
  };

  const setPopupMode = (value, { remember = true } = {}) => {
    popupMode = value;
    positionRow.hidden = !value;
    popupToggle.setAttribute("aria-pressed", String(value));
    if (remember) storage.local.set({ [POPUP_KEY]: value });
    onModeChange(value);
  };
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
  // Face and line spacing, on the root so the popup follows them too.
  const root = document.documentElement.style;
  const fontSelect = create(
    "select",
    { className: "mdTrPositionSelect" },
    Object.entries(FONTS).map(([value, { label }]) => create("option", { value, textContent: label })),
  );
  const setFont = (name) => {
    const font = FONTS[name] ? name : "noto";
    fontSelect.value = font;
    root.setProperty("--md-reading-font", FONTS[font].stack);
  };
  fontSelect.addEventListener("change", () => {
    setFont(fontSelect.value);
    storage.local.set({ [FONT_KEY]: fontSelect.value });
  });
  const lineSwitch = segmented(LINES, "行間", (name) => {
    setLine(name);
    storage.local.set({ [LINE_KEY]: name });
  });
  const setLine = (name) => {
    const line = LINES[name] ? name : "normal";
    lineSwitch.select(line);
    root.setProperty("--md-tr-line", String(LINES[line].value));
  };

  const bar = create("div", { className: "mdTrBar" }, [popupToggle, positionRow, sizeSwitch]);
  const typeBar = create("div", { className: "mdTrBar" }, [
    create("label", { className: "mdTrPositionRow" }, [create("span", { textContent: "フォント" }), fontSelect]),
    create("div", { className: "mdTrPositionRow mdTrPushEnd" }, [
      create("span", { textContent: "行間" }),
      lineSwitch.group,
    ]),
  ]);
  const element = create("div", { className: "mdTrTab" }, [bar, typeBar, card, empty, historyBox]);

  const setSize = (name) => {
    const size = SIZES[name] ? name : "medium";
    // On the root, so the translation popup uses the same size.
    document.documentElement.style.setProperty("--md-tr-size", `${SIZES[size].px}px`);
    for (const sizeButton of sizeButtons)
      sizeButton.setAttribute("aria-pressed", String(sizeButton.dataset.size === size));
  };
  setSize("medium");
  setFont("noto");
  setLine("normal");
  setPopupMode(false, { remember: false });
  setPopupPlace(DEFAULT_POPUP_POSITION);
  storage.local.get([SIZE_KEY, HISTORY_OPEN_KEY, POPUP_KEY, POPUP_POSITION_KEY, FONT_KEY, LINE_KEY]).then((stored) => {
    setFont(stored?.[FONT_KEY]);
    setLine(stored?.[LINE_KEY]);
    setPopupPlace(stored?.[POPUP_POSITION_KEY]);
    setSize(stored?.[SIZE_KEY]);
    historyBox.open = stored?.[HISTORY_OPEN_KEY] === true;
    setPopupMode(stored?.[POPUP_KEY] === true, { remember: false });
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
