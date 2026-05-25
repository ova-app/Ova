module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-native', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'react-native/no-unused-styles': 'off',
    'react-native/no-inline-styles': 'warn',
    'react/prop-types': 'off',
    'react/no-unescaped-entities': 'warn',
    'no-empty': 'warn',
    'no-constant-condition': 'warn',
  },
  env: {
    'react-native/react-native': true,
  },
  ignorePatterns: ['node_modules/', '.expo/', 'dist/'],
}
