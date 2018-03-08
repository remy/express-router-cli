module.exports = {
  plugins: ['node'],
  extends: ['eslint:recommended', 'plugin:node/recommended'],
  parser: 'babel-eslint',
  rules: {
    'node/exports-style': ['error', 'module.exports'],
    'no-console': 0, // disable this check
  },
};
