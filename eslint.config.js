import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'static/',
			'node_modules/',
			'playwright-report/',
			'test-results/',
			'coverage/',
			'e2e/.data/',
			// Working copies of the review subagents; otherwise ESLint checks the repo twice.
			'.claude/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: ts.parser, svelteConfig }
		}
	},
	{
		rules: {
			// The app uses no base-path configuration; plain hrefs are correct here.
			'svelte/no-navigation-without-resolve': 'off',
			// Underscore convention: _ marks a deliberately unused parameter.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }
			]
		}
	}
);
