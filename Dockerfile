# Multi-stage build for optimal size
FROM node:18-alpine as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM node:18-alpine as backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build

# Final runtime image
FROM node:18-alpine
WORKDIR /app

# Install Nginx and Supervisor
RUN apk add --no-cache nginx supervisor

# Create app directories
RUN mkdir -p /app/uploads /var/log/supervisor

# Copy built applications
COPY --from=frontend-builder /app/frontend/dist ./public
COPY --from=backend-builder /app/backend/dist ./backend
COPY --from=backend-builder /app/backend/node_modules ./backend/node_modules

# Copy configuration files
COPY nginx/nginx.conf /etc/nginx/nginx.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY start.sh /start.sh

# Set permissions
RUN chmod +x /start.sh

# Environment variables
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://postgres:password@db:5432/cms_db?sslmode=disable
ENV JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ENV PORT=3001

EXPOSE 3000

CMD ["/start.sh"] 