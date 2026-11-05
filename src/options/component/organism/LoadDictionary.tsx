/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { useEffect, useRef, useState } from "react";
import { res } from "../../logic";
import { detectFileEncoding } from "../../logic/encoding";
import type { DictionaryFileEncoding, DictionaryFileFormat } from "../../types";
import { Button } from "../atom/Button";
import { Select } from "../atom/Select";

type Props = {
  defaultEncoding?: DictionaryFileEncoding;
  defaultFormat?: DictionaryFileFormat;
  busy: boolean;
  trigger: (e: TriggerEvent) => void;
};

type TriggerEvent = {
  type: "load";
  payload: {
    file: File | undefined;
    encoding: DictionaryFileEncoding;
    format: DictionaryFileFormat;
  };
};

export const LoadDictionary: React.FC<Props> = (props) => {
  const [encoding, setEncoding] = useState<DictionaryFileEncoding>("Shift_JIS");
  const [format, setFormat] = useState<DictionaryFileFormat>("EIJIRO");
  const [file, setFile] = useState<File | undefined>(undefined);
  const selectRef = useRef<HTMLSelectElement>(null);

  const ENCODINGS = [
    { value: "Shift_JIS", name: "Shift_JIS" },
    { value: "UTF-8", name: "UTF-8" },
    { value: "UTF-16", name: "UTF-16" },
  ];

  const FORMATS = [
    { value: "EIJIRO", name: res.get("formatEijiroText") },
    { value: "TSV", name: res.get("formatTsv") },
    { value: "PDIC_LINE", name: res.get("formatPdicOneLine") },
    { value: "JSON", name: res.get("formatJson") },
  ];

  useEffect(() => {
    if (!file) {
      return;
    }
    const load = async () => {
      const detectedEncoding = await detectFileEncoding(file);
      if (detectedEncoding === "Unknown") {
        return;
      }
      const detectedEncodingName = (
        detectedEncoding === "ASCII" ? "UTF-8" : detectedEncoding
      ) as DictionaryFileEncoding;
      setEncoding(detectedEncodingName);

      if (selectRef.current) {
        selectRef.current.style.transition = "background-color 0.5s ease";
        selectRef.current.style.backgroundColor = "lightyellow";
        setTimeout(() => {
          if (selectRef.current) {
            selectRef.current.style.backgroundColor = "";
          }
        }, 1500);
      }
    };
    load();
  }, [file]);

  return (
    <>
      <div className="field">
        <label htmlFor="dictFile">{res.get("readDictData")}</label>
        <input id="dictFile" type="file" onChange={(e) => setFile(e.target.files?.[0])} />
      </div>
      <div className="grid-3">
        <div className="field">
          <span className="field-label">{res.get("dictDataFormat")}</span>
          <Select value={format} options={FORMATS} onChange={(value) => setFormat(value as DictionaryFileFormat)} />
        </div>
        <div className="field">
          <span className="field-label">{res.get("dictDataEncoding")}</span>
          <Select
            ref={selectRef}
            value={encoding}
            options={ENCODINGS}
            onChange={(value) => setEncoding(value as DictionaryFileEncoding)}
          />
        </div>
      </div>
      <div className="button-row">
        <Button
          type="primary"
          text={res.get("loadSelectedFile")}
          onClick={() =>
            props.trigger({
              type: "load",
              payload: { encoding, format, file },
            })
          }
          disabled={props.busy || !file}
        />
        {props.busy && <img src="img/loading.gif" width="20" height="20" alt="" />}
      </div>
    </>
  );
};
