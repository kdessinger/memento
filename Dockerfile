FROM node:22-bookworm-slim

WORKDIR /app

# Build tools for better-sqlite3
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", "dist/server/index.js"]
