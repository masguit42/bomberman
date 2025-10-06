# syntax=docker/dockerfile:1

FROM node:20-alpine AS client-builder
WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

FROM node:20-alpine AS server-builder
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY server/ ./server/
RUN cd server && npm run build
RUN cd server && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-builder /app/server/package.json ./server/package.json
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/dist ./server/dist
COPY --from=client-builder /app/client/dist ./client/dist
ENV CLIENT_DIST_PATH=/app/client/dist
ENV PORT=4000
EXPOSE 4000
CMD ["node", "server/dist/server.js"]
