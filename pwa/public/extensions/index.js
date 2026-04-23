// Public build stub. The overlay deployment (private repo) replaces this
// with the real extensions bundle in CI — see that repo's deploy workflow
// for the `cp overlay/private/extensions/dist/extensions.js
// base/pwa/dist/extensions/index.js` step.
//
// Serving an empty module here (instead of 404ing the path) lets the
// extensions-loader's dynamic import resolve cleanly in both deploys
// without the PWA ever seeing a network error in the console. Because
// `merge(mod.extensions ?? mod.default ?? {})` tolerates an empty
// exports object, the public variant ends up with every AppExtension
// set to its default from extensions-defaults.ts.
//
// DO NOT delete — Vite copies this verbatim to dist/, and the path is
// the contract between host and overlay.

export {};
