/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { useEffect, useState } from "react";
import {
  DEFAULT_STYLE,
  FONT_KEY,
  FONTS,
  LINE_KEY,
  LINES,
  normalizeStyle,
  SIZE_KEY,
  SIZES,
  STYLE_KEYS,
  styleValues,
} from "../../../pdf-viewer/translation-style";
import { storage } from "../../extern";
import { res } from "../../logic";
import { Card } from "../atom/Card";
import { Select } from "../atom/Select";

type Style = { size: string; font: string; line: string };

const options = (choices: Record<string, { label: string }>) =>
  Object.entries(choices).map(([value, { label }]) => ({ value, name: label }));

const SAMPLE =
  "殻に吸収された光子は、ガスを加熱し化学状態を変えるだけでなく、運動量も与える（Rybicki and Lightman 1986）。その結果、殻の内側の作用面に力が働き、殻を中心の恒星集団から外側へと押し出す。";

// How translations look in the PDF viewer's translation tab and popup. Kept in local storage like
// the viewer's other settings, and picked up at once by viewers that are open.
export const PdfTranslationStyle: React.FC = () => {
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);

  useEffect(() => {
    let mounted = true;
    storage.local
      .get(STYLE_KEYS)
      .then((stored: Record<string, string> | null) => {
        if (mounted) setStyle(normalizeStyle(stored ?? {}));
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const update = (patch: Partial<Style>) => {
    const next = { ...style, ...patch };
    setStyle(next);
    storage.local.set({ [SIZE_KEY]: next.size, [FONT_KEY]: next.font, [LINE_KEY]: next.line });
  };

  const preview = styleValues(style);

  return (
    <Card title={res.get("pdfTranslationStyleTitle")} description={res.get("pdfTranslationStyleDesc")}>
      <div className="field">
        <span className="field-label">{res.get("pdfTranslationFont")}</span>
        <Select value={style.font} options={options(FONTS)} onChange={(font) => update({ font })} />
      </div>
      <div className="field">
        <span className="field-label">{res.get("pdfTranslationSize")}</span>
        <Select value={style.size} options={options(SIZES)} onChange={(size) => update({ size })} />
      </div>
      <div className="field">
        <span className="field-label">{res.get("pdfTranslationLine")}</span>
        <Select value={style.line} options={options(LINES)} onChange={(line) => update({ line })} />
      </div>
      <div className="field">
        <span className="field-label">{res.get("pdfTranslationPreview")}</span>
        <p
          lang="ja"
          style={{
            margin: 0,
            padding: "12px 16px",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontFamily: preview.fontFamily,
            fontSize: preview.fontSize,
            lineHeight: preview.lineHeight,
            letterSpacing: "0.01em",
            lineBreak: "strict",
          }}
        >
          {SAMPLE}
        </p>
        <p className="hint">{res.get("pdfTranslationFontHint")}</p>
      </div>
    </Card>
  );
};
