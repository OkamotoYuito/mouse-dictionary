/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { useEffect, useState } from "react";
import { pdf, res } from "../../logic";
import type { MouseDictionarySettings, UpdateEventHandler } from "../../types";
import { Button } from "../atom/Button";
import { Card, SwitchRow } from "../atom/Card";
import { Select } from "../atom/Select";
import { makeUpdate } from "./update";

type Props = {
  settings: MouseDictionarySettings;
  onUpdate: UpdateEventHandler;
};

export const PdfSettings: React.FC<Props> = (props) => {
  const { settings } = props;
  const update = makeUpdate(props.onUpdate);
  const [cachedPdfs, setCachedPdfs] = useState<pdf.PdfCacheEntry[]>([]);
  const [cacheBusy, setCacheBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    pdf
      .listPdfCache()
      .then((entries) => {
        if (mounted) setCachedPdfs(entries ?? []);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

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
    <>
      <Card title={res.get("pdfViewerTitle")} description={res.get("pdfViewerDesc")}>
        <SwitchRow
          title={res.get("skipPdfConfirmation")}
          checked={settings.skipPdfConfirmation}
          onChange={(checked) => update({ skipPdfConfirmation: checked })}
        />
        <SwitchRow
          title={res.get("persistPdf")}
          checked={settings.persistPdf}
          onChange={(checked) => update({ persistPdf: checked })}
        />
        <div className="field">
          <span className="field-label">{res.get("pdfLinkTarget")}</span>
          <Select
            value={settings.pdfLinkTarget}
            options={[
              { name: res.get("pdfLinkTargetSelf"), value: "self" },
              { name: res.get("pdfLinkTargetBlank"), value: "blank" },
            ]}
            style={{ maxWidth: 280 }}
            onChange={(value) => update({ pdfLinkTarget: value as "self" | "blank" })}
          />
        </div>
      </Card>

      <Card title={res.get("savedPdfList")} description={res.get("savedPdfDesc")}>
        {cachedPdfs.length === 0 ? (
          <p className="empty">{res.get("noSavedPdf")}</p>
        ) : (
          <>
            <ul className="item-list">
              {cachedPdfs.map((entry) => (
                <li key={entry.id}>
                  <span className="item-title">{entry.title || entry.sourceUrl}</span>
                  {entry.title && <span className="item-meta">{entry.sourceUrl}</span>}
                  <span className="item-meta">
                    {res.get("pdfCacheLastUsed", { date: new Date(entry.lastAccessAt).toLocaleString() })}
                    {" · "}
                    {res.get("pdfCacheExpires", { date: new Date(entry.expiresAt).toLocaleString() })}
                  </span>
                  <div className="button-row">
                    <a
                      className="button button-secondary button-small"
                      href={`pdf/web/viewer.html?id=${encodeURIComponent(entry.id)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {res.get("openSavedPdf")}
                    </a>
                    <button
                      type="button"
                      className="button-danger button-small"
                      disabled={cacheBusy}
                      onClick={() => updateCache(() => pdf.removePdfCache(entry.id))}
                    >
                      {res.get("deletePdf")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="button-row">
              <Button
                type="cancel"
                text={res.get("clearPdfCache")}
                disabled={cacheBusy}
                onClick={() => updateCache(pdf.clearPdfCache)}
              />
            </div>
          </>
        )}
      </Card>
    </>
  );
};
