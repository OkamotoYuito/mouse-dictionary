import { expect, test } from "vitest";
import { fromTranslatorHtml, prepareText, toTranslatorHtml } from "../../../src/main/core/translation";

test("joins PDF line breaks, hyphenation and ligatures before translation", () => {
  expect(prepareText("The ﬁrst spec-\ntrum of the\nsource is shown.\n\n  Next para-\r\n graph with 10 M_\\odot.")).toBe(
    "The first spectrum of the source is shown.\n\nNext paragraph with 10 solar masses.",
  );
});

test("protects TeX in Azure HTML and restores it after translation", () => {
  const { html, expressions } = toTranslatorHtml("Flux $F < 1$ & more\nline");
  expect(html).toBe('Flux <span class="notranslate">$F &lt; 1$</span> &amp; more<br>line');
  expect(expressions).toEqual(["$F < 1$"]);
  expect(
    fromTranslatorHtml('フラックス<span class="notranslate">$F &lt; 1$</span>&amp;その他<br>行', expressions),
  ).toBe("フラックス$F < 1$&その他\n行");
});
