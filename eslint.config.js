import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

// HYG-2 — NCC previously had no lint gate at all (tsc + vite build was the
// only check), while LimeLog and StudyDesk both lint at --max-warnings 0.
// That asymmetry is why react-refresh/only-export-components fired
// repeatedly in those two apps during v1.8/v1.9 and never here — nothing
// was watching. Modelled on StudyDesk's flat config (same ESLint major,
// same plugin choices) with typescript-eslint added for NCC's TS-only
// codebase, rather than LimeLog's older ESLint 8 .eslintrc.cjs setup.

export default tseslint.config(
  { ignores: ['dist', 'android', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      // Matches LimeLog's convention (the other TS app in the suite) —
      // an unused var/arg prefixed with _ is a deliberate placeholder,
      // not dead code. caughtErrorsIgnorePattern is separate from
      // varsIgnorePattern/argsIgnorePattern in typescript-eslint — without
      // it, the `catch (_) { /* ... */ }` idiom used throughout
      // weeklyNotification.ts (and elsewhere) still gets flagged even
      // though it follows the same underscore convention.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // TS already enforces this at compile time via tsc -b in the build
      // script; duplicating it here just fights valid patterns (e.g.
      // Zustand's `create<T>()(...)` generic-inference idiom used
      // throughout every store in this app).
      '@typescript-eslint/no-explicit-any': 'off',
      // Matches StudyDesk's convention exactly — empty catch is a
      // deliberate idiom throughout (best-effort localStorage / Preferences
      // / cross-store fallback reads that are fine to swallow silently).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // react-hooks@7 folded in two new React-Compiler-oriented rules
      // (purity, set-state-in-effect) that fire ~24 times across
      // long-standing, ordinary "sync local state from a prop/store/URL
      // param" effects — none are correctness bugs, all predate this
      // plugin major. Rewriting ~20 files' worth of effects to satisfy a
      // compiler NCC doesn't use is a real-risk refactor on a finance app
      // and out of scope for "add a lint gate." Off for now, matching the
      // spirit of StudyDesk's own react-hooks/static-components downgrade
      // for the same plugin major — tracked as a follow-up (see
      // Nexus_Version_Status.md, new HYG candidate) rather than silently
      // dropped. (Note: 'warn' would still fail --max-warnings 0, so this
      // has to be 'off', not 'warn', to actually be non-blocking.)
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
)
