# Etapa: production (só aplicações) — configuração de produção

## Ambiente
- `.env.example` com todas as chaves lidas via `env()` no config, com
  valores de exemplo e nenhum segredo real
- padrões seguros: `APP_DEBUG=false` e `APP_ENV=production` como
  referência de produção documentada
- nenhum segredo no código ou versionado

## Segurança
- sessão: `secure`, `http_only`, `same_site` adequados; driver adequado
  para mais de um servidor
- HTTPS forçado em produção; proxies e hosts confiáveis configurados
- CORS restrito às origens necessárias
- headers de segurança (CSP, HSTS, X-Frame-Options,
  X-Content-Type-Options) por middleware ou servidor
- rotas e ferramentas de desenvolvimento (Telescope, Debugbar, rotas de
  teste) desligadas ou protegidas em produção

## Caches e deploy
Se já houver caches em `bootstrap/cache`, avise antes. Rode e depois
limpe (`php artisan optimize:clear`); no `report`, pule:
- `php artisan config:cache`; ele não acusa `env()` fora de `config/`
  (com cache, retorna `null`): procure `env(` fora de `config/`
- `php artisan route:cache` (falha com nomes de rota duplicados)
- `php artisan view:cache` e `php artisan event:cache`

Verifique também:
- `storage:link` documentado se o projeto usa disco público
- worker de fila (supervisor/Horizon) e agendador (cron
  `* * * * * php artisan schedule:run`) documentados, com
  `queue:restart` no deploy
- rota de health check (`/up` ou equivalente)
- passos de deploy documentados (migrations com `--force`, build,
  caches, restart de fila)

## Logs e erros
- canais e níveis adequados para produção
- sem dados sensíveis em logs (senhas, tokens, documentos)
- exceções reportadas com contexto útil; páginas de erro sem detalhes
  internos

## Desempenho
- cache, fila e sessão em drivers de produção (não `file`/`sync` se
  houver mais de um servidor ou carga)
- consultas frequentes com índice; eager loading onde há listas
- `Model::preventLazyLoading()` (e afins) ligado fora de produção, se
  o projeto aceitar

O que não puder ser verificado pelo código (servidor, infraestrutura)
vira uma única pergunta agrupada, não suposição; nada, se já estiver em
"Decisões do projeto".
