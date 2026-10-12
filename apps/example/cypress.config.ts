import { defineConfig } from 'cypress'
import { optikPlugin } from '@optik/cypress'

// Create an API token in the Optik UI and set it as OPTIK_TOKEN:
//   pnpm dev &   OPTIK_TOKEN=optik_xxx pnpm test:cypress
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5174',
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    setupNodeEvents(on, config) {
      return optikPlugin(on, config)
    },
  },
})
