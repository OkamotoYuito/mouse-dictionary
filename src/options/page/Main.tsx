/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { produce } from "immer";
import { useEffect, useReducer, useRef, useState } from "react";
import { Button, Card, DataUsage, ExternalLink, Overlay, Panel } from "../component/atom";
import {
  AdvancedSettings,
  DisplaySettings,
  LoadDictionary,
  OperationPanel,
  PdfSettings,
  TranslationSettings,
  WholeSettings,
} from "../component/organism";
import { config, defaultSettings, env } from "../extern";
import { data, dict, message, pdf, res } from "../logic";
import { detectFileEncoding } from "../logic/encoding";
import { usePreview } from "../logic/preview";
import type { TextResourceKeys } from "../resource";
import { Links } from "../resource/links";
import type { DictionaryFile, MouseDictionarySettings } from "../types";

const TABS = ["dictionary", "appearance", "translation", "pdf", "advanced"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, [TextResourceKeys, TextResourceKeys]> = {
  dictionary: ["navDictionary", "navDictionaryDesc"],
  appearance: ["navAppearance", "navAppearanceDesc"],
  translation: ["navTranslation", "navTranslationDesc"],
  pdf: ["navPdf", "navPdfDesc"],
  advanced: ["navAdvanced", "navAdvancedDesc"],
};

// The dictionary window is drawn on the page as a live preview while these tabs are open.
const PREVIEW_TABS: Tab[] = ["appearance"];

const tabFromHash = (): Tab => {
  const hash = location.hash.slice(1) as Tab;
  return TABS.includes(hash) ? hash : "appearance";
};

type MainState = {
  dictDataUsage?: number;
  busy: boolean;
  progress: string;
  settings: MouseDictionarySettings;
  previewText: string;
  tab: Tab;
  jsonEditing: boolean;
  lang: string;
  initialized: boolean;
};

type Action =
  | {
      type: "patch";
      statePatch: Partial<MainState> | undefined;
      settingsPatch: Partial<MouseDictionarySettings> | undefined;
    }
  | {
      type: "replace";
      settings: MouseDictionarySettings;
    };

const reducer = (state: MainState, action: Action): MainState => {
  switch (action.type) {
    case "patch":
      return produce(state, (d) => {
        Object.assign(d, action.statePatch);
        Object.assign(d.settings, action.settingsPatch);
      });
    case "replace":
      return produce(state, (d) => {
        d.settings = action.settings;
      });
  }
};

const initialState: MainState = {
  dictDataUsage: undefined,
  busy: false,
  progress: "",
  settings: {} as MouseDictionarySettings,
  previewText: "rained cats and dogs",
  tab: "appearance",
  jsonEditing: false,
  lang: "",
  initialized: false,
};

type UpdateState = (state: Partial<MainState>) => void;

export const Main: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    tab: tabFromHash(),
    lang: res.getLang(),
  });
  const savedSettings = useRef("");
  const [justSaved, setJustSaved] = useState(false);

  const { updatePreview, setPreviewVisible, attachPreview } = usePreview();

  useEffect(() => {
    const init = async () => {
      const settings = data.preProcessSettings(await config.loadRawSettings());
      savedSettings.current = JSON.stringify(settings);
      updatePreview(settings, state.previewText, true);
      updateState({ settings });

      const isLoaded = await config.isDataReady();
      if (!isLoaded) {
        const ok = await confirmAndLoadInitialDict("confirmLoadInitialDict", updateState);
        updateState({ initialized: ok, dictDataUsage: -1 });
        return;
      }
      updateState({ initialized: true });
    };
    init();
  }, []);
  useEffect(() => {
    if (!state.initialized) return;
    updatePreview(state.settings, state.previewText, true);
  }, [state.settings, state.previewText]);
  useEffect(() => {
    if (!state.initialized) return;
    pdf.setPdfViewerLinkTarget(state.settings.pdfLinkTarget);
  }, [state.initialized, state.settings.pdfLinkTarget]);

  useEffect(() => {
    if (!state.initialized) return;
    setPreviewVisible(PREVIEW_TABS.includes(state.tab) && !state.jsonEditing);
  }, [state.initialized, state.tab, state.jsonEditing]);

  useEffect(() => {
    history.replaceState(null, "", `#${state.tab}`);
  }, [state.tab]);

  const dirty = state.initialized && JSON.stringify(state.settings) !== savedSettings.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateState = (
    statePatch: Record<string, any> | undefined,
    settingsPatch: Partial<MouseDictionarySettings> | undefined = undefined,
  ): void => {
    dispatch({ type: "patch", statePatch, settingsPatch });
  };

  const save = async (): Promise<void> => {
    if (await saveSettings(state.settings)) {
      savedSettings.current = JSON.stringify(state.settings);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }
  };

  const doFactoryReset = (): void => {
    dispatch({
      type: "replace",
      settings: data.preProcessSettings(defaultSettings.get()),
    });
  };

  const switchLanguage = (): void => {
    const newLang = state.lang === "ja" ? "en" : "ja";
    res.setLang(newLang);
    updateState({ lang: newLang });
  };

  const settingsReady = state.initialized && env.get().enableUserSettings;
  const showPreview = settingsReady && PREVIEW_TABS.includes(state.tab) && !state.jsonEditing;
  const onUpdate = (statePatch: Record<string, any> | undefined, settingsPatch?: Partial<MouseDictionarySettings>) =>
    updateState(statePatch, settingsPatch);

  return (
    <>
      <header className="app-header">
        <ExternalLink href={`https://mouse-dictionary.netlify.app/${state.lang}/`} className="app-brand">
          <img src="../icons/icon48.png" alt="" />
          <span className="app-name">Mouse Dictionary</span>
        </ExternalLink>
        <span className="app-version">v{VERSION}</span>
        <div className="app-header-actions">
          <a className="button button-secondary" href="pdf/web/viewer.html" target="_blank" rel="noopener noreferrer">
            {res.get("openPdfViewer")}
          </a>
          <a
            className="header-link"
            href="https://github.com/wtetsu/mouse-dictionary/wiki"
            target="_blank"
            rel="noreferrer"
          >
            {res.get("help")}
          </a>
          <a className="header-link" href="https://github.com/wtetsu/mouse-dictionary" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <button type="button" className="button-secondary button-small" onClick={switchLanguage}>
            {state.lang === "ja" ? "English" : "日本語"}
          </button>
        </div>
      </header>

      <div className="layout">
        <nav className="side-nav" aria-label="Settings">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-current={state.tab === tab ? "page" : undefined}
              disabled={state.busy || (tab !== "dictionary" && !settingsReady)}
              onClick={() => updateState({ tab })}
            >
              {res.get(TAB_LABELS[tab][0])}
              <span className="nav-desc">{res.get(TAB_LABELS[tab][1])}</span>
            </button>
          ))}
          <div className="nav-links">
            <strong>{res.get("usefulLinks")}</strong>
            <ExternalLink href={Links.windowManipulation}>{res.get("windowManipulation")}</ExternalLink>
            <ExternalLink href={Links.downloadDictData}>{res.get("downloadDictData")}</ExternalLink>
            <ExternalLink href={Links.setKeyboardShortcuts}>{res.get("setKeyboardShortcuts")}</ExternalLink>
          </div>
        </nav>

        <div className={showPreview ? "with-preview" : undefined}>
          <main className="content">
            <h1 className="page-title">{res.get(TAB_LABELS[state.tab][0])}</h1>

            <Panel active={state.tab === "dictionary"}>
              <Card title={res.get("dictUsageTitle")} description={res.get("dictUsageDesc")}>
                {env.get().support.localGetBytesInUse && !state.busy && (
                  <DataUsage
                    byteSize={state.dictDataUsage}
                    onUpdate={(byteSize) => updateState({ dictDataUsage: byteSize })}
                  />
                )}
                {state.progress && <span className="progress-text">{state.progress}</span>}
              </Card>
              <Card title={res.get("loadDictTitle")} description={res.get("loadDictDesc")}>
                <LoadDictionary busy={state.busy} trigger={(e) => loadDictionaryData(e.payload, updateState)} />
              </Card>
              <Card title={res.get("defaultDictTitle")} description={res.get("defaultDictDesc")}>
                <div className="button-row">
                  <Button
                    type="revert"
                    text={res.get("loadInitialDict")}
                    disabled={state.busy}
                    onClick={() => confirmAndLoadInitialDict("confirmReloadInitialDict", updateState)}
                  />
                </div>
              </Card>
            </Panel>

            <Panel active={settingsReady && state.tab === "appearance"}>
              <DisplaySettings settings={state.settings} onUpdate={onUpdate} />
            </Panel>

            <Panel active={settingsReady && state.tab === "translation"}>
              <TranslationSettings settings={state.settings} onUpdate={onUpdate} />
            </Panel>

            <Panel active={settingsReady && state.tab === "pdf"}>
              <PdfSettings settings={state.settings} onUpdate={onUpdate} />
            </Panel>

            <Panel active={settingsReady && state.tab === "advanced"}>
              <AdvancedSettings
                settings={state.settings}
                busy={state.busy}
                onUpdate={onUpdate}
                onOpenJsonEditor={() => updateState({ jsonEditing: true })}
              />
              <Card title={res.get("defaultSettings")}>
                <div className="button-row">
                  <Button
                    type="cancel"
                    text={res.get("defaultSettings")}
                    disabled={state.busy}
                    onClick={doFactoryReset}
                  />
                </div>
              </Card>
            </Panel>
          </main>
          {showPreview && (
            <aside className="preview-column" aria-label={res.get("previewTitle")}>
              <div className="field">
                <label htmlFor="previewText">{res.get("previewText")}</label>
                <input
                  id="previewText"
                  type="text"
                  value={state.previewText}
                  onChange={(e) => updateState({ previewText: e.target.value })}
                />
              </div>
              <p className="hint">{res.get("previewDesc")}</p>
              <div ref={attachPreview} />
            </aside>
          )}
        </div>
      </div>

      <OperationPanel dirty={dirty} justSaved={justSaved} disable={state.busy} onSave={save} />

      <Overlay active={state.jsonEditing}>
        <WholeSettings
          initialValue={state.settings}
          onChange={(newSettings) => updateState({ jsonEditing: false }, newSettings)}
        />
      </Overlay>
    </>
  );
};

const saveSettings = async (rawSettings: MouseDictionarySettings): Promise<boolean> => {
  const settings = data.postProcessSettings(rawSettings);
  try {
    await config.saveSettings(settings);
    return true;
  } catch (e) {
    if (e instanceof Error) {
      message.error(e.toString());
    } else {
      message.error(String(e));
    }
    return false;
  }
};

const confirmAndLoadInitialDict = async (messageId: TextResourceKeys, updateState: UpdateState): Promise<boolean> => {
  const willLoad = await message.notice(res.get(messageId), "okCancel");
  if (!willLoad) {
    return false;
  }

  let finalWordCount: number;
  try {
    updateState({ busy: true, tab: "dictionary" });
    finalWordCount = await dict.registerDefaultDict((count, progress) => {
      const message = res.get("progressRegister", { count, progress });
      updateState({ progress: message });
    });
    updateState({ dictDataUsage: -1 });
  } finally {
    updateState({ busy: false, progress: "" });
  }
  await config.setDataReady(true);
  await message.success(res.get("finishRegister", { count: finalWordCount }));

  return true;
};

const loadDictionaryData = async (dictionaryFile: DictionaryFile, updateState: UpdateState): Promise<void> => {
  const { file, encoding, format } = dictionaryFile;
  if (!file) {
    message.warn(res.get("selectDictFile"));
    return;
  }
  if (encoding === "Shift_JIS" && (await detectFileEncoding(file)) !== "Shift_JIS") {
    const willContinue = await message.warn(res.get("fileMayNotBeShiftJis"), "okCancel");
    if (!willContinue) {
      return;
    }
  }
  try {
    updateState({ busy: true, tab: "dictionary" });
    const count = await dict.load({ file, encoding, format }, (ev) => {
      if (ev.name === "reading") {
        const progress = `${ev.loaded.toLocaleString()} / ${ev.total.toLocaleString()} Byte`;
        updateState({ progress });
      }
      if (ev.name === "loading") {
        const progress = res.get("progressRegister", {
          count: ev.count?.toLocaleString(),
          progress: ev.word.head,
        });
        updateState({ progress });
      }
    });
    message.success(res.get("finishRegister", { count: count?.toLocaleString() }));
    config.setDataReady(true);
  } catch (e) {
    if (e instanceof Error) {
      message.error(e.toString());
    } else {
      message.error(String(e));
    }
  } finally {
    updateState({ busy: false, progress: "", dictDataUsage: -1 });
  }
};
