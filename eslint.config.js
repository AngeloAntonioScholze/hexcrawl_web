import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  { ignores: ['dist/**', 'coverage/**'] },

  js.configs.recommended,
  ts.configs.recommended,
  vue.configs['flat/recommended'],

  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      // The engine layer builds objects Babylon reads back later; a bound name
      // that is only ever written is still how those APIs are used.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },

  // Last, so it can switch off everything the formatter already decides.
  prettier,
)
