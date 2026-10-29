require('dotenv').config();

const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const groupName = process.env.NOME_DO_GRUPO;
const webhookUrl = process.env.WEBHOOK_URL;
const pendingBotReplies = new Map();
const outgoingImagesBeingChecked = new Set();

function updatePendingBotReply(chatId, text, amount) {
  const key = `${chatId}:${text}`;
  const pending = pendingBotReplies.get(key);
  const count = (pending?.count || 0) + amount;

  if (pending?.timer) {
    clearTimeout(pending.timer);
  }

  if (count <= 0) {
    pendingBotReplies.delete(key);
    return;
  }

  const timer = setTimeout(() => pendingBotReplies.delete(key), 60000);
  timer.unref();
  pendingBotReplies.set(key, { count, timer });
}

async function getCachedGroupName(chatId) {
  return client.pupPage.evaluate((id) => {
    const wid = window.require('WAWebWidFactory').createWid(id);
    const chat = window.require('WAWebCollections').Chat.get(wid);
    return chat?.formattedTitle || null;
  }, chatId);
}

async function waitForOutgoingImage(msg) {
  const messageId = msg.id._serialized;
  const timeoutMs = 30000;
  const intervalMs = 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (msg.ack >= 1 && msg.hasMedia) {
      console.log('WhatsApp confirmou o envio da imagem; processando a mensagem.');
      await processMessage(msg);
      return;
    }

    const reloadTimeoutMs = Math.min(5000, timeoutMs - (Date.now() - startedAt));
    let reloadTimedOut = false;
    let timeoutHandle;
    const reloadedMessage = await Promise.race([
      msg.reload(),
      new Promise((resolve) => {
        timeoutHandle = setTimeout(() => {
          reloadTimedOut = true;
          resolve(null);
        }, reloadTimeoutMs);
      }),
    ]).finally(() => clearTimeout(timeoutHandle));

    if (reloadTimedOut) {
      console.error(`O WhatsApp Web não respondeu ao recarregar a imagem ${messageId} em 5 segundos.`);
      return;
    }

    if (!reloadedMessage) {
      console.error(`Não foi possível recarregar a mensagem de imagem ${messageId}.`);
      return;
    }

    if (msg.ack >= 1 && msg.hasMedia) {
      console.log('WhatsApp confirmou o envio da imagem; processando a mensagem.');
      await processMessage(msg);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  console.error(
    `A imagem ${messageId} não foi confirmada pelo WhatsApp após 30 segundos (ACK atual: ${msg.ack}).`,
  );
}

if (!groupName || !webhookUrl) {
  console.error('Configure NOME_DO_GRUPO e WEBHOOK_URL no arquivo .env.');
  process.exit(1);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    userAgent: false,
    puppeteer: {
        executablePath: '/usr/bin/google-chrome', // Caminho padrão do Chrome no Linux
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
  console.log('Escaneie o QR code abaixo com o WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('Bot conectado ao WhatsApp.');
  try {
    const runtime = await client.pupPage.evaluate(() => ({
      userAgent: navigator.userAgent,
      webVersion: window.Debug?.VERSION || 'desconhecida',
    }));
    console.log('WhatsApp Web em uso:', runtime.webVersion);
    console.log('Navegador em uso:', runtime.userAgent);
  } catch (error) {
    console.error('Não foi possível verificar as versões em execução:', error.message);
  }
});

client.on('auth_failure', (message) => {
  console.error('Falha na autenticação do WhatsApp:', message);
});

async function processMessage(msg) {
  try {
    const chatId = msg.fromMe ? msg.to : msg.from;
    const isGroup = typeof chatId === 'string' && chatId.endsWith('@g.us');
    console.log(`Mensagem ${msg.fromMe ? 'enviada' : 'recebida'}; identificador de grupo:`, isGroup);
    if (!isGroup) {
      return;
    }

    if (msg.fromMe && pendingBotReplies.has(`${chatId}:${msg.body}`)) {
      updatePendingBotReply(chatId, msg.body, -1);
      console.log('Resposta automática identificada; não será reenviada ao webhook.');
      return;
    }

    const currentGroupName = await getCachedGroupName(chatId);
    if (!currentGroupName) {
      console.warn('Mensagem de grupo ignorada: conversa não encontrada no cache do WhatsApp.');
      return;
    }

    if (currentGroupName !== groupName) {
      console.log(`Mensagem de outro grupo ignorada: "${currentGroupName}".`);
      return;
    }

    const textoMensagem = (msg.body || '').trim();
    const temTextoValido = textoMensagem.length > 0;
    const temImagem = Boolean(msg.hasMedia && msg.type === 'image');
    const temNumeroNoTexto = /\d/.test(textoMensagem);

    if (!temTextoValido && !temImagem) {
      console.log('Mensagem ignorada: não contém texto nem imagem válida.');
      return;
    }

    if (!temNumeroNoTexto && !temImagem) {
      console.log('Mensagem ignorada: sem número e sem imagem.');
      return;
    }

    console.log(`Mensagem do grupo configurado recebida: "${currentGroupName}". Enviando ao webhook.`);
    const contact = msg.fromMe ? null : await msg.getContact();
    const usuario = msg.fromMe
      ? client.info?.pushname || 'Eu'
      : contact?.pushname || contact?.name || 'Não identificado';
    let imagemBase64 = null;

    if (temImagem) {
      console.log('Diagnóstico da chave da mensagem:', {
        idFields: Object.keys(msg.id || {}),
        serializedPresent: typeof msg.id?._serialized === 'string',
        serializedAlternatePresent: typeof msg.id?.$1 === 'string',
        remoteType: typeof msg.id?.remote,
        participantType: typeof msg.id?.participant,
      });

      let media;
      try {
        media = await msg.downloadMedia();
      } catch (error) {
        console.error('O WhatsApp Web falhou ao baixar a imagem; o webhook não será chamado.');
        throw error;
      }

      if (!media || !media.mimetype?.startsWith('image/')) {
        console.error('A mensagem contém uma imagem, mas o WhatsApp Web não retornou a mídia para download.');
        return;
      }
      imagemBase64 = media.data;
    }

    const response = await axios.post(webhookUrl, {
      usuario,
      texto: msg.body,
      imagemBase64,
    });

    console.log('Webhook respondeu com status:', response.status);
    const reply = response.data?.mensagem || response.data?.message;
    if (typeof reply === 'string' && reply) {
      const replyChatId = msg.fromMe ? msg.to : msg.from;
      updatePendingBotReply(replyChatId, reply, 1);

      try {
        await msg.reply(reply);
      } catch (error) {
        updatePendingBotReply(replyChatId, reply, -1);
        throw error;
      }
      console.log('Resposta do webhook enviada ao grupo.');
    } else {
      console.warn('Webhook respondeu sem o campo "mensagem" ou "message".');
    }
  } catch (error) {
    console.error("Erro detalhado:", error); // Exibe o erro completo com stack trace
    if (error.response) {
        console.error("Dados da resposta:", error.response.data);
    }
  }
}

client.on('message_create', (msg) => {
  if (msg.fromMe && msg.type === 'image') {
    const messageId = msg.id._serialized;
    if (outgoingImagesBeingChecked.has(messageId)) {
      return;
    }

    outgoingImagesBeingChecked.add(messageId);
    console.log('Imagem enviada pela conta detectada; verificando o estado do upload.');
    waitForOutgoingImage(msg)
      .catch((error) => {
        console.error('Erro ao aguardar a imagem enviada:', error.message);
      })
      .finally(() => outgoingImagesBeingChecked.delete(messageId));
    return;
  }

  processMessage(msg);
});

client.initialize().catch((error) => {
  console.error('Erro ao iniciar o cliente do WhatsApp:', error.message);
});
