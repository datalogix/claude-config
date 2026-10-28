# Etapa: ci (integração contínua)

Os projetos da Datalogix usam os workflows reutilizáveis de
`datalogix/workflows`, chamados pela tag `@v2` num único
`.github/workflows/datalogix.yml`. O que mora lá (permissões,
versões de actions, matriz padrão, jobs) não é revisado aqui. Numa
aplicação, ESLint, Prettier, `tsc` e Vitest chegam ao CI pelos
scripts `lint`, `typecheck` e `test` (etapas `composer` e `npm`); o
`package.yml` dos pacotes não roda nada do `package.json` nem o
PHPStan. O que o CI não cobrir vai numa linha em "Recomendações
gerais" como melhoria de `datalogix/workflows`, não como item do
projeto.

## Em ambos
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

## Outros workflows
Workflows próprios do projeto, além dos da Datalogix:
- versões de actions fixadas (major ou SHA), não `@main`/`@master`
- `permissions` mínimas, sem segredos no arquivo (só `secrets.*`)
- nada que duplique o que os workflows da Datalogix já fazem
