import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer']
    })
  ],
  build: {
    assetsInlineLimit: 0,
    assetsDir: ''
  },
  base: ''
})
