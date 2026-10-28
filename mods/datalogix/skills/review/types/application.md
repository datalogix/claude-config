# Regras para aplicações Laravel

## Reconhecimento extra
- **Estágio**: procure no `CLAUDE.md` ou nas "Decisões do projeto". Se
  não estiver registrado, pergunte uma vez e registre:
  - **não lançada**: ainda não está em produção
  - **em produção**: já tem usuários e dados reais
- **Testes**: suíte com `RefreshDatabase` (ou equivalente) e banco de
  teste separado; confira no `phpunit.xml` que os testes nunca apontam
  para o banco de desenvolvimento ou de produção.

## Etapas, nesta ordem
1. `git` — .gitignore, .gitattributes e .editorconfig
2. `ci` — integração contínua
3. `composer` — dependências PHP
4. `npm` — dependências do package.json, se existir
5. `code` — código de `app/`, uma pasta por vez. Além do checklist da
   etapa, aplique também:
   - `steps/http.md` em `app/Http` (Controllers, Requests, Middleware,
     Resources), `app/Policies`, `app/Models` e `app/Livewire`
   - `steps/jobs.md` em `app/Jobs`, `app/Listeners`, `app/Events`,
     `app/Console`, `app/Notifications` e `app/Mail` (o agendamento
     fica na etapa `resources`, pasta `routes/`)
6. `resources` — config, database, routes, lang, stubs, uma por vez
7. `frontend` — views, CSS, JS, TS, uma pasta por vez, se existir
8. `production` — configuração de produção e deploy
9. `docs` — README, /docs, CLAUDE.md, skills e guidelines
10. `closing` — fechamento

## API pública
Numa aplicação, o que não pode quebrar é o que está fora do código:
- rotas e URLs (links salvos, SEO, integrações) e nomes de rota usados
  fora do código
- respostas de API consumidas por front-end separado, apps ou terceiros
  (campos, tipos, códigos de status)
- schema do banco (tabelas, colunas, dados existentes)
- payloads de jobs e eventos que podem estar na fila durante o deploy
- webhooks recebidos e enviados, canais de broadcasting
- chaves de `.env` e de config usadas no deploy, comandos Artisan
  chamados por cron, scripts ou deploy
Classes e métodos internos NÃO são API pública: renomeie sem alias.

## Regras por estágio

### não lançada
- checagem de git não é obrigatória; só avise se a árvore estiver suja
- migrations existentes podem ser editadas (com aprovação), lembrando
  que quem já rodou precisa recriar o banco
- fechamento sem notas de deploy

### em produção — obrigatório
- **Checagem de git antes de CADA passo**:
  - `git status --porcelain` vazio (o passo anterior foi commitado)
  - fora da branch padrão (`main`/`master`); se estiver nela, pare e
    sugira criar uma (ex.: `review/<data>`)
  - registre no progresso o commit de início do passo
- Migrations já rodadas nunca são editadas; mudança exige migration nova,
  segura para produção (`steps/resources.md`)
- Mudança em API pública exige aprovação e plano de compatibilidade:
  manter o campo/rota antigo por um tempo, versionar a API, ou deploy em
  duas fases (código que aceita o formato antigo e o novo, depois limpeza)
- Jobs: mudar a assinatura do construtor ou propriedades de um job
  quebra os que já estão na fila; mantenha compatibilidade ou
  planeje drenar a fila
- Fechamento: notas de deploy (`steps/closing.md`)
