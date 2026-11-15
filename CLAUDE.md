# CRM Bless Up

CRM interno da Bless Up (Isa e Jana), substituto da Chronos Dock. Responsável: Atila.
Especificação funcional, técnica, backlog e plano: documento "CRM Bless Up — Especificação funcional do MVP" (Claude Docs).

## Stack

- React + Vite + TypeScript + Tailwind CSS (telas), publicado no Cloudflare Pages
- Supabase: Postgres em Frankfurt, Auth, Edge Functions, Cron
- i18next: todo texto da interface em `src/locales/pt-BR.json`
- Testes: Vitest + Testing Library

## Regras

1. **Nenhum texto literal na interface.** Sempre `t('chave')`.
2. **API e banco guardam códigos, nunca rótulos traduzidos.** `stage: "MEETING_SCHEDULED"`, jamais `"Reunião agendada"`.
3. **RLS ligada em toda tabela.** Sem login, nada é lido nem gravado. Visitantes do site só falam com Edge Functions.
4. **Nenhum segredo no código.** Só a URL e a chave publicável do Supabase vão para o navegador. Chave secreta, tokens da Meta e App Secret ficam nos segredos das Edge Functions.
5. Identificadores UUID. Exclusão lógica (`deleted_at`), exceto anonimização a pedido do titular.
6. Toda tabela tem `created_at`, `created_by`, `updated_at`, `updated_by`.
7. Valores monetários em `numeric(15,2)` com coluna de moeda (`EUR` ou `BRL`). Nunca somar moedas diferentes.
8. Datas em UTC. Conversão só na tela.
9. Estrutura do banco só por migration em `supabase/migrations`. Nunca alteração manual em produção.
10. Regras de negócio no banco (funções SQL) ou nas Edge Functions, nunca só na tela.
11. Nomes de tabela, coluna, variável e arquivo em inglês. Tabelas no singular.

## Antes de commitar

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Pronto

- Critério de aceite do item no backlog atendido
- Lint, typecheck, testes e build passando
- Tela funciona em 375 px sem rolagem lateral
- Status do item atualizado no backlog
