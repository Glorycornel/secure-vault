import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import "fake-indexeddb/auto";

const g = globalThis as typeof globalThis & Record<string, unknown>;

if (!g.crypto) {
  g.crypto = webcrypto as unknown as Crypto;
}
g.IS_REACT_ACT_ENVIRONMENT = true;

if (!g.TextEncoder) {
  g.TextEncoder = TextEncoder as unknown;
  g.TextDecoder = TextDecoder as unknown;
}

if (!g.atob) {
  g.atob = (value: string) => Buffer.from(value, "base64").toString("binary");
}

if (!g.btoa) {
  g.btoa = (value: string) => Buffer.from(value, "binary").toString("base64");
}

if (typeof g.structuredClone !== "function") {
  // Best-effort fallback for environments without structuredClone (tests only).
  const fallbackClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  g.structuredClone = fallbackClone;
  if (typeof global !== "undefined") {
    global.structuredClone = fallbackClone;
  }
}
