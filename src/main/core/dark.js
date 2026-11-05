/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// Dark mode for the dictionary window. The colors of the window are the user's own, set in the
// options and in the replace rules, so instead of a second palette the window's content is
// inverted with its hues turned back: light becomes dark and green stays green. The window's own
// background is darkened the same way, so its border and shadow stay as they are, and its
// scrollbar is a dark one.

export const DARK_MODES = ["auto", "on", "off"];
const INVERT = 0.9;
export const DARK_FILTER = `invert(${INVERT}) hue-rotate(180deg)`;
const DARK_ATTRIBUTE = "data-mouse-dictionary-dark";
const FALLBACK_DARK = "#191919";

// The CSS hue-rotate(180deg) matrix.
const HUE_180 = [
  [-0.574, 1.43, 0.144],
  [0.426, 0.43, 0.144],
  [0.426, 1.43, -0.856],
];

const parseColor = (color) => {
  const value = String(color ?? "").trim();
  let match = value.match(/^#([0-9a-f]{3})$/i);
  if (match) return [...match[1]].map((digit) => Number.parseInt(digit + digit, 16));
  match = value.match(/^#([0-9a-f]{6})$/i);
  if (match) return [0, 2, 4].map((index) => Number.parseInt(match[1].slice(index, index + 2), 16));
  match = value.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (match) return match.slice(1, 4).map(Number);
  return null;
};

const hex = (channels) =>
  `#${channels
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

// What DARK_FILTER turns a color into: white becomes almost black.
export const darkenColor = (color) => {
  const rgb = parseColor(color);
  if (!rgb) return FALLBACK_DARK;
  const inverted = rgb.map((channel) => INVERT * (255 - channel) + (1 - INVERT) * channel);
  return hex(HUE_180.map((row) => row.reduce((sum, factor, index) => sum + factor * inverted[index], 0)));
};

export const isDark = (mode, systemDark) => mode === "on" || (mode !== "off" && systemDark);

const styleFor = (selector) => `
  ${selector}[${DARK_ATTRIBUTE}="true"] > * { filter: ${DARK_FILTER}; color-scheme: light; }
  ${selector}[${DARK_ATTRIBUTE}="true"] { border-color: rgba(255, 255, 255, 0.14) !important; color-scheme: dark; }
`;

// Follows settings.darkMode: "auto" (the system's choice, the default), "on" or "off".
export const setUpDarkMode = (dialog, settings) => {
  const mode = DARK_MODES.includes(settings.darkMode) ? settings.darkMode : "auto";
  const root = dialog.getRootNode();
  const style = document.createElement("style");
  style.textContent = styleFor(dialog.id ? `[id="${dialog.id}"]` : "");
  (root instanceof ShadowRoot ? root : document.head).appendChild(style);

  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const apply = () => {
    const dark = isDark(mode, media?.matches === true);
    dialog.setAttribute(DARK_ATTRIBUTE, String(dark));
    dialog.style.backgroundColor = dark ? darkenColor(settings.backgroundColor) : settings.backgroundColor;
  };
  apply();
  media?.addEventListener?.("change", apply);
};
