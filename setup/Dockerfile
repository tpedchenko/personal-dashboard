FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3333

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install Docker CLI for launching containers from setup wizard
RUN apk add --no-cache docker-cli docker-cli-compose postgresql16-client

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy seed script into the image so we can pipe it to psql
COPY scripts/ ./scripts/

RUN mkdir -p /data && chown nextjs:nodejs /data

# Run as root so we can access Docker socket
# (the setup wizard is a short-lived container)
EXPOSE 3333
CMD ["node", "server.js"]
