/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

export const TEX_EXPRESSION =
  /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|(?<!\\)\$(?!\$)(?:\\.|[^$])*?(?<!\\)\$(?!\$)|\\[A-Za-z]+\*?(?:\{[^{}\n]*\})*/g;

const LIGATURES = { ﬀ: "ff", ﬁ: "fi", ﬂ: "fl", ﬃ: "ffi", ﬄ: "ffl", ﬅ: "st", ﬆ: "st" };

const normalizeSolarMasses = (text) =>
  text.replace(/\$?(\d+(?:[.,]\d+)?)\s*M(?:[_^]?\s*\\odot|[☉⊙\uFFFD\u0099])\$?/g, (_, mass) => `${mass} solar masses`);

// Text selected in PDFs keeps the layout's line breaks, hyphenation and ligatures, which breaks sentences apart.
export const prepareText = (text) =>
  normalizeSolarMasses(
    text
      .replace(/[ﬀ-ﬆ]/g, (ligature) => LIGATURES[ligature] ?? ligature)
      .replace(/­/g, "")
      .replace(/([a-z])-[ \t]*\r?\n\s*([a-z])/g, "$1$2")
      .split(/\r?\n[ \t]*\r?\n/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n\n"),
  );

export const translatePreservingTex = async (translator, text) => {
  const matches = [...text.matchAll(TEX_EXPRESSION)];
  if (!matches.length) return translator.translate(text);

  const protectedExpressions = [];
  const pattern = new RegExp(TEX_EXPRESSION.source, TEX_EXPRESSION.flags);
  const masked = text.replace(pattern, (expression) => {
    const marker = `MDTEXTOKEN${protectedExpressions.length}END`;
    protectedExpressions.push({ expression, marker });
    return marker;
  });
  const translated = await translator.translate(masked);
  if (protectedExpressions.every(({ marker }) => translated.includes(marker))) {
    return protectedExpressions.reduce(
      (result, { expression, marker }) => result.split(marker).join(expression),
      translated,
    );
  }

  let result = "";
  let offset = 0;
  for (const match of matches) {
    const prose = text.slice(offset, match.index);
    if (prose) result += await translator.translate(prose);
    result += match[0];
    offset = match.index + match[0].length;
  }
  const remaining = text.slice(offset);
  if (remaining) result += await translator.translate(remaining);
  return result;
};

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const unescapeHtml = (text) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");

// Azure Translator leaves elements marked "notranslate" untouched when textType=html.
export const toTranslatorHtml = (text) => {
  const expressions = [];
  let html = "";
  let offset = 0;
  for (const match of text.matchAll(TEX_EXPRESSION)) {
    html += escapeHtml(text.slice(offset, match.index));
    html += `<span class="notranslate">${escapeHtml(match[0])}</span>`;
    expressions.push(match[0]);
    offset = match.index + match[0].length;
  }
  html += escapeHtml(text.slice(offset));
  return { html: html.replace(/\n/g, "<br>"), expressions };
};

export const fromTranslatorHtml = (html, expressions) => {
  let index = 0;
  const placeholders = [];
  const text = unescapeHtml(
    html
      .replace(/<span class="notranslate">[\s\S]*?<\/span>/g, (span) => {
        placeholders.push(expressions[index++] ?? unescapeHtml(span.replace(/<[^>]*>/g, "")));
        return `\uE000${placeholders.length - 1}\uE000`;
      })
      .replace(/<br\s*\/?>/g, "\n")
      .replace(/<[^>]*>/g, ""),
  );
  return text.replace(/\uE000(\d+)\uE000/g, (_, i) => placeholders[Number(i)]);
};
