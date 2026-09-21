/**
 * Mouse Dictionary (https://github.com/wtetsu/mouse-dictionary/)
 * Copyright 2018-present wtetsu
 * Licensed under MIT
 */

import storage from "../main/lib/storage";

const IDS_KEY = "**** pdf cache ids ****";
const KEY_PREFIX = "**** pdf cache ****:";
const TTL = 1000 * 60 * 60 * 24 * 7;

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

const readEntries = async () => {
  const ids = await getIds();
  if (ids.length === 0) {
    return [];
  }

  const now = Date.now();
  const stored = await storage.local.get(ids.map(keyFor));
  const valid = [];
  const stale = [];

  for (const id of ids) {
    const entry = stored[keyFor(id)];
    if (entry?.data && typeof entry.data === "string" && entry.expiresAt > now) {
      valid.push({ id, entry });
    } else {
      stale.push(id);
    }
  }

  if (stale.length > 0) {
    await storage.local.remove(stale.map(keyFor));
    await storage.local.set({ [IDS_KEY]: valid.map(({ id }) => id) });
  }

  return valid;
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
  const now = Date.now();
  await storage.local.set({
    [keyFor(id)]: {
      ...entry,
      lastAccessAt: now,
      expiresAt: now + TTL,
    },
  });
  return entry.data;
};

const findByData = async (data) => {
  const entries = await readEntries();
  const match = entries.find(({ entry }) => entry.data === data);
  if (!match) {
    return null;
  }
  await get(match.id);
  return match.id;
};

const set = async (id, data, metadata = {}) => {
  const now = Date.now();
  const entries = await readEntries();
  const current = entries.find((item) => item.id === id)?.entry;
  const nextIds = [id, ...entries.map(({ id: cachedId }) => cachedId).filter((cachedId) => cachedId !== id)];

  await storage.local.set({
    [keyFor(id)]: {
      data,
      sourceUrl: metadata.sourceUrl ?? current?.sourceUrl ?? "",
      title: metadata.title ?? current?.title ?? "",
      createdAt: current?.createdAt ?? now,
      lastAccessAt: now,
      expiresAt: now + TTL,
    },
    [IDS_KEY]: nextIds,
  });
};

const list = async () => {
  const entries = await readEntries();
  return entries
    .map(({ id, entry }) => ({
      id,
      sourceUrl: entry.sourceUrl ?? "",
      title: entry.title ?? "",
      createdAt: entry.createdAt ?? 0,
      lastAccessAt: entry.lastAccessAt ?? entry.createdAt ?? 0,
      expiresAt: entry.expiresAt,
    }))
    .sort((a, b) => b.lastAccessAt - a.lastAccessAt);
};

const clear = async () => {
  const ids = await getIds();
  if (ids.length > 0) {
    await storage.local.remove(ids.map(keyFor));
  }
  await storage.local.set({ [IDS_KEY]: [] });
};

export default { get, set, findByData, list, remove, clear, cleanup: list };
