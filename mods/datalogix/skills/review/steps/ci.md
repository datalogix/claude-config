# Etapa: ci (integração contínua)

Os projetos da Datalogix usam os workflows reutilizáveis de
`datalogix/workflows`, chamados por `@<versão>` num único
`.github/workflows/datalogix.yml`: os Laravel e, com `stack: js`, as
aplicações Nuxt, Next, Vue ou React com Vite e as libs JS. Uma
aplicação Node sem interface (API, worker) não tem stack lá: aplique
só "Node sem stack" e "Outros workflows" (fim deste arquivo).
`<versão>` é a última: a maior
`v<N>` entre as branches e as tags daquele repositório (`gh api
--paginate repos/datalogix/workflows/branches --jq '.[].name'` e o
mesmo com `tags`), não a branch padrão nem o "Latest" do GitHub, que
podem estar atrás. Sem conseguir determiná-la (sem `gh` ou sem acesso),
não rode o `check`, pule as comparações de versão abaixo e diga que
não foram verificadas. O que mora lá (permissões,
versões de actions, matriz padrão, jobs) não é revisado aqui. Numa
aplicação, ESLint, Prettier, `tsc` e Vitest chegam ao CI pelos
scripts `lint`, `typecheck` e `test` (etapas `composer` e `npm`); o
`package.yml` dos pacotes Laravel não roda nada do `package.json`, mas
roda o PHPStan se o `composer.json` o exigir. Com `stack: js`, o CI
roda os scripts `typecheck` (ou `types:check`, `type-check`), `lint`
(ou `check`), `test` e `build` que existirem, com o gerenciador do
lockfile; os de typecheck e lint não podem alterar arquivos (etapa
`npm`). O que o CI não cobrir vai numa linha em "Recomendações gerais"
como melhoria de `datalogix/workflows`, não como item do projeto.

## Todos os tipos com stack
- rode `npx --allow-git=root github:datalogix/workflows#<versão> check`
  na raiz do projeto: só lê; precisa do Node 22.12+ e do `gh` logado.
  Se faltar algum deles, ou se o comando falhar, anote e siga com as
  conferências abaixo. Cada "error" é item "importante" e cada "warn"
  é "sugestão"; a correção é o `setup` (interativo) ou o `protect`
  (ruleset) de `datalogix/workflows`, que eu rodo. No item, escreva o
  comando com o prefixo `!`, que o roda nesta sessão com a saída na
  conversa (ex.: `! npx --allow-git=root
  github:datalogix/workflows#<versão> setup`). Depois que eu rodar,
  rode o `check` de novo e só dê o item por resolvido se o aviso sumiu
- sem o `datalogix.yml`, ou com ele chamando outra major: item
  "importante" pedindo o `setup`; chamando outro ref (branch, SHA): a
  severidade do `check` ou, se ele não rodou, "importante"
- tipos JS: `stack: js` no `with:`; sem ele, o workflow roda os testes
  de Laravel. Um workflow próprio de CI que roda os mesmos scripts
  (ex.: um `ci.yml` com `lint`, `typecheck`, `test`, `build`) duplica
  o `datalogix.yml`: item "importante" pedindo o `setup` e, depois
  dele, a remoção do próprio, sem perder um passo que a stack não roda
  (esse passo vai para "Outros workflows")

## Aplicação Laravel
- `datalogix.yml` chamando
  `datalogix/workflows/.github/workflows/project.yml@<versão>`
- inputs em `with:`: `test-command` que diverge do script `test`,
  ou `tests`/`js` em `false` sem motivo registrado, é item
  "importante" (o `check` não compara inputs com os scripts). Se o
  script também roda Pint ou PHPStan, o `setup` grava o `test-command`
  de propósito: o item é separar o script (etapa `composer`) e só
  depois tirar o input, nunca tirá-lo antes
- `.php-version` (ou `config.platform.php`) se a aplicação não roda
  na última versão do PHP, e `.nvmrc`/`.node-version` se não roda no
  Node LTS: o CI lê esses arquivos, não o `engines`

## Pacote Laravel
- `datalogix.yml` com o job `pipeline` chamando
  `datalogix/workflows/.github/workflows/package.yml@<versão>`, com
  `secrets: inherit` e os gatilhos `push` na `main`,
  `pull_request`, `merge_group` e `workflow_dispatch` (modelo em
  `examples/package.yml` daquele repositório). Outro id de job
  muda o nome do check exigido
- inputs `php` e `laravel` batendo com o `composer.json`: o padrão do
  workflow (PHP 8.2–8.5, Laravel `^12.0`/`^13.0`) vale só se coincidir;
  versão suportada fora da matriz ou matriz fora da faixa é "importante"
- sem `test-command`: o workflow roda `composer test` (se existir),
  senão `vendor/bin/pest`, senão `vendor/bin/phpunit`; com o script
  `test` da etapa `composer`, não é preciso `test-command`. Um
  `test-command` explícito que diverge do script é item "importante",
  com a mesma ressalva da aplicação para o script que roda Pint ou
  PHPStan
- `pint: false` ou `phpstan: false` só com motivo (a versão do Pint é
  da etapa `composer`)
- `phpunit.xml` gerando relatório Clover se `coverage` estiver ligado
  ou `min-coverage` não for 0 (o padrão é 100):
  `<clover outputFile="clover.xml"/>`
- `min-coverage` abaixo de 100 só com motivo registrado; sem motivo, é
  item "importante" (a meta é 100%, ver o modo `tests`)
- ruleset exigindo `pipeline / tests / all-checks`: o `check`
  confere; sem ele, `gh api
  repos/<owner>/<repo>/rules/branches/<branch-padrão>` lista as
  regras ativas da branch com os checks exigidos (sem `gh`, anote e
  siga)

## Aplicação JS (Nuxt, Next, Vue ou React com Vite)
- `datalogix.yml` chamando
  `datalogix/workflows/.github/workflows/project.yml@<versão>` com
  `stack: js`
- inputs em `with:`: `test-command` que diverge do script `test`, ou
  `tests`/`e2e` em `false` sem motivo registrado, é item "importante";
  os inputs de Laravel (`php-version`, `pint`, `phpstan`, `js`) não
  fazem nada e saem
- `min-coverage` (padrão 0, que só mostra a cobertura): acima de 0, o
  `test` precisa gravar o relatório Clover (ex.: o reporter `clover`
  do Vitest, em `coverage/`); sem ele, o job falha
- `.nvmrc`/`.node-version` se a aplicação não roda no Node LTS: o CI
  lê esses arquivos, não o `engines`
- script `test:e2e`, se houver, sobe a aplicação sozinho (ex.: o
  `webServer` do Playwright): o CI o roda depois do `build`
- ruleset exigindo `pipeline / tests / tests` (e `pipeline / security
  / security` e `pipeline / gate / gate` com essas camadas ligadas):
  o `check` confere; a correção é o `protect`
- deploy e monitoramento (`deploy: vercel` ou `netlify`, `monitoring: sentry`) são
  da etapa `production`

## Lib JS
- `datalogix.yml` com o job `pipeline` chamando
  `datalogix/workflows/.github/workflows/package.yml@<versão>` com
  `stack: js`, `secrets: inherit` e os gatilhos do modelo
  (`examples/package.yml`), como no pacote Laravel
- input `node` (padrão `["22", "24", "26"]`) cobrindo a menor versão
  do `engines.node` e as LTS ativas: versão suportada fora da matriz,
  ou matriz abaixo do `engines`, é "importante"
- sem `test-command`, roda o script `test`; um `test-command` que
  diverge do script é "importante"
- `min-coverage` (padrão 100) com o relatório Clover gravado pelo
  `test` (ex.: o reporter `clover` do Vitest, em `coverage/`); sem
  ele, o job falha. Abaixo de 100 só com motivo registrado; sem
  motivo, é item "importante" (a meta é 100%, ver o modo `tests`)
- `lint-command` com o que confere o pacote publicado (ex.: `npx
  publint && npx attw --pack .`), se a etapa `pack` não achar outro
  lugar para isso
- os inputs de Laravel (`php`, `laravel`, `pint`, `phpstan`,
  `coverage`) não fazem nada e saem
- ruleset exigindo `pipeline / tests / all-checks`: o `check`
  confere; a correção é o `protect`
- a publicação não é da stack: o workflow de publicação, se houver,
  segue "Publicação de lib JS" e "Outros workflows"

## Publicação de lib JS
- dispara por tag ou release, nunca em todo push; token do npm só em
  `secrets.*`; `npm publish --provenance` com `permissions: id-token:
  write` se publica no npm público
- publica só depois dos checks do `datalogix.yml` passarem na mesma
  versão (ex.: release criada a partir da `main` protegida)

## Node sem stack
O CI é um workflow do próprio projeto. Não rode o `check` nem o
`setup` de `datalogix/workflows`. Registre em "Recomendações gerais",
uma vez, que uma stack Node em `datalogix/workflows` substituiria este
workflow próprio.
- sem workflow de CI: item "importante" com o arquivo
  `.github/workflows/ci.yml` pronto, seguindo os itens abaixo
- gatilhos `push` na branch padrão e `pull_request`
- Node pelo `.nvmrc`/`.node-version` (`node-version-file`) ou LTS
- instalação pelo lockfile, com o gerenciador dele (`npm ci`,
  `pnpm install --frozen-lockfile`, `yarn install --immutable`), e
  cache do gerenciador no `setup-node`
- roda os scripts `lint`, `typecheck`, `test` e `build` que existirem
  (etapa `npm`); script que existe e o CI não roda é item "importante"
- `concurrency` cancelando execuções antigas do mesmo PR
- deploy pelo CI: só depois dos checks passarem (`needs`), com
  segredos em `secrets.*` ou `environment`

## Outros workflows
Workflows próprios do projeto, além dos da Datalogix (no Node sem
stack, todos, inclusive o de CI):
- versões de actions fixadas (major ou SHA), não `@main`/`@master`
- `permissions` mínimas, sem segredos no arquivo (só `secrets.*`)
- nada que duplique o que os workflows da Datalogix já fazem
