import { webcrypto } from "node:crypto";

// Make Web Crypto available in tests (Node)
(globalThis as any).crypto = webcrypto;
