import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
    base: '/cctv_analytics/',   // 🔥 REQUIRED for production

    plugins: [
        react(),
        legacy({
            targets: ['defaults', 'not IE 11'],
            additionalLegacyPolyfills: ['regenerator-runtime/runtime']
        })
    ],

    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    'vendor-react': ['react', 'react-dom', 'react-router-dom'],
                    'vendor-mui': ['@mui/material', '@emotion/react', '@emotion/styled'],
                    'vendor-mui-icons': ['@mui/icons-material'],
                    'vendor-charts': ['recharts'],
                    'vendor-socket': ['socket.io-client'],
                    'vendor-excel': ['xlsx'],
                },
            },
        },
    },

    server: {
        port: 5173,
        proxy: {
            // Node backend
            '/cctv_analytics/api': {
                target: 'http://localhost:3000',
                changeOrigin: true,
            },

            // Socket.io — strip /cctv_dev prefix so server receives /socket.io/...
            '/cctv_dev/socket.io': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                ws: true,
                rewrite: (path) => path.replace(/^\/cctv_dev/, ''),
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