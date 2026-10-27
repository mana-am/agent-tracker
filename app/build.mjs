// Bundles main + preload (Node/Electron) and the renderer (browser) into dist/.
import { copyFileSync, mkdirSync } from 'node:fs'
import { build } from 'esbuild'

mkdirSync('dist', { recursive: true })

const node = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: 'inline',
  logLevel: 'warning',
}

await Promise.all([
  build({ ...node, entryPoints: ['src/main.ts'], outfile: 'dist/main.js' }),
  build({ ...node, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.js' }),
  build({
    entryPoints: ['src/renderer/app.tsx'],
    outfile: 'dist/renderer.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome130',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    minify: true,
    logLevel: 'warning',
  }),
])

copyFileSync('src/renderer/index.html', 'dist/index.html')
copyFileSync('src/renderer/styles.css', 'dist/styles.css')
console.log('built dist/')
