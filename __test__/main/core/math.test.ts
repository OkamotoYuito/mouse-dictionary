import { expect, test } from "vitest";
import { renderTextWithMath } from "../../../src/main/core/math";

const render = (text: string) => {
  const element = document.createElement("div");
  renderTextWithMath(element, text);
  return element;
};

test("renders inline and display TeX as MathML and keeps the prose as text", () => {
  const element = render("質量は$10^{3}\\,M_{⊙}$で、\\[ \\alpha = 1 \\]となる。");
  const math = element.querySelectorAll("math");
  expect(math).toHaveLength(2);
  expect(math[0].getAttribute("display")).not.toBe("block");
  expect(math[1].getAttribute("display")).toBe("block");
  expect(element.querySelector(".md-math")?.getAttribute("title")).toBe("$10^{3}\\,M_{⊙}$");
  expect(element.textContent).toMatch(/^質量は.*で、.*となる。$/);
});

test("leaves bare commands and plain text untouched", () => {
  const element = render("ダスト温度は15～25 Kである \\citep{Smith2020}。<b>x</b>");
  expect(element.querySelector("math")).toBeNull();
  expect(element.textContent).toBe("ダスト温度は15～25 Kである \\citep{Smith2020}。<b>x</b>");
});

test("does not turn TeX links into live links", () => {
  const element = render("$\\href{javascript:alert(1)}{x}$");
  expect(element.querySelector("a")).toBeNull();
});
