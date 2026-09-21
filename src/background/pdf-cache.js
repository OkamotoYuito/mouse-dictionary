/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import storage from "../main/lib/storage";

const IDS_KEY = "**** pdf cache ids ****";
const KEY_PREFIX = "**** pdf cache ****:";
const TTL = 1000 * 60 * 60 * 24;
// ponytail: keep five Base64 entries in chrome.storage.local; use IndexedDB for a larger cache.
const MAX_ENTRIES = 5;

const keyFor = (id) => `${KEY_PREFIX}${id}`;

const getIds = async () => {
  const ids = await storage.local.pick(IDS_KEY);
  return Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
};

const remove = async (id) => {
  const ids = await getIds();
  await storage.local.remove(keyFor(id));
  await storage.local.set({ [IDS_KEY]: ids.filter((cachedId) => cachedId !== id) });
};

const get = async (id) => {
  const entry = await storage.local.pick(keyFor(id));
  if (!entry || typeof entry.data !== "string") {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    await remove(id);
    return null;
  }
  return entry.data;
};

const set = async (id, data) => {
  const now = Date.now();
  const ids = await getIds();
  const stored = await storage.local.get(ids.map(keyFor));
  const validIds = ids.filter((cachedId) => stored[keyFor(cachedId)]?.expiresAt > now);
  const nextIds = [id, ...validIds.filter((cachedId) => cachedId !== id)].slice(0, MAX_ENTRIES);
  const removedIds = ids.filter((cachedId) => !nextIds.includes(cachedId));

  await storage.local.set({
    [keyFor(id)]: { data, expiresAt: now + TTL },
    [IDS_KEY]: nextIds,
  });
  if (removedIds.length >= 1) {
    await storage.local.remove(removedIds.map(keyFor));
  }
};

export default { get, set };
