/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import dom from "../lib/dom";
import storage from "../lib/storage";
import template from "../lib/template";
import utils from "../lib/utils";

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
  const form = dom.create(`<form style="padding:4px; background:white; position:sticky; top:0; z-index:2;">
    <button type="button" data-add>＋ 意味を追加</button>
    <div data-fields hidden><input name="word" placeholder="英単語" aria-label="英単語" required style="width:95%">
    <textarea name="meaning" placeholder="追加する意味" aria-label="追加する意味" required style="width:95%"></textarea>
    <button type="submit">保存</button> <button type="button" data-cancel>キャンセル</button>
    <span data-status role="status"></span></div></form>`);
  const fields = form.querySelector("[data-fields]");
  const word = form.querySelector('[name="word"]');
  const meaning = form.querySelector('[name="meaning"]');
  const status = form.querySelector("[data-status]");
  form.addEventListener("mousedown", (event) => event.stopPropagation());
  const openForm = (head) => {
    fields.hidden = false;
    word.value = head;
    meaning.focus();
  };
  form.querySelector("[data-add]").addEventListener("click", () => openForm(utils.getSelection()?.trim() ?? ""));
  dialog.addEventListener("mouse-dictionary-add-meaning", (event) => openForm(event.detail));
  form.querySelector("[data-cancel]").addEventListener("click", () => {
    fields.hidden = true;
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
      const escaped = value.replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
      );
      await storage.local.set({ [key]: existing ? `${existing}<br>${escaped}` : escaped });
      meaning.value = "";
      fields.hidden = true;
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
