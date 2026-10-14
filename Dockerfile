FROM node:22.22.2-bookworm-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src src
COPY node-web node-web
COPY build build
COPY app app
COPY lib lib
COPY scripts scripts
COPY db db
COPY public public
COPY drizzle drizzle
COPY tsconfig.json tsconfig.node.json vite.config.ts next.config.ts cloudflare-env.d.ts drizzle.config.ts ./
RUN npm run build:node
FROM node:22.22.2-bookworm-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e
WORKDIR /app
COPY --from=build /build/node-dist node-dist
COPY drizzle drizzle
COPY package.json ./
RUN mkdir -p /data/db /data/photos && chown -R node:node /data
USER node
ENV NODE_ENV=production PORT=8080 SKYLINE_DATA_ROOT=/data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:8080/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","node-dist/server/main.js"]
