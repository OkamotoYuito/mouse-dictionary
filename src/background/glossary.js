import rule from "../main/core/rule";
import storage from "../main/lib/storage";
import { createMatcher, formsOf, RECORDED_WORDS_KEY } from "../pdf-viewer/recorded-words";

export const ASTRONOMY_CONTEXT = "天文学（電波天文学・星間物理学・星形成）の論文の一節。";

// Standard Japanese for terms PLaMo tends to translate in their everyday sense ("source" as 供給源,
// "outflow" as 流出, "efficiency" as 効率). Only the terms that appear in a paragraph are sent with it.
export const ASTRONOMY_TERMS = [
  ["source", "天体"],
  ["radio source", "電波源"],
  ["outflow", "アウトフロー"],
  ["molecular outflow", "分子流"],
  ["jet", "ジェット"],
  ["clump", "クランプ"],
  ["core", "コア"],
  ["dense core", "高密度コア"],
  ["filament", "フィラメント"],
  ["envelope", "エンベロープ"],
  ["protostar", "原始星"],
  ["young stellar object", "若い恒星状天体（YSO）"],
  ["massive star", "大質量星"],
  ["low-mass star", "小質量星"],
  ["main sequence", "主系列"],
  ["molecular cloud", "分子雲"],
  ["giant molecular cloud", "巨大分子雲"],
  ["HII region", "HII領域"],
  ["H II region", "HII領域"],
  ["photodissociation region", "光解離領域"],
  ["supernova remnant", "超新星残骸"],
  ["supernova", "超新星"],
  ["stellar wind", "恒星風"],
  ["feedback", "フィードバック"],
  ["shock", "衝撃波"],
  ["turbulence", "乱流"],
  ["magnetic field", "磁場"],
  ["cosmic ray", "宇宙線"],
  ["interstellar medium", "星間物質"],
  ["star formation", "星形成"],
  ["star formation rate", "星形成率"],
  ["star formation efficiency", "星形成効率"],
  ["initial mass function", "初期質量関数"],
  ["gravitational collapse", "重力収縮"],
  ["free-fall time", "自由落下時間"],
  ["Jeans mass", "ジーンズ質量"],
  ["virial parameter", "ビリアルパラメータ"],
  ["virial equilibrium", "ビリアル平衡"],
  ["protoplanetary disk", "原始惑星系円盤"],
  ["circumstellar disk", "星周円盤"],
  ["accretion disk", "降着円盤"],
  ["hot core", "ホットコア"],
  ["hot corino", "ホットコリノ"],
  ["complex organic molecule", "複雑な有機分子"],
  ["isotopologue", "同位体置換種"],
  ["abundance", "存在度"],
  ["critical density", "臨界密度"],
  ["column density", "柱密度"],
  ["number density", "個数密度"],
  ["volume density", "体積密度"],
  ["optical depth", "光学的厚み"],
  ["optically thin", "光学的に薄い"],
  ["optically thick", "光学的に厚い"],
  ["excitation temperature", "励起温度"],
  ["kinetic temperature", "運動温度"],
  ["brightness temperature", "輝度温度"],
  ["antenna temperature", "アンテナ温度"],
  ["local thermodynamic equilibrium", "局所熱力学平衡"],
  ["main beam efficiency", "主ビーム能率"],
  ["beam size", "ビームサイズ"],
  ["synthesized beam", "合成ビーム"],
  ["emission line", "輝線"],
  ["absorption line", "吸収線"],
  ["spectral line", "スペクトル線"],
  ["recombination line", "再結合線"],
  ["line width", "線幅"],
  ["linewidth", "線幅"],
  ["velocity dispersion", "速度分散"],
  ["velocity resolution", "速度分解能"],
  ["angular resolution", "角度分解能"],
  ["systemic velocity", "系の速度"],
  ["local standard of rest", "局所静止基準（LSR）"],
  ["line of sight", "視線方向"],
  ["integrated intensity", "積分強度"],
  ["moment map", "モーメントマップ"],
  ["channel map", "チャンネルマップ"],
  ["position-velocity diagram", "位置-速度図"],
  ["signal-to-noise ratio", "信号対雑音比"],
  ["rms noise", "rms雑音"],
  ["flux density", "フラックス密度"],
  ["luminosity", "光度"],
  ["solar mass", "太陽質量"],
  ["dust continuum", "ダスト連続波"],
  ["continuum emission", "連続波放射"],
  ["free-free emission", "自由-自由放射"],
  ["synchrotron radiation", "シンクロトロン放射"],
  ["thermal emission", "熱放射"],
  ["maser", "メーザー"],
  ["gas-to-dust ratio", "ガス・ダスト比"],
  ["conversion factor", "変換係数"],
  ["radio telescope", "電波望遠鏡"],
  ["single-dish", "単一鏡"],
  ["interferometer", "干渉計"],
  ["on-the-fly", "オンザフライ（OTF）"],
  ["Galactic center", "銀河系中心"],
  ["Galactic plane", "銀河面"],
  ["spiral arm", "渦状腕"],
  ["Milky Way", "天の川銀河"],
  ["redshift", "赤方偏移"],
  ["redshifted", "赤方偏移した"],
  ["blueshifted", "青方偏移した"],
  ["extinction", "減光"],
  ["reddening", "赤化"],
];

const MAX_TERMS = 40;
const MAX_TARGET_LENGTH = 40;

// The first sense of a dictionary or user-written meaning, e.g. "『避けがたい』,免れられない" -> "避けがたい".
export const firstSense = (meaning) =>
  (meaning ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split(/\r?\n|\\n| \/ /)[0]
    .split(/[,;、；]/)[0]
    .replace(/〈[^〉]*〉|《[^》]*》|\{[^}]*\}|[『』]/g, "")
    .replace(/^\s*[(（][^)）]*[)）]/, "")
    .trim();

const usable = (term) => term.source.trim() && term.target && term.target.length <= MAX_TARGET_LENGTH;

// Builds a function that picks the glossary entries for a paragraph: the user's own meanings first,
// then the astronomy terms, then the dictionary meanings of recorded words.
export const createGlossary = async ({ astronomy = true, recordedWords = true } = {}) => {
  const terms = new Map();
  const add = (source, target, priority) => {
    const key = source.toLowerCase();
    if (!terms.has(key) || terms.get(key).priority > priority) terms.set(key, { source, target, priority });
  };
  if (astronomy) {
    for (const [source, target] of ASTRONOMY_TERMS) add(source, target, 1);
  }
  if (recordedWords) {
    const words = Object.keys((await storage.local.pick(RECORDED_WORDS_KEY)) ?? {});
    const customKeys = words.map((word) => `**** custom word ****:${word}`);
    const meanings = words.length ? await storage.local.get([...words, ...customKeys]) : {};
    for (const word of words) {
      const custom = meanings[`**** custom word ****:${word}`];
      const target = firstSense(custom || meanings[word]);
      if (target) add(word, target, custom ? 0 : 2);
    }
  }
  if (!terms.size) return () => [];

  await rule.load();
  const matcher = createMatcher([...terms.keys()], (word) => formsOf(word, rule.doBase));
  return (text) => {
    const found = new Set(matcher.find(text).map(({ word }) => word));
    return [...found]
      .map((key) => terms.get(key))
      .filter(usable)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, MAX_TERMS)
      .map(({ source, target }) => ({ source, target }));
  };
};
