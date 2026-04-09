FROM node:20-alpine

WORKDIR /repo/server

COPY server/package.json server/package-lock.json* ./
RUN npm install

COPY server/ .
COPY tests/server/ /repo/tests/server/

RUN npm run build

EXPOSE 3001

CMD ["node", "dist/main.js"]
