module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'jsx-a11y'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  env: {
    node: true,
    es2022: true,
    browser: true,
  },
  ignorePatterns: [
    'dist',
    'build',
    'node_modules',
    'coverage',
    '*.config.cjs',
    '*.config.js',
    '*.config.ts',
    '.next',
  ],
};
