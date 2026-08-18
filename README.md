# DevOps Lab: Docker Multi-Stage API

## Sobre el Proyecto
Este repositorio es un laboratorio práctico (Proof of Concept) diseñado para implementar y demostrar competencias en **Docker** y la **creación de imágenes multi-stage**. 

El código base utilizado es una API REST desarrollada en Node.js (proveniente del backend del proyecto e-commerce "Amargo y Dulce"), el cual fue aislado y adaptado exclusivamente para optimizar su despliegue mediante contenedores.

## Objetivos del Laboratorio
* **Optimización de imágenes:** Reducir drásticamente el tamaño del contenedor final separando el entorno de construcción (build) del entorno de ejecución (producción).
* **Seguridad:** Evitar la inclusión de dependencias de desarrollo (`devDependencies`) y código fuente innecesario en el contenedor productivo, reduciendo la superficie de ataque.
* **Infraestructura Ágil:** Preparar la aplicación para ser desplegada eficientemente en entornos modernos y pipelines de Integración y Entrega Continua (CI/CD).

## Tecnologías Utilizadas
* **Docker:** Para la virtualización a nivel de sistema operativo y empaquetado de la aplicación.
* **Node.js & Express:** Entorno de ejecución y framework del backend.
* **Git:** Para el control de versiones y gestión del repositorio.

## ¿Por qué Multi-Stage?
El `Dockerfile` de este proyecto está dividido en dos etapas clave para lograr un despliegue eficiente:
1. **Builder (Etapa de Construcción):** Utiliza una imagen base completa de Node para instalar absolutamente todas las dependencias y preparar el entorno.
2. **Production (Etapa de Producción):** Inicializa una imagen completamente nueva y ligera (basada en Alpine Linux). La clave de esta etapa es que copia **únicamente** los archivos resultantes necesarios para ejecutar la aplicación desde la etapa anterior, dejando atrás el peso extra.

## Cómo ejecutar este proyecto localmente
Para probar la imagen en tu entorno local, asegúrate de tener Docker instalado y ejecuta los siguientes comandos en tu terminal:

1. Clonar el repositorio:
`git clone https://github.com/tu-usuario/devops-multistage-lab.git`

2. Entrar al directorio:
`cd devops-multistage-lab`

3. Construir la imagen de Docker:
`docker build -t api-multistage .`

4. Levantar el contenedor:
`docker run -p 3000:3000 api-multistage`

## Autor
**Facundo Bautista Pais**
Analista en Sistemas | DevOps Junior
