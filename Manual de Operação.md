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

**Acompanhar tudo em tempo real:**

```bash
sudo journalctl -u whatsapp-bot -f
```

**Acompanhar logs em formato simplificado:**

```bash
sudo journalctl -u whatsapp-bot -f -o cat
```

Este é o comando mais importante para acompanhar o QR Code quando precisar autenticar novamente o WhatsApp.

**Consultar os últimos 100 registros:**

```bash
sudo journalctl -u whatsapp-bot -n 100
```

**Consultar registros das últimas 24 horas:**

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
sudo journalctl -u whatsapp-bot -f -o cat
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

Depois da autenticação, procure a mensagem:

```text
Bot conectado ao WhatsApp.
```

---

## 6. Resumo dos comandos mais utilizados

| Necessidade | Comando |
|---|---|
| Verificar funcionamento | `sudo systemctl status whatsapp-bot` |
| Acompanhar logs | `sudo journalctl -u whatsapp-bot -f -o cat` |
| Ver últimos registros | `sudo journalctl -u whatsapp-bot -n 100` |
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

**Objetivo:** manter o WhatsApp Finance Bot funcionando continuamente, com inicialização automática, reinicialização diária e facilidade para diagnosticar problemas.