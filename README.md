# FiberDoc - Sistema de Documentação de Fibras e Equipamentos

Sistema completo de gerenciamento de infraestrutura de rede óptica, desenvolvido com **React 19**, **Node.js**, **tRPC** e **Leaflet.js**.

## Sobre o Projeto

FiberDoc é uma plataforma web para documentação, visualização e gerenciamento de:
- **CEOs** (Central de Equipamento Óptico)
- **CTOs** (Câmara de Terminação Óptica)
- **Fibras Ópticas** e **Cabos**
- **Portas** e **Conexões**
- **POIs** (Pontos de Interesse)
- **Topologia** de rede

### Recursos Principais
- Mapa interativo com Leaflet.js e Google Maps
- Autenticação OAuth integrada (Manus)
- Dashboard com estatísticas em tempo real
- Interface responsiva (mobile-first)
- Sincronização em tempo real
- Exportação de relatórios (PDF)
- Design moderno com Tailwind CSS 4

## Arquitetura

### Frontend (React 19 + TypeScript)
```
client/
├── src/
│   ├── pages/              # Páginas principais
│   │   ├── Home.tsx        # Landing page
│   │   ├── InfrastructureMap.tsx  # Mapa principal
│   │   ├── Dashboard.tsx   # Dashboard
│   │   └── ...
│   ├── components/         # Componentes reutilizáveis
│   │   ├── DashboardLayout.tsx
│   │   ├── Map.tsx
│   │   ├── AIChatBox.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── trpc.ts        # Cliente tRPC
│   │   └── hooks.ts       # Custom hooks
│   ├── App.tsx            # Roteamento
│   └── main.tsx           # Entry point
└── index.html
```

### Backend (Node.js + Express + tRPC)
```
server/
├── routers.ts             # Procedures tRPC (API)
├── db.ts                  # Query helpers
├── auth.logout.test.ts    # Testes
└── _core/
    ├── context.ts         # Contexto tRPC
    ├── oauth.ts           # Autenticação
    ├── llm.ts             # LLM integration
    ├── voiceTranscription.ts
    └── ...
```

### Database (MySQL/TiDB + Drizzle ORM)
```
drizzle/
├── schema.ts              # Definição de tabelas
└── migrations/            # Histórico de mudanças
```

## Como Começar

### Pré-requisitos
- Node.js 22.x
- pnpm (ou npm/yarn)
- Variáveis de ambiente configuradas

### Instalação

```bash
# Clone o repositório
git clone https://github.com/ewertonlopesssi-fiberdoc/fiberdoc-source.git
cd fiberdoc-source

# Instale as dependências
pnpm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# Inicie o servidor de desenvolvimento
pnpm dev
```

Acesse `http://localhost:3000` no navegador.

### Build para Produção

```bash
pnpm build
pnpm start
```

## Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | React 19, TypeScript, Tailwind CSS 4, Vite |
| **Backend** | Node.js, Express 4, tRPC 11 |
| **Database** | MySQL/TiDB, Drizzle ORM |
| **Autenticação** | Manus OAuth |
| **Mapas** | Leaflet.js, Google Maps API |
| **Testes** | Vitest |
| **Deploy** | Manus Platform |

## Variáveis de Ambiente

```env
# OAuth
VITE_APP_ID=<seu-app-id>
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=<seu-portal-url>

# Database
DATABASE_URL=mysql://user:password@host:3306/fiberdoc

# JWT
JWT_SECRET=<seu-secret>

# APIs
BUILT_IN_FORGE_API_URL=<api-url>
BUILT_IN_FORGE_API_KEY=<api-key>
```

## Documentação

- [tRPC Documentation](https://trpc.io)
- [Drizzle ORM](https://orm.drizzle.team)
- [Leaflet.js](https://leafletjs.com)
- [React Documentation](https://react.dev)

## Testes

```bash
# Rodar testes
pnpm test

# Rodar testes com cobertura
pnpm test:coverage
```

## Problemas Conhecidos

### v6.2.11
- Botão "Salvar posição" agora aparece corretamente após arrastar elementos no mapa

## Changelog

### v6.2.11
- Correção: Botão "Salvar posição" não aparecia após mover elementos
- Refatoração: Comparação de `pendingMovePos?.id` com `sidePanel.element.id`

### v6.2.10
- Adicionado `movingElementId` às dependências do `renderMarkers`

### v6.2.9
- Adicionados logs de debug ao handler dragend

## Contribuindo

Para contribuir com o projeto:

1. Faça um fork do repositório
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## Licença

Este projeto é propriedade de Ewerton Lopes. Todos os direitos reservados.

## Contato

Para dúvidas ou sugestões, entre em contato através de:
- GitHub Issues: [Abrir Issue](https://github.com/ewertonlopesssi-fiberdoc/fiberdoc-source/issues)

---

**Versão Atual:** v6.2.11  
**Última Atualização:** 16 de Março de 2026
