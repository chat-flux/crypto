const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { generateKeyPair } = require('crypto');

const app = express();
app.use(bodyParser.json());

const GLOBAL_API_KEY = process.env.GLOBAL_API_KEY; // Puxa a chave da variável de ambiente

// Middleware para verificar a chave de autorização
function checkApiKey(req, res, next) {
  const apiKey = req.headers['authorization'];
  if (!apiKey || apiKey !== GLOBAL_API_KEY) {
    return res.status(403).send('Forbidden');
  }
  next();
}

// Adiciona o middleware de autenticação à rota
app.post('/generate-key-pair', checkApiKey, (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).send('ID is required');
  }

  const dirPath = path.join(__dirname, './privkeys', id);
  const privateKeyPath = path.join(dirPath, 'private.pem');

  console.log(`Creating directory: ${dirPath}`);
  
  // Cria o diretório se ele não existir
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  generateKeyPair('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  }, (err, publicKey, privateKey) => {
    if (err) {
      return res.status(500).send('Error generating key pair');
    }

    console.log(`Saving private key to: ${privateKeyPath}`);
    
    // Salva a chave privada
    fs.writeFile(privateKeyPath, privateKey, (err) => {
      if (err) {
        return res.status(500).send('Error saving private key');
      }

      // Retorna a chave pública
      res.send({ publicKey });
    });
  });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
