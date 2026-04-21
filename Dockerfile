FROM node:24-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run -w forge-app build
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3011

EXPOSE 3011

CMD ["npm", "run", "-w", "forge-app", "start"]
