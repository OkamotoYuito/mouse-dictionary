import { expect, test, vi } from "vitest";
import config from "../../src/main/core/config";
import events from "../../src/main/core/events";
import view from "../../src/main/core/view";
import storage from "../../src/main/lib/storage";
import utils from "../../src/main/lib/utils";
import settings from "../../src/main/settings";

test("adds an escaped meaning without replacing the existing dictionary entry", async () => {
  vi.spyOn(storage.local, "pick").mockResolvedValue("既存の意味");
  const save = vi.spyOn(storage.local, "set").mockResolvedValue(undefined);
  const area = view.create({ ...settings, normalDialogStyles: {} });
  document.body.append(area.dialog);
  area.dialog.querySelector<HTMLButtonElement>("[data-add]")?.click();
  const word = area.dialog.querySelector<HTMLInputElement>('[name="word"]');
  const meaning = area.dialog.querySelector<HTMLTextAreaElement>('[name="meaning"]');
  if (!word || !meaning) throw new Error("Missing inputs");
  word.value = "Cloud";
  meaning.value = "雲 <cloud>";
  area.dialog.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() =>
    expect(save).toHaveBeenCalledWith({ "**** custom word ****:cloud": "既存の意味<br>雲 &lt;cloud&gt;" }),
  );
  area.dialog.remove();
  vi.restoreAllMocks();
});

test("double-clicking selected PDF text opens the meaning form with that word", async () => {
  vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: vi.fn() } } });
  vi.spyOn(config, "isDataReady").mockResolvedValue(true);
  const selection = vi.spyOn(utils, "getSelection").mockReturnValue("");
  const area = view.create({ ...settings, normalDialogStyles: {}, movingDialogStyles: {} });
  const text = document.createElement("p");
  text.textContent = "Nebula";
  document.body.append(text, area.dialog);
  await events.attach({ ...settings, normalDialogStyles: {}, movingDialogStyles: {} }, area.dialog, vi.fn());
  selection.mockReturnValue("Nebula");
  text.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, composed: true }));
  expect(area.dialog.querySelector<HTMLInputElement>('[name="word"]')?.value).toBe("Nebula");
  expect(area.dialog.querySelector<HTMLElement>("[data-fields]")?.hidden).toBe(false);
  expect(document.activeElement).toBe(area.dialog.querySelector('[name="meaning"]'));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test("edits a plural word to its singular and updates an existing custom meaning", async () => {
  vi.spyOn(storage.local, "pick").mockImplementation(async (key) =>
    key === "**** custom word ****:cloud" ? "古い意味<br>雲 &lt;cloud&gt;" : undefined,
  );
  const save = vi.spyOn(storage.local, "set").mockResolvedValue(undefined);
  const area = view.create({ ...settings, normalDialogStyles: {} });
  document.body.append(area.dialog);
  area.dialog.dispatchEvent(new CustomEvent("mouse-dictionary-add-meaning", { detail: "clouds" }));
  const word = area.dialog.querySelector<HTMLInputElement>('[name="word"]');
  const meaning = area.dialog.querySelector<HTMLTextAreaElement>('[name="meaning"]');
  if (!word || !meaning) throw new Error("Missing inputs");
  word.value = "cloud";
  word.dispatchEvent(new Event("input", { bubbles: true }));
  area.dialog.querySelector<HTMLButtonElement>("[data-load]")?.click();
  await vi.waitFor(() => expect(meaning.value).toBe("古い意味\n雲 <cloud>"));
  meaning.value = "新しい意味 <sky>";
  meaning.dispatchEvent(new Event("input", { bubbles: true }));
  area.dialog.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await vi.waitFor(() =>
    expect(save).toHaveBeenCalledWith({ "**** custom word ****:cloud": "新しい意味 &lt;sky&gt;" }),
  );
  area.dialog.remove();
  vi.restoreAllMocks();
});
