/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import temml from "temml";

// Only delimited math is rendered; bare commands such as \citep{...} stay as text.
const MATH =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\begin\{([A-Za-z]+\*?)\}([\s\S]*?)\\end\{\3\}|\\\(([\s\S]+?)\\\)|(?<!\\)\$((?:\\.|[^$\n])+?)(?<!\\)\$/g;

const renderMath = (source, tex, displayMode) => {
  const span = document.createElement("span");
  span.className = "md-math";
  span.title = source;
  // temml escapes the input and refuses \href and similar commands, so its MathML is safe to insert.
  span.innerHTML = temml.renderToString(tex, { displayMode, throwOnError: false });
  return span;
};

// Shows text with its TeX math rendered as MathML, which Chrome draws natively.
export const renderTextWithMath = (element, text) => {
  element.replaceChildren();
  let offset = 0;
  let afterBlock = false;
  // Display math sits on its own line, so the spaces around it would only indent the text.
  const appendText = (part, beforeBlock) => {
    if (afterBlock) part = part.trimStart();
    element.append(beforeBlock ? part.trimEnd() : part);
  };
  for (const match of text.matchAll(MATH)) {
    const [source, display, bracket, environment, , paren, inline] = match;
    const block = !!(environment || display || bracket);
    appendText(text.slice(offset, match.index), block);
    const tex = environment ? source : (display ?? bracket ?? paren ?? inline);
    element.append(renderMath(source, tex, block));
    afterBlock = block;
    offset = match.index + source.length;
  }
  appendText(text.slice(offset), false);
};
