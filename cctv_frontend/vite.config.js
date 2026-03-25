import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    base: '/cctv_analytics/',   // 🔥 REQUIRED for production

    plugins: [react()],

    server: {
        port: 5173,
        proxy: {
            // Node backend
            '/cctv_analytics/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },

            // FastAPI
            '/cctv_dev': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                ws: true,
            },
            '/detection-images': {
                target: 'http://localhost:8000',
                changeOrigin: true,
            },
            '/socket.io': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                ws: true,
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