/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { useEffect, useState } from "react";
import { AZURE_TRANSLATOR_KEY } from "../../../background/azure-translator";
import { DEFAULT_PLAMO_URL, PLAMO_TRANSLATOR_KEY } from "../../../background/plamo-translator";
import { storage } from "../../extern";
import { res } from "../../logic";
import type { MouseDictionarySettings, UpdateEventHandler } from "../../types";
import { Card, SwitchRow } from "../atom/Card";
import { GlossaryEditor } from "./GlossaryEditor";
import { PdfTranslationStyle } from "./PdfTranslationStyle";
import { makeUpdate } from "./update";

type Props = {
  settings: MouseDictionarySettings;
  onUpdate: UpdateEventHandler;
};

const PLAMO_COMMAND = "llama-server -hf pfnet/plamo-3-translate-2b-GGUF:Q4_K_M -c 4096 -np 1 --port 8080";

export const TranslationSettings: React.FC<Props> = (props) => {
  const update = makeUpdate(props.onUpdate);
  const [azure, setAzure] = useState({ key: "", region: "", allowUse: false });
  const [plamo, setPlamo] = useState({ enabled: true, url: "", astronomy: true, recordedWords: true });

  useEffect(() => {
    let mounted = true;
    storage.local
      .pick(AZURE_TRANSLATOR_KEY)
      .then((config) => {
        if (mounted && config)
          setAzure({ key: config.key ?? "", region: config.region ?? "", allowUse: config.allowUse === true });
      })
      .catch(() => undefined);
    storage.local
      .pick(PLAMO_TRANSLATOR_KEY)
      .then((config) => {
        if (mounted && config)
          setPlamo({
            enabled: config.enabled !== false,
            url: config.url ?? "",
            astronomy: config.astronomy !== false,
            recordedWords: config.recordedWords !== false,
          });
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  // Translator settings live in local storage only, apart from the synced settings, and are saved right away.
  const updateAzure = (patch: Partial<typeof azure>) => {
    const config = { ...azure, ...patch };
    setAzure(config);
    storage.local.set({ [AZURE_TRANSLATOR_KEY]: { key: config.key.trim(), region: config.region.trim() } });
  };
  const updatePlamo = (patch: Partial<typeof plamo>) => {
    const config = { ...plamo, ...patch };
    setPlamo(config);
    storage.local.set({ [PLAMO_TRANSLATOR_KEY]: { ...config, url: config.url.trim() } });
  };

  return (
    <>
      <Card title={res.get("translationDisplayTitle")}>
        <SwitchRow
          title={res.get("showTranslationByDefault")}
          checked={props.settings.showTranslationByDefault}
          onChange={(checked) => update({ showTranslationByDefault: checked })}
        />
      </Card>

      <PdfTranslationStyle />

      <Card title={res.get("translationEngineTitle")} description={res.get("translationEngineDesc")}>
        <SwitchRow
          title={res.get("plamoTranslatorEnabled")}
          description={res.get("plamoTranslatorEnabledDesc")}
          checked={plamo.enabled}
          onChange={(enabled) => updatePlamo({ enabled })}
        />
        {plamo.enabled && (
          <>
            <div className="field">
              <label htmlFor="plamoTranslatorUrl">{res.get("plamoTranslatorUrl")}</label>
              <input
                id="plamoTranslatorUrl"
                type="text"
                placeholder={DEFAULT_PLAMO_URL}
                value={plamo.url}
                onChange={(e) => updatePlamo({ url: e.target.value })}
              />
            </div>
            <p className="hint">
              {res.get("plamoTranslatorHelp")} <code>{PLAMO_COMMAND}</code>
            </p>
            <SwitchRow
              title={res.get("plamoAstronomyGlossary")}
              description={res.get("plamoAstronomyGlossaryDesc")}
              checked={plamo.astronomy}
              onChange={(astronomy) => updatePlamo({ astronomy })}
            />
            <SwitchRow
              title={res.get("plamoRecordedGlossary")}
              description={res.get("plamoRecordedGlossaryDesc")}
              checked={plamo.recordedWords}
              onChange={(recordedWords) => updatePlamo({ recordedWords })}
            />
          </>
        )}
      </Card>

      {plamo.enabled && plamo.astronomy && (
        <Card title={res.get("glossaryTitle")} description={res.get("glossaryDesc")}>
          <GlossaryEditor />
        </Card>
      )}

      <Card title={res.get("azureTranslatorTitle")} description={res.get("azureTranslatorHelp")}>
        <SwitchRow
          title={res.get("azureTranslatorAllowUse")}
          description={res.get("azureTranslatorAllowUseDesc")}
          checked={azure.allowUse}
          onChange={(allowUse) => updateAzure({ allowUse })}
        />
        <div className="field">
          <label htmlFor="azureTranslatorKey">{res.get("azureTranslatorKey")}</label>
          <input
            id="azureTranslatorKey"
            type="password"
            autoComplete="off"
            value={azure.key}
            onChange={(e) => updateAzure({ key: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="azureTranslatorRegion">{res.get("azureTranslatorRegion")}</label>
          <input
            id="azureTranslatorRegion"
            type="text"
            placeholder="japaneast"
            value={azure.region}
            required={!!azure.key.trim()}
            onChange={(e) => updateAzure({ region: e.target.value })}
          />
          {azure.key.trim() && !azure.region.trim() && (
            <p className="error-text">{res.get("azureTranslatorRegionRequired")}</p>
          )}
        </div>
      </Card>
    </>
  );
};
