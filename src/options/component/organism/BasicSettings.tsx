/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { produce } from "immer";
import { useEffect, useState } from "react";
import { AZURE_TRANSLATOR_KEY } from "../../../background/azure-translator";
import { DEFAULT_PLAMO_URL, PLAMO_TRANSLATOR_KEY } from "../../../background/plamo-translator";
import { env, storage } from "../../extern";
import { pdf, res } from "../../logic";
import type { InitialPosition, MouseDictionaryBasicSettings, UpdateEventHandler } from "../../types";
import { Button } from "../atom/Button";
import { Select } from "../atom/Select";

type Props = {
  settings: MouseDictionaryBasicSettings;
  busy: boolean;
  onUpdate: UpdateEventHandler;
  children?: React.ReactNode;
};

const FONT_SIZES = [
  { name: "xx-small", value: "xx-small" },
  { name: "x-small", value: "x-small" },
  { name: "smaller", value: "smaller" },
  { name: "small", value: "small" },
  { name: "medium", value: "medium" },
  { name: "large", value: "large" },
  { name: "larger", value: "larger" },
  { name: "x-large", value: "x-large" },
  { name: "xx-large", value: "xx-large" },
];

export const BasicSettings: React.FC<Props> = (props) => {
  const [cachedPdfs, setCachedPdfs] = useState<pdf.PdfCacheEntry[]>([]);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [azure, setAzure] = useState({ key: "", region: "" });
  const [plamo, setPlamo] = useState({ enabled: false, url: "" });

  useEffect(() => {
    let mounted = true;
    pdf
      .listPdfCache()
      .then((entries) => {
        if (mounted) {
          setCachedPdfs(entries ?? []);
        }
      })
      .catch(() => undefined);
    storage.local
      .pick(AZURE_TRANSLATOR_KEY)
      .then((config) => {
        if (mounted && config) {
          setAzure({ key: config.key ?? "", region: config.region ?? "" });
        }
      })
      .catch(() => undefined);
    storage.local
      .pick(PLAMO_TRANSLATOR_KEY)
      .then((config) => {
        if (mounted && config) {
          setPlamo({ enabled: !!config.enabled, url: config.url ?? "" });
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const settings = props.settings;
  if (!settings) {
    return <div />;
  }

  const positions = [
    { name: res.get("positionLeft"), value: "left" },
    { name: res.get("positionRight"), value: "right" },
  ];
  if (env.get().enableWindowStatusSave) {
    positions.push({
      name: res.get("positionKeep"),
      value: "keep",
    });
  }

  const update = (patch: Partial<MouseDictionaryBasicSettings>) => {
    const newPatch = produce(patch, (d) => {
      for (const name of Object.keys(patch)) {
        const value = patch[name];
        if (Number.isNaN(value) || (Number.isInteger(value) && value < 0)) {
          d[name] = 0;
        }
      }
    });
    props.onUpdate(undefined, newPatch);
  };

  // The key is kept in local storage only, apart from the synced settings.
  const updateAzure = (patch: Partial<typeof azure>) => {
    const config = { ...azure, ...patch };
    setAzure(config);
    storage.local.set({ [AZURE_TRANSLATOR_KEY]: { key: config.key.trim(), region: config.region.trim() } });
  };

  const updatePlamo = (patch: Partial<typeof plamo>) => {
    const config = { ...plamo, ...patch };
    setPlamo(config);
    storage.local.set({ [PLAMO_TRANSLATOR_KEY]: { enabled: config.enabled, url: config.url.trim() } });
  };

  const updateCache = async (action: () => Promise<boolean>) => {
    setCacheBusy(true);
    try {
      if (await action()) {
        setCachedPdfs((await pdf.listPdfCache()) ?? []);
      }
    } finally {
      setCacheBusy(false);
    }
  };

  return (
    <form className="settingsForm">
      <fieldset>
        <h2>{res.get("basicSettings")}</h2>
        <label>
          {res.get("skipPdfConfirmation")}
          <input
            type="checkbox"
            name="lookupWithCapitalized"
            onChange={(e) => update({ skipPdfConfirmation: e.target.checked })}
            checked={settings.skipPdfConfirmation}
          />
        </label>
        <h3>{res.get("pdfSettings")}</h3>
        <label>
          {res.get("persistPdf")}
          <input
            type="checkbox"
            name="persistPdf"
            onChange={(e) => update({ persistPdf: e.target.checked })}
            checked={settings.persistPdf}
          />
        </label>
        <h3>{res.get("translationSettings")}</h3>
        <label>
          {res.get("showTranslationByDefault")}
          <input
            type="checkbox"
            name="showTranslationByDefault"
            onChange={(e) => update({ showTranslationByDefault: e.target.checked })}
            checked={settings.showTranslationByDefault}
          />
        </label>
        <label>
          {res.get("plamoTranslatorEnabled")}
          <input
            type="checkbox"
            name="plamoTranslatorEnabled"
            onChange={(e) => updatePlamo({ enabled: e.target.checked })}
            checked={plamo.enabled}
          />
        </label>
        {plamo.enabled && (
          <>
            <label>{res.get("plamoTranslatorUrl")}</label>
            <input
              type="text"
              name="plamoTranslatorUrl"
              placeholder={DEFAULT_PLAMO_URL}
              value={plamo.url}
              onChange={(e) => updatePlamo({ url: e.target.value })}
            />
            <p>{res.get("plamoTranslatorHelp")}</p>
          </>
        )}
        <label>{res.get("azureTranslatorKey")}</label>
        <input
          type="password"
          name="azureTranslatorKey"
          autoComplete="off"
          value={azure.key}
          onChange={(e) => updateAzure({ key: e.target.value })}
        />
        <label>{res.get("azureTranslatorRegion")}</label>
        <input
          type="text"
          name="azureTranslatorRegion"
          value={azure.region}
          required={!!azure.key.trim()}
          onChange={(e) => updateAzure({ region: e.target.value })}
        />
        {azure.key.trim() && !azure.region.trim() && (
          <p style={{ color: "#c62828" }}>{res.get("azureTranslatorRegionRequired")}</p>
        )}
        <p>{res.get("azureTranslatorHelp")}</p>
        <label>{res.get("pdfLinkTarget")}</label>
        <Select
          value={settings.pdfLinkTarget}
          options={[
            { name: res.get("pdfLinkTargetSelf"), value: "self" },
            { name: res.get("pdfLinkTargetBlank"), value: "blank" },
          ]}
          style={{ width: 250 }}
          onChange={(value) => update({ pdfLinkTarget: value as "self" | "blank" })}
        />
        <h4>{res.get("savedPdfList")}</h4>
        {cachedPdfs.length === 0 ? (
          <p>{res.get("noSavedPdf")}</p>
        ) : (
          <>
            <ul>
              {cachedPdfs.map((entry) => (
                <li key={entry.id} style={{ marginBottom: 8 }}>
                  <div style={{ overflowWrap: "anywhere" }}>{entry.title || entry.sourceUrl}</div>
                  {entry.title && <div style={{ overflowWrap: "anywhere" }}>{entry.sourceUrl}</div>}
                  <small>
                    {res.get("pdfCacheLastUsed", { date: new Date(entry.lastAccessAt).toLocaleString() })}
                    {" / "}
                    {res.get("pdfCacheExpires", { date: new Date(entry.expiresAt).toLocaleString() })}
                  </small>
                  <br />
                  <a href={`pdf/web/viewer.html?id=${encodeURIComponent(entry.id)}`} target="_blank" rel="noreferrer">
                    {res.get("openSavedPdf")}
                  </a>{" "}
                  <Button
                    type="revert"
                    text={res.get("deletePdf")}
                    disabled={cacheBusy}
                    onClick={() => updateCache(() => pdf.removePdfCache(entry.id))}
                  />
                </li>
              ))}
            </ul>
            <Button
              type="cancel"
              text={res.get("clearPdfCache")}
              disabled={cacheBusy}
              onClick={() => updateCache(pdf.clearPdfCache)}
            />
          </>
        )}
        <label>{res.get("initialSize")}</label>
        <span>{res.get("width")}</span>
        <input
          type="number"
          name="width"
          value={settings.width}
          style={{
            width: 90,
            backgroundColor: settings.initialPosition === "keep" ? "#c0c0c0" : undefined,
          }}
          onChange={(e) => update({ [e.target.name]: Number.parseInt(e.target.value, 10) })}
        />
        <span> {res.get("height")}</span>
        <input
          type="number"
          name="height"
          value={settings.height}
          style={{
            width: 90,
            backgroundColor: settings.initialPosition === "keep" ? "#c0c0c0" : undefined,
          }}
          onChange={(e) => update({ [e.target.name]: Number.parseInt(e.target.value, 10) })}
        />
        <label>{res.get("initialPosition")}</label>
        <Select
          value={settings.initialPosition}
          options={positions}
          style={{ width: 250 }}
          onChange={(value) => update({ initialPosition: value as InitialPosition })}
        />
        <br />
        <h3>{res.get("colorAndFont")}</h3>
        <div className="container">
          <div className="row" style={{ width: 690 }}>
            <div className="column">
              <h4>{res.get("headFont")}</h4>
              <input
                type="color"
                style={{ width: 200 }}
                value={settings.headFontColor}
                onChange={(e) => update({ headFontColor: e.target.value })}
              />
              <br />
              <Select
                value={settings.headFontSize}
                options={FONT_SIZES}
                style={{ width: 200 }}
                onChange={(value) => update({ headFontSize: value })}
              />
            </div>
            <div className="column">
              <h4>{res.get("descFont")}</h4>
              <input
                type="color"
                style={{ width: 200 }}
                value={settings.descFontColor}
                onChange={(e) => update({ descFontColor: e.target.value })}
              />
              <br />
              <Select
                value={settings.descFontSize}
                options={FONT_SIZES}
                style={{ width: 200 }}
                onChange={(value) => update({ descFontSize: value })}
              />
            </div>
            <div className="column">
              <h4>{res.get("background")}</h4>
              <input
                type="color"
                style={{ width: 200 }}
                value={settings.backgroundColor}
                onChange={(e) => update({ backgroundColor: e.target.value })}
              />
            </div>
          </div>
        </div>
        {props.children}
      </fieldset>
    </form>
  );
};
