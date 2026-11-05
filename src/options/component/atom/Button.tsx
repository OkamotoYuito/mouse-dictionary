/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import type { MouseEventHandler } from "react";

type Props = {
  text: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  type: "primary" | "cancel" | "revert" | "json";
  disabled?: boolean;
};

const CLASS = {
  primary: "",
  cancel: "button-danger",
  revert: "button-secondary",
  json: "button-secondary",
};

export const Button: React.FC<Props> = (props) => {
  return (
    <button type="button" className={CLASS[props.type]} disabled={props.disabled} onClick={props.onClick}>
      {props.text}
    </button>
  );
};
