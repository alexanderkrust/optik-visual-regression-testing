// Node entry — used in vitest.config.ts. Browser-side helpers live in "@optik/vitest/browser".
export { optik } from "./plugin.js"
export type { OptikConfig } from "./plugin.js"
// playwright({ connectOptions: rendererConnectOptions() }) — pinned browsers when OPTIK_RENDERER is set
export { rendererConnectOptions } from "@optik/core"
