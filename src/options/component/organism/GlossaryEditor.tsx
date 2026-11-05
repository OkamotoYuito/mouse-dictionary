/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { useEffect, useRef, useState } from "react";
import { ASTRONOMY_GLOSSARY_KEY, ASTRONOMY_TERMS } from "../../../background/astronomy-terms";
import { storage } from "../../extern";
import { message, res } from "../../logic";

type Row = { id: number; source: string; target: string };

// Edits the astronomy glossary. Every change is saved right away, like the other translator settings.
export const GlossaryEditor: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const nextId = useRef(0);
  const toRows = (terms: string[][]): Row[] =>
    terms.map(([source, target]) => ({ id: nextId.current++, source: source ?? "", target: target ?? "" }));

  useEffect(() => {
    storage.local
      .pick(ASTRONOMY_GLOSSARY_KEY)
      .then((edited) => setRows(toRows(Array.isArray(edited) ? edited : ASTRONOMY_TERMS)))
      .catch(() => setRows(toRows(ASTRONOMY_TERMS)));
  }, []);

  const save = (newRows: Row[]) => {
    setRows(newRows);
    storage.local.set({ [ASTRONOMY_GLOSSARY_KEY]: newRows.map(({ source, target }) => [source, target]) });
  };
  const change = (id: number, patch: Partial<Row>) =>
    save(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  const add = () => {
    setFilter("");
    save([{ id: nextId.current++, source: "", target: "" }, ...rows]);
  };
  const reset = async () => {
    if (!(await message.notice(res.get("glossaryResetConfirm"), "okCancel"))) return;
    setFilter("");
    setRows(toRows(ASTRONOMY_TERMS));
    storage.local.remove(ASTRONOMY_GLOSSARY_KEY);
  };

  // The first of several rows with the same term is the one used.
  const counts = new Map<string, number>();
  for (const { source } of rows) {
    const key = source.trim().toLowerCase();
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const query = filter.trim().toLowerCase();
  const shown = query
    ? rows.filter(({ source, target }) => source.toLowerCase().includes(query) || target.includes(filter.trim()))
    : rows;

  return (
    <div className="glossary">
      <div className="glossary-toolbar">
        <input
          type="search"
          placeholder={res.get("glossarySearch")}
          aria-label={res.get("glossarySearch")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="hint">{res.get("glossaryCount", { count: rows.length })}</span>
        <button type="button" className="button-secondary button-small" onClick={add}>
          {res.get("glossaryAdd")}
        </button>
      </div>
      <div className="glossary-head" aria-hidden="true">
        <span>{res.get("glossarySource")}</span>
        <span>{res.get("glossaryTarget")}</span>
      </div>
      <ul className="glossary-list">
        {shown.map((row) => (
          <li key={row.id}>
            <div className="glossary-row">
              <input
                type="text"
                aria-label={res.get("glossarySource")}
                value={row.source}
                placeholder="outflow"
                onChange={(e) => change(row.id, { source: e.target.value })}
              />
              <span className="glossary-arrow">→</span>
              <input
                type="text"
                aria-label={res.get("glossaryTarget")}
                value={row.target}
                placeholder="アウトフロー"
                onChange={(e) => change(row.id, { target: e.target.value })}
              />
              <button
                type="button"
                className="button-danger button-arrow"
                aria-label={res.get("glossaryDelete")}
                title={res.get("glossaryDelete")}
                onClick={() => save(rows.filter(({ id }) => id !== row.id))}
              >
                ×
              </button>
            </div>
            {(counts.get(row.source.trim().toLowerCase()) ?? 0) > 1 && (
              <p className="error-text">{res.get("glossaryDuplicate")}</p>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="empty">{res.get("glossaryNoMatch")}</li>}
      </ul>
      <div className="button-row">
        <button type="button" className="button-secondary button-small" onClick={reset}>
          {res.get("glossaryReset")}
        </button>
      </div>
    </div>
  );
};
