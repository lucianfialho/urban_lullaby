# Base image: Node.js com ferramentas adicionais como o FFmpeg
FROM mcr.microsoft.com/devcontainers/javascript-node:1-22-bookworm

# Instalar dependências adicionais via apt-get (se necessário)
RUN apt-get update && apt-get install -y ffmpeg

# Criar diretório de trabalho
WORKDIR /app

# Copiar arquivos do projeto para o contêiner
COPY . .

# Instalar dependências do projeto
RUN npm install

# Expor a porta para fins de depuração (caso precise)
EXPOSE 3000

# Comando para rodar o app
CMD ["npm", "start"]
