/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { env } from "../../extern";
import { res } from "../../logic";
import type { InitialPosition, MouseDictionarySettings, UpdateEventHandler } from "../../types";
import { Card } from "../atom/Card";
import { Select } from "../atom/Select";
import { makeUpdate } from "./update";

type Props = {
  settings: MouseDictionarySettings;
  onUpdate: UpdateEventHandler;
};

const FONT_SIZES = ["xx-small", "x-small", "smaller", "small", "medium", "large", "larger", "x-large", "xx-large"].map(
  (size) => ({ name: size, value: size }),
);

export const DisplaySettings: React.FC<Props> = (props) => {
  const { settings } = props;
  const update = makeUpdate(props.onUpdate);

  const positions = [
    { name: res.get("positionLeft"), value: "left" },
    { name: res.get("positionRight"), value: "right" },
  ];
  if (env.get().enableWindowStatusSave) {
    positions.push({ name: res.get("positionKeep"), value: "keep" });
  }
  // The remembered size wins over the initial one, so the size fields have no effect then.
  const sizeDisabled = settings.initialPosition === "keep";

  return (
    <>
      <Card title={res.get("windowSettings")} description={res.get("windowSettingsDesc")}>
        <div className="field">
          <span className="field-label">{res.get("initialPosition")}</span>
          <Select
            value={settings.initialPosition}
            options={positions}
            style={{ maxWidth: 280 }}
            onChange={(value) => update({ initialPosition: value as InitialPosition })}
          />
        </div>
        <div className="field">
          <span className="field-label">{res.get("initialSize")}</span>
          <div className="inline-fields">
            <span>{res.get("width")}</span>
            <input
              type="number"
              name="width"
              value={settings.width}
              disabled={sizeDisabled}
              onChange={(e) => update({ width: Number.parseInt(e.target.value, 10) })}
            />
            <span>{res.get("height")}</span>
            <input
              type="number"
              name="height"
              value={settings.height}
              disabled={sizeDisabled}
              onChange={(e) => update({ height: Number.parseInt(e.target.value, 10) })}
            />
            <span className="hint">px</span>
          </div>
        </div>
      </Card>

      <Card title={res.get("colorAndFont")} description={res.get("colorAndFontDesc")}>
        <div className="grid-3">
          <div className="field">
            <span className="field-label">{res.get("headFont")}</span>
            <input
              type="color"
              value={settings.headFontColor}
              onChange={(e) => update({ headFontColor: e.target.value })}
            />
            <Select
              value={settings.headFontSize}
              options={FONT_SIZES}
              onChange={(value) => update({ headFontSize: value })}
            />
          </div>
          <div className="field">
            <span className="field-label">{res.get("descFont")}</span>
            <input
              type="color"
              value={settings.descFontColor}
              onChange={(e) => update({ descFontColor: e.target.value })}
            />
            <Select
              value={settings.descFontSize}
              options={FONT_SIZES}
              onChange={(value) => update({ descFontSize: value })}
            />
          </div>
          <div className="field">
            <span className="field-label">{res.get("background")}</span>
            <input
              type="color"
              value={settings.backgroundColor}
              onChange={(e) => update({ backgroundColor: e.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <span className="field-label">{res.get("darkMode")}</span>
          <Select
            value={settings.darkMode ?? "auto"}
            options={[
              { name: res.get("darkModeAuto"), value: "auto" },
              { name: res.get("darkModeOn"), value: "on" },
              { name: res.get("darkModeOff"), value: "off" },
            ]}
            style={{ maxWidth: 280 }}
            onChange={(value) => update({ darkMode: value as MouseDictionarySettings["darkMode"] })}
          />
          <p className="hint">{res.get("darkModeDesc")}</p>
        </div>
      </Card>
    </>
  );
};
