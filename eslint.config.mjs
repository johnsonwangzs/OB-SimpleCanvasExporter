import obsidianmd from 'eslint-plugin-obsidianmd';

// The exported viewer has no Obsidian App; retain the other global restrictions.
const viewerGlobals=obsidianmd.configs.recommended.findLast(config=>config.rules?.['no-restricted-globals'])
  .rules['no-restricted-globals'].slice(1)
  .filter(option=>(typeof option==='string'?option:option.name)!=='localStorage');

export default [
  { ignores: ['node_modules/**', '.pnpm-store/**', 'main.js', 'qa/**', 'release/**'] },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        projectService: false,
      },
    },
  },
  {
    // This function runs in exported HTML, where Obsidian's DOM extensions do not exist.
    files: ['src/viewer.ts', 'src/watermark.ts'],
    rules: { 'obsidianmd/prefer-create-el': 'off', 'obsidianmd/prefer-instanceof': 'off', 'no-restricted-globals': ['warn', ...viewerGlobals] },
  },
];
