/// <reference types="vite/client" />

// TypeScript 6 tightens the rules around side-effect imports — bare
// `import './styles.css'` lines now need the module to be declared. Vite
// handles CSS imports at build time; tell the type checker they exist.
declare module '*.css';
