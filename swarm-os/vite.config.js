import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
            },
            // Proxy all bridge endpoints
            '/peers': 'http://localhost:3000',
            '/info': 'http://localhost:3000',
            '/inbox': 'http://localhost:3000',
            '/broadcast': 'http://localhost:3000',
            '/stats': 'http://localhost:3000',
            '/topics': 'http://localhost:3000',
            '/join': 'http://localhost:3000',
            '/leave': 'http://localhost:3000',
        }
    }
})
