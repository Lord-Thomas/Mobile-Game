import { defineConfig } from 'vitest/config'

// Config Vitest volontairement isolée du gros vite.config.js du jeu :
// les tests portent sur de la logique pure (serveur, sanitizers) et n'ont
// pas besoin des plugins R3F/WebGL.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'server/**/*.test.js'],
  },
})
