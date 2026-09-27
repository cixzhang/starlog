import noHardcodedColors from './eslint-rules/no-hardcoded-colors.js';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      'starlog': noHardcodedColors,
    },
    rules: {
      'starlog/no-hardcoded-colors': 'error',
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
  },
];
