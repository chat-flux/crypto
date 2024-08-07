# Use a versão mais leve do Node.js
FROM node:16-alpine

# Defina o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copie o package.json e o package-lock.json
COPY package*.json ./

# Instale as dependências
RUN npm install

# Copie o restante da aplicação
COPY . .

# Exponha a porta que a aplicação vai usar
EXPOSE 3003

# Comando para rodar a aplicação
CMD ["node", "index.js"]
