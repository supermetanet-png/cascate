
# Build Stage
FROM node:20-alpine as build
WORKDIR /app
# Copia arquivos de dependência da raiz (contexto docker-compose é a raiz)
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Production Stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
