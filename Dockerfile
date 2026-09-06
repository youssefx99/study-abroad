# One image for every service: they share the same workspace and differ only in
# the entrypoint, so building once and varying the command keeps the layer cache
# useful across all eight.

FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY services ./services
COPY scripts ./scripts

RUN npm install --omit=dev --workspaces --include-workspace-root && npm cache clean --force

RUN mkdir -p /app/data
EXPOSE 4000-4007
CMD ["node", "services/gateway/src/index.js"]

# The web app needs its own build step and dev dependencies to compile.
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps ./apps
RUN npm install --workspaces --include-workspace-root
RUN npm run build --workspace @flow/web
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace", "@flow/web"]
