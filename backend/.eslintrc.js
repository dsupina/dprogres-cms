module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2020: true,
  },
  rules: {
    // Prevent importing .js files in TypeScript
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/*.js'],
            message: 'Do not import .js files in TypeScript source. Use .ts files instead. Compiled .js files in dist/ are generated automatically.',
          },
        ],
        paths: [
          {
            name: '**/*.js',
            message: 'Do not import .js files in TypeScript source. Use .ts files instead.',
          },
        ],
      },
    ],
    // TypeScript-specific rules
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', 'coverage/'],
};
