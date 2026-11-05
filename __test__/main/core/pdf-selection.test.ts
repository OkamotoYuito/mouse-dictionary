import { afterEach, expect, test } from "vitest";
import { readPdfSelection } from "../../../src/main/core/pdf-selection";

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

// [text, top, height] for each text-layer span, as PDF.js lays out "M∗ ≳ 10³ M⊙ there".
const renderTextLayer = (spans: [string, number, number][]) => {
  const layer = document.createElement("div");
  layer.className = "textLayer";
  for (const [text, top, height] of spans) {
    const span = document.createElement("span");
    span.textContent = text;
    span.getBoundingClientRect = () => ({ top, bottom: top + height, height }) as DOMRect;
    layer.appendChild(span);
  }
  document.body.appendChild(layer);
  return layer;
};

const selectAll = (node: Node) => {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return selection;
};

test("keeps superscripts and subscripts that PDF.js draws as separate spans", () => {
  const layer = renderTextLayer([
    ["with ", 100, 9.5],
    ["M", 100, 9.5],
    ["∗", 105, 6.5],
    [" ", 105, 0],
    ["≳", 100, 9.5],
    [" ", 100, 0],
    ["10", 100, 9.5],
    [" ", 100, 0],
    ["3", 97, 6.5],
    [" ", 97, 0],
    ["M", 100, 9.5],
    ["⊙", 105, 6.5],
    [" ", 105, 0],
    ["there", 100, 9.5],
  ]);
  expect(readPdfSelection(selectAll(layer))).toBe("with $M_{∗}$ ≳ $10^{3}$ $M_{⊙}$ there");
});

test("joins scripts spread over several spans", () => {
  const layer = renderTextLayer([
    ["km s", 100, 9.5],
    ["−", 97, 6.5],
    ["1", 97, 6.5],
  ]);
  expect(readPdfSelection(selectAll(layer))).toBe("km $s^{−1}$");
});

test("keeps a subscript and a superscript on the same base in one formula", () => {
  const layer = renderTextLayer([
    ["(T", 100, 9.5],
    ["e", 105, 6.5],
    ["2", 97, 6.5],
    [")", 100, 9.5],
  ]);
  expect(readPdfSelection(selectAll(layer))).toBe("($T_{e}^{2}$)");
});

test("ignores selections outside a PDF text layer", () => {
  const div = document.createElement("div");
  div.textContent = "plain text";
  document.body.appendChild(div);
  expect(readPdfSelection(selectAll(div))).toBeNull();
});
