FROM node:24-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY pnpm-lock.yaml* ./

RUN npm install -g pnpm

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm run codegen

RUN pnpm run typecheck

FROM node:24-alpine

RUN apk add --no-cache curl

WORKDIR /app

RUN npm install -g pnpm

COPY package*.json ./
COPY pnpm-lock.yaml* ./

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/generated ./generated
COPY --from=builder /app/ponder.config.ts ./
COPY --from=builder /app/ponder.schema.ts ./
COPY --from=builder /app/schema.graphql ./
COPY --from=builder /app/abis ./abis
COPY --from=builder /app/src ./src
COPY --from=builder /app/ponder-env.d.ts ./
COPY --from=builder /app/tsconfig.json ./

RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 42069

HEALTHCHECK --interval=30s --timeout=10s --start-period=300s --retries=3 \
  CMD curl -f http://localhost:42069/health || exit 1

CMD ["pnpm", "start"]