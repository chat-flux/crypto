import express from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import bodyParser from 'body-parser';
import https from 'https'; // Importação do módulo https


const app = express();

// Configurações do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vcorlrgonjehlqgypkml.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjb3JscmdvbmplaGxxZ3lwa21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjE5MjE5MTIsImV4cCI6MjAzNzQ5NzkxMn0.eylQfsEZWFGGFZgqfgbJqmdRkzDhXKIHlWZ8jae_iNQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Middleware para parsear JSON
app.use(bodyParser.json());

// Função para gerar um ID aleatório
function generateRandomId() {
  const randomString = crypto.randomBytes(16).toString('hex');
  return `thread_${randomString}`;
}

function generateRandomAsstId() {
  const randomString = crypto.randomBytes(16).toString('hex');
  return `asst_${randomString}`;
}

// Função para gerar uma chave de API
function generateApiKey() {
  return crypto.randomBytes(32).toString('hex');
}

// Função para gerar um ID de mensagem aleatório
function generateMessageId() {
  const randomString = crypto.randomBytes(16).toString('hex');
  return `msg_${randomString}`;
}

// Função para gerar um ID de assistente aleatório
function generateAssistantId() {
  const randomString = crypto.randomBytes(16).toString('hex');
  return `asst_${randomString}`;
}

// Função de validação de assistente
function validateAssistant(req, res, next) {
  const { name, model, max_tokens } = req.body;
  const validModels = [
    'gemma2-9b-it', 'gemma-7b-it', 'llama-3.1-70b-versatile', 
    'llama-3.1-8b-instant', 'llama3-70b-8192', 'llama3-8b-8192'
  ];

  if (!name || !model || !validModels.includes(model)) {
    return res.status(400).json({ message: 'Name e model são obrigatórios e model deve ser um dos seguintes: gemma2-9b-it, gemma-7b-it, llama-3.1-70b-versatile, llama-3.1-8b-instant, llama3-70b-8192, llama3-8b-8192' });
  }

  let defaultMaxTokens = 8000;
  if (['llama-3.1-70b-versatile', 'llama-3.1-8b-instant'].includes(model)) {
    defaultMaxTokens = 8000;
  }

  if (max_tokens && max_tokens > defaultMaxTokens) {
    return res.status(400).json({ message: `O modelo ${model} permite no máximo ${defaultMaxTokens} tokens` });
  }

  req.body.max_tokens = req.body.max_tokens || defaultMaxTokens;
  next();
}

// Middleware de autenticação por chave de API
async function authenticateApiKey(req, res, next) {
  console.log("Iniciando autenticação...");
  const apiKey = req.headers['x-api-key'];
  console.log("API Key recebida:", apiKey);

  if (!apiKey) {
    console.log("Chave de API não fornecida.");
    return res.status(401).json({ message: 'Chave de API não fornecida' });
  }

  try {
    // 1. Verificar na tabela 'users' (api_global)
    console.log("Buscando chave em 'users'...");
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, api_global')
      .eq('api_global', apiKey); 

      //  Usar .data para verificar se há resultados e então pegar o primeiro
      //   em vez de .single() que espera apenas um resultado

      if (userError) {
        console.error("Erro ao buscar em 'users':", userError);
        throw userError;
      }

      if (user && user.length > 0) { 
        console.log("Usuário encontrado em 'users':", user[0]);
        req.user = { id: user[0].id };
        return next();
      }

    console.log("Chave não encontrada em 'users'. Buscando em 'api_keys'...");

    // 2. Verificar na tabela 'api_keys' 
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('api_key', apiKey)
      .single(); // .single() está correto aqui, pois cada chave deve ser única

    if (apiKeyError) {
      console.error("Erro ao buscar em 'api_keys':", apiKeyError);
      throw apiKeyError;
    }

    if (apiKeyData && apiKeyData.active) {
      console.log("Chave encontrada em 'api_keys':", apiKeyData);
      req.user = { id: apiKeyData.user_id };
      return next();
    }

    console.log("Chave não encontrada ou inativa em 'api_keys'.");

    // 3. Se nenhuma chave for encontrada ou estiver inativa
    return res.status(403).json({ message: 'Chave de API inválida ou desativada' });

  } catch (error) {
    console.error('Erro na autenticação:', error.message);
    res.status(500).json({ message: 'Erro na autenticação' });
  }
}

// Endpoint para o root (/)
app.get('/', (req, res) => {
  const apiStatus = {
    status: 'online',
    version: 'Convert Ai 1.0.1'
  };

  res.status(200).json(apiStatus);
});

// Endpoint para criar uma nova chave de API
app.post('/users/api-keys', authenticateApiKey, async (req, res) => {
  const newApiKey = generateApiKey();

  try {
    const { data: insertedKey, error } = await supabase
      .from('api_keys')
      .insert([{ user_id: req.user.id, api_key: newApiKey, active: true }])
      .select();

    if (error) {
      throw error;
    }

    res.status(201).json({ message: 'Chave de API criada com sucesso', apiKey: newApiKey });
  } catch (error) {
    res.status(500).json({ message: `Erro ao criar chave de API: ${error.message}` });
  }
});

// Endpoint para listar as chaves de API do usuário logado
app.get('/users/api-keys', authenticateApiKey, async (req, res) => {
  try {
    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', req.user.id);

    if (error) {
      throw error;
    }

    res.status(200).json(apiKeys);
  } catch (error) {
    res.status(500).json({ message: `Erro ao listar chaves de API: ${error.message}` });
  }
});

// Endpoint para remover uma chave de API
app.delete('/users/api-keys/:key_id', authenticateApiKey, async (req, res) => {
  const { key_id } = req.params;

  try {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', key_id)
      .eq('user_id', req.user.id);

    if (error) {
      throw error;
    }

    res.status(200).json({ message: 'Chave de API removida com sucesso' });
  } catch (error) {
    res.status(500).json({ message: `Erro ao remover chave de API: ${error.message}` });
  }
});

app.put('/users/api-keys/:key_id', authenticateApiKey, async (req, res) => {
  const { key_id } = req.params;
  const userId = req.user.id;
  const { active } = req.body; // Recebe o novo estado (true para ativar, false para desativar)

  // 1. Validação do estado 'active'
  if (typeof active !== 'boolean') {
    return res.status(400).json({ message: 'O campo "active" é obrigatório e deve ser um booleano (true/false).' });
  }

  try {
    // 2. Buscar a chave de API
    const { data: existingKey, error: findError } = await supabase
      .from('api_keys')
      .select('id, active') // Seleciona 'active' para verificar o estado atual
      .eq('id', key_id)
      .eq('user_id', userId)
      .single();

    if (findError) {
      console.error("Erro ao buscar a chave de API:", findError);
      return res.status(500).json({ message: 'Erro ao buscar a chave de API.' });
    }

    if (!existingKey) {
      return res.status(404).json({ message: 'Chave de API não encontrada ou não autorizada.' });
    }

    // 3. Verificar se o estado atual é diferente do desejado
    if (existingKey.active === active) {
      return res.status(400).json({ 
        message: active ? 'A chave de API já está ativa.' : 'A chave de API já está desativada.' 
      });
    }

    // 4. Atualizar o estado da chave
    const { data: updatedKey, error: updateError } = await supabase
      .from('api_keys')
      .update({ active })
      .eq('id', key_id)
      .eq('user_id', userId)
      .select();

    if (updateError) {
      console.error("Erro ao atualizar a chave de API:", updateError);
      return res.status(500).json({ message: 'Erro ao atualizar a chave de API.' });
    }

    // 5. Retornar sucesso
    res.status(200).json({ 
      message: active ? 'Chave de API ativada com sucesso.' : 'Chave de API desativada com sucesso.',
      key: updatedKey[0]
    });

  } catch (error) {
    console.error("Erro geral ao atualizar a chave:", error);
    res.status(500).json({ message: 'Erro ao atualizar a chave de API.' });
  }
});

// Endpoint para registrar um novo usuário
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  // Verifica se o username e password foram fornecidos
  if (!username || !password) {
    return res.status(400).json({ message: 'Username e password são obrigatórios' });
  }

  // Hash da senha
  const hashedPassword = await bcrypt.hash(password, 10);
  const apiKey = generateApiKey();

  try {
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password: hashedPassword, api_global: apiKey }])
      .select();

    if (error) {
      throw error;
    }

    res.status(201).json({ message: 'Usuário registrado com sucesso', apiKey });
  } catch (error) {
    res.status(400).json({ message: `Erro ao registrar usuário: ${error.message}` });
  }
});

// Endpoint para adicionar uma nova chave de API
app.post('/users/api-keys', authenticateApiKey, async (req, res) => {
  const { apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ message: 'API key é obrigatória' });
  }

  try {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('groq_api_keys')
      .eq('id', req.user.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const updatedApiKeys = user.groq_api_keys || [];
    const newId = updatedApiKeys.length + 1;
    const newApiKey = { id: newId.toString(), 'api-key': apiKey, active: true };

    updatedApiKeys.push(newApiKey);

    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ groq_api_keys: updatedApiKeys })
      .eq('id', req.user.id)
      .select('groq_api_keys')
      .single();

    if (updateError) {
      throw updateError;
    }

    const addedApiKey = updatedUser.groq_api_keys.find(key => key['api-key'] === apiKey);
    res.status(201).json({ message: 'API key adicionada com sucesso', apiKey: addedApiKey });
  } catch (error) {
    res.status(500).json({ message: `Erro ao adicionar API key: ${error.message}` });
  }
});

// Endpoint para listar as chaves de API do usuário logado
app.get('/users/api-keys', authenticateApiKey, async (req, res) => {
  try {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, groq_api_keys')
      .eq('id', req.user.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    res.status(200).json({ apiKeys: user.groq_api_keys || [] });
  } catch (error) {
    res.status(500).json({ message: `Erro ao listar API keys: ${error.message}` });
  }
});

// Endpoint para editar uma chave de API
app.put('/users/api-keys/:key_id', authenticateApiKey, async (req, res) => {
  const { key_id } = req.params;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ message: 'O campo "active" é obrigatório e deve ser um booleano' });
  }

  try {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('groq_api_keys')
      .eq('id', req.user.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const updatedApiKeys = (user.groq_api_keys || []).map(key => 
      key.id === key_id ? { ...key, active } : key
    );

    const { error: updateError } = await supabase
      .from('users')
      .update({ groq_api_keys: updatedApiKeys })
      .eq('id', req.user.id);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({ message: 'API key atualizada com sucesso' });
  } catch (error) {
    res.status(500).json({ message: `Erro ao atualizar API key: ${error.message}` });
  }
});

// Endpoint para remover uma chave de API
app.delete('/users/api-keys/:key_id', authenticateApiKey, async (req, res) => {
  const { key_id } = req.params;

  try {
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('groq_api_keys')
      .eq('id', req.user.id)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ message: 'Usuário não encontrado' });
    }

    const updatedApiKeys = (user.groq_api_keys || []).filter(key => key.id !== key_id);

    const { error: updateError } = await supabase
      .from('users')
      .update({ groq_api_keys: updatedApiKeys })
      .eq('id', req.user.id);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({ message: 'API key removida com sucesso' });
  } catch (error) {
    res.status(500).json({ message: `Erro ao remover API key: ${error.message}` });
  }
});

// Endpoint para criar uma nova linha na tabela threads (protegido)
app.post('/threads', authenticateApiKey, async (req, res) => {
  const id_thread = generateRandomId();
  const user_id = req.user.id;
  const { messages } = req.body; // Recebe o objeto JSON de mensagens do corpo da requisição

  try {
    const { data: insertedData, error } = await supabase
      .from('threads')
      .insert([{ id_thread, user_id, messages }]) // Insere o objeto JSON de mensagens
      .select();

    if (error) {
      throw error;
    }

    res.status(201).json(insertedData[0]);
  } catch (error) {
    res.status(400).json({ message: `Erro ao adicionar linha: ${error.message}` });
  }
});

// Atualização do endpoint para buscar todas as threads do usuário logado
app.get('/threads', authenticateApiKey, async (req, res) => {
  try {
    const userId = req.user.id;
    //console.log(`Buscando threads para o user_id: ${userId}`);

    const { data: threads, error } = await supabase
      .from('threads')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    res.status(200).json(threads);
  } catch (error) {
    console.error(`Erro ao recuperar as threads do usuário: ${error.message}`);
    res.status(500).json({ error: 'Erro ao recuperar as threads do usuário' });
  }
});

// Endpoint para obter informações de uma thread pelo id_thread (protegido)
app.get('/threads/:id_thread', authenticateApiKey, async (req, res) => {
  const { id_thread } = req.params;
  const user_id = req.user.id;

  try {
    //console.log(`Buscando thread com id_thread: ${id_thread} e user_id: ${user_id}`);

    const { data, error } = await supabase
      .from('threads')
      .select('*')
      .eq('id_thread', id_thread)
      .eq('user_id', user_id)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({ message: 'Thread não encontrada ou acesso negado' });
    }

    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ message: `Erro ao buscar thread: ${error.message}` });
  }
});

// Endpoint para deletar uma thread pelo id_thread (protegido)
app.delete('/threads/:id_thread', authenticateApiKey, async (req, res) => {
  const { id_thread } = req.params;
  const user_id = req.user.id;

  try {
    const { data, error } = await supabase
      .from('threads')
      .delete()
      .eq('id_thread', id_thread)
      .eq('user_id', user_id)
      .select();

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Thread não encontrada ou acesso negado' });
    }

    res.status(200).json({ message: 'Thread deletada com sucesso' });
  } catch (error) {
    res.status(400).json({ message: `Erro ao deletar thread: ${error.message}` });
  }
});

// Novo endpoint para adicionar mensagens a uma thread existente
app.post('/threads/:thread_id/messages', authenticateApiKey, async (req, res) => {
  const { thread_id } = req.params;
  const { role, text } = req.body;

  // Verifica se o role e text foram fornecidos e se o role é válido
  if (!role || !text || !['system', 'user', 'assistant'].includes(role)) {
    return res.status(400).json({ message: 'Role e text são obrigatórios e role deve ser um dos seguintes: system, user, assistant' });
  }

  const newMessage = { id: generateMessageId(), created_at: new Date().toISOString(), content: [{ role, text }] };

  try {
    // Busca a thread existente
    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('*')
      .eq('id_thread', thread_id)
      .single();

    if (fetchError || !thread) {
      return res.status(404).json({ message: 'Thread não encontrada' });
    }

    // Atualiza o array de mensagens
    const updatedMessages = thread.messages || [];
    updatedMessages.push(newMessage);

    // Atualiza a thread com as novas mensagens
    const { data: updatedThread, error: updateError } = await supabase
      .from('threads')
      .update({ messages: updatedMessages })
      .eq('id_thread', thread_id)
      .select();

    if (updateError) {
      throw updateError;
    }

    res.status(200).json(updatedThread[0]);
  } catch (error) {
    res.status(400).json({ message: `Erro ao adicionar mensagem: ${error.message}` });
  }
});

// Novo endpoint para listar mensagens de uma thread específica (protegido)
app.get('/threads/:thread_id/messages', authenticateApiKey, async (req, res) => {
  const { thread_id } = req.params;
  const user_id = req.user.id;

  try {
    //console.log(`Buscando mensagens para thread_id: ${thread_id} e user_id: ${user_id}`);

    const { data: thread, error } = await supabase
      .from('threads')
      .select('messages')
      .eq('id_thread', thread_id)
      .eq('user_id', user_id)
      .single();

    if (error) {
      throw error;
    }

    if (!thread) {
      return res.status(404).json({ message: 'Thread não encontrada ou acesso negado' });
    }

    res.status(200).json(thread.messages);
  } catch (error) {
    res.status(400).json({ message: `Erro ao buscar mensagens: ${error.message}` });
  }
});

// Novo endpoint para listar uma mensagem específica de uma thread (protegido)
app.get('/threads/:thread_id/messages/:message_id', authenticateApiKey, async (req, res) => {
  const { thread_id, message_id } = req.params;
  const user_id = req.user.id;

  try {
    //console.log(`Buscando mensagem com message_id: ${message_id} na thread_id: ${thread_id} e user_id: ${user_id}`);

    const { data: thread, error } = await supabase
      .from('threads')
      .select('messages')
      .eq('id_thread', thread_id)
      .eq('user_id', user_id)
      .single();

    if (error) {
      throw error;
    }

    if (!thread) {
      return res.status(404).json({ message: 'Thread não encontrada ou acesso negado' });
    }

    const message = thread.messages.find(msg => msg.id === message_id);
    if (!message) {
      return res.status(404).json({ message: 'Mensagem não encontrada' });
    }

    res.status(200).json(message);
  } catch (error) {
    res.status(400).json({ message: `Erro ao buscar mensagem: ${error.message}` });
  }
});

// Endpoint para modificar uma mensagem específica em uma thread (protegido)
app.put('/threads/:thread_id/messages/:message_id', authenticateApiKey, async (req, res) => {
  const { thread_id, message_id } = req.params;
  const { role, text } = req.body;

  // Verifica se o role e text foram fornecidos e se o role é válido
  if (!role || !text || !['system', 'user', 'assistant'].includes(role)) {
    return res.status(400).json({ message: 'Role e text são obrigatórios e role deve ser um dos seguintes: system, user, assistant' });
  }

  try {
    // Busca a thread existente
    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('*')
      .eq('id_thread', thread_id)
      .single();

    if (fetchError || !thread) {
      return res.status(404).json({ message: 'Thread não encontrada' });
    }

    // Encontra a mensagem específica
    const messageIndex = thread.messages.findIndex(msg => msg.id === message_id);
    if (messageIndex === -1) {
      return res.status(404).json({ message: 'Mensagem não encontrada' });
    }

    // Modifica a mensagem
    thread.messages[messageIndex].content = [{ role, text }];

    // Atualiza a thread com a mensagem modificada
    const { data: updatedThread, error: updateError } = await supabase
      .from('threads')
      .update({ messages: thread.messages })
      .eq('id_thread', thread_id)
      .select();

    if (updateError) {
      throw updateError;
    }

    // Retorna apenas a mensagem atualizada
    const updatedMessage = thread.messages[messageIndex];
    res.status(200).json(updatedMessage);
  } catch (error) {
    res.status(400).json({ message: `Erro ao modificar mensagem: ${error.message}` });
  }
});

// Endpoint para deletar uma mensagem específica em uma thread (protegido)
app.delete('/threads/:thread_id/messages/:message_id', authenticateApiKey, async (req, res) => {
  const { thread_id, message_id } = req.params;

  try {
    // Busca a thread existente
    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('*')
      .eq('id_thread', thread_id)
      .single();

    if (fetchError || !thread) {
      return res.status(404).json({ message: 'Thread não encontrada' });
    }

    // Filtra a mensagem específica
    const updatedMessages = thread.messages.filter(msg => msg.id !== message_id);

    // Atualiza a thread com a mensagem deletada
    const { data: updatedThread, error: updateError } = await supabase
      .from('threads')
      .update({ messages: updatedMessages })
      .eq('id_thread', thread_id)
      .select();

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({ message: 'Mensagem deletada com sucesso' });
  } catch (error) {
    res.status(400).json({ message: `Erro ao deletar mensagem: ${error.message}` });
  }
});

// Endpoint to create a new assistant (protected)
app.post('/assistants', authenticateApiKey, validateAssistant, async (req, res) => {
  let { name, description, model, instructions, seed, top_p, temperature, stream = false, max_tokens, response_format, language, tone, behavior, business_name, business_info, type_agent } = req.body;

  // Validate type_agent
  const validTypeAgents = ['sales', 'support', 'secretary', 'technical', 'financial', 'marketing', 'hr', 'travel', 'medical', 'recruitment', 'translator', 'helpdesk', 'shopping', 'legal', 'scheduling'];
  if (type_agent && !validTypeAgents.includes(type_agent)) {
    return res.status(400).json({ message: `Invalid type_agent. Valid values are: ${validTypeAgents.join(', ')}` });
  }

  // Validate tone
  const validTones = ['formal', 'casual', 'funny', 'respectful', 'serious', 'irrelevant', 'enthusiastic', 'practical'];
  if (tone && !validTones.includes(tone)) {
    return res.status(400).json({ message: `Invalid tone. Valid values are: ${validTones.join(', ')}` });
  }

  // Validate language
  const validLanguages = ['english', 'portugues', 'espanhol'];
  if (language && !validLanguages.includes(language)) {
    return res.status(400).json({ message: `Invalid language. Valid values are: ${validLanguages.join(', ')}` });
  }

  // Check if max_tokens is greater than 8000 and adjust if necessary
  if (max_tokens > 8000) {
    //console.log(`max_tokens provided (${max_tokens}) is greater than 8000. Adjusting to 8000.`);
    max_tokens = 8000;
  }

  // Construct the instructions string with the new optional parameters
  instructions = `Your name: ${name}\n` +
    (language ? `language: ${language}\n` : '') +
    (tone ? `tone: ${tone}\n` : '') +
    (behavior ? `behavior: ${behavior}\n` : '') +
    (business_name ? `business_name: ${business_name}\n` : '') +
    (business_info ? `business_info: ${business_info}\n` : '') +
    (type_agent ? `type_agent: ${type_agent}\n` : '') +
    instructions;

  const newAssistant = {
    assistant_id: generateRandomAsstId(),
    created_at: new Date().toISOString(),
    name,
    description,
    model,
    instructions,
    seed,
    top_p,
    temperature,
    stream,
    max_tokens,
    response_format
  };

  try {
    const { data, error } = await supabase
      .from('assistants')
      .insert([newAssistant])
      .select();

    if (error) {
      throw error;
    }

    const { id, ...responseData } = data[0]; // Remove the "id" field
    res.status(201).json(responseData);
  } catch (error) {
    res.status(400).json({ message: `Error creating assistant: ${error.message}` });
  }
});

// Endpoint to edit an existing assistant (protected)
app.put('/assistants/:id', authenticateApiKey, validateAssistant, async (req, res) => {
  const { id } = req.params;
  let { name, description, model, instructions, seed, top_p, temperature, stream = false, max_tokens, response_format, language, tone, behavior, business_name, business_info, type_agent } = req.body;

  // Validate type_agent
  const validTypeAgents = ['sales', 'support', 'secretary', 'technical', 'financial', 'marketing', 'hr', 'travel', 'medical', 'recruitment', 'translator', 'helpdesk', 'shopping', 'legal', 'scheduling'];
  if (type_agent && !validTypeAgents.includes(type_agent)) {
    return res.status(400).json({ message: `Invalid type_agent. Valid values are: ${validTypeAgents.join(', ')}` });
  }

  // Validate tone
  const validTones = ['formal', 'casual', 'funny', 'respectful', 'serious', 'irrelevant', 'enthusiastic', 'practical'];
  if (tone && !validTones.includes(tone)) {
    return res.status(400).json({ message: `Invalid tone. Valid values are: ${validTones.join(', ')}` });
  }

  // Validate language
  const validLanguages = ['english', 'portugues', 'espanhol'];
  if (language && !validLanguages.includes(language)) {
    return res.status(400).json({ message: `Invalid language. Valid values are: ${validLanguages.join(', ')}` });
  }

  // Check if max_tokens is greater than 8000 and adjust if necessary
  if (max_tokens > 8000) {
    //console.log(`max_tokens provided (${max_tokens}) is greater than 8000. Adjusting to 8000.`);
    max_tokens = 8000;
  }

  // Construct the instructions string with the new optional parameters
  instructions = `Your name: ${name}\n` +
    (language ? `language: ${language}\n` : '') +
    (tone ? `tone: ${tone}\n` : '') +
    (behavior ? `behavior: ${behavior}\n` : '') +
    (business_name ? `business_name: ${business_name}\n` : '') +
    (business_info ? `business_info: ${business_info}\n` : '') +
    (type_agent ? `type_agent: ${type_agent}\n` : '') +
    instructions;

  const updatedAssistant = {
    name,
    description,
    model,
    instructions,
    seed,
    top_p,
    temperature,
    stream,
    max_tokens,
    response_format
  };

  try {
    const { data, error } = await supabase
      .from('assistants')
      .update(updatedAssistant)
      .eq('assistant_id', id)
      .select();

    if (error) {
      throw error;
    }

    const { id: assistantId, ...responseData } = data[0]; // Remove the "id" field
    res.status(200).json(responseData);
  } catch (error) {
    res.status(400).json({ message: `Error editing assistant: ${error.message}` });
  }
});

// Endpoint para listar todos os assistentes
app.get('/assistants', authenticateApiKey, async (req, res) => {
  try {
    const { data: assistants, error } = await supabase
      .from('assistants')
      .select('*');

    if (error) {
      throw error;
    }

    res.status(200).json(assistants);
  } catch (error) {
    res.status(400).json({ message: `Erro ao listar assistentes: ${error.message}` });
  }
});

// Endpoint para obter assistente por ID
app.get('/assistants/:id', authenticateApiKey, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: assistant, error } = await supabase
      .from('assistants')
      .select('*')
      .eq('assistant_id', id)
      .single();

    if (error) {
      throw error;
    }

    if (!assistant) {
      return res.status(404).json({ message: 'Assistente não encontrado' });
    }

    res.status(200).json(assistant);
  } catch (error) {
    res.status(400).json({ message: `Erro ao obter assistente: ${error.message}` });
  }
});

// Endpoint para deletar assistente por ID
app.delete('/assistants/:id', authenticateApiKey, async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('assistants')
      .delete()
      .eq('assistant_id', id)
      .select();

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ message: 'Assistente não encontrado' });
    }

    res.status(200).json({ message: 'Assistente deletado com sucesso' });
  } catch (error) {
    res.status(400).json({ message: `Erro ao deletar assistente: ${error.message}` });
  }
});

function generateRunId() {
  return 'run_' + Math.random().toString(36).substr(2, 9);
}

// Função para fazer uma requisição POST usando o módulo https
async function makePostRequest(url, data, headers, apiKeys) {
  for (const apiKey of apiKeys) {
    try {
      return await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || 443,
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers,
            'Authorization': `Bearer ${apiKey['api-key']}`
          }
        };

        const req = https.request(options, (res) => {
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk;
          });
          res.on('end', () => {
            try {
              const parsedData = JSON.parse(responseData);
              if (parsedData.error && parsedData.error.code === 'rate_limit_exceeded') {
                reject({ rateLimitExceeded: true, message: parsedData.error.message });
              } else {
                resolve(parsedData);
              }
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on('error', (e) => {
          reject(e);
        });

        req.write(JSON.stringify(data));
        req.end();
      });
    } catch (error) {
      if (error.rateLimitExceeded) {
        console.warn(`Rate limit exceeded for API key ${apiKey['api-key']}. Trying next key...`);
        continue;
      } else {
        throw error;
      }
    }
  }
  throw new Error('All API keys have exceeded their rate limits.');
}

// Endpoint para criar uma nova run em uma thread existente
app.post('/threads/:thread_id/runs', authenticateApiKey, async (req, res) => {
  const { thread_id } = req.params;
  const { assistant_id } = req.body;

  if (!assistant_id) {
      console.error('Erro: Assistant ID é obrigatório');
      return res.status(400).json({ message: 'Assistant ID é obrigatório' });
  }

  const newRun = {
      id_run: generateRunId(),
      created_at: new Date().toISOString(),
      assistant_id,
      status: 'queued',
      failed_at: null,
      completed_at: null,
      logs: null,
      content: []
  };

  let thread;

  try {
      // Verifica se o usuário possui chaves de API
      const { data: user, error: userError } = await supabase
          .from('users')
          .select('groq_api_keys')
          .eq('id', req.user.id)
          .single();

      if (userError || !user) {
          throw new Error('Erro ao buscar chaves de API do usuário');
      }

      if (!user.groq_api_keys || user.groq_api_keys.length === 0) {
          return res.status(400).json({ message: 'Usuário não possui chaves de API' });
      }

      // Busca a thread existente
      const { data, error: fetchError } = await supabase
          .from('threads')
          .select('*')
          .eq('id_thread', thread_id)
          .single();

      if (fetchError || !data) {
          console.error(`Erro ao buscar thread: ${fetchError ? fetchError.message : 'Thread não encontrada'}`);
          return res.status(404).json({ message: 'Thread não encontrada' });
      }

      thread = data;

      // Atualiza o array de runs
      const updatedRuns = thread.runs || [];
      updatedRuns.push(newRun);

      // Atualiza a thread com as novas runs
      const { error: updateError } = await supabase
          .from('threads')
          .update({ runs: updatedRuns })
          .eq('id_thread', thread_id);

      if (updateError) {
          console.error(`Erro ao atualizar thread: ${updateError.message}`);
          throw updateError;
      }

      res.status(201).json(newRun);

      // Faz a requisição POST para a API externa
      const { data: assistant, error: assistantError } = await supabase
          .from('assistants')
          .select('*')
          .eq('assistant_id', assistant_id)
          .single();

      if (assistantError || !assistant) {
          console.error(`Erro ao buscar assistente: ${assistantError ? assistantError.message : 'Assistente não encontrado'}`);
          throw new Error('Assistente não encontrado');
      }

      const instructionsMessage = { role: 'system', content: assistant.instructions };
      const messages = [
          instructionsMessage,
          ...thread.messages.map(msg => {
              if (Array.isArray(msg.content) && msg.content.length > 0) {
                  return { role: msg.content[0].role, content: msg.content[0].text };
              } else if (typeof msg.content === 'string') {
                  return { role: msg.role, content: msg.content };
              } else {
                  console.error('Estrutura de mensagem inválida:', msg);
                  throw new Error('Estrutura de mensagem inválida');
              }
          })
      ];

      const requestBody = {
          messages,
          model: assistant.model,
          temperature: assistant.temperature,
          max_tokens: assistant.max_tokens,
          top_p: assistant.top_p,
          stream: assistant.stream,
          stop: null
      };

      //console.log('Request body para API externa:', requestBody);

      const response = await makePostRequest(
          'https://api.groq.com/openai/v1/chat/completions',
          requestBody,
          {},
          user.groq_api_keys
      );

      //console.log('Resposta da API externa:', response);

      const assistantMessage = { role: 'assistant', content: response.choices[0].message.content };
      newRun.status = 'completed';
      newRun.completed_at = new Date().toISOString();
      newRun.content.push({ text: assistantMessage.content });
      thread.messages.push(assistantMessage);

      await supabase
          .from('threads')
          .update({ runs: updatedRuns, messages: thread.messages })
          .eq('id_thread', thread_id);

  } catch (error) {
      newRun.status = 'failed';
      newRun.failed_at = new Date().toISOString();
      newRun.logs = error.message;

      const updatedRuns = thread ? thread.runs || [] : [];
      updatedRuns.push(newRun);

      await supabase
          .from('threads')
          .update({ runs: updatedRuns })
          .eq('id_thread', thread_id);

      console.error(`Erro ao criar run: ${error.message}`);
      res.status(500).json({ message: 'Erro ao criar run', error: error.message });
  }
});

// Endpoint para obter uma run específica
app.get('/threads/:thread_id/runs/:run_id', authenticateApiKey, async (req, res) => {
  const { thread_id, run_id } = req.params;

  try {
    // Busca a thread existente
    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('*')
      .eq('id_thread', thread_id)
      .single();

    if (fetchError || !thread) {
      return res.status(404).json({ message: 'Thread não encontrada' });
    }

    // Busca a run específica
    const run = thread.runs.find(run => run.id_run === run_id);

    if (!run) {
      return res.status(404).json({ message: 'Run não encontrada' });
    }

    res.status(200).json(run);
  } catch (error) {
    console.error(`Erro ao obter run: ${error.message}`);
    res.status(500).json({ message: 'Erro ao obter run' });
  }
});

// Endpoint para listar todas as runs de uma thread
app.get('/threads/:thread_id/runs', authenticateApiKey, async (req, res) => {
  const { thread_id } = req.params;

  try {
    // Busca a thread existente
    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('*')
      .eq('id_thread', thread_id)
      .single();

    if (fetchError || !thread) {
      return res.status(404).json({ message: 'Thread não encontrada' });
    }

    res.status(200).json(thread.runs || []);
  } catch (error) {
    console.error(`Erro ao listar runs: ${error.message}`);
    res.status(500).json({ message: 'Erro ao listar runs' });
  }
});

// Endpoint para deletar uma run específica
app.delete('/threads/:thread_id/runs/:run_id', authenticateApiKey, async (req, res) => {
  const { thread_id, run_id } = req.params;

  try {
    // Busca a thread existente
    const { data: thread, error: fetchError } = await supabase
      .from('threads')
      .select('*')
      .eq('id_thread', thread_id)
      .single();

    if (fetchError || !thread) {
      return res.status(404).json({ message: 'Thread não encontrada' });
    }

    // Remove a run específica
    const updatedRuns = thread.runs.filter(run => run.id_run !== run_id);

    // Atualiza a thread com as runs restantes
    const { error: updateError } = await supabase
      .from('threads')
      .update({ runs: updatedRuns })
      .eq('id_thread', thread_id);

    if (updateError) {
      throw updateError;
    }

    res.status(200).json({ message: 'Run deletada com sucesso' });
  } catch (error) {
    console.error(`Erro ao deletar run: ${error.message}`);
    res.status(500).json({ message: 'Erro ao deletar run' });
  }
});

export default app;
