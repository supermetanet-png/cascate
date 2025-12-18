
FROM node:20-alpine
WORKDIR /app
# O contexto de build é a raiz do projeto, então acessamos backend/
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm install
WORKDIR /app
COPY . .
WORKDIR /app/backend
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
