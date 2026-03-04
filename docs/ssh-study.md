# Estudo Técnico: SSH Commander — MikroTik, Huawei NE8000 e Huawei MA5800 (6730)

## Diagnóstico do Problema Actual

O terminal SSH mostra o **banner de login** mas **não mostra o output dos comandos** (ex: `ip address print`).

### Causa Raiz Identificada

O código actual usa `conn.shell()` do ssh2 com PTY (pseudo-terminal) alocado. O problema é que o MikroTik RouterOS usa um shell interactivo que **repinta o ecrã** usando sequências ANSI. Quando o servidor envia `ip address print\n`, o MikroTik:

1. Ecoa o comando de volta (com ANSI de cor)
2. Repinta o prompt com ANSI cursor-move
3. Envia o output do comando
4. Repinta o prompt novamente

O strip ANSI que adicionámos remove **todas** as sequências ANSI, incluindo os caracteres de texto que o MikroTik envia como parte do output. O resultado é que o output fica vazio ou muito reduzido.

**O problema real**: o MikroTik com PTY usa `\r\n` (CRLF) e repintura de linha. O output do `ip address print` chega em múltiplos chunks com sequências de cursor que reposicionam o texto. Após o strip ANSI, os chunks ficam com apenas `\r\n` e o texto visível some.

---

## Comportamento por Equipamento

### MikroTik RouterOS 7.x

| Característica | Comportamento |
|---|---|
| Shell | Interactivo com PTY obrigatório para output correcto |
| Prompt | `[user@hostname] > ` (com espaço no final) |
| Output | Enviado com ANSI de cor + repintura de linha |
| CRLF | Usa `\r\n` (CRLF) |
| Paginação | Sem paginação por defeito (`disable_paging` não necessário) |
| Comando de saída | `quit` (não `exit`) |
| Detecção de fim | Aguardar o prompt aparecer após o output |
| Problema crítico | Com PTY: repintura ANSI oculta o output após strip. Sem PTY: output truncado |
| Solução | Usar **detecção de prompt** em vez de timeout fixo |

### Huawei NE8000 (VRP — Versatile Routing Platform)

| Característica | Comportamento |
|---|---|
| Shell | Interactivo com PTY |
| Prompt | `<hostname>` ou `[hostname]` (modo config) |
| Output | Texto limpo, sem ANSI de cor (ou com ANSI mínimo) |
| CRLF | Usa `\r\n` (CRLF) |
| Paginação | **SIM** — usa `---- More ----` que bloqueia o output |
| Desactivar paginação | `screen-length 0 temporary` (por sessão) |
| Comando de saída | `quit` |
| Detecção de fim | Aguardar o prompt após o output |
| Problema crítico | Paginação bloqueia output se não for desactivada |

### Huawei SmartAX MA5800 (OLT — 6730)

| Característica | Comportamento |
|---|---|
| Shell | Interactivo com PTY |
| Prompt | `MA5800-X17(config)#` ou `MA5800-X17>` |
| Output | Texto com possível ANSI mínimo |
| CRLF | Usa `\r\n` (CRLF) |
| Paginação | **SIM** — usa `---- More ( Press 'Q' to break ) ----` |
| Desactivar paginação | **NÃO SUPORTADO** — deve enviar espaço para continuar |
| Comando de saída | `quit` ou `exit` |
| Detecção de fim | Aguardar o prompt após o output |
| Problema crítico | Paginação não pode ser desactivada; deve ser gerida enviando espaços |

---

## Solução Técnica Correcta: Detecção de Prompt

A abordagem correcta (usada pelo Netmiko, Paramiko e todas as ferramentas de automação de rede profissionais) é:

1. **Abrir sessão shell** com PTY de largura grande (200+ colunas) para evitar quebra de linha
2. **Aguardar o prompt inicial** antes de enviar qualquer comando
3. **Enviar cada comando** e aguardar que o prompt apareça novamente no output
4. **Detectar o prompt** usando regex baseado no que foi observado após o login
5. **Gerir paginação** enviando espaço quando `---- More ----` aparecer
6. **Strip ANSI selectivo**: remover apenas sequências de controlo de cursor, manter o texto

### Algoritmo de Detecção de Prompt

```
1. Conectar e abrir shell com PTY (cols=220, rows=50)
2. Aguardar dados iniciais (banner + prompt)
3. Extrair o prompt: última linha não vazia após strip ANSI
4. Para cada comando:
   a. Enviar comando + \n
   b. Acumular output
   c. Verificar se o output termina com o prompt (regex)
   d. Se sim → comando concluído
   e. Se `---- More ----` → enviar espaço
   f. Timeout de segurança: 15s por comando
5. Enviar quit/exit
6. Fechar sessão
```

### Regex de Prompt por Equipamento

| Equipamento | Regex do Prompt |
|---|---|
| MikroTik | `/\[[\w@.-]+\]\s*[>#]\s*$/m` |
| Huawei NE8000 | `/^[<\[]\S+[>\]]\s*$/m` |
| Huawei MA5800 | `/^[\w.-]+[>#]\s*$/m` |
| Genérico | `/[$#>]\s*$/m` |

---

## Implementação Recomendada

### Mudanças no `ssh.ts`

1. **Substituir timeout fixo por detecção de prompt** — a função `waitForPrompt(stream, promptRegex, timeoutMs)` acumula chunks e resolve quando o prompt é detectado.
2. **Adicionar `pty: { cols: 220, rows: 50 }` no `conn.shell()`** — evita quebra de linha e repintura excessiva.
3. **Adicionar `screen-length 0 temporary` automático** para Huawei NE8000 antes dos comandos do utilizador.
4. **Gerir `---- More ----`** enviando espaço automaticamente.
5. **Strip ANSI melhorado**: remover sequências de cursor/cor mas preservar o texto visível.
6. **Auto-detecção do tipo de equipamento** baseada no banner de login.

### Tipo de Equipamento (para configuração automática)

```ts
type DeviceType = "mikrotik" | "huawei_vrp" | "huawei_olt" | "generic";

function detectDeviceType(banner: string): DeviceType {
  if (/MikroTik|RouterOS/i.test(banner)) return "mikrotik";
  if (/Huawei.*VRP|<\w+>/i.test(banner)) return "huawei_vrp";
  if (/MA5800|MA5600|SmartAX/i.test(banner)) return "huawei_olt";
  return "generic";
}
```
