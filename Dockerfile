# ── Building Phase (Vite Frontend) ──
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies for building
COPY package*.json ./
RUN npm install

# Copy source and build frontend
COPY . .
RUN npm run build

# ── Production Phase (Express Backend) ──
FROM node:20-slim

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm install --production && \
    npm install -g tsx

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
# Copy backend source
COPY . .

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start server
CMD ["tsx", "server.ts"]
