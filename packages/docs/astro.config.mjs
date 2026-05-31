// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeSix from '@six-tech/starlight-theme-six';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Mage',
			description: 'BCA AI coding assistant for the terminal — powered by GAIA',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/anomalyco/opencode' },
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'index' },
						{ label: 'Installation', slug: 'guides/installation' },
						{ label: 'Quickstart', slug: 'guides/quickstart' },
					],
				},
				{
					label: 'Configuration',
					items: [
						{ label: 'Settings', slug: 'guides/settings' },
						{ label: 'Providers & Models', slug: 'guides/providers' },
						{ label: 'Custom Instructions', slug: 'guides/custom-instructions' },
					],
				},
				{
					label: 'IDE Integration',
					items: [
						{ label: 'VS Code', slug: 'ai-tools/vscode' },
						{ label: 'Cursor', slug: 'ai-tools/cursor' },
						{ label: 'Zed', slug: 'ai-tools/zed' },
					],
				},
				{
					label: 'Desktop App',
					items: [
						{ label: 'Overview', slug: 'desktop/overview' },
						{ label: 'Building', slug: 'desktop/building' },
					],
				},
				{
					label: 'Reference',
					autogenerate: { directory: 'reference' },
				},
			],
			plugins: [
				starlightThemeSix({
					navLinks: [
						{ label: 'Docs', link: '/' },
					],
					footerText: 'Built by [BCA](https://bca.co.id).',
				}),
			],
		}),
	],
});
