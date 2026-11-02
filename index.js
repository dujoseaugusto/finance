require('dotenv').config();

const { randomUUID } = require('crypto');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');

const groupName = process.env.NOME_DO_GRUPO;
const webhookUrl = process.env.WEBHOOK_URL;
const pendingBotReplies = new Map();
const outgoingImagesBeingChecked = new Set();

function log(level, event, details = {}) {
  const write = level === 'error'
    ? console.error
    : level === 'warn'
      ? console.warn
      : console.log;

  write(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details,
  }));
}

function getErrorDetails(error) {
  const message = error?.message || String(error);
  return {
    errorName: error?.name || 'Error',
    errorMessage: webhookUrl ? message.split(webhookUrl).join('[URL REDIGIDA]') : message,
    ...(error?.response?.status ? { httpStatus: error.response.status } : {}),
  };
}

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

function getSerializedId(value) {
  if (typeof value === 'string') return value;
  return value?._serialized || value?.$1 || null;
}

function getMessageChatId(msg) {
  const remoteChatId = getSerializedId(msg.id?.remote);
  if (remoteChatId?.endsWith('@g.us')) {
    return remoteChatId;
  }

  const directionalChatId = msg.fromMe ? msg.to : msg.from;
  if (directionalChatId?.endsWith('@g.us')) {
    return directionalChatId;
  }

  return remoteChatId || directionalChatId || null;
}

async function getCachedGroupName(chatId) {
  return client.pupPage.evaluate((id) => {
    const wid = window.require('WAWebWidFactory').createWid(id);
    const chat = window.require('WAWebCollections').Chat.get(wid);
    return chat?.formattedTitle || null;
  }, chatId);
}

async function waitForOutgoingImage(msg, correlationId) {
  const timeoutMs = 30000;
  const intervalMs = 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (msg.ack >= 1 && msg.hasMedia) {
      log('info', 'image_upload_confirmed', { correlationId, ack: msg.ack });
      await processMessage(msg, correlationId);
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
      log('error', 'image_upload_reload_timeout', { correlationId, timeoutMs: reloadTimeoutMs });
      return;
    }

    if (!reloadedMessage) {
      log('error', 'image_upload_reload_failed', { correlationId });
      return;
    }

    if (msg.ack >= 1 && msg.hasMedia) {
      log('info', 'image_upload_confirmed', { correlationId, ack: msg.ack });
      await processMessage(msg, correlationId);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  log('error', 'image_upload_confirmation_timeout', {
    correlationId,
    timeoutMs,
    ack: msg.ack,
  });
}

if (!groupName || !webhookUrl) {
  log('error', 'configuration_invalid', {
    missing: [
      ...(!groupName ? ['NOME_DO_GRUPO'] : []),
      ...(!webhookUrl ? ['WEBHOOK_URL'] : []),
    ],
  });
  process.exit(1);
}

log('info', 'configuration_valid');

const client = new Client({
    authStrategy: new LocalAuth(),
    userAgent: false,
    puppeteer: {
        executablePath: '/usr/bin/google-chrome', // Caminho padrão do Chrome no Linux
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
  log('info', 'authentication_qr_generated');
  console.log('Escaneie o QR code abaixo com o WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  log('info', 'whatsapp_authenticated');
});

client.on('ready', async () => {
  log('info', 'whatsapp_ready');
  try {
    const runtime = await client.pupPage.evaluate(() => ({
      webVersion: window.Debug?.VERSION || 'desconhecida',
    }));
    log('info', 'runtime_versions', runtime);
  } catch (error) {
    log('warn', 'runtime_versions_unavailable', getErrorDetails(error));
  }
});

client.on('auth_failure', () => {
  log('error', 'whatsapp_auth_failure');
});

client.on('disconnected', (reason) => {
  log('error', 'whatsapp_disconnected', { reason: String(reason) });
});

client.on('change_state', (state) => {
  log('info', 'whatsapp_state_changed', { state });
});

async function processMessage(msg, correlationId = randomUUID()) {
  let stage = 'message_received';
  try {
    log('info', 'message_received', {
      correlationId,
      direction: msg.fromMe ? 'outgoing' : 'incoming',
      type: msg.type,
      hasMedia: Boolean(msg.hasMedia),
    });

    stage = 'identify_chat';
    const chatId = getMessageChatId(msg);
    const isGroup = typeof chatId === 'string' && chatId.endsWith('@g.us');
    if (!isGroup) {
      log('info', 'message_ignored_not_group', { correlationId });
      return;
    }

    if (msg.fromMe && pendingBotReplies.has(`${chatId}:${msg.body}`)) {
      updatePendingBotReply(chatId, msg.body, -1);
      log('info', 'bot_reply_echo_ignored', { correlationId });
      return;
    }

    stage = 'resolve_group';
    log('info', 'group_lookup_started', { correlationId });
    const currentGroupName = await getCachedGroupName(chatId);
    log('info', 'group_lookup_completed', {
      correlationId,
      matched: currentGroupName === groupName,
    });
    if (currentGroupName && currentGroupName !== groupName) {
      log('warn', 'group_name_mismatch', {
        correlationId,
        configuredGroupName: groupName,
        whatsappGroupName: currentGroupName,
      });
    }
    if (!currentGroupName) {
      log('warn', 'message_ignored_group_not_in_cache', { correlationId });
      return;
    }

    if (currentGroupName !== groupName) {
      log('info', 'message_ignored_other_group', { correlationId });
      return;
    }

    const textoMensagem = (msg.body || '').trim();
    const temTextoValido = textoMensagem.length > 0;
    const temImagem = Boolean(msg.hasMedia && msg.type === 'image');
    const temNumeroNoTexto = /\d/.test(textoMensagem);

    if (!temTextoValido && !temImagem) {
      log('info', 'message_ignored_empty', { correlationId });
      return;
    }

    if (!temNumeroNoTexto && !temImagem) {
      log('info', 'message_ignored_without_number_or_image', { correlationId });
      return;
    }

    log('info', 'message_accepted', { correlationId, hasImage: temImagem });
    stage = 'resolve_sender';
    const contact = msg.fromMe ? null : await msg.getContact();
    const usuario = msg.fromMe
      ? client.info?.pushname || 'Eu'
      : contact?.pushname || contact?.name || 'Não identificado';
    log('info', 'sender_resolved', {
      correlationId,
      senderType: msg.fromMe ? 'self' : 'contact',
    });
    let imagemBase64 = null;

    if (temImagem) {
      let media;
      const imageDownloadStartedAt = Date.now();
      try {
        stage = 'download_image';
        log('info', 'image_download_started', { correlationId });
        media = await msg.downloadMedia();
      } catch (error) {
        log('error', 'image_download_failed', {
          correlationId,
          durationMs: Date.now() - imageDownloadStartedAt,
          ...getErrorDetails(error),
        });
        throw error;
      }

      if (!media || !media.mimetype?.startsWith('image/')) {
        log('error', 'image_download_invalid_result', { correlationId });
        return;
      }
      imagemBase64 = media.data;
      log('info', 'image_download_completed', {
        correlationId,
        mimeType: media.mimetype,
        durationMs: Date.now() - imageDownloadStartedAt,
      });
    }

    stage = 'webhook_request';
    const webhookStartedAt = Date.now();
    log('info', 'webhook_request_started', { correlationId });
    let response;
    try {
      response = await axios.post(webhookUrl, {
        usuario,
        texto: msg.body,
        imagemBase64,
      });
    } catch (error) {
      log('error', 'webhook_request_failed', {
        correlationId,
        durationMs: Date.now() - webhookStartedAt,
        ...getErrorDetails(error),
      });
      throw error;
    }

    log('info', 'webhook_request_completed', {
      correlationId,
      httpStatus: response.status,
      durationMs: Date.now() - webhookStartedAt,
    });
    const reply = response.data?.mensagem || response.data?.message;
    if (typeof reply === 'string' && reply) {
      updatePendingBotReply(chatId, reply, 1);

      try {
        stage = 'send_reply';
        log('info', 'reply_send_started', { correlationId });
        await msg.reply(reply);
      } catch (error) {
        updatePendingBotReply(chatId, reply, -1);
        log('error', 'reply_send_failed', {
          correlationId,
          ...getErrorDetails(error),
        });
        throw error;
      }
      log('info', 'reply_send_completed', { correlationId });
    } else {
      log('warn', 'webhook_reply_missing', { correlationId });
    }

    log('info', 'message_processing_completed', { correlationId });
  } catch (error) {
    log('error', 'message_processing_failed', {
      correlationId,
      stage,
      ...getErrorDetails(error),
    });
  }
}

client.on('message_create', (msg) => {
  const correlationId = randomUUID();
  if (msg.fromMe && msg.type === 'image') {
    const messageId = msg.id._serialized;
    if (outgoingImagesBeingChecked.has(messageId)) {
      log('info', 'outgoing_image_check_already_running', { correlationId });
      return;
    }

    outgoingImagesBeingChecked.add(messageId);
    log('info', 'outgoing_image_detected', { correlationId });
    waitForOutgoingImage(msg, correlationId)
      .catch((error) => {
        log('error', 'outgoing_image_processing_failed', {
          correlationId,
          ...getErrorDetails(error),
        });
      })
      .finally(() => outgoingImagesBeingChecked.delete(messageId));
    return;
  }

  processMessage(msg, correlationId);
});

log('info', 'whatsapp_client_initialization_started');
client.initialize()
  .then(() => log('info', 'whatsapp_client_initialization_completed'))
  .catch((error) => {
    log('error', 'whatsapp_client_initialization_failed', getErrorDetails(error));
  });
