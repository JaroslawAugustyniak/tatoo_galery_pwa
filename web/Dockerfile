FROM node:20-bookworm-slim AS base
# openssl wymagany przez Prisma, sharp ma gotowe binaria dla glibc
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /web

FROM base AS dev
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM base AS prod
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
# postinstall uruchamia `prisma generate`, więc schemat musi być już w obrazie
COPY prisma ./prisma
# devDependencies są potrzebne: tailwind/typescript do buildu, prisma CLI do migracji przy starcie
RUN npm ci --include=dev
COPY . .
RUN npx prisma generate && npm run build \
    # katalog uploadów należy do użytkownika node => nazwany wolumen dziedziczy właściciela
    && mkdir -p /data/uploads && chown -R node:node /data/uploads /web/.next
ENV UPLOAD_DIR=/data/uploads
USER node
EXPOSE 3000
CMD ["npm", "start"]
