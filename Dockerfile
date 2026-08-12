FROM node:22-bookworm-slim AS builder

WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS service

ENV NODE_ENV=production
WORKDIR /service

RUN groupadd --system --gid 10001 logstream \
  && useradd --system --uid 10001 --gid logstream --home-dir /service logstream

COPY --from=builder --chown=logstream:logstream /workspace/package.json ./package.json
COPY --from=builder --chown=logstream:logstream /workspace/node_modules ./node_modules
COPY --from=builder --chown=logstream:logstream /workspace/build ./build
COPY --chown=logstream:logstream database ./database

USER logstream
EXPOSE 8080

CMD ["node", "build/main.js"]
