/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'swarm-bg': '#050510',
                'swarm-panel': '#0F172A',
                'swarm-text': '#E2E8F0',
                'swarm-dim': '#64748B',
                'neon-cyan': '#00F0FF',
                'neon-pink': '#FF2A6D',
                'neon-green': '#05FF00',
            },
            fontFamily: {
                mono: ['JetBrains Mono', 'monospace'],
            }
        },
    },
    plugins: [],
}
