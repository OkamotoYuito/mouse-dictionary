/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { res } from "../../logic";
import { Button } from "../atom/Button";

type Props = {
  dirty: boolean;
  justSaved: boolean;
  disable: boolean;
  onSave: () => void;
};

// Floats at the bottom of the page while there is something to save, or briefly after saving.
export const OperationPanel: React.FC<Props> = (props) => {
  if (!props.dirty && !props.justSaved) {
    return null;
  }
  return (
    <div className="save-bar" role="status">
      <span className={`save-state ${props.dirty ? "dirty" : "saved"}`}>
        {props.dirty ? res.get("unsavedChanges") : res.get("finishSaving")}
      </span>
      <Button
        type="primary"
        text={res.get("saveSettings")}
        disabled={props.disable || !props.dirty}
        onClick={props.onSave}
      />
    </div>
  );
};
