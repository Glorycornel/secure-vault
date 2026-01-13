export type PasswordOptions = {
  length: number;
  lower: boolean;
  upper: boolean;
  numbers: boolean;
  symbols: boolean;
};

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NUM = "0123456789";
const SYM = "!@#$%^&*()-_=+[]{};:,.<>?/|~";

function pickRandomChar(chars: string) {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return chars[arr[0] % chars.length];
}

export function generatePassword(opts: PasswordOptions) {
  const pools: string[] = [];
  if (opts.lower) pools.push(LOWER);
  if (opts.upper) pools.push(UPPER);
  if (opts.numbers) pools.push(NUM);
  if (opts.symbols) pools.push(SYM);

  if (pools.length === 0) {
    throw new Error("Select at least one character set.");
  }
  if (opts.length < pools.length) {
    throw new Error(`Length must be at least ${pools.length}.`);
  }

  // Ensure at least 1 char from each selected pool
  const result: string[] = pools.map((p) => pickRandomChar(p));

  // Fill remaining from combined pool
  const all = pools.join("");
  for (let i = result.length; i < opts.length; i++) {
    result.push(pickRandomChar(all));
  }

  // Shuffle (Fisher-Yates with crypto randomness)
  for (let i = result.length - 1; i > 0; i--) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join("");
}
