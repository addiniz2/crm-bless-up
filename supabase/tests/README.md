# Testes do banco

Rodam num Postgres 16 local e descartável. O arquivo `00_supabase_stub.sql` imita o mínimo do Supabase
(esquema `auth`, `auth.uid()` e os papéis `anon` e `authenticated`). Nunca rode contra produção.

```bash
psql -v ON_ERROR_STOP=1 -f supabase/tests/00_supabase_stub.sql \
     -f supabase/migrations/20261115000001_core_schema.sql \
     -f supabase/tests/core_schema_test.sql
```

O que é verificado: auditoria preenchida; etapa só muda pelas funções; desqualificar exige motivo;
conversão cria conta, contato e oportunidade e leva as atividades; lead convertido fica somente leitura;
ganho transforma a conta em cliente; histórico de etapas; quem não é usuária ativa não vê nem grava nada;
visitante anônimo não acessa tabela nenhuma.
