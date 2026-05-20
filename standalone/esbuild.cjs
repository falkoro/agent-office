const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--production');

esbuild
  .build({
    entryPoints: [path.join(__dirname, 'server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: path.join(__dirname, '..', 'dist', 'standalone', 'server.js'),
    minify: production,
    sourcemap: !production,
    logLevel: 'info',
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
