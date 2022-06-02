module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es2021: true,
  },
  extends: [
    'airbnb',
    'airbnb-typescript',
  ],
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  overrides: [
    {
      files: ['*.ts'],
      parserOptions: {
        ecmaVersion: 'latest',
        project: ['./tsconfig.json']
      },
      rules: {
        'no-underscore-dangle': ['error', {'allowAfterThis': true}],
      },
    }
  ],
};
