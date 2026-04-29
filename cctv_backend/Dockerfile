# Backend Dockerfile
FROM node:18-alpine AS frontend-builder

# Build frontend first
WORKDIR /frontend
COPY cctv_frontend/package*.json ./
RUN npm install
COPY cctv_frontend/ ./
RUN npm run build

# Backend stage
FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    mysql-client \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY cctv_backend/package*.json ./

# Install dependencies
RUN npm install

# Copy application code
COPY cctv_backend/ .

# Copy built frontend from builder
COPY --from=frontend-builder /frontend/dist ../cctv_frontend/dist

# Create necessary directories
RUN mkdir -p uploads logs

# Copy and set permissions for entrypoint script
COPY cctv_backend/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/cctv_analytics/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]

# Start application
CMD ["node", "src/server.js"]
