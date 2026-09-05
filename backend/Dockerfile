FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY benchmark ./benchmark
RUN mkdir -p /app/uploads && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "src/server.js"]
