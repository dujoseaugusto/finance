# Manual de Operação — WhatsApp Finance Bot

**Projeto:** `/home/jose-augusto/projets/finance`  
**Serviço Linux:** `whatsapp-bot`  
**Agendamento:** Reinicialização diária às 04:00  
**Usuário:** `jose-augusto`

---

## 1. Verificar se o bot está funcionando

**Consultar status completo:**

```bash
sudo systemctl status whatsapp-bot
```

Resultado esperado: `active (running)`.

**Verificar rapidamente se está ativo:**

```bash
systemctl is-active whatsapp-bot
```

**Verificar se inicia automaticamente com o Linux:**

```bash
systemctl is-enabled whatsapp-bot
```

Resultado esperado: `enabled`.

---

## 2. Acompanhar os logs

Por padrão, a saída da aplicação vai para o journal do systemd. Para manter uma retenção de três dias somente para o bot, aplique a configuração dedicada abaixo; depois disso, os logs da aplicação ficam no arquivo indicado e o journal continua registrando os eventos de início e parada do serviço.

**Acompanhar mensagens do bot em tempo real:**

```bash
sudo tail -f /home/jose-augusto/.local/state/whatsapp-bot/bot.log
```

**Consultar os últimos registros do bot:**

```bash
sudo tail -n 100 /home/jose-augusto/.local/state/whatsapp-bot/bot.log
```

Cada registro do bot aparece em JSON, com horário, nível e evento. Os eventos `whatsapp_ready` e `whatsapp_disconnected` indicam, respectivamente, conexão pronta e desconexão. Use este arquivo também para acompanhar o QR Code.

**Filtrar erros e avisos:**

```bash
sudo tail -f /home/jose-augusto/.local/state/whatsapp-bot/bot.log | grep -E '"level":"(warn|error)"'
```

**Consultar eventos de uma mensagem pelo identificador de correlação:**

Cada etapa de processamento inclui um `correlationId`. Copie o valor do evento `message_received` e procure os registros relacionados:

```bash
sudo grep -F 'ID_DE_CORRELACAO' /home/jose-augusto/.local/state/whatsapp-bot/bot.log*
```

Os registros identificam etapas como `image_download_started`, `webhook_request_started` e `reply_send_completed`. Falhas incluem o campo `stage`, que aponta a etapa em que ocorreram.

Quando o título do grupo não corresponder à configuração, o evento `group_name_mismatch` registra os dois títulos para facilitar a comparação. Os logs da aplicação são mantidos em arquivo e rotacionados diariamente, com retenção aproximada de três dias.

O journal continua disponível para eventos do próprio systemd, como início e parada do serviço:

```bash
sudo journalctl -u whatsapp-bot -f
```

### Configurar logs do bot e retenção de três dias

Instale o drop-in do systemd e a regra do logrotate incluídos no projeto:

```bash
cd /home/jose-augusto/projets/finance
sudo install -d -o jose-augusto -g jose-augusto /home/jose-augusto/.local/state/whatsapp-bot
sudo install -D -m 0644 ops/systemd/whatsapp-bot-logging.conf /etc/systemd/system/whatsapp-bot.service.d/10-logging.conf
sudo install -m 0644 ops/logrotate/whatsapp-bot /etc/logrotate.d/whatsapp-bot
sudo systemctl daemon-reload
sudo systemctl restart whatsapp-bot
```

O drop-in envia a saída da aplicação para `/home/jose-augusto/.local/state/whatsapp-bot/bot.log`. A pasta precisa existir antes de reiniciar o serviço. O logrotate divide o arquivo diariamente e limita a retenção a dois arquivos anteriores e três dias de idade. Para conferir a regra sem rotacionar arquivos:

```bash
sudo logrotate --debug /etc/logrotate.d/whatsapp-bot
```

**Consultar os últimos 100 eventos do systemd:**

```bash
sudo journalctl -u whatsapp-bot -n 100
```

**Consultar eventos do systemd das últimas 24 horas:**

```bash
sudo journalctl -u whatsapp-bot --since "24 hours ago"
```

**Sair da visualização dos logs:** pressione `Ctrl + C`.

---

## 3. Controlar o bot manualmente

**Iniciar:**

```bash
sudo systemctl start whatsapp-bot
```

**Parar:**

```bash
sudo systemctl stop whatsapp-bot
```

**Reiniciar:**

```bash
sudo systemctl restart whatsapp-bot
```

**Depois de reiniciar, acompanhar os logs:**

```bash
sudo tail -f /var/log/whatsapp-bot/bot.log
```

---

## 4. Verificar a reinicialização diária (04:00)

**Consultar o próximo horário programado:**

```bash
systemctl list-timers whatsapp-bot-restart.timer
```

**Consultar o status do agendamento:**

```bash
sudo systemctl status whatsapp-bot-restart.timer
```

Resultado esperado: `active (waiting)`.

**Verificar se o agendamento está habilitado:**

```bash
systemctl is-enabled whatsapp-bot-restart.timer
```

Resultado esperado: `enabled`.

**Consultar o histórico das reinicializações:**

```bash
sudo journalctl -u whatsapp-bot-restart.service -n 50
```

---

## 5. Quando perder a sessão do WhatsApp

Se o WhatsApp desconectar e solicitar uma nova autenticação:

1. Abra o terminal.
2. Execute:

```bash
sudo journalctl -u whatsapp-bot -f -o cat
```

3. Aguarde a geração do QR Code.
4. Abra o WhatsApp no celular.
5. Entre em **Dispositivos conectados**.
6. Selecione **Conectar dispositivo**.
7. Escaneie o QR Code exibido no terminal.

Depois da autenticação, procure o evento `whatsapp_ready`, que indica que o cliente está pronto:

```json
{"level":"info","event":"whatsapp_ready"}
```

---

## 6. Resumo dos comandos mais utilizados

| Necessidade | Comando |
|---|---|
| Verificar funcionamento | `sudo systemctl status whatsapp-bot` |
| Acompanhar logs do bot | `sudo tail -f /home/jose-augusto/.local/state/whatsapp-bot/bot.log` |
| Ver últimos registros do bot | `sudo tail -n 100 /home/jose-augusto/.local/state/whatsapp-bot/bot.log` |
| Ver eventos do systemd | `sudo journalctl -u whatsapp-bot -f` |
| Reiniciar bot | `sudo systemctl restart whatsapp-bot` |
| Iniciar bot | `sudo systemctl start whatsapp-bot` |
| Parar bot | `sudo systemctl stop whatsapp-bot` |
| Ver próximo agendamento | `systemctl list-timers whatsapp-bot-restart.timer` |
| Ver status do agendamento | `sudo systemctl status whatsapp-bot-restart.timer` |

---

## 7. Observações importantes

- Não execute `npm start` manualmente enquanto o serviço systemd estiver ativo, para evitar duas instâncias do bot.
- A sessão do WhatsApp é mantida pelo mecanismo de autenticação do projeto.
- O reinício diário às 04:00 não deve apagar a sessão salva.
- Se o computador estiver desligado às 04:00, o timer configurado com `Persistent=true` poderá executar a tarefa quando o Linux voltar a funcionar.
- O systemd reinicia o processo quando ele encerra, mas não garante a recuperação de uma sessão inválida do WhatsApp.
- Os logs do bot não registram o texto das mensagens, imagens, números de telefone nem o conteúdo retornado pelo webhook.

**Objetivo:** manter o WhatsApp Finance Bot funcionando continuamente, com inicialização automática, reinicialização diária e facilidade para diagnosticar problemas.