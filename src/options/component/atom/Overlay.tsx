/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

type Props = {
  active: boolean;
  children?: React.ReactNode;
};

export const Overlay: React.FC<Props> = (props) => {
  if (!props.active) {
    return <></>;
  }
  return <div className="overlay">{props.children}</div>;
};
