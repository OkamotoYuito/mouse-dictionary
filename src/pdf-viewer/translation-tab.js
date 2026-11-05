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
import { addToHistory, findInHistory, historyKey, normalizeHistory } from "./translation-history";

const create = (tag, props = {}, children = []) => {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
};

const button = (textContent, onClick, className = "") => {
  const element = create("button", { type: "button", textContent, className });
  element.addEventListener("click", onClick);
  return element;
};

// onMakeNote({ quote, text, place }) puts a note; goTo(place) scrolls to a place in the PDF.
export const createTranslationTab = ({ onMakeNote, goTo, showToast }) => {
  const translate = createTranslateEngine();
  let key = null;
  let history = [];
  let current = null; // { source, place, translation, engine, status, kind }
  let requestId = 0;

  const status = create("div", { className: "mdTrStatus", role: "status" });
  status.setAttribute("aria-live", "polite");
  const source = create("div", { className: "mdTrSource", title: "クリックで全文表示" });
  source.addEventListener("click", () => source.classList.toggle("mdExpanded"));
  const result = create("div", { className: "mdTrResult" });
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
  const card = create("section", { className: "mdTrCurrent" }, [status, source, result, actions]);

  const historyTitle = create("h3");
  const clear = button("消去", () => {
    if (!history.length || !confirm("このPDFの翻訳履歴を消去しますか？")) return;
    history = [];
    save();
    render();
  });
  const list = create("div", { className: "mdTrHistory" });
  const empty = create("div", { className: "mdPanelEmpty" }, [
    create("p", { textContent: "本文の英文を選ぶと、ここに翻訳が出ます。" }),
    create("p", { textContent: "一度訳した文はこのPDFの履歴に残り、同じ文を選ぶと履歴からすぐに出します。" }),
  ]);
  const element = create("div", { className: "mdTrTab" }, [
    card,
    empty,
    create("div", { className: "mdTrHistoryHead" }, [historyTitle, clear]),
    list,
  ]);

  const save = () => {
    if (!key) return;
    const entries = history.map(({ normalized, ...entry }) => entry);
    if (entries.length) storage.local.set({ [key]: { entries } });
    else storage.local.remove(key);
  };

  const show = (values) => {
    current = { ...current, ...values };
    render();
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
      source.textContent = current.source;
      if (current.translation) renderTextWithMath(result, current.translation);
      else result.textContent = "";
      retry.hidden = !current.translation && !current.status;
      copy.hidden = !current.translation;
      toNote.hidden = !current.translation || !current.place;
    }

    historyTitle.textContent = `履歴 ${history.length}件`;
    clear.hidden = history.length === 0;
    list.replaceChildren(
      ...history.map((entry) => {
        const item = create("button", { type: "button", className: "mdTrItem" }, [
          create("div", { className: "mdTrItemSource", textContent: entry.source }),
          create("div", { className: "mdTrItemText", textContent: entry.translation }),
          create("div", {
            className: "mdTrItemMeta",
            textContent: [entry.place ? `p.${entry.place.page}` : "", entry.engine].filter(Boolean).join(" ・ "),
          }),
        ]);
        item.addEventListener("click", () => {
          requestId++;
          show({
            source: entry.source,
            place: entry.place ?? null,
            translation: entry.translation,
            engine: entry.engine,
            kind: "same",
          });
          if (entry.place) goTo(entry.place);
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
    translateSelection: (text, place) => run(text, place).catch((error) => console.error("Mouse Dictionary:", error)),
    render,
  };
};
