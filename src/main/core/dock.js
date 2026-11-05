/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// Docks the dictionary window into the dictionary tab of the PDF viewer's side panel.
//
// The viewer's side panel (src/pdf-viewer/workspace.js) owns the dock: it sends
// "mouse-dictionary-dock" with { docked, rect }, rect being the area to fill or null while the
// tab isn't showing. Docked, the window fills that area and can't be moved; undocked, it floats
// again where it was. The window asks for the current dock with "mouse-dictionary-dock-request"
// when it starts, whenever it's shown, and when the panel says it's ready, telling whether it's visible.

import dom from "../lib/dom";

const DOCK_EVENT = "mouse-dictionary-dock";
const REQUEST_EVENT = "mouse-dictionary-dock-request";

// Over the side panel, but under PDF.js's menus (z-index 30000 and up).
const DOCKED_STYLES = { borderRadius: "0", border: "0", boxShadow: "none", opacity: "1", zIndex: "20000" };
const FLOATING_FIELDS = ["left", "top", "width", "height", "borderRadius", "border", "boxShadow"];

const isHidden = (dialog) => dialog.getAttribute("data-mouse-dictionary-hidden") === "true";

export const setUpDocking = (dialog, draggable, settings) => {
  let dock = { docked: false, rect: null };
  let floating = null; // the floating window's place and look, kept while docked

  const apply = () => {
    if (!dock.docked) {
      dialog.style.display = "";
      if (floating) {
        Object.assign(dialog.style, floating);
        floating = null;
        if (!isHidden(dialog)) dom.applyStyles(dialog, settings.normalDialogStyles);
        draggable.lock(false);
      }
      return;
    }
    if (!floating) {
      floating = Object.fromEntries(FLOATING_FIELDS.map((field) => [field, dialog.style[field]]));
      draggable.lock(true);
    }
    if (!dock.rect) {
      dialog.style.display = "none";
      return;
    }
    dialog.style.display = "";
    const { left, top, width, height } = dock.rect;
    Object.assign(dialog.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      ...(isHidden(dialog) ? {} : DOCKED_STYLES),
    });
    draggable.syncFromStyle();
  };

  window.addEventListener(DOCK_EVENT, (event) => {
    dock = { docked: event.detail?.docked === true, rect: event.detail?.rect ?? null };
    apply();
  });

  const request = () =>
    window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: { visible: !isHidden(dialog) } }));

  // Showing and hiding the window resets its look, so dock it again, and let the panel know.
  new MutationObserver(() => {
    apply();
    request();
  }).observe(dialog, { attributes: true, attributeFilter: ["data-mouse-dictionary-hidden"] });

  // The panel may get ready after the window; it says so, and the window asks again.
  window.addEventListener("mouse-dictionary-dock-ready", request);
  request();
};
