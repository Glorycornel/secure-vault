"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { generatePassword, type PasswordOptions } from "@/lib/utils/passwordGenerator";

type Strength = {
  label: "Weak" | "Medium" | "Strong";
  level: 1 | 2 | 3; // for UI
  hint: string;
};

function strengthOf(password: string, opts: PasswordOptions): Strength {
  const meetsLength = password.length >= 8;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  const typeCount =
    (opts.lower && hasLower ? 1 : 0) +
    (opts.upper && hasUpper ? 1 : 0) +
    (opts.numbers && hasNumber ? 1 : 0) +
    (opts.symbols && hasSymbol ? 1 : 0);

  if (meetsLength && typeCount === 4) {
    return {
      label: "Strong",
      level: 3,
      hint: "All character types selected with 8+ characters.",
    };
  }
  if (meetsLength && typeCount >= 2) {
    return {
      label: "Medium",
      level: 2,
      hint: "Good. Add all character types for strong passwords.",
    };
  }
  return {
    label: "Weak",
    level: 1,
    hint: "Use 8+ characters and more character types.",
  };
}

function strengthFromOptions(opts: PasswordOptions): Strength {
  if (!opts.lower && !opts.upper && !opts.numbers && !opts.symbols) {
    return {
      label: "Weak",
      level: 1,
      hint: "Select at least one character type.",
    };
  }

  const meetsLength = opts.length >= 8;
  const typeCount =
    (opts.lower ? 1 : 0) +
    (opts.upper ? 1 : 0) +
    (opts.numbers ? 1 : 0) +
    (opts.symbols ? 1 : 0);

  if (meetsLength && typeCount === 4) {
    return {
      label: "Strong",
      level: 3,
      hint: "All character types selected with 8+ characters.",
    };
  }
  if (meetsLength && typeCount >= 2) {
    return {
      label: "Medium",
      level: 2,
      hint: "Estimated strength. Add all character types for strong.",
    };
  }
  return {
    label: "Weak",
    level: 1,
    hint: "Estimated strength. Use 8+ characters and more types.",
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
  const [lengthOpen, setLengthOpen] = useState(false);
  const lengthButtonRef = useRef<HTMLButtonElement | null>(null);
  const lengthMenuRef = useRef<HTMLDivElement | null>(null);

  const canGenerate = useMemo(
    () => opts.lower || opts.upper || opts.numbers || opts.symbols,
    [opts]
  );

  const lengthOptions = useMemo(() => [6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64], []);

  const strength = useMemo<Strength>(() => {
    if (!value) {
      return strengthFromOptions(opts);
    }
    return strengthOf(value, opts);
  }, [value, opts]);

  useEffect(() => {
    if (!lengthOpen) return;

    function onDocClick(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (lengthButtonRef.current?.contains(target)) return;
      if (lengthMenuRef.current?.contains(target)) return;
      setLengthOpen(false);
    }

    function onDocKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLengthOpen(false);
    }

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onDocKey);
    };
  }, [lengthOpen]);

  function update<K extends keyof PasswordOptions>(key: K, val: PasswordOptions[K]) {
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
          <label className="w-24 text-sm text-white/80">Length</label>
          <div className="relative w-full">
            <button
              ref={lengthButtonRef}
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-white/20 bg-purple-500/15 px-3 py-2 text-sm text-white outline-none"
              onClick={() => setLengthOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={lengthOpen}
            >
              <span>{opts.length} characters</span>
              <span className="text-white/60" aria-hidden="true">
                ▾
              </span>
            </button>
            {lengthOpen ? (
              <div
                ref={lengthMenuRef}
                className="absolute left-0 top-full z-20 mt-2 w-full rounded-xl border border-white/20 bg-purple-950/80 p-1 text-sm text-white shadow-lg backdrop-blur"
                role="listbox"
                aria-label="Password length"
              >
                {lengthOptions.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="option"
                    aria-selected={opts.length === n}
                    className={`flex w-full items-center rounded-lg px-3 py-2 text-left hover:bg-white/10 ${
                      opts.length === n ? "bg-white/10 text-white" : "text-white/80"
                    }`}
                    onClick={() => {
                      update("length", n);
                      setLengthOpen(false);
                    }}
                  >
                    {n} characters
                  </button>
                ))}
              </div>
            ) : null}
          </div>
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

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {/* Output */}
        <div className="flex gap-2">
          <input
            className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white outline-none"
            value={value}
            readOnly
            placeholder="Generate a password..."
          />
          <button
            className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 disabled:opacity-60"
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
