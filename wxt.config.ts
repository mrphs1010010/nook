import { defineConfig } from 'wxt';

// https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  outDir: 'output', // not hidden, so it's easy to pick in Chrome's Load unpacked dialog
  modules: ['@wxt-dev/module-react'],
  imports: false,
  // One name for every release, so the website's download link always gets the latest.
  zip: { artifactTemplate: '{{name}}-{{browser}}.zip' },
  dev: {
    // An IP rather than "localhost", which doesn't resolve on every machine.
    server: { host: '127.0.0.1', origin: '127.0.0.1' },
  },
  manifest: {
    name: 'Nook',
    description: 'Notes on your fans, right next to your OnlyFans and Fansly chats. Everything stays in your browser.',
    minimum_chrome_version: '116',
    permissions: ['storage', 'sidePanel', 'clipboardWrite'],
    host_permissions: ['https://onlyfans.com/*', 'https://fansly.com/*'],
    action: { default_title: 'Open Nook' },
  },
});
