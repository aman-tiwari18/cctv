import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/cctv/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },
            '/detections': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
            '/detection-images': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
            // Script-server direct routes (cancel, health, status)
            // Use /ss/... prefix to avoid clashing with /cctv/api/executions
            '/ss': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/ss/, ''),
            },
        }
    }
})
