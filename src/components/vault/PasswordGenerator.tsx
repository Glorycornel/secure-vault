"use client";

import { useMemo, useState } from "react";
import {
  generatePassword,
  type PasswordOptions,
} from "@/lib/utils/passwordGenerator";

type Strength = {
  label: "Weak" | "Medium" | "Strong";
  level: 1 | 2 | 3; // for UI
  hint: string;
};

function strengthOf(password: string, opts: PasswordOptions): Strength {
  // Strength scoring: keep it simple + predictable for UX
  let score = 0;

  // length contribution
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (password.length >= 20) score++;

  // variety contribution (based on what user allowed + actual content)
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (opts.lower && hasLower) score++;
  if (opts.upper && hasUpper) score++;
  if (opts.numbers && hasNumber) score++;
  if (opts.symbols && hasSymbol) score++;

  // Cap and normalize
  if (score <= 3) {
    return {
      label: "Weak",
      level: 1,
      hint: "Increase length and add more character types.",
    };
  }
  if (score <= 6) {
    return {
      label: "Medium",
      level: 2,
      hint: "Good. Consider 16+ chars and symbols for stronger passwords.",
    };
  }
  return {
    label: "Strong",
    level: 3,
    hint: "Great strength for most use-cases.",
  };
}

export default function PasswordGenerator() {
  const [opts, setOpts] = useState<PasswordOptions>({
    length: 16,
    lower: true,
    upper: true,
    numbers: true,
    symbols: false,
  });

  const [value, setValue] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canGenerate = useMemo(
    () => opts.lower || opts.upper || opts.numbers || opts.symbols,
    [opts]
  );

  const lengthOptions = useMemo(() => [8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64], []);

  const strength = useMemo<Strength>(() => {
    if (!value) {
      return {
        label: "Weak",
        level: 1,
        hint: "Generate a password to see strength.",
      };
    }
    return strengthOf(value, opts);
  }, [value, opts]);

  function update<K extends keyof PasswordOptions>(
    key: K,
    val: PasswordOptions[K]
  ) {
    setOpts((p) => ({ ...p, [key]: val }));
  }

  function onGenerate() {
    setCopied(false);
    setError(null);
    try {
      setValue(generatePassword(opts));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate password");
    }
  }

  async function onCopy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Password Generator</h3>
        <button
          className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-2 text-xs font-semibold text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] disabled:opacity-60"
          onClick={onGenerate}
          disabled={!canGenerate}
        >
          Generate
        </button>
      </div>

      <div className="mt-4 space-y-4">
        {/* Length dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-sm text-white/80 w-24">Length</label>
          <select
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none"
            value={opts.length}
            onChange={(e) => update("length", Number(e.target.value))}
          >
            {lengthOptions.map((n) => (
              <option key={n} value={n} className="text-black">
                {n} characters
              </option>
            ))}
          </select>
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-2 text-sm text-white/85">
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <input
              type="checkbox"
              checked={opts.lower}
              onChange={(e) => update("lower", e.target.checked)}
            />
            Lowercase
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <input
              type="checkbox"
              checked={opts.upper}
              onChange={(e) => update("upper", e.target.checked)}
            />
            Uppercase
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <input
              type="checkbox"
              checked={opts.numbers}
              onChange={(e) => update("numbers", e.target.checked)}
            />
            Numbers
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <input
              type="checkbox"
              checked={opts.symbols}
              onChange={(e) => update("symbols", e.target.checked)}
            />
            Symbols
          </label>
        </div>

        {/* Strength indicator (replaces the misleading slider bar) */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-white/85">
              Strength:{" "}
              <span
                className={
                  strength.level === 1
                    ? "text-red-300"
                    : strength.level === 2
                    ? "text-yellow-200"
                    : "text-green-200"
                }
              >
                {strength.label}
              </span>
            </div>
            <div className="text-[11px] text-white/60">{strength.hint}</div>
          </div>

          <div className="mt-2 flex gap-2">
            <div
              className={`h-2 flex-1 rounded-full ${
                strength.level >= 1 ? "bg-white/70" : "bg-white/15"
              }`}
            />
            <div
              className={`h-2 flex-1 rounded-full ${
                strength.level >= 2 ? "bg-white/70" : "bg-white/15"
              }`}
            />
            <div
              className={`h-2 flex-1 rounded-full ${
                strength.level >= 3 ? "bg-white/70" : "bg-white/15"
              }`}
            />
          </div>
        </div>

        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : null}

        {/* Output */}
        <div className="flex gap-2">
          <input
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none"
            value={value}
            readOnly
            placeholder="Generate a password..."
          />
          <button
            className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white disabled:opacity-60 hover:bg-white/15"
            onClick={onCopy}
            disabled={!value}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
