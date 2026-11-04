import { expect, test, vi } from "vitest";
import view from "../../src/main/core/view";
import storage from "../../src/main/lib/storage";
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
