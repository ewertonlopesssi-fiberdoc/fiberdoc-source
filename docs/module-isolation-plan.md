# Plano de Isolamento de Módulos — FiberDoc

## 1. Diagnóstico: Pontos de Acoplamento Actuais

O sistema tem **40+ módulos** definidos num único ficheiro `server/routers.ts` (3350 linhas) e um único `server/db.ts`. Esta arquitectura monolítica cria os seguintes pontos de acoplamento:

### 1.1 Acoplamento no Backend

| Problema | Causa | Impacto |
|---|---|---|
| `routers.ts` monolítico (3350 linhas) | Todos os módulos num único ficheiro | Alteração num módulo pode introduzir erro de TypeScript que impede o build de **todos** os módulos |
| `db.ts` partilhado | Todas as queries num único ficheiro | Alteração numa query pode quebrar módulos que a partilham (ex: `createMaintenanceRecord` é usada por 31 módulos) |
| `createMaintenanceRecord` global | Chamada em rooms, equipments, fibers, ports, connections | Se a assinatura mudar, todos os módulos que a chamam falham |
| Imports directos de schema Drizzle | `sshCommander` importa directamente de `../drizzle/schema` | Alteração no schema quebra o módulo sem aviso claro |

### 1.2 Acoplamento no Frontend

| Problema | Causa | Impacto |
|---|---|---|
| Páginas com 1000-3500 linhas | Lógica de UI + lógica de negócio misturadas | Alteração visual pode quebrar lógica de dados |
| Ausência de testes de componentes | Sem testes de UI por módulo | Regressões visuais não são detectadas |
| `App.tsx` com todas as rotas | Todas as rotas num único ficheiro | Erro de import numa página impede o carregamento de todas |

---

## 2. Solução: Arquitectura de Isolamento por Módulo

### 2.1 Backend — Separação de Routers

**Estrutura proposta:**

```
server/
  routers/
    rooms.ts          # router das salas
    equipments.ts     # router dos equipamentos
    fibers.ts         # router das fibras
    ports.ts          # router das portas
    connections.ts    # router das conexões
    ceos.ts           # router dos CEOs
    ctos.ts           # router dos CTOs
    ipDoc.ts          # router do IP DOC
    sshCommander.ts   # router do SSH Commander
    powerSources.ts   # router das fontes de energia
    alerts.ts         # router dos alertas
    ...
  routers.ts          # apenas importa e combina os sub-routers
  db/
    rooms.ts          # queries de salas
    equipments.ts     # queries de equipamentos
    fibers.ts         # queries de fibras
    ...
  db.ts               # re-exporta tudo (compatibilidade)
```

**Regras de isolamento:**
- Cada ficheiro de router importa apenas as queries do seu próprio módulo de `db/`
- Nenhum router importa directamente do schema Drizzle (usa sempre funções de `db/`)
- `createMaintenanceRecord` é importada de um módulo partilhado `db/shared.ts`

### 2.2 Script de Validação Pós-Update

O script `fiberdoc-health-check.sh` verifica após cada update:

1. Serviço a responder em `/api/health`
2. Base de dados acessível
3. Módulos críticos a responder (rooms, equipments, fibers, ports)
4. SSH Commander a responder
5. Autenticação local a funcionar

### 2.3 Testes de Regressão por Módulo

Cada módulo tem o seu próprio ficheiro de teste:

```
server/
  rooms.test.ts         # testa CRUD de salas
  equipments.test.ts    # testa CRUD de equipamentos
  ssh.test.ts           # testa execução SSH
  ipDoc.test.ts         # testa IP DOC
```

Os testes são executados automaticamente antes de gerar o ZIP de update.

---

## 3. Implementação Gradual (sem quebrar o sistema)

### Fase 1 — Imediata (sem refactoring)
- Adicionar script `fiberdoc-health-check.sh` executado automaticamente após cada update
- Adicionar testes de regressão para os módulos mais críticos (SSH, equipamentos, fibras)
- O script de update falha e faz rollback automático se o health check falhar

### Fase 2 — Curto prazo (1-2 semanas)
- Separar `routers.ts` em ficheiros por módulo (sem alterar a lógica)
- Separar `db.ts` em ficheiros por módulo (sem alterar as queries)
- Manter `routers.ts` e `db.ts` como re-exportadores para compatibilidade

### Fase 3 — Médio prazo (1 mês)
- Adicionar testes de componentes React para as páginas críticas
- Implementar CI/CD com execução automática de testes antes de gerar o ZIP

---

## 4. Implementação Imediata: Health Check Pós-Update

O script `fiberdoc-health-check.sh` é a medida de maior impacto imediato:

```bash
#!/bin/bash
# Verifica se todos os módulos críticos estão a funcionar após um update
BASE_URL="http://localhost:3000"

check() {
  local name="$1"
  local url="$2"
  local expected="$3"
  local result=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
  if [ "$result" = "$expected" ]; then
    echo "  OK $name ($result)"
    return 0
  else
    echo "  ERRO $name (esperado $expected, obtido $result)"
    return 1
  fi
}

FAILED=0
check "Servidor HTTP"    "$BASE_URL/"                    "200" || FAILED=1
check "API tRPC"         "$BASE_URL/api/trpc/auth.me"    "200" || FAILED=1
check "Auth local"       "$BASE_URL/api/local-auth/info" "200" || FAILED=1

if [ $FAILED -eq 0 ]; then
  echo "  TODOS OS MODULOS OK"
  exit 0
else
  echo "  FALHA DETECTADA -- considere rollback:"
  echo "  tar -xzf /opt/fiberdoc/backups/ULTIMO_BACKUP.tar.gz -C /opt/fiberdoc"
  exit 1
fi
```
