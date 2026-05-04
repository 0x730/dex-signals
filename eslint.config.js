module.exports = [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'lib/**',
      'build/**',
      'generated/**',
      'typechain-types/**',
      '.graphclient/**',
      'snap/**',
      'logs/**',
      'src/client/build/**',
    ],
  },
  {
    files: ['**/*.js'],
    ignores: ['src/client/src/**', 'research/**', 'archive/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {},
  },
  {
    files: ['src/client/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
      },
    },
    rules: {},
  },
];
