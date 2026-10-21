# The API, for a server (tools/deploy/docker-compose.yml). Built from the
# repository root:  docker compose -f tools/deploy/docker-compose.yml build
#
# Two stages. `build` has everything - the TypeScript compiler, the Nest CLI,
# the Prisma CLI - and is also what the `migrate` service runs, because the
# Prisma CLI is a dev dependency and the runtime image does not carry it.
# `runtime` has the compiled app and its production dependencies only.
#
# The same Debian in both, with OpenSSL: Prisma picks its query engine for the
# OpenSSL it finds at `prisma generate`, and an engine built for one and run on
# another fails at the first query rather than at boot.

FROM node:24-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

COPY apps/api/ ./
RUN npx prisma generate && npm run build


FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    MEDIA_ROOT=/data/media

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --omit=dev
# The generated client lives in node_modules and was made in the build stage;
# the production install above does not run `prisma generate`.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

RUN mkdir -p /data/media && chown -R node:node /data
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
