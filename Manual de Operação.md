# Manual de Operação — WhatsApp Finance Bot

**Projeto:** `/home/jose-augusto/projets/finance`

**Serviço systemd:** `whatsapp-bot`

**Usuário Linux:** `jose-augusto`

Este manual reúne os comandos para verificar e controlar o bot nesta máquina. Use **systemd** como forma normal de execução; rode `npm start` manualmente apenas para testes ou diagnóstico, nunca ao mesmo tempo que o serviço.

## Verificar e controlar o serviço

```bash
sudo systemctl status whatsapp-bot
sudo systemctl start whatsapp-bot
sudo systemctl stop whatsapp-bot
sudo systemctl restart whatsapp-bot
```

Para verificar se o serviço está ativo e configurado para iniciar com o Linux:

```bash
systemctl is-active whatsapp-bot
systemctl is-enabled whatsapp-bot
```

Para habilitar o início automático ou desabilitá-lo:

```bash
sudo systemctl enable whatsapp-bot
sudo systemctl disable whatsapp-bot
```

## Consultar logs

Com a configuração de log em arquivo instalada, a saída normal do bot fica em `/home/jose-augusto/.local/state/whatsapp-bot/bot.log`. Acompanhar em tempo real:

```bash
sudo tail -f /home/jose-augusto/.local/state/whatsapp-bot/bot.log
```

Ver os últimos 100 registros:

```bash
sudo tail -n 100 /home/jose-augusto/.local/state/whatsapp-bot/bot.log
```

Filtrar avisos e erros:

```bash
sudo tail -f /home/jose-augusto/.local/state/whatsapp-bot/bot.log | grep -E '"level":"(warn|error)"'
```

Os registros são JSON. Para acompanhar o processamento de uma mensagem, copie o `correlationId` do evento `message_received` e procure todas as etapas relacionadas:

```bash
sudo grep -F 'ID_DE_CORRELACAO' /home/jose-augusto/.local/state/whatsapp-bot/bot.log*
```

Eventos como `image_download_started`, `webhook_request_started` e `reply_send_completed` indicam o progresso; em falhas, o campo `stage` mostra a etapa. `group_name_mismatch` indica que o nome do grupo recebido difere do configurado.

O journal do systemd registra eventos do serviço e a saída de erro do processo:

```bash
sudo journalctl -u whatsapp-bot -f
sudo journalctl -u whatsapp-bot -n 100
sudo journalctl -u whatsapp-bot --since "24 hours ago"
```

Para sair de uma visualização em tempo real, pressione `Ctrl+C`.

### Configurar arquivo de log e rotação

Se os arquivos de configuração `ops/systemd/whatsapp-bot-logging.conf` e `ops/logrotate/whatsapp-bot` estiverem disponíveis no projeto, instale-os uma vez:

```bash
cd /home/jose-augusto/projets/finance
sudo install -d -o jose-augusto -g jose-augusto /home/jose-augusto/.local/state/whatsapp-bot
sudo install -D -m 0644 ops/systemd/whatsapp-bot-logging.conf /etc/systemd/system/whatsapp-bot.service.d/10-logging.conf
sudo install -m 0644 ops/logrotate/whatsapp-bot /etc/logrotate.d/whatsapp-bot
sudo systemctl daemon-reload
sudo systemctl restart whatsapp-bot
```

A rotação é diária, mantém até dois arquivos rotacionados e remove arquivos com mais de três dias na próxima execução do logrotate. Validar a regra sem rotacionar arquivos:

```bash
sudo logrotate --debug /etc/logrotate.d/whatsapp-bot
```

## Reinicialização diária

Se o timer `whatsapp-bot-restart.timer` estiver instalado, consultar a próxima execução, o estado e o histórico:

```bash
systemctl list-timers whatsapp-bot-restart.timer
sudo systemctl status whatsapp-bot-restart.timer
systemctl is-enabled whatsapp-bot-restart.timer
sudo journalctl -u whatsapp-bot-restart.service -n 50
```

O timer está previsto para reiniciar o bot diariamente às 04:00. Se estiver configurado com `Persistent=true`, uma execução perdida enquanto a máquina estava desligada poderá ocorrer quando ela voltar a ligar.

## Executar manualmente

Use este modo apenas com o serviço parado:

```bash
sudo systemctl stop whatsapp-bot
cd /home/jose-augusto/projets/finance
npm start
```

Para encerrar a execução manual, pressione `Ctrl+C`. Depois, retome a execução normal:

```bash
sudo systemctl start whatsapp-bot
```

## Reconectar o WhatsApp

Se for solicitado um novo pareamento:

1. Acompanhe a saída do bot. Com o serviço systemd e o log em arquivo, use:
   ```bash
   sudo tail -f /home/jose-augusto/.local/state/whatsapp-bot/bot.log
   ```
   Se estiver executando com `npm start`, o QR Code aparece no próprio terminal.
2. No celular, abra **WhatsApp > Dispositivos conectados > Conectar dispositivo**.
3. Escaneie o QR Code.
4. Aguarde o evento `whatsapp_ready`, que confirma que o cliente está pronto.

## Observações

- Não execute `npm start` enquanto o serviço systemd estiver ativo; isso inicia uma segunda instância.
- A sessão do WhatsApp fica salva localmente pelo `LocalAuth` e não deve ser apagada durante uma reinicialização normal.
- O systemd reinicia o processo se ele encerrar, mas não garante a recuperação de uma sessão inválida.
- O bot não registra o texto das mensagens, imagens, números de telefone nem o conteúdo retornado pelo webhook.
