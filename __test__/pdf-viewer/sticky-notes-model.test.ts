import { expect, test } from "vitest";
import {
  createNote,
  filterNotes,
  normalizeDocument,
  notesKey,
  removeNote,
  sortNotes,
  toMarkdown,
  updateNote,
} from "../../src/pdf-viewer/sticky-notes-model";

test("notes are keyed by the PDF's fingerprint", () => {
  expect(notesKey("abc")).toBe("pdfStickyNotes:abc");
});

test("a new note stays on its page and falls back to yellow", () => {
  const note = createNote({ page: 2, x: 1.4, y: -0.2, color: "nope", now: 5 });
  expect(note).toMatchObject({ page: 2, x: 1, y: 0, color: "yellow", text: "", collapsed: false, createdAt: 5 });
  expect(note.id).toMatch(/^[a-z0-9]+$/);
});

test("broken stored notes are dropped", () => {
  const stored = {
    title: "Paper",
    notes: [
      { id: "a", page: 1, x: 0.5, y: 0.5, text: "ok", color: "pink" },
      { id: "b", page: 0, x: 0.5, y: 0.5 },
      { page: 1 },
      null,
    ],
  };
  const { title, notes } = normalizeDocument(stored);
  expect(title).toBe("Paper");
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({ id: "a", color: "pink", quote: "", collapsed: false });
  expect(normalizeDocument(undefined)).toEqual({ title: "", notes: [] });
});

test("notes are listed in reading order", () => {
  const notes = [
    { id: "c", page: 2, x: 0, y: 0.1 },
    { id: "b", page: 1, x: 0.8, y: 0.5 },
    { id: "a", page: 1, x: 0.1, y: 0.5 },
  ];
  expect(sortNotes(notes as never).map((note) => note.id)).toEqual(["a", "b", "c"]);
});

test("updating moves a note within its page and removing drops it", () => {
  const note = createNote({ page: 1, x: 0.2, y: 0.2 });
  const [moved] = updateNote([note], note.id, { x: 2, y: 0.3, text: "hi" }, 9);
  expect(moved).toMatchObject({ x: 1, y: 0.3, text: "hi", updatedAt: 9 });
  expect(removeNote([moved], note.id)).toEqual([]);
});

test("search looks at the text and the quote", () => {
  const notes = [
    { ...createNote({ page: 1, x: 0, y: 0, quote: "molecular clouds" }), text: "形成" },
    { ...createNote({ page: 2, x: 0, y: 0 }), text: "HII region" },
  ];
  expect(filterNotes(notes, "Molecular 形成")).toHaveLength(1);
  expect(filterNotes(notes, "region")[0].page).toBe(2);
  expect(filterNotes(notes, "  ")).toHaveLength(2);
});

test("notes export as Markdown with quotes", () => {
  const notes = [
    { ...createNote({ page: 3, x: 0, y: 0 }), text: "" },
    { ...createNote({ page: 1, x: 0, y: 0, quote: "line one\nline two" }), text: "比較する" },
  ];
  expect(toMarkdown("Paper", notes)).toBe(
    "# Paper\n\n## p.1\n> line one\n> line two\n\n比較する\n\n## p.3\n（メモなし）\n",
  );
});
