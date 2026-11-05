import { expect, test } from "vitest";
import { darkenColor, isDark } from "../../../src/main/core/dark";

test("a white background becomes almost black", () => {
  expect(darkenColor("#ffffff")).toBe("#191919");
  expect(darkenColor("#fff")).toBe("#191919");
  expect(darkenColor("rgb(255, 255, 255)")).toBe("#191919");
});

test("a black background becomes light, and grays stay gray", () => {
  expect(darkenColor("#000000")).toBe("#e6e6e6");
  const [r, g, b] = darkenColor("#808080")
    .slice(1)
    .match(/../g)
    .map((part) => Number.parseInt(part, 16));
  expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1);
});

test("a tinted background keeps its hue", () => {
  // A light yellow turns into a dark yellow-brown, not a dark blue.
  const [r, g, b] = darkenColor("#fff8dc")
    .slice(1)
    .match(/../g)
    .map((part) => Number.parseInt(part, 16));
  expect(r).toBeGreaterThan(b);
  expect(r + g + b).toBeLessThan(150);
});

test("an unreadable color falls back to a dark gray", () => {
  expect(darkenColor("transparent")).toBe("#191919");
  expect(darkenColor(undefined)).toBe("#191919");
});

test("dark mode follows the system unless set on or off", () => {
  expect(isDark("auto", true)).toBe(true);
  expect(isDark("auto", false)).toBe(false);
  expect(isDark("on", false)).toBe(true);
  expect(isDark("off", true)).toBe(false);
  expect(isDark(undefined, true)).toBe(true);
});
