FROM node:20-alpine

WORKDIR /repo/client

COPY client/package.json client/package-lock.json* ./
RUN npm install

COPY client/ .
COPY tests/client/ /repo/tests/client/

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
