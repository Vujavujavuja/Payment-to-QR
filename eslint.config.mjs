import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    // Build output, dependencies, and the Python tree — eslint should not
    // walk any of it.
    ignores: ['.next/**', 'out/**', 'build/**', 'node_modules/**', 'python/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
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
