# ETAPA 1: Construcción (Builder)
# Usamos una imagen de Node ligera
FROM node:18-alpine AS builder
WORKDIR /app
# Copiamos solo los archivos de dependencias primero (optimiza el caché)
COPY package*.json ./
# Instalamos todo (incluso las dependencias de desarrollo)
RUN npm install
# Copiamos el resto del codigo
COPY . .

# ETAPA 2: Producción
# Empezamos de cero con una imagen nueva y limpia
FROM node:18-alpine
WORKDIR /app
# copiamos SOLO lo que necesitamos desde la etapa "builder"
COPY --from=builder /app ./
# Exponemos el puerto que usa la API
EXPOSE 3000
# Comando para iniciar la aplicación
CMD ["npm", "start"]