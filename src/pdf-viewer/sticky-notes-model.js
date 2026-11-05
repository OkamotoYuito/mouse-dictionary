/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// Sticky notes put on PDF pages. A note's place is kept as a fraction of its page's width and
// height, so it stays on the same spot at any zoom. Notes are stored per document, keyed by the
// PDF's fingerprint, and nothing is written into the PDF itself.

export const NOTE_COLORS = {
  yellow: { label: "黄", paper: "#fff3a6", edge: "#e8c94a" },
  pink: { label: "ピンク", paper: "#ffd6e4", edge: "#ef8fb0" },
  blue: { label: "青", paper: "#d4e9ff", edge: "#7fb2ea" },
  green: { label: "緑", paper: "#d8f5d0", edge: "#86c97a" },
  purple: { label: "紫", paper: "#e8dcff", edge: "#a98be8" },
};

export const DEFAULT_COLOR = "yellow";

export const notesKey = (fingerprint) => `pdfStickyNotes:${fingerprint}`;

const clamp01 = (value) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const createNote = ({ page, x, y, color = DEFAULT_COLOR, quote = "", now = Date.now() }) => ({
  id: newId(),
  page,
  x: clamp01(x),
  y: clamp01(y),
  text: "",
  quote,
  color: NOTE_COLORS[color] ? color : DEFAULT_COLOR,
  collapsed: false,
  createdAt: now,
  updatedAt: now,
});

const normalizeNote = (note) => {
  if (!note || typeof note.id !== "string" || !Number.isInteger(note.page) || note.page < 1) return null;
  return {
    id: note.id,
    page: note.page,
    x: clamp01(note.x),
    y: clamp01(note.y),
    text: typeof note.text === "string" ? note.text : "",
    quote: typeof note.quote === "string" ? note.quote : "",
    color: NOTE_COLORS[note.color] ? note.color : DEFAULT_COLOR,
    collapsed: note.collapsed === true,
    createdAt: Number(note.createdAt) || 0,
    updatedAt: Number(note.updatedAt) || 0,
  };
};

// Reads what was stored for a document, dropping anything broken.
export const normalizeDocument = (stored) => {
  const notes = Array.isArray(stored?.notes) ? stored.notes.map(normalizeNote).filter(Boolean) : [];
  return { title: typeof stored?.title === "string" ? stored.title : "", notes };
};

// Reading order: by page, then top to bottom, then left to right.
export const sortNotes = (notes) => [...notes].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

export const updateNote = (notes, id, change, now = Date.now()) =>
  notes.map((note) =>
    note.id === id
      ? {
          ...note,
          ...change,
          ...(change.x === undefined ? {} : { x: clamp01(change.x) }),
          ...(change.y === undefined ? {} : { y: clamp01(change.y) }),
          updatedAt: now,
        }
      : note,
  );

export const removeNote = (notes, id) => notes.filter((note) => note.id !== id);

export const filterNotes = (notes, query) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return notes;
  return notes.filter((note) => {
    const haystack = `${note.text}\n${note.quote}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
};

// Notes as Markdown, for pasting into a notebook such as Obsidian.
export const toMarkdown = (title, notes) => {
  const lines = [`# ${title || "PDFの付箋"}`, ""];
  for (const note of sortNotes(notes)) {
    lines.push(`## p.${note.page}`);
    if (note.quote) {
      lines.push(...note.quote.split("\n").map((line) => `> ${line}`), "");
    }
    lines.push(note.text.trim() || "（メモなし）", "");
  }
  return `${lines.join("\n").trim()}\n`;
};
