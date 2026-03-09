# Como Criar Webhook no SGP TSMx

## 📋 Visão Geral

Este guia mostra passo a passo como registrar um webhook no SGP TSMx para sincronizar automaticamente com o FiberDoc quando dados de cliente são alterados.

---

## 🔧 Passo 1: Acessar Configurações de Webhooks

### No SGP TSMx:

1. **Login** no painel administrativo do SGP
2. Ir para: **Sistema** → **Integrações** (ou **Webhooks**)
3. Procurar por: **"Gerenciador de Webhooks"** ou **"Webhooks"**

**Exemplo de Menu:**
```
┌─ Sistema
│  ├─ Configurações Gerais
│  ├─ Usuários e Permissões
│  ├─ Integrações
│  │  ├─ APIs Externas
│  │  ├─ Webhooks ← AQUI
│  │  └─ Sincronizações
│  └─ Logs
```

---

## ➕ Passo 2: Criar Novo Webhook

### Clique em: **"Novo Webhook"** ou **"+ Adicionar"**

Você verá um formulário com os seguintes campos:

```
┌─────────────────────────────────────────────────────┐
│ Criar Novo Webhook                                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Nome do Webhook: ___________________________        │
│ [Descrição breve para identificar]                 │
│                                                     │
│ URL de Destino: ___________________________        │
│ [Onde o webhook será enviado]                      │
│                                                     │
│ Tipo de Evento: [Dropdown ▼]                       │
│ ☐ ONU Atualizada                                   │
│ ☐ Cliente Atualizado                               │
│ ☐ Serviço Atualizado                               │
│ ☐ Todos os Eventos                                 │
│                                                     │
│ Método HTTP: [POST ▼]                              │
│                                                     │
│ Autenticação: [Dropdown ▼]                         │
│ ○ Nenhuma                                          │
│ ○ Bearer Token                                     │
│ ○ HMAC-SHA256                                      │
│                                                     │
│ Secret (se HMAC): ___________________________       │
│                                                     │
│ Headers Customizados:                              │
│ ┌─────────────────────────────────────────────┐   │
│ │ [+ Adicionar Header]                        │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ Ativo: [✓] Sim                                     │
│                                                     │
│ [Cancelar]  [Testar]  [Salvar]                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 📝 Passo 3: Preencher os Campos

### **3.1 Nome do Webhook**

```
Nome: FiberDoc - Sincronização de ONUs
```

Escolha um nome descritivo para identificar facilmente.

---

### **3.2 URL de Destino**

```
URL: https://seu-fiberdoc.com/api/webhooks/sgp
```

**Importante:**
- Use **HTTPS** (nunca HTTP)
- Substitua `seu-fiberdoc.com` pelo domínio real
- A URL deve estar **acessível da internet**
- Testar conectividade: `curl -I https://seu-fiberdoc.com/api/webhooks/sgp`

**Exemplos de URLs válidas:**
```
https://fiberdoc.empresa.com.br/api/webhooks/sgp
https://192.168.1.100:3000/api/webhooks/sgp  (se acesso local)
https://fiberdoc.manus.space/api/webhooks/sgp  (se hospedado em Manus)
```

---

### **3.3 Tipo de Evento**

Selecione **todos** os eventos que devem disparar o webhook:

```
☑ ONU Atualizada          ← Quando dados da ONU mudam
☑ Cliente Atualizado      ← Quando dados do cliente mudam
☑ Serviço Atualizado      ← Quando dados do serviço mudam
```

**Recomendação:** Marque todos os 3 para sincronizar em qualquer mudança.

---

### **3.4 Método HTTP**

```
Método: POST
```

Deixe como **POST** (padrão).

---

### **3.5 Autenticação**

Selecione: **HMAC-SHA256**

```
Autenticação: ○ Nenhuma
              ● HMAC-SHA256
              ○ Bearer Token
```

---

### **3.6 Secret (Chave de Assinatura)**

```
Secret: seu-secret-super-secreto-32-caracteres-ou-mais
```

**Como gerar um secret seguro:**

**Opção 1: Via Linux/Mac**
```bash
openssl rand -hex 32
# Resultado: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

**Opção 2: Via PowerShell (Windows)**
```powershell
[Convert]::ToHexString([byte[]]@((1..32 | ForEach-Object {Get-Random -Maximum 256})))
```

**Opção 3: Online (menos seguro)**
- https://www.random.org/hex/
- Gerar 32 caracteres hexadecimais

**Importante:**
- Mínimo 32 caracteres
- Use caracteres aleatórios (letras + números)
- Guarde este secret em local seguro
- Você precisará configurar o mesmo secret no FiberDoc

---

### **3.7 Headers Customizados**

Clique em **"+ Adicionar Header"** e adicione:

```
Header 1:
  Nome: X-Webhook-Signature
  Valor: [será preenchido automaticamente pelo SGP]

Header 2 (Opcional):
  Nome: X-SGP-Source
  Valor: sgp-tsmx
```

O header `X-Webhook-Signature` é **obrigatório** para validação HMAC-SHA256.

---

### **3.8 Ativo**

```
☑ Ativo
```

Deixe marcado para o webhook funcionar imediatamente.

---

## 🧪 Passo 4: Testar o Webhook

### Clique em: **"Testar"**

O SGP enviará um webhook de teste para a URL configurada.

**Resposta esperada:**
```json
{
  "success": true,
  "serial": "TPLINK-TEST-123",
  "message": "ONU sincronizada com sucesso"
}
```

**Se falhar:**
- Verificar se URL está correta
- Verificar se FiberDoc está online
- Verificar firewall/proxy
- Ver logs do FiberDoc: `[Webhook]`

---

## 💾 Passo 5: Salvar o Webhook

### Clique em: **"Salvar"**

O webhook será criado e ativado automaticamente.

---

## ✅ Passo 6: Configurar Secret no FiberDoc

Agora você precisa informar ao FiberDoc qual é o secret para validar as assinaturas.

### No FiberDoc:

1. Ir para: **Sistema** → **Configurações**
2. Procurar por: **"SGP Webhook Secret"** ou **"Webhook"**
3. Preencher com o mesmo secret que usou no SGP

**Via SQL (se não houver UI):**
```sql
INSERT INTO system_settings (key, value) 
VALUES ('sgp_webhook_secret', 'seu-secret-super-secreto-32-caracteres-ou-mais')
ON DUPLICATE KEY UPDATE value = 'seu-secret-super-secreto-32-caracteres-ou-mais';
```

---

## 🔄 Passo 7: Testar a Sincronização Completa

### No SGP TSMx:

1. Editar um cliente/ONU
2. Alterar dados (ex: Wi-Fi SSID ou PPPoE login)
3. Salvar

### No FiberDoc:

1. Verificar logs: `[Webhook] ✓ Sincronização bem-sucedida`
2. Verificar se ONU foi atualizada no GenieACS
3. Verificar se TP-Link ONT recebeu as configurações

---

## 📊 Monitoramento de Webhooks

### No SGP TSMx:

Ir para: **Sistema** → **Integrações** → **Webhooks** → **Histórico**

Você verá:
- Data/hora do envio
- URL de destino
- Status (sucesso/erro)
- Código HTTP retornado
- Tempo de resposta

```
┌─────────────────────────────────────────────────────┐
│ Histórico de Webhooks                               │
├─────────────────────────────────────────────────────┤
│ Data/Hora        │ Evento    │ Status │ Código │ ms │
├─────────────────────────────────────────────────────┤
│ 09/03 18:45:23   │ ONU Upd   │ ✓ OK   │ 200    │ 245│
│ 09/03 18:42:15   │ Client    │ ✓ OK   │ 200    │ 312│
│ 09/03 18:40:08   │ Service   │ ✗ Erro │ 500    │ 1200
│ 09/03 18:38:45   │ ONU Upd   │ ✓ OK   │ 200    │ 198│
└─────────────────────────────────────────────────────┘
```

---

## 🚨 Troubleshooting

### Webhook não é enviado

**Causa:** Webhook desativado ou evento não configurado

**Solução:**
1. Verificar se webhook está **Ativo** ✓
2. Verificar se evento está selecionado
3. Reativar webhook

---

### Erro 401 - Assinatura Inválida

**Causa:** Secret diferente no SGP e FiberDoc

**Solução:**
1. Verificar secret no SGP
2. Verificar secret no FiberDoc
3. Garantir que são idênticos
4. Reenviar webhook

---

### Erro 500 - Erro do Servidor

**Causa:** Erro no FiberDoc

**Solução:**
1. Verificar logs do FiberDoc: `grep "\[Webhook\]" /var/log/fiberdoc.log`
2. Verificar se GenieACS está online
3. Verificar se ONU existe no SGP e GenieACS

---

### Erro 404 - URL Não Encontrada

**Causa:** URL incorreta ou FiberDoc offline

**Solução:**
1. Testar URL: `curl -I https://seu-fiberdoc.com/api/webhooks/sgp`
2. Verificar se FiberDoc está online
3. Verificar firewall/proxy
4. Verificar DNS

---

## 📋 Checklist Final

- [ ] Webhook criado no SGP com nome descritivo
- [ ] URL correta: `https://seu-fiberdoc.com/api/webhooks/sgp`
- [ ] Eventos selecionados: ONU, Cliente, Serviço
- [ ] Autenticação: HMAC-SHA256
- [ ] Secret gerado e seguro (32+ caracteres)
- [ ] Headers customizados adicionados
- [ ] Webhook ativo ✓
- [ ] Teste do webhook passou
- [ ] Secret configurado no FiberDoc
- [ ] Teste de sincronização completa passou
- [ ] Histórico de webhooks monitorado

---

## 🎯 Próximas Etapas

1. **Monitorar sincronizações** — Acompanhar histórico de webhooks
2. **Configurar alertas** — Notificar se taxa de erro > 10%
3. **Documentar processo** — Treinar equipe sobre fluxo
4. **Backup de configurações** — Salvar secret em local seguro

---

## 📞 Suporte

Se encontrar problemas:

1. Verificar logs do SGP (Webhooks)
2. Verificar logs do FiberDoc (`[Webhook]`)
3. Verificar logs do GenieACS (`/api/logs`)
4. Contactar suporte técnico
