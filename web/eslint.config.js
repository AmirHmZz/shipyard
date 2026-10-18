import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

const sharedPatterns = [
  "@/pages/*",
  "@/App",
  "@/routes/*",
  "**/route",
  "**/route.tsx",
  "**/layout",
  "**/layout.tsx",
  "!**/+types/route",
  "!**/+types/layout",
];
const boundaries = (extra = [], paths = []) => [
  "error",
  {
    paths,
    patterns: [
      {
        group: [...sharedPatterns, ...extra],
        message: "Follow the dependency boundaries in web/AGENTS.md.",
      },
    ],
  },
];

export default tseslint.config(
  { ignores: ["src/lib/schema.d.ts"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": boundaries(),
    },
  },
  {
    files: ["src/routes/*/modules/services/**", "src/lib/services/**"],
    rules: {
      "no-restricted-imports": boundaries(
        [
          "react/*",
          "react-router/*",
          "sonner/*",
          "@tanstack/react-query/*",
          "**/hooks",
          "**/hooks/**",
          "**/components",
          "**/components/**",
        ],
        [
          "react",
          "react-router",
          "sonner",
          "@tanstack/react-query",
          "@/lib/api",
        ],
      ),
    },
  },
  {
    files: ["**/hooks/**"],
    rules: {
      "no-restricted-imports": boundaries([
        "**/components",
        "**/components/**",
      ]),
    },
  },
  {
    files: ["**/generics/**", "**/utils/**"],
    rules: {
      "no-restricted-imports": boundaries([
        "**/components",
        "**/components/**",
        "**/hooks",
        "**/hooks/**",
        "**/services",
        "**/services/**",
      ]),
    },
  },
  {
    files: ["src/**/*.tsx"],
    ignores: ["**/services/**", "**/hooks/**"],
    rules: {
      "no-restricted-imports": boundaries(
        [],
        [
          "@/lib/api/client",
          {
            name: "@/lib/api",
            importNames: ["api", "post"],
            message:
              "Components call hooks, not the transport (AGENTS.md rule 11).",
          },
        ],
      ),
    },
  },
);
