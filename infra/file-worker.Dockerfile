FROM node:24.19.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api ./apps/api
RUN npm install --global pnpm@11.25.0 \
    && pnpm install --frozen-lockfile --filter @hucescholar/api... \
    && pnpm --filter @hucescholar/api build
RUN mkdir -p /data/files /data/mail && chown node:node /data/files /data/mail
USER node
WORKDIR /workspace/apps/api
CMD ["node", "dist/file-worker.js"]
