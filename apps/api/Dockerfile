FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/core/package.json apps/core/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --ignore-scripts

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build --workspace @ad-product-forge/core && npm run build --workspace @ad-product-forge/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV ARTIFACTS_DIR=/data/artifacts
COPY --from=build /app/package.json /app/package-lock.json /app/
COPY --from=build /app/apps/core /app/apps/core
COPY --from=build /app/apps/api /app/apps/api
COPY --from=build /app/node_modules /app/node_modules
RUN mkdir -p /data/artifacts
EXPOSE 3000
CMD ["node", "apps/api/dist/src/index.js"]
