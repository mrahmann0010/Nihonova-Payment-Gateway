# syntax=docker/dockerfile:1

# --- Dependencies (production only) ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Runtime ---
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as the built-in non-root user.
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 3000

# Reap zombies / forward signals correctly for graceful shutdown.
CMD ["node", "src/server.js"]
