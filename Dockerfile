FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data STATIC_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/core ./src/core
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8787
USER node
CMD ["node", "server/index.ts"]
