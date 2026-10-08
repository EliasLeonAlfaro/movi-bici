FROM node:24-alpine
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=4000 \
    LAB_MODE=1 \
    DB_PATH=/app/data/movibici.db

EXPOSE 4000
VOLUME ["/app/data"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:4000/api/salud || exit 1

CMD ["node", "src/server.js"]
