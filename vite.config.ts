import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    envDir: './env',
    plugins: [react(), tailwindcss()],

    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },

    server: {
        host: '127.0.0.1',
        port: 5173,
        strictPort: false,
        proxy: {
            '/api': 'http://127.0.0.1:3001',
        },
    },

    preview: {
        host: '127.0.0.1',
        port: 4173,
        proxy: {
            '/api': 'http://127.0.0.1:3001',
        },
    },
});