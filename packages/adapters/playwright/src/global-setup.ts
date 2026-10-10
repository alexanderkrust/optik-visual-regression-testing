import { client } from "./client.js"

export default async function globalSetup(): Promise<void> {
  if (!process.env._OPTIK_TOKEN) {
    throw new Error(
      "Optik: no token configured. Add optikConfig({ token: 'optik_...' }) to your playwright.config.ts.",
    )
  }
  const run = await client().createRun({ suite: process.env._OPTIK_SUITE })
  process.env._OPTIK_RUN_ID = run.id
}
