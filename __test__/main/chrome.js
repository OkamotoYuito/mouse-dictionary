class Storage {
  constructor() {
    this.data = {};
  }

  get(keys, callback) {
    const result = {};
    for (const key of keys) {
      result[key] = this.data[key];
    }
    callback(result);
  }

  set(items, callback) {
    Object.assign(this.data, items);
    callback();
  }

  remove(keys, callback) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      delete this.data[key];
    }
    callback();
  }
}

class Chrome {
  constructor() {
    this.runtime = {
      lastError: null,
    };
    this.storage = {
      local: new Storage(),
      sync: new Storage(),
    };
  }
}

export default Chrome;
