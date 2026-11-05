/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { produce } from "immer";
import type { MouseDictionarySettings, UpdateEventHandler } from "../../types";

// Passes a settings patch on, turning NaN and negative numbers from cleared or mistyped inputs into 0.
export const makeUpdate =
  (onUpdate: UpdateEventHandler) =>
  (patch: Partial<MouseDictionarySettings>): void => {
    const newPatch = produce(patch, (d) => {
      for (const name of Object.keys(patch)) {
        const value = patch[name];
        if (Number.isNaN(value) || (Number.isInteger(value) && value < 0)) {
          d[name] = 0;
        }
      }
    });
    onUpdate(undefined, newPatch);
  };
