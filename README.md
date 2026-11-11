# whatsapp-financas

Bot local que encaminha mensagens do grupo configurado no WhatsApp para um webhook do Google Apps Script.

## Consultar contas fixas do mês

No grupo configurado, quando uma pessoa enviar um texto que não seja reconhecido como registro financeiro, o bot perguntará se deseja consultar as contas fixas do mês. Responda `SIM` em até cinco minutos para consultar. A resposta lista cada conta usando somente o ícone de status e o nome.

A consulta usa o mesmo `WEBHOOK_URL` dos registros, enviando:

```json
{"acao":"listarItensAPagar"}
```

## Instalação e configuração

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie `.env.example` para `.env` e configure `NOME_DO_GRUPO` e `WEBHOOK_URL`.
3. Inicie o bot:
   ```bash
   npm start
   ```

Na primeira execução, escaneie o QR code exibido no terminal com o WhatsApp. A sessão será salva localmente.
