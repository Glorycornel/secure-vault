"use client";

import { useMemo, useState } from "react";
import { generatePassword, type PasswordOptions } from "@/lib/utils/passwordGenerator";

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
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Password Generator</h3>
        <button
          className="rounded-md bg-black px-3 py-2 text-xs text-white disabled:opacity-60"
          onClick={onGenerate}
          disabled={!canGenerate}
        >
          Generate
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm w-20">Length</label>
          <input
            className="w-full"
            type="range"
            min={8}
            max={64}
            value={opts.length}
            onChange={(e) => update("length", Number(e.target.value))}
          />
          <span className="text-sm w-10 text-right">{opts.length}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={opts.lower}
              onChange={(e) => update("lower", e.target.checked)}
            />
            Lowercase
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={opts.upper}
              onChange={(e) => update("upper", e.target.checked)}
            />
            Uppercase
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={opts.numbers}
              onChange={(e) => update("numbers", e.target.checked)}
            />
            Numbers
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={opts.symbols}
              onChange={(e) => update("symbols", e.target.checked)}
            />
            Symbols
          </label>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2">
          <input
            className="w-full rounded-md border px-3 py-2 text-sm"
            value={value}
            readOnly
            placeholder="Generate a password..."
          />
          <button className="rounded-md border px-3 py-2 text-sm" onClick={onCopy} disabled={!value}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
