/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { htmlrisk, res } from "../../logic";
import type { MouseDictionaryAdvancedSettings, UpdateEventHandler } from "../../types";
import { Button } from "../atom/Button";
import { Card, SwitchRow } from "../atom/Card";
import { HighlightEditor } from "../atom/HighlightEditor";
import { ReplaceRuleEditor } from "./ReplaceRuleEditor";
import { makeUpdate } from "./update";

type AdvancedSettingsProps = {
  settings: MouseDictionaryAdvancedSettings;
  busy: boolean;
  onUpdate: UpdateEventHandler;
  onOpenJsonEditor: () => void;
};

const WikiLink: React.FC<{ page: string }> = ({ page }) => (
  <a href={`https://github.com/wtetsu/mouse-dictionary/wiki/${page}`} target="_blank" rel="noopener noreferrer">
    ?
  </a>
);

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = (props) => {
  const lookupWithCapitalized = props.settings?.lookupWithCapitalized ?? false;
  const parseWordsLimit = props.settings?.parseWordsLimit ?? 8;
  const pdfUrl = props.settings?.pdfUrl ?? "";
  const domType = props.settings?.domType ?? "shadow";
  const contentWrapperTemplate = props.settings?.contentWrapperTemplate ?? "";
  const dialogTemplate = props.settings?.dialogTemplate ?? "";
  const contentTemplate = props.settings?.contentTemplate ?? "";
  const normalDialogStyles = props.settings?.normalDialogStyles ?? "";
  const movingDialogStyles = props.settings?.movingDialogStyles ?? "";
  const hiddenDialogStyles = props.settings?.hiddenDialogStyles ?? "";

  const scriptWarning = (html: string): string | undefined => {
    const risks = htmlrisk.findHtmlRisks(html);
    if (risks.length === 0) {
      return undefined;
    }
    return res.get("scriptWarning", { detail: htmlrisk.describeHtmlRisks(risks) });
  };

  const update = makeUpdate(props.onUpdate);

  return (
    <>
      <Card title={res.get("backupTitle")} description={res.get("aboutJsonEditor")}>
        <div className="button-row">
          <Button type="json" text={res.get("openJsonEditor")} disabled={props.busy} onClick={props.onOpenJsonEditor} />
        </div>
      </Card>

      <Card title={res.get("lookupSettings")} description={res.get("lookupSettingsDesc")}>
        <div className="field">
          <span className="field-label">{res.get("abbreviateShortWordDesc")}</span>
          <div className="inline-fields">
            <span>{res.get("abbreviateShortWordDesc0")}</span>
            <input
              type="number"
              value={props.settings.shortWordLength}
              onChange={(e) => update({ shortWordLength: Number.parseInt(e.target.value, 10) })}
            />
            <span>{res.get("abbreviateShortWordDesc1")}</span>
            <input
              type="number"
              value={props.settings.cutShortWordDescription}
              onChange={(e) => update({ cutShortWordDescription: Number.parseInt(e.target.value, 10) })}
            />
            <span>{res.get("abbreviateShortWordDesc2")}</span>
          </div>
        </div>
        <SwitchRow
          title={res.get("lookupWithCapitalized")}
          checked={lookupWithCapitalized}
          onChange={(checked) => update({ lookupWithCapitalized: checked })}
        />
        <div className="field">
          <label htmlFor="parseWordsLimit">{res.get("parseWordsLimit")}</label>
          <input
            id="parseWordsLimit"
            type="number"
            value={parseWordsLimit}
            onChange={(e) => update({ parseWordsLimit: Number.parseInt(e.target.value, 10) })}
          />
        </div>
      </Card>

      <Card title={res.get("pageSettings")}>
        <div className="field">
          <label htmlFor="pdfUrl">{res.get("pdfUrlPattern")}</label>
          <input
            id="pdfUrl"
            type="text"
            value={pdfUrl}
            placeholder="\.pdf$"
            onChange={(e) => update({ pdfUrl: e.target.value })}
          />
        </div>
        <div className="field">
          <span className="field-label">
            {res.get("domType")} <WikiLink page="DOM-Type" />
          </span>
          <div className="radio-group">
            {(["shadow", "light"] as const).map((type) => (
              <label key={type}>
                <input
                  type="radio"
                  name="domType"
                  value={type}
                  checked={domType === type}
                  onChange={() => update({ domType: type })}
                />
                {type === "shadow" ? "Shadow DOM" : "Light DOM"}
              </label>
            ))}
          </div>
        </div>
      </Card>

      <Card
        title={
          <>
            {res.get("htmlTemplate")} <WikiLink page="HTML-templates" />
          </>
        }
      >
        <div className="field">
          <span className="field-label">{res.get("htmlTemplateWindow")}</span>
          <HighlightEditor
            mode="html"
            theme="xcode"
            onChange={(value) => update({ dialogTemplate: value })}
            value={dialogTemplate}
            style={{ height: 250 }}
            warning={scriptWarning(dialogTemplate)}
          />
        </div>
        <div className="field">
          <span className="field-label">{res.get("htmlTemplateDesc")}</span>
          <HighlightEditor
            mode="html"
            theme="xcode"
            onChange={(value) => update({ contentWrapperTemplate: value })}
            value={contentWrapperTemplate}
            style={{ height: 70 }}
            warning={scriptWarning(contentWrapperTemplate)}
          />
        </div>
        <div className="field">
          <span className="field-label">{res.get("htmlTemplateDescText")}</span>
          <HighlightEditor
            mode="html"
            theme="xcode"
            onChange={(value) => update({ contentTemplate: value })}
            value={contentTemplate}
            style={{ height: 400 }}
            warning={scriptWarning(contentTemplate)}
          />
        </div>
      </Card>

      <Card title={res.get("styles")}>
        {(
          [
            ["stylesActive", "normalDialogStyles", normalDialogStyles],
            ["stylesMoving", "movingDialogStyles", movingDialogStyles],
            ["stylesInactive", "hiddenDialogStyles", hiddenDialogStyles],
          ] as const
        ).map(([label, key, value]) => (
          <div className="field" key={key}>
            <span className="field-label">{res.get(label)}</span>
            <HighlightEditor
              mode="json"
              theme="tomorrow"
              onChange={(json) => update({ [key]: json })}
              value={value}
              style={{ height: 85 }}
            />
          </div>
        ))}
      </Card>

      <Card title={res.get("replaceRules")}>
        <ReplaceRuleEditor
          replaceRules={props.settings.replaceRules}
          onUpdate={(rules) => update({ replaceRules: rules })}
        />
      </Card>
    </>
  );
};
