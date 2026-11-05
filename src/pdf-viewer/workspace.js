/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// Runs inside the bundled PDF.js viewer, next to vocabulary.js. Adds free scrolling (drag the
// pages around while holding Space, or with the middle button), sticky notes, and a side panel on
// the right with a translation tab and a notes tab. The look is in mouse-dictionary-workspace.css.

import { renderTextWithMath } from "../main/core/math";
import { readPdfSelection } from "../main/core/pdf-selection";
import storage from "../main/lib/storage";
import { popupPosition } from "./popup-position";
import {
  createNote,
  filterNotes,
  NOTE_COLORS,
  NOTE_WIDTH,
  normalizeDocument,
  noteSummary,
  notesKey,
  removeNote,
  sortNotes,
  storedSignature,
  toMarkdown,
  updateNote,
} from "./sticky-notes-model";
import { createTranslationTab } from "./translation-tab";

const SIDE_KEY = "pdfSidePanel"; // { open, tab }
const OLD_PANEL_KEY = "pdfStickyNotesPanelOpen";
// Translation on top and the dictionary below share one tab; the notes have their own.
const TABS = { reading: "翻訳・辞書", notes: "付箋" };
const OLD_TABS = { dictionary: "reading", translation: "reading" };
const SPLIT_KEY = "pdfSideSplit";
const SPLIT = { min: 0.15, max: 0.85, default: 0.5 }; // the translation's share of the height
const DOCK_KEY = "pdfDictionaryDocked";
const WIDTH_KEY = "pdfSidePanelWidth";
const SIDE_WIDTH = { min: 280, max: 760, default: 360 };
const PANEL_TRANSITION = 220; // ms, a little over the panel's slide
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

// Leave room on both sides of the pages, like a desk, so they can be slid sideways at any zoom:
// either edge of a page can be brought to the middle of the view, e.g. out from under the
// dictionary window. Wrapped pages need the view's width to wrap in, so they get none.
const DESK_ROOM = 0.5; // of the view's width, on each side
const SCROLL_WRAPPED = 2; // PDF.js ScrollMode.WRAPPED

const setUpDesk = (container, viewer, eventBus) => {
  let room = 0;
  let recenter = false;

  // How far the pages sit from the middle of the view, sideways.
  const offCenter = () => {
    const page = viewer.querySelector(".page");
    if (!page) return 0;
    const pageRect = page.getBoundingClientRect();
    const viewRect = container.getBoundingClientRect();
    return pageRect.left + pageRect.width / 2 - (viewRect.left + container.clientWidth / 2);
  };

  const update = () => {
    if (recenter) {
      recenter = false;
      container.scrollLeft += offCenter();
    }
    const firstPage = viewer.querySelector(".page");
    const usable =
      firstPage && app.pdfViewer?.scrollMode !== SCROLL_WRAPPED && !container.classList.contains("pdfPresentationMode");
    const next = usable ? Math.round(container.clientWidth * DESK_ROOM) : 0;
    if (next === room) return;
    const before = firstPage?.getBoundingClientRect().left;
    // On the container: PDF.js rewrites the viewer element's own style and classes.
    container.style.setProperty("--md-desk-room", `${next}px`);
    container.classList.toggle("mdWide", next > 0);
    room = next;
    // Keep the pages where they were on screen while the room appears or goes away.
    if (firstPage) container.scrollLeft += firstPage.getBoundingClientRect().left - before;
  };
  let queued = false;
  const updateSoon = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      update();
    });
  };
  // Pages that sat in the middle stay there when zooming. PDF.js has already resized them by
  // now, but not yet told anyone of its new scroll position, so this reads the old one.
  let centered = true;
  container.addEventListener(
    "scroll",
    () => {
      centered = Math.abs(offCenter()) < 4;
    },
    { passive: true },
  );
  eventBus.on("scalechanging", () => {
    recenter ||= centered;
  });

  for (const name of [
    "scalechanging",
    "pagesloaded",
    "rotationchanging",
    "scrollmodechanged",
    "spreadmodechanged",
    "resize",
    "presentationmodechanged",
  ]) {
    eventBus.on(name, updateSoon);
  }
  new ResizeObserver(updateSoon).observe(container);
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
let foldAll;
let addButton;
let panelButton;
let translateButton;
let readingPane;
let splitRatio = SPLIT.default;
let dockArea;
let dockNotice;
let undockButton;
let docked = true;
let translationTab;
let activeTab = "reading";
const tabButtons = {};
const tabPanes = {};
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
    // The note may go off the page on every side, but not beyond being just outside it.
    const size = element.getBoundingClientRect();
    const x = Math.max((left - rect.left) / rect.width, -size.width / rect.width);
    const y = Math.max((top - rect.top) / rect.height, -size.height / rect.height);
    change(id, { page: target.page, x, y });
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

// Dragging a note's right edge sets its width. Double-clicking the edge puts the width back.
const startResize = (event, id, element) => {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  focusNote(id);
  const startX = event.clientX;
  const startWidth = element.querySelector(".mdNoteCard").getBoundingClientRect().width;
  let width = startWidth;
  element.classList.add("mdResizing");
  const move = (moveEvent) => {
    width = Math.min(NOTE_WIDTH.max, Math.max(NOTE_WIDTH.min, startWidth + moveEvent.clientX - startX));
    element.style.setProperty("--md-note-width", `${Math.round(width)}px`);
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    element.classList.remove("mdResizing");
    if (Math.round(width) === Math.round(startWidth)) return;
    // Only the width changed, so the note isn't redrawn.
    setNotes(updateNote(state.notes, id, { width }));
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
};

const renderNote = (note) => {
  noteElements.get(note.id)?.remove();
  const { paper, edge } = NOTE_COLORS[note.color];

  // Minimized, a note is a small tag with its first line, as wide as the note at most.
  const summary = create("span", { className: "mdNoteChipText", textContent: noteSummary(note) });
  const chip = create("button", { type: "button", className: "mdNoteChip", title: note.text || note.quote || "付箋" }, [
    create("span", { className: "mdNoteChipMark" }),
    summary,
  ]);
  chip.setAttribute("aria-label", "付箋を開く");
  chip.addEventListener("pointerdown", (event) =>
    startDrag(event, note.id, () => change(note.id, { collapsed: false })),
  );

  // Close and minimize sit on the left, so they stay in reach when a wide note runs off the view.
  const head = create("div", { className: "mdNoteHead" }, [
    tool("×", "削除", () => deleteNote(note.id)),
    tool("–", "最小化", () => change(note.id, { collapsed: true })),
    create("span", { className: "mdNotePage", textContent: `p.${note.page}` }),
    ...Object.keys(NOTE_COLORS).map((color) => swatch(note, color)),
  ]);
  head.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    startDrag(event, note.id);
  });

  const text = create("textarea", { className: "mdNoteText", value: note.text, placeholder: "メモを書く…" });
  text.addEventListener("input", () => {
    state.notes = updateNote(state.notes, note.id, { text: text.value });
    const current = noteById(note.id);
    summary.textContent = noteSummary(current);
    chip.title = current.text || current.quote || "付箋";
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

  const element = create("div", { className: "mdNote" }, [chip, card]);
  const resizer = create("div", { className: "mdNoteResize", title: "ドラッグで幅を変更（ダブルクリックで元の幅）" });
  resizer.addEventListener("pointerdown", (event) => startResize(event, note.id, element));
  resizer.addEventListener("dblclick", () => change(note.id, { width: NOTE_WIDTH.default }));
  card.append(resizer);

  element.dataset.id = note.id;
  element.classList.toggle("mdOpen", !note.collapsed);
  element.classList.toggle("mdFocused", state.focusedId === note.id);
  element.style.left = `${note.x * 100}%`;
  element.style.top = `${note.y * 100}%`;
  element.style.setProperty("--md-note-paper", paper);
  element.style.setProperty("--md-note-edge", edge);
  element.style.setProperty("--md-note-width", `${note.width}px`);
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

const addNote = (values, { focus = true } = {}) => {
  const note = { ...createNote(values), text: values.text ?? "" };
  setNotes([...state.notes, note]);
  const element = renderNote(note);
  focusNote(note.id);
  if (focus) requestAnimationFrame(() => element.querySelector("textarea")?.focus({ preventScroll: true }));
};

const setPlacing = (placing) => {
  state.placing = placing;
  container.classList.toggle("mdPlacing", placing);
  addButton.classList.toggle("toggled", placing);
  addButton.setAttribute("aria-pressed", String(placing));
};

// The selected text of a page and the place just right of it, where a note about it goes.
const readSelection = () => {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  const target = pageNumberAt(rect.right - 1, rect.top + 1) ?? pageNumberAt(rect.left + 1, rect.top + 1);
  if (!target) return null;
  const pageRect = target.div.getBoundingClientRect();
  return {
    selection,
    rect,
    div: target.div,
    text: (readPdfSelection(selection) ?? selection.toString()).replace(/\s+\n/g, "\n").trim(),
    place: {
      page: target.page,
      x: (rect.right + 8 - pageRect.left) / pageRect.width,
      y: (rect.top - pageRect.top) / pageRect.height,
    },
  };
};

// With text selected, the note goes right beside it and quotes it. Otherwise, the next click
// on a page puts the note there.
const onAddButton = () => {
  const selected = readSelection();
  if (selected) {
    selected.selection.removeAllRanges();
    setPlacing(false);
    addNote({ ...selected.place, quote: selected.text });
    return;
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

// Scrolls so that a place on a page comes a third of the way down the view.
const goTo = ({ page, x, y }) => {
  const div = pageView(page)?.div;
  if (!div) return false;
  const pageRect = div.getBoundingClientRect();
  const viewRect = container.getBoundingClientRect();
  container.scrollTo({
    top: container.scrollTop + pageRect.top - viewRect.top + y * pageRect.height - container.clientHeight * 0.3,
    left: container.scrollLeft + pageRect.left - viewRect.left + x * pageRect.width - container.clientWidth * 0.4,
  });
  return true;
};

const goToNote = (id) => {
  const note = noteById(id);
  if (!note) return;
  if (note.collapsed) change(id, { collapsed: false });
  if (!goTo(note)) return;
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
  foldAll.hidden = state.notes.length === 0;
  foldAll.textContent = state.notes.some((note) => !note.collapsed) ? "すべて最小化" : "すべて開く";
  tabButtons.notes.textContent = state.notes.length ? `${TABS.notes} ${state.notes.length}` : TABS.notes;
  if (!isPanelOpen() || activeTab !== "notes") return;

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

const isPanelOpen = () => document.getElementById("outerContainer")?.classList.contains("mdSideOpen") ?? false;

const setPanelOpen = (open, { tab = activeTab, remember = true } = {}) => {
  const wasOpen = isPanelOpen();
  activeTab = tab;
  document.getElementById("outerContainer")?.classList.toggle("mdSideOpen", open);
  for (const [name, tabButton] of Object.entries(tabButtons)) {
    const selected = name === tab;
    tabButton.setAttribute("aria-selected", String(selected));
    tabButton.tabIndex = selected ? 0 : -1;
    tabPanes[name].hidden = !selected;
  }
  translateButton.classList.toggle("toggled", open && tab === "reading");
  panelButton.classList.toggle("toggled", open && tab === "notes");
  translateButton.setAttribute("aria-expanded", String(open && tab === "reading"));
  panelButton.setAttribute("aria-expanded", String(open && tab === "notes"));
  if (remember) storage.local.set({ [SIDE_KEY]: { open, tab } });
  renderPanel();
  // Let "page width" and "auto" zoom follow the narrower viewing area.
  if (open !== wasOpen) setTimeout(() => app.eventBus.dispatch("resize", { source: window }), PANEL_TRANSITION);
  // The docked dictionary goes away at once, and comes in once the panel has slid open.
  sendDock();
  if (open && !wasOpen) setTimeout(sendDock, PANEL_TRANSITION);
};

// ---- Docked dictionary ----

// Tells the dictionary window (src/main/core/dock.js) where to sit, or that it has nowhere to.
const sendDock = () => {
  const showing = docked && isPanelOpen() && activeTab === "reading";
  let rect = null;
  if (showing) {
    const { left, top, width, height } = dockArea.getBoundingClientRect();
    if (width > 0 && height > 0) rect = { left, top, width, height };
  }
  window.dispatchEvent(new CustomEvent("mouse-dictionary-dock", { detail: { docked, rect } }));
};

const setDocked = (value, { remember = true } = {}) => {
  docked = value;
  dockArea.hidden = !docked;
  dockNotice.hidden = docked;
  undockButton.hidden = !docked;
  // Undocked, the dictionary's half shrinks to a line and the translation takes the room.
  readingPane.classList.toggle("mdUndocked", !docked);
  if (remember) storage.local.set({ [DOCK_KEY]: docked });
  sendDock();
};

// The panel's left edge can be dragged to make it wider or narrower; the width is kept.
const clampSideWidth = (width) =>
  Math.round(Math.max(SIDE_WIDTH.min, Math.min(SIDE_WIDTH.max, window.innerWidth * 0.7, width)));

const setSideWidth = (width) => {
  document.documentElement.style.setProperty("--md-side-width", `${clampSideWidth(width)}px`);
};

const buildResizer = () => {
  const resizer = create("div", { className: "mdSideResizer", title: "ドラッグで幅を変更（ダブルクリックで元の幅）" });
  resizer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    let width = startWidth;
    document.body.classList.add("mdSideResizing");
    const move = (moveEvent) => {
      width = clampSideWidth(startWidth + startX - moveEvent.clientX);
      setSideWidth(width);
      sendDock();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.classList.remove("mdSideResizing");
      storage.local.set({ [WIDTH_KEY]: width });
      app.eventBus.dispatch("resize", { source: window });
      sendDock();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  });
  resizer.addEventListener("dblclick", () => {
    setSideWidth(SIDE_WIDTH.default);
    storage.local.remove(WIDTH_KEY);
    app.eventBus.dispatch("resize", { source: window });
    sendDock();
  });
  return resizer;
};

const buildDictionaryPane = () => {
  undockButton = create("button", { type: "button", textContent: "小窓に切り離す" });
  undockButton.addEventListener("click", () => setDocked(false));
  const dock = create("button", { type: "button", textContent: "パネルに固定" });
  dock.addEventListener("click", () => {
    setDocked(true);
    setPanelOpen(true, { tab: "reading" });
  });
  // Shows through only while the dictionary window is off.
  dockArea = create("div", { className: "mdDockArea" }, [
    create("p", { textContent: "辞書を起動すると、ここに単語の意味が出ます。" }),
    create("p", { textContent: "ツールバーの Mouse Dictionary のアイコン（またはショートカット）で起動します。" }),
  ]);
  dockNotice = create("div", { className: "mdDockNotice" }, [
    create("span", { textContent: "辞書は小窓で表示中" }),
    dock,
  ]);
  new ResizeObserver(sendDock).observe(dockArea);
  return create("section", { className: "mdSplitBottom" }, [
    create("div", { className: "mdSplitHead" }, [create("h2", { textContent: "辞書" }), undockButton, dockNotice]),
    dockArea,
  ]);
};

const setSplit = (ratio) => {
  splitRatio = Math.min(SPLIT.max, Math.max(SPLIT.min, ratio));
  readingPane.style.setProperty("--md-split-top", String(splitRatio));
  readingPane.style.setProperty("--md-split-bottom", String(1 - splitRatio));
};

// The line between the translation and the dictionary: drag it to share the height differently,
// double-click it for half and half.
const buildSplitter = () => {
  const splitter = create("div", {
    className: "mdSplitter",
    role: "separator",
    title: "ドラッグで上下の比率を変更（ダブルクリックで半々）",
  });
  splitter.setAttribute("aria-orientation", "horizontal");
  splitter.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    document.body.classList.add("mdSplitting");
    const move = (moveEvent) => {
      const rect = readingPane.getBoundingClientRect();
      setSplit((moveEvent.clientY - rect.top) / rect.height);
      sendDock();
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      document.body.classList.remove("mdSplitting");
      storage.local.set({ [SPLIT_KEY]: splitRatio });
      sendDock();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
  });
  splitter.addEventListener("dblclick", () => {
    setSplit(SPLIT.default);
    storage.local.remove(SPLIT_KEY);
    sendDock();
  });
  return splitter;
};

// A toolbar button opens its tab, or closes the panel when its tab is already showing.
const toggleTab = (tab) => setPanelOpen(!(isPanelOpen() && activeTab === tab), { tab });

const buildPanel = () => {
  panelTitle = create("h2", { textContent: "付箋" });
  const copy = create("button", {
    type: "button",
    textContent: "Markdownでコピー",
    title: "付箋をすべてMarkdownでコピー（Obsidianなどに貼れます）",
  });
  copy.addEventListener("click", copyMarkdown);
  foldAll = create("button", { type: "button" });
  foldAll.addEventListener("click", () => {
    const collapsed = state.notes.some((note) => !note.collapsed);
    setNotes(state.notes.map((note) => (note.collapsed === collapsed ? note : { ...note, collapsed })));
    renderAllNotes();
  });
  const search = create("input", { type: "search", className: "mdPanelSearch", placeholder: "付箋を検索" });
  search.addEventListener("input", () => {
    state.query = search.value;
    renderPanel();
  });
  panelList = create("div", { className: "mdPanelList" });
  toast = create("div", { className: "mdPanelToast", role: "status" });

  translationTab = createTranslationTab({
    onMakeNote: ({ quote, text, place }) => addNote({ ...place, quote, text }, { focus: false }),
    showToast,
    onModeChange: (on) => on || closePopup(),
  });
  translationTab.subscribe(updatePopup);
  readingPane = create("div", { className: "mdTabPane mdReadingPane" }, [
    create("section", { className: "mdSplitTop" }, [translationTab.element]),
    buildSplitter(),
    buildDictionaryPane(),
  ]);
  setSplit(SPLIT.default);
  tabPanes.reading = readingPane;
  tabPanes.notes = create("div", { className: "mdTabPane" }, [
    create("div", { className: "mdPanelHead" }, [panelTitle, foldAll, copy]),
    search,
    panelList,
  ]);

  const tabBar = create("div", { className: "mdTabs", role: "tablist" });
  for (const [name, label] of Object.entries(TABS)) {
    const tabButton = create("button", { type: "button", className: "mdTab", role: "tab", textContent: label });
    tabButton.addEventListener("click", () => setPanelOpen(true, { tab: name }));
    tabButton.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const names = Object.keys(TABS);
      const next = names[(names.indexOf(name) + (event.key === "ArrowRight" ? 1 : names.length - 1)) % names.length];
      setPanelOpen(true, { tab: next });
      tabButtons[next].focus();
    });
    tabButtons[name] = tabButton;
    tabBar.append(tabButton);
  }

  panel = create("aside", { id: "mdSidePanel" }, [buildResizer(), tabBar, tabPanes.reading, tabPanes.notes, toast]);
  panel.setAttribute("aria-label", "翻訳・辞書・付箋");
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
  panelButton.addEventListener("click", () => toggleTab("notes"));

  translateButton = toolbarButton("mdTranslateButton", "翻訳・辞書（本文の英文を選ぶと翻訳します）");
  translateButton.addEventListener("mousedown", (event) => event.preventDefault()); // keep the text selection
  translateButton.addEventListener("click", () => {
    toggleTab("reading");
    // Opened with a sentence selected: translate it right away.
    if (isPanelOpen() && activeTab === "reading") translateSelectedText();
  });

  const right = document.getElementById("toolbarViewerRight");
  right?.prepend(translateButton, addButton, panelButton, create("div", { className: "mdToolbarDivider" }));
};

// ---- Translation ----

const POPUP_WIDTH = 380;
const POPUP_GAP = 14;

const isSentence = (text) => (text.match(/[a-zA-Z]{2,}/g) ?? []).length >= 2;

// The translation popup: beside the selected text, on its page, so it scrolls and zooms with it.
let popup = null; // { element, runId, view, page }

const closePopup = () => {
  popup?.element.remove();
  popup = null;
};

const updatePopup = (view) => {
  if (!popup || view.runId !== popup.runId) return;
  popup.view = view;
  const { element } = popup;
  element.querySelector(".mdTrPopupStatus").textContent = view.statusText;
  element.classList.toggle("mdTrSimilar", view.kind === "similar" || view.kind === "similar-failed");
  const body = element.querySelector(".mdTrPopupBody");
  if (view.translation) renderTextWithMath(body, view.translation);
  else body.textContent = "";
  element.querySelector("[data-note]").hidden = !view.translation || !view.place;
};

const popupButton = (textContent, title, onClick) => {
  const element = create("button", { type: "button", textContent, title });
  element.setAttribute("aria-label", title);
  element.addEventListener("click", onClick);
  return element;
};

// Dragging the header moves the popup about its page.
const dragPopup = (event) => {
  if (event.button !== 0 || event.target.closest("button") || !popup) return;
  event.preventDefault();
  const { element } = popup;
  const page = element.parentElement?.parentElement;
  if (!page) return;
  const start = { x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop };
  const move = (moveEvent) => {
    const rect = page.getBoundingClientRect();
    element.style.left = `${((start.left + moveEvent.clientX - start.x) / rect.width) * 100}%`;
    element.style.top = `${((start.top + moveEvent.clientY - start.y) / rect.height) * 100}%`;
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
};

const openPopup = (selected, runId) => {
  closePopup();
  const width = Math.min(POPUP_WIDTH, container.clientWidth - 24);
  const { left, top, above } = popupPosition({
    rect: selected.rect,
    view: container.getBoundingClientRect(),
    width,
    mode: translationTab.popupPlace(),
    gap: POPUP_GAP,
  });
  const pageRect = selected.div.getBoundingClientRect();

  const toNote = popupButton("付箋にする", "原文を引用した付箋にする", () => {
    const view = popup?.view;
    if (!view?.translation || !view.place) return;
    addNote({ ...view.place, quote: view.source, text: view.translation }, { focus: false });
    closePopup();
  });
  toNote.dataset.note = "";
  toNote.hidden = true;
  const head = create("div", { className: "mdTrPopupHead" }, [
    create("span", { className: "mdTrPopupStatus", role: "status" }),
    toNote,
    popupButton("パネル", "サイドパネルで開く", () => setPanelOpen(true, { tab: "reading" })),
    popupButton("×", "閉じる", closePopup),
  ]);
  head.addEventListener("pointerdown", dragPopup);
  const element = create("div", { className: "mdTrPopup", role: "dialog" }, [
    head,
    create("div", { className: "mdTrPopupBody", lang: "ja" }),
  ]);
  element.setAttribute("aria-label", "翻訳");
  // Above the text, the popup hangs from its bottom edge, so it grows upward as the text comes in.
  element.classList.toggle("mdAbove", above);
  element.style.width = `${width}px`;
  element.style.left = `${((left - pageRect.left) / pageRect.width) * 100}%`;
  element.style.top = `${((top - pageRect.top) / pageRect.height) * 100}%`;
  // Keep PDF.js, the dictionary and the notes away from clicks and selections in the popup.
  element.addEventListener("mousedown", (event) => event.stopPropagation());
  element.addEventListener("mouseup", (event) => event.stopPropagation());

  popup = { element, runId, view: null, page: selected.place.page };
  layerFor(selected.place.page).append(element);
  attachLayers();
};

// Selecting a sentence in the pages translates it while the translation tab is showing, and
// always in popup mode, where the translation also pops up beside the sentence.
const translateSelectedText = () => {
  const popupMode = translationTab.isPopupMode();
  if (!popupMode && !(isPanelOpen() && activeTab === "reading")) return;
  const selected = readSelection();
  if (!selected || !isSentence(selected.text)) return;
  if (!selected.selection.anchorNode?.parentElement?.closest(".textLayer")) return;
  const runId = translationTab.translateSelection(selected.text, selected.place);
  if (popupMode) {
    openPopup(selected, runId);
    translationTab.notify();
  }
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
  await translationTab.load(fingerprint);

  // PDF.js's single-page mode can't be scrolled through freely, so open such documents continuously.
  if (app.pdfViewer.scrollMode === SCROLL_PAGE) app.pdfViewer.scrollMode = SCROLL_VERTICAL;
};

const start = async () => {
  if (!app) return;
  await app.initializedPromise;

  container = document.getElementById("viewerContainer");
  if (!container) return;
  setUpPanning(container);
  setUpDesk(container, document.getElementById("viewer") ?? container, app.eventBus);
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
      } else if (event.key === "Escape" && popup && !isTyping(event.target)) {
        event.stopImmediatePropagation();
        closePopup();
      }
    },
    true,
  );
  window.addEventListener("pagehide", () => saveTimer && save());
  container.addEventListener("mouseup", (event) => {
    if (event.button !== 0 || state.placing) return;
    // Wait for the selection to settle.
    setTimeout(translateSelectedText, 0);
  });

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

  const stored = await storage.local.get([SIDE_KEY, OLD_PANEL_KEY, DOCK_KEY, WIDTH_KEY, SPLIT_KEY]);
  if (Number.isFinite(stored?.[SPLIT_KEY])) setSplit(stored[SPLIT_KEY]);
  if (Number.isFinite(stored?.[WIDTH_KEY])) setSideWidth(stored[WIDTH_KEY]);
  const side = stored?.[SIDE_KEY] ?? { open: stored?.[OLD_PANEL_KEY] === true, tab: "notes" };
  setDocked(stored?.[DOCK_KEY] !== false, { remember: false });
  const tab = OLD_TABS[side.tab] ?? side.tab;
  setPanelOpen(side.open === true, { tab: TABS[tab] ? tab : "reading", remember: false });

  // The dictionary window asks where to sit when it starts and whenever it's shown. Docked, it
  // brings up its tab when shown, since it would otherwise stay out of sight.
  window.addEventListener("mouse-dictionary-dock-request", (event) => {
    if (docked && event.detail?.visible && !(isPanelOpen() && activeTab === "reading")) {
      setPanelOpen(true, { tab: "reading" });
    } else {
      sendDock();
    }
  });
  window.addEventListener("resize", sendDock);
  window.dispatchEvent(new CustomEvent("mouse-dictionary-dock-ready"));
};

start().catch((error) => console.error("Mouse Dictionary:", error));
