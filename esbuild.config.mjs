import * as esbuild from 'esbuild';
const options = {
  entryPoints: ['src/main.ts'], outfile: 'main.js', bundle: true,
  external: ['obsidian','electron'], format: 'cjs', platform: 'browser', target: 'es2022',
  treeShaking: true, minifySyntax: true, logLevel: 'info', define: { __QA__: String(process.argv.includes('--qa')) },
};
if (process.argv.includes('--watch')) await (await esbuild.context(options)).watch();
else await esbuild.build(options);
