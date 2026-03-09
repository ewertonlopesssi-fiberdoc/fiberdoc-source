# Configuração de Webhook SGP TSMx → GenieACS

## Visão Geral

Este documento descreve como configurar o webhook do SGP TSMx para sincronizar automaticamente as configurações de cliente (PPPoE, Wi-Fi) na ONU via GenieACS quando dados são alterados no SGP.

---

## 📋 Fluxo de Sincronização

```
1. Cliente alterado no SGP TSMx
   ↓
2. SGP envia webhook para FiberDoc (/api/webhooks/sgp)
   ↓
3. FiberDoc valida assinatura HMAC-SHA256
   ↓
4. FiberDoc busca dados da ONU no SGP
   ↓
5. FiberDoc envia configurações para GenieACS via TR-069
   ↓
6. GenieACS aplica na ONU
   ↓
7. TP-Link ONT recebe e aplica configurações
   ↓
8. Cliente conectado com PPPoE + Wi-Fi configurados
```

---

## 🔧 Configuração do FiberDoc

### 1. Endpoint Webhook

O FiberDoc expõe o endpoint:

```
POST /api/webhooks/sgp
```

**URL Completa:**
```
https://seu-fiberdoc.com/api/webhooks/sgp
```

### 2. Configurar Secret do Webhook (Opcional)

Para validar assinatura HMAC-SHA256, configure o secret no FiberDoc:

**Via UI (Sistema → Configurações):**
- Adicionar chave: `sgp_webhook_secret`
- Valor: `seu-secret-aqui` (mínimo 32 caracteres)

**Via SQL (Direto no banco):**
```sql
INSERT INTO system_settings (key, value) 
VALUES ('sgp_webhook_secret', 'seu-secret-aqui')
ON DUPLICATE KEY UPDATE value = 'seu-secret-aqui';
```

**Sem Secret (Modo Teste):**
Se não configurar secret, o FiberDoc aceitará webhooks sem validação de assinatura.

---

## 🔐 Configuração do SGP TSMx

### 1. Acessar Gerenciador de Webhooks

No SGP TSMx:
```
Sistema → Integrações → Webhooks
```

### 2. Criar Novo Webhook

**Configurações:**

| Campo | Valor |
|---|---|
| **Nome** | FiberDoc - Sincronização ONU |
| **URL** | `https://seu-fiberdoc.com/api/webhooks/sgp` |
| **Método** | POST |
| **Eventos** | `onu_updated`, `client_updated`, `service_updated` |
| **Secret** | `seu-secret-aqui` (mesmo valor do FiberDoc) |
| **Ativo** | ✓ Sim |

### 3. Headers Personalizados

Adicionar header:
```
X-Webhook-Signature: [HMAC-SHA256 do payload]
```

O SGP deve calcular:
```
HMAC-SHA256(payload_json, secret) = assinatura_hex
```

---

## 📤 Formato do Webhook

### Payload Esperado

```json
{
  "event": "onu_updated",
  "serial": "TPLINK1234567890",
  "servicoId": 12345,
  "contractId": 67890,
  "timestamp": 1710000000000,
  "data": {
    "serial": "TPLINK1234567890",
    "onu_login": "cliente@isp.com.br",
    "onu_password": "senha123",
    "wifi_ssid": "WiFi-Cliente",
    "wifi_password": "wifisenha123",
    "wifi_ssid5": "WiFi-Cliente-5G",
    "wifi_password5": "wifisenha123"
  }
}
```

### Campos Obrigatórios

- **event**: Tipo de evento (`onu_updated`, `client_updated`, `service_updated`)
- **serial**: Serial da ONU (ex: `TPLINK1234567890`)
- **timestamp**: Unix timestamp em milissegundos

### Campos Opcionais

- **servicoId**: ID do serviço no SGP
- **contractId**: ID do contrato no SGP
- **data**: Objeto com dados adicionais (pode conter serial se não fornecido no topo)

---

## 🔄 Campos Sincronizados

| Campo SGP | Campo GenieACS (TR-069) | Descrição |
|---|---|---|
| `onu_login` | `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username` | Login PPPoE |
| `onu_password` | `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password` | Senha PPPoE |
| `wifi_ssid` | `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID` | SSID Wi-Fi 2.4GHz |
| `wifi_password` | `InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey` | Senha Wi-Fi 2.4GHz |
| `wifi_ssid5` | `InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID` | SSID Wi-Fi 5GHz |
| `wifi_password5` | `InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.PreSharedKey.1.PreSharedKey` | Senha Wi-Fi 5GHz |

---

## 📝 Resposta do Webhook

### Sucesso (200 OK)

```json
{
  "success": true,
  "serial": "TPLINK1234567890",
  "message": "ONU TPLINK1234567890 sincronizada com sucesso"
}
```

### Erro - Assinatura Inválida (401)

```json
{
  "error": "Assinatura inválida"
}
```

### Erro - Falha na Sincronização (400)

```json
{
  "error": "Falha ao processar webhook"
}
```

### Erro - Servidor (500)

```json
{
  "error": "Descrição do erro"
}
```

---

## 🔄 Retry Automático

Se a sincronização falhar, o FiberDoc tenta novamente com backoff exponencial:

| Tentativa | Delay | Total |
|---|---|---|
| 1ª | Imediato | 0s |
| 2ª | 1 segundo | 1s |
| 3ª | 2 segundos | 3s |
| 4ª | 4 segundos | 7s |

Após 3 falhas, a sincronização é registrada como erro permanente.

---

## 🧪 Teste do Webhook

### 1. Via cURL

```bash
curl -X POST https://seu-fiberdoc.com/api/webhooks/sgp \
  -H "Content-Type: application/json" \
  -d '{
    "event": "onu_updated",
    "serial": "TPLINK1234567890",
    "timestamp": '$(date +%s000)',
    "data": {
      "onu_login": "teste@isp.com.br",
      "onu_password": "teste123",
      "wifi_ssid": "WiFi-Teste",
      "wifi_password": "teste123"
    }
  }'
```

### 2. Via Postman

1. Criar nova requisição POST
2. URL: `https://seu-fiberdoc.com/api/webhooks/sgp`
3. Headers:
   - `Content-Type: application/json`
4. Body (raw JSON):
```json
{
  "event": "onu_updated",
  "serial": "TPLINK1234567890",
  "timestamp": 1710000000000,
  "data": {
    "onu_login": "teste@isp.com.br",
    "onu_password": "teste123",
    "wifi_ssid": "WiFi-Teste",
    "wifi_password": "teste123"
  }
}
```

### 3. Verificar Logs

No servidor FiberDoc:
```bash
tail -f /var/log/fiberdoc.log | grep "\[Webhook\]"
```

Procure por:
- `[Webhook] Recebido evento: onu_updated`
- `[Webhook] ✓ Sincronização bem-sucedida: TPLINK1234567890`
- `[Webhook] ✗ Erro na sincronização: ...`

---

## 🚨 Troubleshooting

### Webhook não é recebido

1. Verificar se URL está correta e acessível
2. Verificar firewall/proxy
3. Testar conectividade: `curl -I https://seu-fiberdoc.com/api/webhooks/sgp`

### Erro: "Assinatura inválida"

1. Verificar se secret no SGP == secret no FiberDoc
2. Verificar se SGP está calculando HMAC-SHA256 corretamente
3. Desabilitar validação (remover secret) para testes

### Erro: "ONU não encontrada no SGP"

1. Verificar se serial está correto
2. Verificar se ONU está cadastrada no SGP
3. Verificar se SGP está acessível do FiberDoc

### Erro: "ONU não encontrada no GenieACS"

1. Verificar se GenieACS está online
2. Verificar se ONU aparece em `/devices` no GenieACS
3. Verificar se serial no GenieACS == serial no SGP

### Erro: "Dados PPPoE incompletos"

1. Verificar se `onu_login` e `onu_password` estão preenchidos no SGP
2. Verificar se cliente tem contrato ativo

---

## 📊 Monitoramento

### Verificar Status do Webhook

No FiberDoc, acessar:
```
Sistema → Logs → Webhooks
```

Visualizar:
- Data/hora da sincronização
- Serial da ONU
- Status (sucesso/erro)
- Mensagem de erro (se houver)

### Alertas Recomendados

Configurar alertas para:
- Webhook com erro permanente
- Taxa de erro > 10%
- Latência de sincronização > 30 segundos

---

## 🔒 Segurança

### Boas Práticas

1. **Use HTTPS** — Sempre usar HTTPS para webhooks
2. **Valide Assinatura** — Configurar secret HMAC-SHA256
3. **Limite de Tentativas** — Máximo 3 retries
4. **Timeout** — 30 segundos por sincronização
5. **Logs** — Registrar todas as sincronizações

### Proteção contra Replay

O FiberDoc não implementa proteção contra replay por padrão. Para adicionar:

1. Adicionar campo `nonce` no webhook
2. Registrar nonces já processados
3. Rejeitar nonces duplicados

---

## 📞 Suporte

Para problemas ou dúvidas:

1. Verificar logs do FiberDoc: `[Webhook]`
2. Verificar logs do SGP: Seção de Webhooks
3. Verificar logs do GenieACS: `/api/logs`
4. Contactar suporte técnico

---

## 📚 Referências

- [GenieACS Documentation](https://genieacs.com/)
- [TR-069 Specification](https://www.broadband-forum.org/)
- [HMAC-SHA256](https://en.wikipedia.org/wiki/HMAC)
