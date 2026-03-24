# Multi-stage build for Next.js Personal Dashboard
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps
COPY . .
ARG DATABASE_URL
ARG NEXT_PUBLIC_GITHUB_AUTH_ENABLED
ENV DATABASE_URL=${DATABASE_URL}
ENV NEXT_PUBLIC_GITHUB_AUTH_ENABLED=${NEXT_PUBLIC_GITHUB_AUTH_ENABLED}
RUN npx prisma generate
RUN npm run build

# Stage 3: Production
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3333
ENV PORT=3333
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -qO- http://localhost:3333/api/health || exit 1

CMD ["node", "server.js"]
