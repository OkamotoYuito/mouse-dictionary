/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

type Props = {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
};

export const Card: React.FC<Props> = (props) => {
  return (
    <section className="card">
      <header className="card-header">
        <h2>{props.title}</h2>
        {props.description && <p>{props.description}</p>}
      </header>
      <div className="card-body">{props.children}</div>
    </section>
  );
};

type SwitchRowProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

// A labeled on/off switch spanning the card's width.
export const SwitchRow: React.FC<SwitchRowProps> = (props) => {
  return (
    <label className="switch-row">
      <span className="switch-text">
        <span className="switch-title">{props.title}</span>
        {props.description && <span className="hint">{props.description}</span>}
      </span>
      <input
        type="checkbox"
        className="switch"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
      />
    </label>
  );
};
