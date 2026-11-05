import { expect, test } from "vitest";
import { popupPosition } from "../../src/pdf-viewer/popup-position";

const view = { left: 0, top: 0, right: 1000, bottom: 800 };
const width = 300;

test("below and above center the popup on the selection", () => {
  const rect = { left: 300, top: 200, right: 500, bottom: 240 };
  expect(popupPosition({ rect, view, width, mode: "below", gap: 10 })).toEqual({ left: 250, top: 245, above: false });
  expect(popupPosition({ rect, view, width, mode: "above", gap: 10 })).toEqual({ left: 250, top: 195, above: true });
});

test("a centered popup stays inside the view", () => {
  const rect = { left: 0, top: 200, right: 100, bottom: 240 };
  expect(popupPosition({ rect, view, width, mode: "below" }).left).toBe(8);
  const nearRight = { left: 900, top: 200, right: 1000, bottom: 240 };
  expect(popupPosition({ rect: nearRight, view, width, mode: "below" }).left).toBe(692);
});

test("auto goes right, then left, then under the selection", () => {
  const narrow = { left: 100, top: 200, right: 400, bottom: 240 };
  expect(popupPosition({ rect: narrow, view, width, gap: 10 }).left).toBe(410);
  const rightSide = { left: 600, top: 200, right: 900, bottom: 240 };
  expect(popupPosition({ rect: rightSide, view, width, gap: 10 }).left).toBe(290);
  const wide = { left: 50, top: 200, right: 950, bottom: 240 };
  expect(popupPosition({ rect: wide, view, width, gap: 10 })).toEqual({ left: 50, top: 245, above: false });
});

test("right and left are kept inside the view, and unknown modes act as auto", () => {
  const rect = { left: 600, top: 200, right: 900, bottom: 240 };
  expect(popupPosition({ rect, view, width, mode: "right" }).left).toBe(692);
  expect(popupPosition({ rect, view, width, mode: "left", gap: 10 }).left).toBe(290);
  expect(popupPosition({ rect, view, width, mode: "nope", gap: 10 }).left).toBe(290);
});
