/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// How translations look in the PDF viewer: text size, face and line spacing. Chosen on the
// options page and kept in local storage; the viewer's translation tab and popup follow them.

export const SIZE_KEY = "pdfTranslationSize";
export const FONT_KEY = "pdfTranslationFont";
export const LINE_KEY = "pdfTranslationLine";
export const STYLE_KEYS = [SIZE_KEY, FONT_KEY, LINE_KEY];

export const SIZES = {
  small: { label: "小（13px）", px: 13 },
  medium: { label: "中（15px）", px: 15 },
  large: { label: "大（17.5px）", px: 17.5 },
};

// A face that isn't installed falls back to Noto Sans JP, then Hiragino.
const FALLBACK = '"Noto Sans JP", "Noto Sans CJK JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif';
export const FONTS = {
  noto: { label: "Noto Sans JP", stack: FALLBACK },
  hiragino: { label: "ヒラギノ角ゴ", stack: `"Hiragino Sans", "Hiragino Kaku Gothic ProN", ${FALLBACK}` },
  yu: { label: "游ゴシック", stack: `"Yu Gothic UI", YuGothic, "Yu Gothic Medium", "Yu Gothic", ${FALLBACK}` },
  biz: { label: "BIZ UDPゴシック", stack: `"BIZ UDPGothic", "BIZ UDGothic", ${FALLBACK}` },
  system: { label: "システム", stack: `system-ui, -apple-system, ${FALLBACK}` },
  // The browser's own serif face (Times and Hiragino Mincho on a Mac, unless set otherwise in Chrome).
  serif: { label: "Serif（ブラウザ標準）", stack: "serif" },
  notoSerif: {
    label: "Noto Serif JP",
    stack: `"Noto Serif JP", "Noto Serif CJK JP", "Hiragino Mincho ProN", "Yu Mincho", YuMincho, serif`,
  },
  mincho: {
    label: "明朝（ヒラギノ・游）",
    stack: `"Hiragino Mincho ProN", "Yu Mincho", YuMincho, "Noto Serif JP", "Noto Serif CJK JP", serif`,
  },
};

export const LINES = {
  tight: { label: "狭い（1.3）", value: 1.3 },
  normal: { label: "標準（1.45）", value: 1.45 },
  wide: { label: "広い（1.7）", value: 1.7 },
};

export const DEFAULT_STYLE = { size: "medium", font: "noto", line: "normal" };

// The chosen style from what was stored, with defaults for anything missing or unknown.
export const normalizeStyle = (stored = {}) => ({
  size: SIZES[stored[SIZE_KEY]] ? stored[SIZE_KEY] : DEFAULT_STYLE.size,
  font: FONTS[stored[FONT_KEY]] ? stored[FONT_KEY] : DEFAULT_STYLE.font,
  line: LINES[stored[LINE_KEY]] ? stored[LINE_KEY] : DEFAULT_STYLE.line,
});

// CSS for a style: a font stack, a size and a line height.
export const styleValues = (style) => ({
  fontFamily: FONTS[style.font].stack,
  fontSize: `${SIZES[style.size].px}px`,
  lineHeight: String(LINES[style.line].value),
});

// Sets the CSS variables the viewer's translations use.
export const applyStyle = (style, element = document.documentElement) => {
  const values = styleValues(style);
  element.style.setProperty("--md-reading-font", values.fontFamily);
  element.style.setProperty("--md-tr-size", values.fontSize);
  element.style.setProperty("--md-tr-line", values.lineHeight);
};
