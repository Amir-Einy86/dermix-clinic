FROM node:24-bookworm-slim

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY client /app/client

EXPOSE 5000
CMD ["node", "src/server.js"]
