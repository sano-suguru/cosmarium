/// <reference types="vite/client" />
/// <reference types="vite-plugin-glsl/ext" />

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
