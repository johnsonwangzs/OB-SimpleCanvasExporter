import obsidianmd from 'eslint-plugin-obsidianmd';

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
    files: ['src/viewer.ts'],
    rules: { 'obsidianmd/prefer-create-el': 'off', 'obsidianmd/prefer-instanceof': 'off' },
  },
];
