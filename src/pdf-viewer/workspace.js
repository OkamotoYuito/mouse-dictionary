/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// Runs inside the bundled PDF.js viewer, next to vocabulary.js. Adds free scrolling (drag the
// pages around while holding Space, or with the middle button) and sticky notes, with a panel on
// the right listing the notes of the PDF. The look itself is in mouse-dictionary-workspace.css.

import { readPdfSelection } from "../main/core/pdf-selection";
import storage from "../main/lib/storage";
import {
  createNote,
  filterNotes,
  NOTE_COLORS,
  normalizeDocument,
  notesKey,
  removeNote,
  sortNotes,
  storedSignature,
  toMarkdown,
  updateNote,
} from "./sticky-notes-model";

const PANEL_KEY = "pdfStickyNotesPanelOpen";
const SAVE_DELAY = 400;
const DRAG_THRESHOLD = 3;
const SCROLL_PAGE = 3; // PDF.js ScrollMode.PAGE
const SCROLL_VERTICAL = 0;

const create = (tag, props = {}, children = []) => {
  const element = Object.assign(document.createElement(tag), props);
  element.append(...children);
  return element;
};

const isTyping = (target) =>
  !!target?.closest?.("input, textarea, select, [contenteditable]:not([contenteditable='false'])");

// ---- Free scrolling ----

const setUpPanning = (container) => {
  let spaceDown = false;
  let pan = null;
  let moved = false;

  const stop = () => {
    if (!pan) return;
    container.releasePointerCapture?.(pan.pointerId);
    pan = null;
    container.classList.remove("mdPanning");
  };

  // Space works like Acrobat's temporary hand tool. A tap without dragging still scrolls a screen.
  // Listening on window in the capture phase keeps PDF.js from handling the same key.
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code !== "Space" || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat || spaceDown) return;
      spaceDown = true;
      moved = false;
      container.classList.add("mdPanReady");
    },
    true,
  );
  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code !== "Space" || !spaceDown) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      spaceDown = false;
      container.classList.remove("mdPanReady");
      if (!moved && !pan) {
        container.scrollBy({ top: (event.shiftKey ? -1 : 1) * container.clientHeight * 0.9, behavior: "smooth" });
      }
    },
    true,
  );
  window.addEventListener("blur", () => {
    spaceDown = false;
    container.classList.remove("mdPanReady");
    stop();
  });

  container.addEventListener(
    "pointerdown",
    (event) => {
      const byMiddle = event.button === 1;
      if (!byMiddle && !(spaceDown && event.button === 0)) return;
      event.preventDefault();
      event.stopPropagation();
      pan = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: container.scrollLeft,
        top: container.scrollTop,
      };
      container.setPointerCapture?.(event.pointerId);
      container.classList.add("mdPanning");
    },
    true,
  );
  // Keep the browser's own middle-button autoscroll out of the way.
  container.addEventListener("mousedown", (event) => event.button === 1 && event.preventDefault(), true);
  container.addEventListener("pointermove", (event) => {
    if (!pan || event.pointerId !== pan.pointerId) return;
    const dx = event.clientX - pan.x;
    const dy = event.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) moved = true;
    container.scrollLeft = pan.left - dx;
    container.scrollTop = pan.top - dy;
  });
  container.addEventListener("pointerup", stop);
  container.addEventListener("pointercancel", stop);
  container.addEventListener("lostpointercapture", stop);
};

// ---- Sticky notes ----

const app = window.PDFViewerApplication;

const state = {
  key: null,
  title: "",
  notes: [],
  lastSaved: "",
  placing: false,
  focusedId: null,
  query: "",
};

const layers = new Map(); // page number -> layer element
const noteElements = new Map(); // note id -> element

let container;
let panel;
let panelList;
let panelTitle;
let addButton;
let panelButton;
let countBadge;
let toast;
let saveTimer;

const pageView = (pageNumber) => app.pdfViewer?.getPageView(pageNumber - 1);

const pageNumberAt = (x, y) => {
  for (const element of document.elementsFromPoint(x, y)) {
    const page = element.closest?.(".page[data-page-number]");
    if (page) return { page: Number(page.dataset.pageNumber), div: page };
  }
  return null;
};

const layerFor = (pageNumber) => {
  let layer = layers.get(pageNumber);
  if (!layer) {
    layer = create("div", { className: "mdNoteLayer" });
    layers.set(pageNumber, layer);
  }
  return layer;
};

// PDF.js empties a page's element when it re-renders it, so the layers are put back every time.
const attachLayers = () => {
  for (const [pageNumber, layer] of layers) {
    const div = pageView(pageNumber)?.div;
    if (div && layer.parentElement !== div) div.append(layer);
  }
};

let attachQueued = false;
const attachLayersSoon = () => {
  if (attachQueued) return;
  attachQueued = true;
  requestAnimationFrame(() => {
    attachQueued = false;
    attachLayers();
  });
};

const save = () => {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (!state.key) return;
  state.title = document.title || state.title;
  const value = { title: state.title, notes: state.notes };
  state.lastSaved = storedSignature(value);
  if (state.notes.length === 0) {
    storage.local.remove(state.key);
  } else {
    storage.local.set({ [state.key]: value });
  }
};

const saveLater = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, SAVE_DELAY);
};

const setNotes = (notes, { persist = true, soon = false } = {}) => {
  state.notes = notes;
  if (persist) soon ? saveLater() : save();
  countBadge.textContent = notes.length ? String(notes.length) : "";
  renderPanel();
};

const noteById = (id) => state.notes.find((note) => note.id === id);

const focusNote = (id) => {
  state.focusedId = id;
  for (const [noteId, element] of noteElements) element.classList.toggle("mdFocused", noteId === id);
  for (const item of panelList.querySelectorAll(".mdPanelItem")) {
    item.classList.toggle("mdCurrent", item.dataset.id === id);
  }
};

const change = (id, values, options) => {
  setNotes(updateNote(state.notes, id, values), options);
  const note = noteById(id);
  if (note) renderNote(note);
};

const deleteNote = (id) => {
  noteElements.get(id)?.remove();
  noteElements.delete(id);
  setNotes(removeNote(state.notes, id));
};

// Dragging a note (by its icon or its header) moves it, even onto another page.
const startDrag = (event, id, onClick) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const element = noteElements.get(id);
  const origin = element.getBoundingClientRect();
  const grab = { x: event.clientX - origin.left, y: event.clientY - origin.top };
  const start = { x: event.clientX, y: event.clientY };
  let dragging = false;
  focusNote(id);

  const move = (moveEvent) => {
    const dx = moveEvent.clientX - start.x;
    const dy = moveEvent.clientY - start.y;
    if (!dragging && Math.abs(dx) + Math.abs(dy) <= DRAG_THRESHOLD) return;
    dragging = true;
    element.style.transform = `translate(${dx}px, ${dy}px)`;
    element.style.pointerEvents = "none";
  };
  const end = (upEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    element.style.transform = "";
    element.style.pointerEvents = "";
    if (!dragging) {
      onClick?.();
      return;
    }
    const left = upEvent.clientX - grab.x;
    const top = upEvent.clientY - grab.y;
    const target = pageNumberAt(upEvent.clientX, upEvent.clientY) ?? {
      page: noteById(id).page,
      div: pageView(noteById(id).page)?.div,
    };
    if (!target.div) return;
    const rect = target.div.getBoundingClientRect();
    change(id, { page: target.page, x: (left - rect.left) / rect.width, y: (top - rect.top) / rect.height });
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
};

const swatch = (note, color) => {
  const { paper, label } = NOTE_COLORS[color];
  const button = create("button", { type: "button", className: "mdNoteSwatch", title: label });
  button.style.background = paper;
  button.setAttribute("aria-pressed", String(note.color === color));
  button.addEventListener("click", () => change(note.id, { color }));
  return button;
};

const tool = (text, title, onClick) => {
  const button = create("button", { type: "button", className: "mdNoteTool", textContent: text, title });
  button.setAttribute("aria-label", title);
  button.addEventListener("click", onClick);
  return button;
};

const renderNote = (note) => {
  noteElements.get(note.id)?.remove();
  const { paper, edge } = NOTE_COLORS[note.color];

  const icon = create("button", { type: "button", className: "mdNoteIcon", title: note.text || "付箋" });
  icon.setAttribute("aria-label", "付箋を開く");
  icon.addEventListener("pointerdown", (event) =>
    startDrag(event, note.id, () => change(note.id, { collapsed: false })),
  );

  const head = create("div", { className: "mdNoteHead" }, [
    create("span", { className: "mdNotePage", textContent: `p.${note.page}` }),
    ...Object.keys(NOTE_COLORS).map((color) => swatch(note, color)),
    tool("–", "たたむ", () => change(note.id, { collapsed: true })),
    tool("×", "削除", () => deleteNote(note.id)),
  ]);
  head.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    startDrag(event, note.id);
  });

  const text = create("textarea", { className: "mdNoteText", value: note.text, placeholder: "メモを書く…" });
  text.addEventListener("input", () => {
    state.notes = updateNote(state.notes, note.id, { text: text.value });
    icon.title = text.value || "付箋";
    saveLater();
    renderPanel();
  });
  text.addEventListener("focus", () => focusNote(note.id));
  text.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      text.blur();
    }
  });
  text.addEventListener("blur", () => saveTimer && save());

  const card = create("div", { className: "mdNoteCard" }, [head]);
  if (note.quote) card.append(create("div", { className: "mdNoteQuote", textContent: note.quote }));
  card.append(text);

  const element = create("div", { className: "mdNote" }, [icon, card]);
  element.dataset.id = note.id;
  element.classList.toggle("mdOpen", !note.collapsed);
  element.classList.toggle("mdFocused", state.focusedId === note.id);
  element.style.left = `${note.x * 100}%`;
  element.style.top = `${note.y * 100}%`;
  element.style.setProperty("--md-note-paper", paper);
  element.style.setProperty("--md-note-edge", edge);
  // Keep PDF.js and the dictionary's own selection handling away from the note.
  element.addEventListener("mousedown", (event) => event.stopPropagation());
  element.addEventListener("pointerdown", () => focusNote(note.id));

  noteElements.set(note.id, element);
  layerFor(note.page).append(element);
  attachLayers();
  return element;
};

// The note being typed in is left as it is, so its text box keeps the focus and the caret.
const editingNoteId = () => document.activeElement?.closest?.(".mdNote")?.dataset.id ?? null;

const renderAllNotes = () => {
  const editing = editingNoteId();
  for (const [id, element] of noteElements) {
    if (id === editing) continue;
    element.remove();
    noteElements.delete(id);
  }
  for (const note of state.notes) {
    if (note.id !== editing) renderNote(note);
  }
};

const addNote = (values) => {
  const note = createNote(values);
  setNotes([...state.notes, note]);
  const element = renderNote(note);
  focusNote(note.id);
  requestAnimationFrame(() => element.querySelector("textarea")?.focus({ preventScroll: true }));
};

const setPlacing = (placing) => {
  state.placing = placing;
  container.classList.toggle("mdPlacing", placing);
  addButton.classList.toggle("toggled", placing);
  addButton.setAttribute("aria-pressed", String(placing));
};

// With text selected, the note goes right beside it and quotes it. Otherwise, the next click
// on a page puts the note there.
const onAddButton = () => {
  const selection = window.getSelection();
  if (selection?.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const target = pageNumberAt(rect.right - 1, rect.top + 1) ?? pageNumberAt(rect.left + 1, rect.top + 1);
    if (target) {
      const quote = (readPdfSelection(selection) ?? selection.toString()).replace(/\s+\n/g, "\n").trim();
      const pageRect = target.div.getBoundingClientRect();
      selection.removeAllRanges();
      setPlacing(false);
      addNote({
        page: target.page,
        x: (rect.right + 8 - pageRect.left) / pageRect.width,
        y: (rect.top - pageRect.top) / pageRect.height,
        quote,
      });
      return;
    }
  }
  setPlacing(!state.placing);
};

const placeAt = (event) => {
  if (!state.placing || event.button !== 0 || event.target.closest(".mdNote")) return;
  const target = pageNumberAt(event.clientX, event.clientY);
  if (!target) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = target.div.getBoundingClientRect();
  setPlacing(false);
  addNote({
    page: target.page,
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  });
};

// ---- Notes panel ----

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add("mdShown");
  setTimeout(() => toast.classList.remove("mdShown"), 1600);
};

const goToNote = (id) => {
  const note = noteById(id);
  const div = note && pageView(note.page)?.div;
  if (!div) return;
  if (note.collapsed) change(id, { collapsed: false });
  const pageRect = div.getBoundingClientRect();
  const viewRect = container.getBoundingClientRect();
  container.scrollTo({
    top: container.scrollTop + pageRect.top - viewRect.top + note.y * pageRect.height - container.clientHeight * 0.3,
    left: container.scrollLeft + pageRect.left - viewRect.left + note.x * pageRect.width - container.clientWidth * 0.4,
  });
  focusNote(id);
  const element = noteElements.get(id);
  if (element) {
    element.classList.remove("mdFlash");
    void element.offsetWidth;
    element.classList.add("mdFlash");
  }
};

const copyMarkdown = async () => {
  try {
    await navigator.clipboard.writeText(toMarkdown(document.title || state.title, state.notes));
    showToast("Markdownでコピーしました");
  } catch {
    showToast("コピーできませんでした");
  }
};

const renderPanel = () => {
  if (!panel) return;
  panelTitle.textContent = state.notes.length ? `付箋 ${state.notes.length}` : "付箋";
  if (!document.getElementById("outerContainer")?.classList.contains("mdNotesOpen")) return;

  const notes = sortNotes(filterNotes(state.notes, state.query));
  panelList.replaceChildren();
  if (state.notes.length === 0) {
    const start = create("button", { type: "button", textContent: "付箋を貼る" });
    start.addEventListener("click", () => setPlacing(true));
    panelList.append(
      create("div", { className: "mdPanelEmpty" }, [
        create("p", { textContent: "まだ付箋はありません。" }),
        create("p", {
          textContent:
            "ツールバーの付箋ボタンを押してページをクリックすると貼れます。文字を選んでから押すと、その文を引用した付箋になります。",
        }),
        start,
      ]),
    );
    return;
  }
  if (notes.length === 0) {
    panelList.append(create("div", { className: "mdPanelEmpty", textContent: "一致する付箋はありません。" }));
    return;
  }
  let page = 0;
  for (const note of notes) {
    if (note.page !== page) {
      page = note.page;
      panelList.append(create("div", { className: "mdPanelPage", textContent: `${page}ページ` }));
    }
    const item = create("button", { type: "button", className: "mdPanelItem" });
    item.dataset.id = note.id;
    item.style.setProperty("--md-note-edge", NOTE_COLORS[note.color].edge);
    item.classList.toggle("mdCurrent", note.id === state.focusedId);
    if (note.quote) item.append(create("div", { className: "mdPanelQuote", textContent: note.quote }));
    const text = note.text.trim();
    item.append(
      create("div", { className: `mdPanelText${text ? "" : " mdEmptyText"}`, textContent: text || "（メモなし）" }),
    );
    item.addEventListener("click", () => goToNote(note.id));
    panelList.append(item);
  }
};

const setPanelOpen = (open, { remember = true } = {}) => {
  document.getElementById("outerContainer")?.classList.toggle("mdNotesOpen", open);
  panelButton.classList.toggle("toggled", open);
  panelButton.setAttribute("aria-expanded", String(open));
  if (remember) storage.local.set({ [PANEL_KEY]: open });
  renderPanel();
  // Let "page width" and "auto" zoom follow the narrower viewing area.
  setTimeout(() => app.eventBus.dispatch("resize", { source: window }), 220);
};

const buildPanel = () => {
  panelTitle = create("h2", { textContent: "付箋" });
  const copy = create("button", {
    type: "button",
    textContent: "Markdownでコピー",
    title: "付箋をすべてMarkdownでコピー（Obsidianなどに貼れます）",
  });
  copy.addEventListener("click", copyMarkdown);
  const search = create("input", { type: "search", className: "mdPanelSearch", placeholder: "付箋を検索" });
  search.addEventListener("input", () => {
    state.query = search.value;
    renderPanel();
  });
  panelList = create("div", { className: "mdPanelList" });
  toast = create("div", { className: "mdPanelToast", role: "status" });
  panel = create("aside", { id: "mdNotesPanel" }, [
    create("div", { className: "mdPanelHead" }, [panelTitle, copy]),
    search,
    panelList,
    toast,
  ]);
  panel.setAttribute("aria-label", "付箋");
  document.getElementById("mainContainer")?.append(panel);
};

const toolbarButton = (id, title) => {
  const button = create("button", { id, type: "button", className: "toolbarButton", title });
  button.setAttribute("aria-label", title);
  return button;
};

const buildToolbar = () => {
  addButton = toolbarButton("mdNotesAddButton", "付箋を貼る（文字を選んでから押すと引用付き）");
  addButton.addEventListener("mousedown", (event) => event.preventDefault()); // keep the text selection
  addButton.addEventListener("click", onAddButton);

  panelButton = toolbarButton("mdNotesPanelButton", "付箋の一覧");
  countBadge = create("span", { id: "mdNotesCount" });
  panelButton.append(countBadge);
  panelButton.addEventListener("click", () =>
    setPanelOpen(!document.getElementById("outerContainer")?.classList.contains("mdNotesOpen")),
  );

  const right = document.getElementById("toolbarViewerRight");
  right?.prepend(addButton, panelButton, create("div", { className: "mdToolbarDivider" }));
};

// ---- Document ----

const loadDocument = async () => {
  const fingerprint = app.pdfDocument?.fingerprints?.[0];
  if (!fingerprint) return;
  state.key = notesKey(fingerprint);
  const stored = await storage.local.get([state.key]);
  const documentNotes = normalizeDocument(stored?.[state.key]);
  state.title = documentNotes.title;
  state.lastSaved = storedSignature(stored?.[state.key]);
  for (const layer of layers.values()) layer.remove();
  layers.clear();
  setNotes(documentNotes.notes, { persist: false });
  renderAllNotes();

  // PDF.js's single-page mode can't be scrolled through freely, so open such documents continuously.
  if (app.pdfViewer.scrollMode === SCROLL_PAGE) app.pdfViewer.scrollMode = SCROLL_VERTICAL;
};

const start = async () => {
  if (!app) return;
  await app.initializedPromise;

  container = document.getElementById("viewerContainer");
  if (!container) return;
  setUpPanning(container);
  buildToolbar();
  buildPanel();

  container.addEventListener("pointerdown", placeAt, true);
  container.addEventListener("pointerdown", (event) => {
    if (!event.target.closest?.(".mdNote")) focusNote(null);
  });
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && state.placing) {
        event.stopImmediatePropagation();
        setPlacing(false);
      }
    },
    true,
  );
  window.addEventListener("pagehide", () => saveTimer && save());

  for (const name of ["pagerendered", "textlayerrendered", "pagesloaded", "scalechanging", "rotationchanging"]) {
    app.eventBus.on(name, attachLayersSoon);
  }
  new MutationObserver(attachLayersSoon).observe(document.getElementById("viewer") ?? container, {
    childList: true,
    subtree: true,
  });

  app.eventBus.on("documentloaded", () => loadDocument().catch((error) => console.error("Mouse Dictionary:", error)));
  if (app.pdfDocument) await loadDocument();

  // Notes edited in another tab of the same PDF show up here too.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !state.key || !changes[state.key]) return;
    const value = changes[state.key].newValue;
    const signature = storedSignature(value);
    if (signature === state.lastSaved || (value === undefined && state.notes.length === 0)) return;
    state.lastSaved = signature;
    const editing = noteById(editingNoteId());
    const notes = normalizeDocument(value).notes.map((note) => (note.id === editing?.id ? editing : note));
    setNotes(notes, { persist: false });
    renderAllNotes();
  });

  const stored = await storage.local.get([PANEL_KEY]);
  if (stored?.[PANEL_KEY]) setPanelOpen(true, { remember: false });
};

start().catch((error) => console.error("Mouse Dictionary:", error));
