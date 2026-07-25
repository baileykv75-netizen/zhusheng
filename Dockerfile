FROM node:20-alpine AS build

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
COPY --from=build /app ./
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=3s --start-period=8s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1
CMD ["sh", "-c", "corepack enable && pnpm exec next start -H 0.0.0.0 -p ${PORT:-4173}"]
