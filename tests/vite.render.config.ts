/**
 * EduMate — Bundle de test de rendu.
 *
 * Compile l'application React en un seul fichier IIFE (`dist-test/render.js`)
 * qui peut être injecté dans un DOM simulé (jsdom). Cela permet de vérifier
 * que les pages se montent réellement et affichent leur contenu — sans
 * navigateur — en plus des tests API et unitaires.
 *
 * Les feuilles de style sont neutralisées (elles n'apportent rien à la
 * vérification du rendu) afin d'éviter toute dépendance à un moteur CSS.
 */
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Remplace les imports de CSS par un module vide. */
function ignoreStyles(): Plugin {
  return {
    name: 'edumate-ignore-styles',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('.css')) return '\0virtual:empty-css';
      return null;
    },
    load(id) {
      if (id === '\0virtual:empty-css') return 'export default {}';
      return null;
    },
  };
}

export default defineConfig({
  root: projectRoot,
  plugins: [react(), ignoreStyles()],
  define: {
    'process.env.NODE_ENV': '"development"',
  },
  resolve: {
    alias: {
      '@client': path.resolve(projectRoot, 'src/client'),
      '@shared': path.resolve(projectRoot, 'src/shared'),
    },
  },
  build: {
    outDir: path.resolve(projectRoot, 'dist-test'),
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: path.resolve(projectRoot, 'tests/render-entry.tsx'),
      name: 'EduMateRenderTest',
      formats: ['iife'],
      fileName: () => 'render.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
