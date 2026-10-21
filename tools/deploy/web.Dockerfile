# The web app and the server in front of everything: Caddy with the static
# export baked in. Built from the repository root.
#
# The export is made here, on the server, with EXPO_PUBLIC_API_URL=/v1 - the
# same relative address the LAN host uses, so the bundle names no host and the
# page and the API come from one origin (no CORS, one certificate).
#
# About 4 GB of memory is enough for Metro; a 2 GB machine needs swap for the
# few minutes of the build, or the export built elsewhere and copied up
# (README.md, "A small server").

FROM node:24-bookworm-slim AS build
WORKDIR /repo

COPY apps/mobile/package.json apps/mobile/package-lock.json apps/mobile/
RUN cd apps/mobile && npm ci

COPY apps/mobile/ apps/mobile/
COPY tools/lan-host/precompress.mjs tools/lan-host/precompress.mjs

ENV EXPO_PUBLIC_API_URL=/v1
# The public address, for what a search result and a shared link name: the
# preview picture, the canonical page, the structured data (apps/mobile/src/
# lib/site.ts). The same DOMAIN Caddy answers on, from docker-compose.yml.
ARG DOMAIN
ENV EXPO_PUBLIC_SITE_ORIGIN=https://${DOMAIN}
# Where "Write to us" and the account-deletion page (/support) send people.
ARG SUPPORT_EMAIL
ENV EXPO_PUBLIC_SUPPORT_EMAIL=${SUPPORT_EMAIL}
# The app's pages in the stores, once it is in them: the welcome page links to
# them instead of saying "coming soon" (apps/mobile/src/lib/site.ts).
ARG APP_STORE_URL
ENV EXPO_PUBLIC_APP_STORE_URL=${APP_STORE_URL}
ARG PLAY_STORE_URL
ENV EXPO_PUBLIC_PLAY_STORE_URL=${PLAY_STORE_URL}
RUN cd apps/mobile \
  && npx expo export --platform web --output-dir dist-web \
  && node ../../tools/lan-host/precompress.mjs dist-web


FROM caddy:2-alpine
COPY tools/deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/mobile/dist-web /srv/web
