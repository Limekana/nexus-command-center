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
      // (purity, set-state-in-effect). They fired 25 times on long-standing
      // code when the gate was added, and were switched off wholesale rather
      // than rewritten sight-unseen on a finance app.
      //
      // HYG-4 (v1.11) closed that out by reviewing all 25 individually:
      //
      //   3 were real and are fixed. CrossDomainCard corrected a rotation
      //     index in an effect when deriving it removes both the stale frame
      //     and the extra render. Dashboard and SavingsGoals each memoised a
      //     Date.now() window against deps that don't include time, so the
      //     "last 7 days" count and the deadline-pacing pill both went stale
      //     across a day boundary — a goal that fell behind overnight kept
      //     reporting on pace, which is the one thing that pill is for.
      //
      //   The rest are seeded editable forms, overridable defaults, live
      //     clocks, async kickoffs and deep-link consumption. Each now carries
      //     a scoped disable stating why AT the site, so the reasoning is
      //     where the next reader will be rather than in a config file.
      //
      // Both rules are ON. That is the actual win: the 21 exceptions are
      // pinned and explained, and anything NEW that trips these rules fails
      // the gate instead of joining an invisible backlog.
      'react-hooks/purity': 'error',
      'react-hooks/set-state-in-effect': 'error',
    },
  },
)
