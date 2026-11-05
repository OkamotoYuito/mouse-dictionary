/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// Where the translation popup goes relative to the selected text.

export const POPUP_POSITIONS = {
  auto: "自動（右→左→下）",
  below: "選択の下・中央",
  above: "選択の上・中央",
  right: "選択の右",
  left: "選択の左",
};

export const DEFAULT_POPUP_POSITION = "auto";

const EDGE = 8;

// rect: the selection, view: the visible area, both { left, top, right, bottom } on screen.
// Returns the popup's top-left corner; with above, top is where its bottom edge goes.
export const popupPosition = ({ rect, view, width, mode = DEFAULT_POPUP_POSITION, gap = 14 }) => {
  const fitsRight = rect.right + gap + width <= view.right - EDGE;
  const fitsLeft = rect.left - gap - width >= view.left + EDGE;
  const clampLeft = (left) => Math.max(view.left + EDGE, Math.min(left, view.right - width - EDGE));
  const centered = clampLeft(rect.left + (rect.right - rect.left) / 2 - width / 2);

  switch (POPUP_POSITIONS[mode] ? mode : DEFAULT_POPUP_POSITION) {
    case "below":
      return { left: centered, top: rect.bottom + gap / 2, above: false };
    case "above":
      return { left: centered, top: rect.top - gap / 2, above: true };
    case "right":
      return { left: clampLeft(rect.right + gap), top: rect.top, above: false };
    case "left":
      return { left: clampLeft(rect.left - gap - width), top: rect.top, above: false };
    default:
      if (fitsRight) return { left: rect.right + gap, top: rect.top, above: false };
      if (fitsLeft) return { left: rect.left - gap - width, top: rect.top, above: false };
      return { left: clampLeft(rect.left), top: rect.bottom + gap / 2, above: false };
  }
};
