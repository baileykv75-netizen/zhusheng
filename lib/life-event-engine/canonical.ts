import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export function canonicalizePayload(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalizePayload).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalizePayload(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashPayload(value: unknown): string {
  return bytesToHex(sha256(utf8ToBytes(canonicalizePayload(value))));
}

export function mergeImmutableById<T>(
  previous: readonly T[],
  current: readonly T[],
  getId: (item: T) => string,
  label: string
): T[] {
  const merged = new Map<string, T>();
  for (const item of [...previous, ...current]) {
    const id = getId(item);
    const existing = merged.get(id);
    if (existing && hashPayload(existing) !== hashPayload(item)) {
      throw new Error(`${label} ${id} is immutable; submit a new ID for revised content`);
    }
    if (!existing) merged.set(id, item);
  }
  return [...merged.values()].sort((left, right) => getId(left).localeCompare(getId(right)));
}
