import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { apiMiddleware } from './server/api.js';
import { siteData } from './scripts/site-data.js';
import { readSiteConfig } from './scripts/site-config.js';

// Local editor: mount the data API on the Vite server so a single command runs everything
const travelApi = () => ({
  name: 'travel-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware());
  },
  configurePreviewServer(server) {
    server.middlewares.use(apiMiddleware());
  },
});

const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// --mode static: the read-only static site, built into site/ and published by npm run deploy
export default defineConfig(({ mode }) => {
  const isSite = mode === 'static';
  // the site title comes from data/site.json (personal settings, not part of the code repository)
  const { title } = readSiteConfig();
  return {
    base: isSite ? './' : '/',
    define: { __SITE_TITLE__: JSON.stringify(title) },
    plugins: [
      react(),
      isSite ? siteData() : travelApi(),
      {
        name: 'site-title',
        transformIndexHtml: (html) => html.replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`),
      },
    ],
    server: {
      open: true,
      watch: { ignored: ['**/data/**', '**/.deploy/**', '**/site/**'] },
    },
    build: {
      outDir: isSite ? 'site' : 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 3000,
    },
  };
});
