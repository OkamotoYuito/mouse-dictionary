/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import { useEffect } from "react";
import { config, storage } from "../../extern";
import { res } from "../../logic";

type Props = {
  byteSize: number | undefined;
  onUpdate: (byteSize: number) => void;
};

export const DataUsage: React.FC<Props> = (props) => {
  useEffect(() => {
    const updateSize = async () => {
      if (props.byteSize === undefined) {
        const newSize = (await config.getBytesInUse()) ?? -1;
        props.onUpdate(newSize);
      }
      if (props.byteSize === -1) {
        const pSize = storage.local.getBytesInUse();
        // Waits at least 500 ms in order to show off doing something :-)
        await Promise.all([pSize, wait(500)]);
        const newSize = (await pSize) ?? 0;
        config.setBytesInUse(newSize);
        props.onUpdate(newSize);
      }
    };
    updateSize();
  }, [props.byteSize]);

  const loading = props.byteSize === undefined || props.byteSize === -1;
  const size = loading ? "" : Math.floor((props.byteSize as number) / 1024).toLocaleString();
  return (
    <button
      type="button"
      className="stat button-reset"
      title={res.get("dictUsageDesc")}
      onClick={() => props.onUpdate(-1)}
    >
      {loading ? (
        <img src="img/loading.gif" width="16" height="16" alt="" />
      ) : (
        <span className="stat-value">{res.get("dictDataUsage", { size })}</span>
      )}
    </button>
  );
};

const wait = (time: number): Promise<void> =>
  new Promise((done) => {
    setTimeout(() => {
      done();
    }, time);
  });
