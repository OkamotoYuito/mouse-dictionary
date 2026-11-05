/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

// British spellings whose American form no pattern below produces.
const IRREGULAR = new Map([
  ["aluminium", "aluminum"],
  ["sulphur", "sulfur"],
  ["sulphate", "sulfate"],
  ["sulphide", "sulfide"],
  ["grey", "gray"],
  ["programme", "program"],
  ["programmes", "programs"],
  ["artefact", "artifact"],
  ["artefacts", "artifacts"],
  ["ageing", "aging"],
  ["judgement", "judgment"],
  ["acknowledgement", "acknowledgment"],
  ["acknowledgements", "acknowledgments"],
  ["manoeuvre", "maneuver"],
  ["plough", "plow"],
  ["mould", "mold"],
  ["sceptical", "skeptical"],
  ["tyre", "tire"],
  ["focussed", "focused"],
  ["focussing", "focusing"],
]);

// Words that only look British: "hour" is not "hor", "four" is not "for".
const NOT_BRITISH = new Set([
  "hour",
  "four",
  "pour",
  "tour",
  "your",
  "flour",
  "sour",
  "dour",
  "devour",
  "scour",
  "our",
]);

const PATTERNS = [
  // colour, behaviour, favourable, neighbouring -> color, behavior, favorable, neighboring
  [/^(.{2,})our(s|ed|ing|able|ably|ite|ites|ful|less|er|ers|ist|ists)?$/, "$1or$2"],
  // ionisation, characterise, organised -> ionization, characterize, organized
  [/^(.{2,})isation(s)?$/, "$1ization$2"],
  [/^(.{3,})is(e|es|ed|ing|er|ers)$/, "$1iz$2"],
  // analyse, catalysed -> analyze, catalyzed
  [/^(.+)ys(e|es|ed|ing|er|ers)$/, "$1yz$2"],
  // centre, metres, fibres, centred -> center, meters, fibers, centered
  [/^(.+[tb])re(s)?$/, "$1er$2"],
  [/^(.+[tb])red$/, "$1ered"],
  // catalogue, analogues -> catalog, analogs
  [/^(.+)ogue(s)?$/, "$1og$2"],
  // modelled, labelling, travelled, cancelled -> modeled, labeling, traveled, canceled.
  // At least two letters before the vowel keeps "filled" and "called" as they are.
  [/^(.{2,}[aeiou])ll(ed|ing|er|ers)$/, "$1l$2"],
  // defence, licence, offence -> defense, license, offense
  [/^(def|lic|off|pret)ence(s)?$/, "$1ense$2"],
  // haemoglobin, anaemia, palaeontology, oestrogen, foetus -> hemoglobin, anemia, paleontology, estrogen, fetus
  [
    /^(.*)(haem|anaem|leukaem|palae|encyclopaed|orthopaed|paediatr|oestr|foet)(.*)$/,
    (_, a, b, c) => a + b.replace(/ae|oe/, "e") + c,
  ],
];

// The American spelling of a British one ("colour" -> "color"), or null when there is nothing to change.
// It only adds a lookup candidate, so a pattern that misfires produces a non-word that matches nothing.
export const americanize = (word) => {
  // "Colour" at the start of a sentence becomes "Color"; all-capital words are left alone.
  const lower = word?.toLowerCase();
  if (!lower || lower.length < 4 || NOT_BRITISH.has(lower) || (word !== lower && word === word.toUpperCase())) {
    return null;
  }
  const converted = convert(lower);
  if (!converted) return null;
  return word === lower ? converted : converted[0].toUpperCase() + converted.slice(1);
};

const convert = (word) => {
  const irregular = IRREGULAR.get(word);
  if (irregular) return irregular;
  for (const [pattern, replacement] of PATTERNS) {
    if (pattern.test(word)) {
      const converted = word.replace(pattern, replacement);
      if (converted !== word) return converted;
    }
  }
  return null;
};
