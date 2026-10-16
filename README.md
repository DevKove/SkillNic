# SkillNic — API de gerenciamento de skills

Backend REST para registrar, listar, versionar e recuperar instruções reutilizáveis para programação. Projetado para uso pelo plugin SkillNic Manager dentro do ChatGPT.

## Estado

Este repositório contém o código-fonte inicial do backend e a migração do banco. **Ainda precisa ser implantado** em um serviço Node.js e conectado a um projeto Supabase próprio. Não configure credenciais do projeto Morada360 aqui sem confirmar que esse é o projeto desejado.

## Stack

- Node.js 20+
- Express 5
- Supabase Auth para autenticação de usuários
- PostgreSQL/Supabase para persistência
- OpenAPI 3.1

## Rotas

- `GET /health` — verificação de disponibilidade.
- `POST /v1/skills` — registrar uma skill.
- `GET /v1/skills` — listar skills do usuário; aceita `scope=conversation|project|user` e `active=true|false`.
- `GET /v1/skills/:name` — recuperar uma skill.
- `PATCH /v1/skills/:name` — atualizar uma skill.
- `DELETE /v1/skills/:name` — excluir uma skill.
- `POST /v1/skills/:name/activate` — recuperar a instrução e devolver um bloco de contexto para aplicação na tarefa atual.

Todas as rotas `/v1` exigem um token de acesso do Supabase Auth no cabeçalho `Authorization: Bearer <token>`. Cada consulta é limitada ao usuário autenticado. O escopo `conversation` é um rótulo de contexto fornecido pelo cliente; o servidor não consegue descobrir automaticamente o ID de uma conversa do ChatGPT sem integração explícita.

## Configuração local

1. Crie um projeto Supabase dedicado ao SkillNic.
2. No SQL Editor do Supabase, execute `supabase/migrations/001_create_skills.sql`.
3. Copie `.env.example` para `.env` e configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
4. Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no cliente, GPT ou repositório.
5. Instale e execute:

```bash
npm install
npm run dev
```

Por padrão, o servidor escuta em `http://localhost:3000`.

## Autenticação

O backend valida o token com Supabase Auth e obtém o ID do usuário pelo servidor. Para chamadas reais, o cliente precisa primeiro autenticar o usuário no Supabase e enviar o access token. Não existe autenticação anônima por padrão.

## Integração ChatGPT

A especificação está em `openapi.yaml`. Para conectar um Custom GPT via Actions, publique a API em uma URL HTTPS, configure a autenticação compatível com a hospedagem e importe o OpenAPI. O OpenAPI, por si só, não hospeda a API nem concede ao modelo acesso automático ao token de um usuário.

O comando `/usar_skill` é uma convenção de diálogo: dependendo do cliente do ChatGPT, barras no início da mensagem não são comandos nativos. Também é possível dizer “use a skill auth-jwt para criar uma rota de login”.

## Segurança

- O token de autenticação nunca é armazenado na tabela de skills.
- O servidor só opera sobre skills pertencentes ao usuário autenticado.
- Conteúdo de skills é tratado como dado/instrução de usuário, nunca como mecanismo para substituir políticas de segurança do sistema.
- Não armazene segredos, tokens privados ou credenciais em skills.
- Antes de uso em produção, configure limites de requisição, logs sem conteúdo sensível, backups, política de retenção e monitoramento.

## Licença

A definir pelo mantenedor.
