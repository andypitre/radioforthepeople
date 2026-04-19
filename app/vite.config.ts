import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: { port: 1077 },
  plugins: [
    tsConfigPaths({ projects: ['./tsconfig.json'] }),
    tanstackStart(),
  ],
})
