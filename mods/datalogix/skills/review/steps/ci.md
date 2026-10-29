# Etapa: ci (integração contínua)

Nos tipos JS, aplique só "Tipos JS" e "Outros workflows" (fim deste
arquivo): `datalogix/workflows` ainda não tem stack JS.

Os projetos Laravel da Datalogix usam os workflows reutilizáveis de
`datalogix/workflows`, chamados pela tag `@v2` num único
`.github/workflows/datalogix.yml`. O que mora lá (permissões,
versões de actions, matriz padrão, jobs) não é revisado aqui. Numa
aplicação, ESLint, Prettier, `tsc` e Vitest chegam ao CI pelos
scripts `lint`, `typecheck` e `test` (etapas `composer` e `npm`); o
`package.yml` dos pacotes não roda nada do `package.json` nem o
PHPStan. O que o CI não cobrir vai numa linha em "Recomendações
gerais" como melhoria de `datalogix/workflows`, não como item do
projeto.

## Pacote e aplicação Laravel
- rode `npx github:datalogix/workflows#v2 check` na raiz do
  projeto: só lê; precisa do Node 22.12+ e do `gh` logado. Se
  faltar algum deles, ou se o comando falhar porque a tag `v2`
  ainda não existe, anote e siga com as conferências abaixo. Cada
  "error" é item "importante" e cada "warn" é "sugestão"; a
  correção é `npx github:datalogix/workflows#v2 setup`
  (interativo: eu rodo) ou `protect` para o ruleset
- sem o `datalogix.yml`, ou com ele chamando outra versão: item
  "importante" pedindo o `setup`

## Aplicação
- `datalogix.yml` chamando
  `datalogix/workflows/.github/workflows/project.yml@v2`
- inputs em `with:`: `test-command` que diverge do script `test`,
  ou `tests`/`js` em `false` sem motivo registrado, é item
  "importante" (o `check` não compara inputs com os scripts)
- `.php-version` (ou `config.platform.php`) se a aplicação não roda
  na última versão do PHP, e `.nvmrc`/`.node-version` se não roda no
  Node LTS: o CI lê esses arquivos, não o `engines`

## Pacote
- `datalogix.yml` com o job `pipeline` chamando
  `datalogix/workflows/.github/workflows/package.yml@v2`, com
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
  `test-command` explícito que diverge do script é item "importante"
- `pint: false` só com motivo (a versão do Pint é da etapa `composer`)
- `phpunit.xml` gerando relatório Clover se `coverage` estiver ligado:
  `<clover outputFile="clover.xml"/>`
- ruleset exigindo `pipeline / tests / all-checks`: o `check`
  confere; sem ele, `gh api
  repos/<owner>/<repo>/rules/branches/<branch-padrão>` lista as
  regras ativas da branch com os checks exigidos (sem `gh`, anote e
  siga)

## Tipos JS
O CI é um workflow do próprio projeto. Não rode o `check` nem o
`setup` de `datalogix/workflows`. Registre em "Recomendações gerais",
uma vez, que uma stack JS em `datalogix/workflows` substituiria este
workflow próprio.
- sem workflow de CI: item "importante" com o arquivo
  `.github/workflows/ci.yml` pronto, seguindo os itens abaixo
- gatilhos `push` na branch padrão e `pull_request`
- Node pelo `.nvmrc`/`.node-version` (`node-version-file`) ou LTS; lib:
  matriz com a menor versão do `engines.node` e a LTS
- instalação pelo lockfile, com o gerenciador dele (`npm ci`,
  `pnpm install --frozen-lockfile`, `yarn install --immutable`), e
  cache do gerenciador no `setup-node`
- roda os scripts `lint`, `typecheck`, `test` e `build` que existirem
  (etapa `npm`); script que existe e o CI não roda é item "importante"
- `concurrency` cancelando execuções antigas do mesmo PR
- lib com workflow de publicação: dispara por tag ou release, nunca em
  todo push; token do npm só em `secrets.*`; `npm publish
  --provenance` com `permissions: id-token: write` se publica no npm
  público
- deploy pelo CI (aplicação): só depois dos checks passarem
  (`needs`), com segredos em `secrets.*` ou `environment`

## Outros workflows
Workflows próprios do projeto, além dos da Datalogix (nos tipos JS,
todos, inclusive o de CI):
- versões de actions fixadas (major ou SHA), não `@main`/`@master`
- `permissions` mínimas, sem segredos no arquivo (só `secrets.*`)
- nada que duplique o que os workflows da Datalogix já fazem
