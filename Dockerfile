# Ultrachess: one container with the Node server, the built site and SQLite.
# The database lives in /data — mount a volume there so accounts survive deploys.
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=8080 \
    DB_FILE=/data/ultrachess.db
RUN mkdir -p /data
EXPOSE 8080
CMD ["npx", "tsx", "server/index.ts"]
