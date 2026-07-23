import apiClient from "./client";

// Small in-memory cache for navigation data. It deduplicates requests already
// in flight and keeps a just-visited event from being fetched again on click.
// Seat-map data deliberately has a very short lifetime because availability is
// live inventory and checkout remains the final authority.
const entries = new Map();

export const cachedGet = (url, maxAgeMs = 30_000) => {
  const now = Date.now();
  const existing = entries.get(url);
  if (existing && now - existing.createdAt < maxAgeMs) return existing.promise;

  const promise = apiClient.get(url).catch((error) => {
    if (entries.get(url)?.promise === promise) entries.delete(url);
    throw error;
  });
  entries.set(url, { createdAt: now, promise });
  return promise;
};

export const prefetch = (url, maxAgeMs) => {
  cachedGet(url, maxAgeMs).catch(() => {});
};
