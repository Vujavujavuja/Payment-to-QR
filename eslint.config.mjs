import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

// eslint-config-next 16 ships native flat config. Routing it through
// FlatCompat — the eslintrc bridge the 15.x setup needed — makes the
// validator walk a self-referential plugin object and die with
// "Converting circular structure to JSON". These are imported directly.
const config = [
  {
    // Build output, dependencies, and the Python tree — eslint should not
    // walk any of it.
    ignores: ['.next/**', 'out/**', 'build/**', 'node_modules/**', 'python/**', 'next-env.d.ts'],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      // The QR code and the slip preview are a data: URL and a blob: URL.
      // next/image cannot optimise either, so the rule only ever fires as a
      // false positive here — but it stays on so a real <img> is still caught.
      // Suppressions live at the call site with a reason.

      // An unused parameter prefixed with _ is a deliberate signature filler.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
    linterOptions: {
      // A suppression for a rule that can no longer fire is worse than no
      // suppression: it documents a constraint that has stopped existing.
      // This repo shipped two such comments for months while no linter ran.
      reportUnusedDisableDirectives: 'error',
    },
  },
];

export default config;
