import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

export default defineConfig([
  // ✅ Ignore generated & build artifacts (ESLint v9 flat config)
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // ✅ PWA / Workbox generated files
    "public/sw.js",
    "public/workbox-*.js",
    "public/icons/**",
  ]),

  ...nextVitals,
  ...nextTs,

  // ⬅️ disables conflicting ESLint rules
  prettier,
]);
