FROM node:24.19.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libreoffice-writer python3 fonts-liberation2 fonts-dejavu-core poppler-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY infra/docx-converter-server.mjs ./server.mjs
COPY apps/api/src/files/validate-docx.py ./validate-docx.py
USER node
ENV HOME=/tmp
CMD ["node", "server.mjs"]
