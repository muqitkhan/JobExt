import { resolve } from 'node:path';
import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  alias: {
    '@': resolve(__dirname, '.'),
  },
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, '.'),
      },
    },
  }),
  manifest: {
    name: 'JobExt',
    description:
      'Tailor your resume to job descriptions using a local LLM. Private, unlimited, open source.',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      96: 'icon/96.png',
      128: 'icon/128.png',
    },
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting', 'tabs', 'downloads'],
    host_permissions: [
      'http://127.0.0.1/*',
      'http://localhost/*',
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://generativelanguage.googleapis.com/*',
      '*://*.linkedin.com/*',
      '*://*.indeed.com/*',
      '*://*.glassdoor.com/*',
      '*://*.ziprecruiter.com/*',
      '<all_urls>',
    ],
    action: {
      default_title: 'Open JobExt',
    },
  },
});
