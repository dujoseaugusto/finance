# whatsapp-financas

Bot local que encaminha mensagens do grupo configurado no WhatsApp para um webhook do Google Apps Script.

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
