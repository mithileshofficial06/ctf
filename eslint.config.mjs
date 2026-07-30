import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  /**
   * Server-only content must never reach the client bundle.
   *
   * `*.server.ts` modules hold CTF flags and hints. React components are where
   * a `"use client"` directive turns an innocent-looking import into a shipped
   * secret, so the rule is scoped to component files — route handlers and
   * scripts are `.ts` and legitimately need the flags.
   *
   * This is a lint rule rather than a comment on purpose: a rule a machine
   * checks outlives the person who remembers it.
   */
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/*.server", "**/*.server.ts", "@/lib/**/*.server"],
              message:
                "Server-only module (holds CTF flags/hints). Importing it from a component risks shipping the answers in the client bundle. Fetch what you need through an API route instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
