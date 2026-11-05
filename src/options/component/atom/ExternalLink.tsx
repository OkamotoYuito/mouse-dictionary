/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

type Props = {
  href: string;
  className?: string;
  icon?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export const ExternalLink: React.FC<Props> = (props) => {
  return (
    <a href={props.href} target="_blank" rel="noopener noreferrer" className={props.className} style={props.style}>
      {props.children}
      {props.icon && <img src="img/external.png" width="12" height="12" style={{ marginLeft: 2 }} />}
    </a>
  );
};
