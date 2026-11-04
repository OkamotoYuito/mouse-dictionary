/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import dom from "../lib/dom";
import storage from "../lib/storage";
import template from "../lib/template";
import utils from "../lib/utils";

const TEX_EXPRESSION =
  /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?:\\.|[^$])*?(?<!\\)\$(?!\$)|\\[A-Za-z]+\*?(?:\{[^{}\n]*\})*/g;

const translatePreservingTex = async (translator, text) => {
  const matches = [...text.matchAll(TEX_EXPRESSION)];
  if (!matches.length) return translator.translate(text);

  const protectedExpressions = [];
  const pattern = new RegExp(TEX_EXPRESSION.source, TEX_EXPRESSION.flags);
  const masked = text.replace(pattern, (expression) => {
    const marker = `MDTEXTOKEN${protectedExpressions.length}END`;
    protectedExpressions.push({ expression, marker });
    return marker;
  });
  const translated = await translator.translate(masked);
  if (protectedExpressions.every(({ marker }) => translated.includes(marker))) {
    return protectedExpressions.reduce(
      (result, { expression, marker }) => result.split(marker).join(expression),
      translated,
    );
  }

  let result = "";
  let offset = 0;
  for (const match of matches) {
    const prose = text.slice(offset, match.index);
    if (prose) result += await translator.translate(prose);
    result += match[0];
    offset = match.index + match[0].length;
  }
  const remaining = text.slice(offset);
  if (remaining) result += await translator.translate(remaining);
  return result;
};

const createDialogElement = (settings) => {
  const html = template.render(settings.dialogTemplate, {
    backgroundColor: settings.backgroundColor,
    width: settings.width,
    height: settings.height,
    scroll: "scroll", // For backward compatibility
  });
  const dialog = dom.create(html);
  dom.applyStyles(dialog, settings.normalDialogStyles);
  return dialog;
};

const create = (settings) => {
  const dialog = createDialogElement(settings);
  const content = dom.create(settings.contentWrapperTemplate);
  const form = dom.create(`<form class="md-editor">
    <style>
      .md-editor { position: sticky; top: 0; z-index: 2; padding: 12px; background: #fff; border-bottom: 1px solid #e7ebf1; font: 13px/1.45 -apple-system, BlinkMacSystemFont, sans-serif; color: #263247; }
      .md-editor *, .md-editor *::before, .md-editor *::after { box-sizing: border-box; }
      .md-editor [hidden] { display: none !important; }
      .md-editor button { appearance: none; border: 1px solid transparent; border-radius: 8px; padding: 7px 11px; font: 600 12px/1.3 -apple-system, BlinkMacSystemFont, sans-serif; cursor: pointer; transition: background-color .15s, border-color .15s; }
      .md-editor button:focus-visible, .md-editor input:focus-visible, .md-editor textarea:focus-visible { outline: 2px solid #5674e8; outline-offset: 2px; }
      .md-editor [data-add] { display: inline-flex; align-items: center; gap: 6px; color: #3b56b6; background: #eef2ff; }
      .md-editor [data-add]:hover { background: #dfe7ff; }
      .md-editor [data-translate] { margin-left: 5px; color: #315a48; background: #e8f5ed; }
      .md-editor [data-translate]:hover { background: #d7eddf; }
      .md-editor [data-translation] { display: grid; gap: 6px; margin-top: 8px; padding: 9px; border: 1px solid #e0e8e3; border-radius: 8px; background: #f7fbf8; }
      .md-editor [data-translation-result] { color: #263b30; white-space: pre-wrap; overflow-wrap: anywhere; }
      .md-editor [data-fields] { display: grid; gap: 8px; margin-top: 12px; }
      .md-editor label { display: grid; gap: 4px; color: #546177; font-size: 11px; font-weight: 600; }
      .md-editor input, .md-editor textarea { width: 100%; padding: 8px 10px; border: 1px solid #d8deea; border-radius: 8px; background: #f9fafc; color: #202b3c; font: 13px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
      .md-editor textarea { min-height: 70px; resize: vertical; }
      .md-editor .md-actions { display: flex; flex-wrap: wrap; gap: 6px; }
      .md-editor [type=submit] { background: #405fcb; color: white; }
      .md-editor [type=submit]:hover { background: #304aa8; }
      .md-editor [data-load], .md-editor [data-cancel] { background: #f1f3f7; color: #49566a; }
      .md-editor [data-load]:hover, .md-editor [data-cancel]:hover { background: #e3e7ef; }
      .md-editor [data-status] { color: #65748b; font-size: 11px; overflow-wrap: anywhere; }
      .md-editor [data-suggestions] { display: grid; gap: 5px; }
      .md-editor [data-suggestion] { text-align: left; background: #f3f6ff; color: #304b9c; overflow-wrap: anywhere; line-height: 1.5; }
    </style>
    <button type="button" data-add><span aria-hidden="true">＋</span> 意味を追加</button>
    <button type="button" data-translate aria-controls="mouse-dictionary-translation" aria-expanded="false">翻訳を表示</button>
    <section id="mouse-dictionary-translation" data-translation hidden aria-label="翻訳結果">
      <span data-translation-status role="status" aria-live="polite">文章を選択すると自動翻訳します</span>
      <div data-translation-result></div>
    </section>
    <div data-fields hidden>
      <label>単語<input name="word" placeholder="英単語" aria-label="英単語" required></label>
      <label>自分の意味<textarea name="meaning" placeholder="意味やメモを入力" aria-label="追加する意味" required></textarea></label>
      <div data-suggestions><button type="button" data-suggestion hidden></button></div>
      <div class="md-actions"><button type="button" data-suggest>意味の候補を取得</button><span data-suggest-status role="status" aria-live="polite"></span></div>
      <div class="md-actions"><button type="submit">保存</button><button type="button" data-load>登録済みを編集</button><button type="button" data-cancel>キャンセル</button></div>
      <span data-status role="status" aria-live="polite"></span>
    </div></form>`);
  const fields = form.querySelector("[data-fields]");
  const word = form.querySelector('[name="word"]');
  const meaning = form.querySelector('[name="meaning"]');
  const status = form.querySelector("[data-status]");
  const suggestions = form.querySelector("[data-suggestions]");
  const firstSuggestion = form.querySelector("[data-suggestion]");
  const suggestionStatus = form.querySelector("[data-suggest-status]");
  let suggestionRequestId = 0;
  let pendingSources = [];
  const translationPanel = form.querySelector("[data-translation]");
  const translationStatus = form.querySelector("[data-translation-status]");
  const translationResult = form.querySelector("[data-translation-result]");
  let translationRequestId = 0;
  let translatorPromise = null;
  const translatorOptions = { sourceLanguage: "en", targetLanguage: "ja" };
  const translatorAvailability =
    "Translator" in globalThis
      ? globalThis.Translator.availability(translatorOptions).catch(() => null)
      : Promise.resolve(null);
  const translateButton = form.querySelector("[data-translate]");
  const setTranslationVisible = (visible) => {
    translationPanel.hidden = !visible;
    translateButton.textContent = visible ? "翻訳を隠す" : "翻訳を表示";
    translateButton.setAttribute("aria-expanded", String(visible));
  };
  const clearSuggestions = () => {
    firstSuggestion.hidden = true;
    firstSuggestion.textContent = "";
    firstSuggestion.onclick = null;
    suggestions.querySelectorAll("[data-suggestion]").forEach((button, index) => {
      if (index) button.remove();
    });
  };
  const addSuggestion = (button, candidate, head) => {
    button.onclick = () => {
      const selected = candidate.meaning;
      if (!meaning.value.split("\n").includes(selected))
        meaning.value = meaning.value ? `${meaning.value}\n${selected}` : selected;
      if (candidate.source === "ウィクショナリー日本語版" && !pendingSources.includes(head.toLowerCase()))
        pendingSources.push(head.toLowerCase());
      meaning.dispatchEvent(new Event("input", { bubbles: true }));
      suggestionStatus.textContent = "候補を入力欄に追加しました";
      meaning.focus();
    };
  };
  const suggest = () => {
    const head = word.value.trim();
    const request = ++suggestionRequestId;
    clearSuggestions();
    if (!/^[a-zA-Z]+(?:['’-][a-zA-Z]+)*$/.test(head) || head.length > 80) {
      suggestionStatus.textContent = "英単語を入力してください";
      return;
    }
    suggestionStatus.textContent = "辞書から候補を取得中…";
    chrome.runtime.sendMessage({ type: "suggest_meaning", word: head }, (response) => {
      if (request !== suggestionRequestId || fields.hidden || word.value.trim() !== head) return;
      if (chrome.runtime.lastError || response?.error) {
        suggestionStatus.textContent = response?.error ?? "候補を取得できませんでした";
      } else if (!response?.meaning) {
        suggestionStatus.textContent = "候補が見つかりませんでした";
      } else {
        const candidates = [response, ...(response.alternatives ?? [])];
        candidates.forEach((candidate, index) => {
          const button = index === 0 ? firstSuggestion : document.createElement("button");
          button.hidden = false;
          if (index) {
            button.type = "button";
            button.dataset.suggestion = "";
          }
          button.textContent = candidate.meaning;
          addSuggestion(button, candidate, head);
          suggestions.appendChild(button);
        });
        suggestionStatus.textContent = `${candidates.length}件の候補。押すと入力欄に追加します`;
      }
    });
  };
  form.querySelector("[data-suggest]").addEventListener("click", suggest);
  const translateText = async (text) => {
    const request = ++translationRequestId;
    setTranslationVisible(true);
    translationResult.textContent = "";
    if (!text) {
      translationStatus.textContent = "翻訳する文章を選択してください";
      return;
    }
    if (!("Translator" in globalThis)) {
      translationStatus.textContent = "このChromeではTranslator APIを利用できません";
      return;
    }
    translationStatus.textContent = "翻訳モデルを準備しています…";
    if (!translatorPromise) {
      translatorPromise = globalThis.Translator.create({
        ...translatorOptions,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            if (!translationPanel.hidden)
              translationStatus.textContent = `翻訳モデルをダウンロード中… ${Math.round(event.loaded * 100)}%`;
          });
        },
      });
      translatorPromise.catch(() => {
        translatorPromise = null;
      });
    }
    try {
      const translator = await translatorPromise;
      if (request !== translationRequestId) return;
      translationStatus.textContent = "翻訳しています…";
      const translated = await translatePreservingTex(translator, text);
      if (request !== translationRequestId) return;
      translationResult.textContent = translated;
      translationStatus.textContent = "英語 → 日本語";
    } catch (error) {
      console.error(error);
      if (request !== translationRequestId) return;
      if (error?.name === "NotSupportedError") {
        const availability = await translatorAvailability;
        if (request !== translationRequestId) return;
        translationStatus.textContent =
          availability === "unavailable"
            ? "このChromeでは英語→日本語の翻訳モデルを利用できません"
            : `翻訳モデルを作成できませんでした（availability: ${availability ?? "不明"}）`;
      } else {
        translationStatus.textContent = `翻訳できませんでした（${error?.name ?? "エラー"}）`;
      }
    }
  };
  translateButton.addEventListener("click", () => {
    setTranslationVisible(translationPanel.hidden);
  });
  dialog.addEventListener("mouse-dictionary-translate-selection", (event) => translateText(event.detail));
  dialog.addEventListener("mouse-dictionary-hide-translation", () => {
    translationRequestId++;
    setTranslationVisible(false);
  });
  let editingHead = null;
  let requestId = 0;
  const loadMeaning = async () => {
    const head = word.value.trim().toLowerCase();
    const request = ++requestId;
    if (!head) return;
    try {
      const existing = await storage.local.pick(`**** custom word ****:${head}`);
      if (request !== requestId || word.value.trim().toLowerCase() !== head) return;
      const decoder = document.createElement("textarea");
      decoder.innerHTML = (existing ?? "").replace(/<br\s*\/?\s*>/gi, "\n");
      meaning.value = decoder.value;
      pendingSources = [];
      editingHead = existing ? head : null;
      status.textContent = existing ? "登録済みの意味を編集中" : "登録済みの意味はありません";
    } catch (error) {
      console.error(error);
      status.textContent = "読み込めませんでした";
    }
  };
  form.addEventListener("mousedown", (event) => event.stopPropagation());
  const openForm = (head) => {
    fields.hidden = false;
    word.value = head;
    meaning.value = "";
    pendingSources = [];
    editingHead = null;
    meaning.focus();
    loadMeaning();
    if (head) suggest();
  };
  form.querySelector("[data-add]").addEventListener("click", () => openForm(utils.getSelection()?.trim() ?? ""));
  dialog.addEventListener("mouse-dictionary-add-meaning", (event) => openForm(event.detail));
  form.querySelector("[data-load]").addEventListener("click", loadMeaning);
  word.addEventListener("input", () => {
    suggestionRequestId++;
    clearSuggestions();
    suggestionStatus.textContent = "単語を変更した場合は候補を再取得できます";
    requestId++;
    editingHead = null;
    status.textContent = "単語を変更しました。既存の意味を編集する場合は読み込んでください";
  });
  meaning.addEventListener("input", () => {
    requestId++;
  });
  form.querySelector("[data-cancel]").addEventListener("click", () => {
    suggestionRequestId++;
    clearSuggestions();
    suggestionStatus.textContent = "";
    fields.hidden = true;
    requestId++;
    status.textContent = "";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const head = word.value.trim().toLowerCase();
    const value = meaning.value.trim();
    if (!head || !value) return;
    try {
      const key = `**** custom word ****:${head}`;
      const existing = await storage.local.pick(key);
      const sourceKey = `**** custom source ****:${head}`;
      const existingSources = pendingSources.length ? await storage.local.pick(sourceKey) : null;
      const escaped = value.replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
      );
      const values = { [key]: existing && editingHead !== head ? `${existing}<br>${escaped}` : escaped };
      if (pendingSources.length) {
        values[sourceKey] = [
          ...new Set([...(Array.isArray(existingSources) ? existingSources : []), ...pendingSources]),
        ];
      }
      await storage.local.set(values);
      meaning.value = "";
      fields.hidden = true;
      suggestionRequestId++;
      clearSuggestions();
      status.textContent = "";
      dialog.dispatchEvent(new CustomEvent("mouse-dictionary-entry-saved", { detail: head }));
    } catch (error) {
      console.error(error);
      status.textContent = "保存できませんでした";
    }
  });
  dialog.appendChild(form);
  dialog.appendChild(content);
  return { dialog, content };
};

export default { create };
