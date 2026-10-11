import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { parseRuntimeConfig } from './src/config.ts';

export default defineConfig({
  plugins: [{
    name: 'external-activity-config',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.split('?')[0] !== '/runtime-config.json' || !process.env.SKYLINE_ACTIVITY_CONFIG_PATH) return next();
        try {
          const text = await readFile(process.env.SKYLINE_ACTIVITY_CONFIG_PATH, 'utf8');
          const safeConfig = parseRuntimeConfig(JSON.parse(text));
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(safeConfig));
        } catch {
          response.statusCode = 503;
          response.end('{}');
        }
      });
    },
  }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 650 },
});
