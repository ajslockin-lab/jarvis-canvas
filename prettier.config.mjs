/**
 * Prettier config — easy defaults, tight enough that CI can reject drift.
 *
 * `singleQuote: false` matches the existing cjs in this monorepo (the
 * bulk of files use double quotes). `trailingComma: "es5"` lines up
 * with the package.json files already shipped. `printWidth: 100` is a
 * compromise between the long-form jsx in jarvis-canvas and the JSON
 * locks; 100 fits both comfortably.
 */
export default {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  trailingComma: "es5",
  bracketSpacing: true,
  arrowParens: "always",
};
