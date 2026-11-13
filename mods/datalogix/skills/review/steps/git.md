# Etapa: git (.gitignore, .gitattributes e .editorconfig)

## .gitignore
- entradas faltando: `vendor/`, `node_modules/`, `.env`,
  `.phpunit.cache`, `.phpunit.result.cache`, `build/`, `coverage/`,
  `clover.xml` (pacote com cobertura, etapa `ci`), `phpstan.neon`
  (local; o versionado é o `.dist`, etapa `composer`), arquivos de IDE e
  SO; nos tipos JS, só os que se aplicam, mais `dist/` (saída do build
  da lib, da SPA ou do Node), `.nuxt/`, `.output/`, `.data/` (Nuxt),
  `.next/`, `out/` e
  `next-env.d.ts` (Next), `.env*` exceto o `.env.example`, `*.tgz`
  (`npm pack`)
- entradas obsoletas ou que ignoram algo que deveria ser versionado
- lockfiles nunca entram no `.gitignore`, nem os de outro gerenciador
  (`composer.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`,
  `bun.lock`); um segundo lockfile no projeto é item da etapa `npm`.
  Entrada existente: item "importante" que a tira e versiona o lockfile
  gerado pelo gerenciador do projeto
- `composer.lock`: SEMPRE versionado, em aplicação e em pacote (o
  Composer ignora o lockfile de uma dependência; no pacote, ele fixa o
  ambiente de desenvolvimento e sai do download pelo `export-ignore`)
- lockfile JS, em todo tipo com `package.json`, inclusive pacote
  Laravel: o do gerenciador do projeto é SEMPRE versionado (reproduz o
  ambiente de desenvolvimento e o CI; sem ele, o `setup-js` de
  `datalogix/workflows` roda `npm install` sem versões fixas). O
  `bun.lock` também é versionado, mas o CI não o usa (etapa `npm`)
- aplicação: `.env` ignorado e `.env.example` versionado; `storage/` e
  `bootstrap/cache/` com seus `.gitignore` internos; `public/build`,
  `public/hot` e `public/storage` ignorados
- organização (item "sugestão", só num arquivo desorganizado, nunca por
  gosto): entradas agrupadas por assunto, com um comentário curto em cada
  grupo; nada duplicado nem coberto por outra regra (`/vendor` e
  `vendor/`). Ao reorganizar, mantenha cada exceção depois da regra que
  ela desfaz (`!.env.example` depois de `.env.*`) e confira que `git
  status --porcelain --ignored` sai igual antes e depois

## .github/CODEOWNERS
Só garante algo com um ruleset que exige a aprovação dos donos
(`require_code_owner_review` em `gh api
repos/{owner}/{repo}/rules/branches/<branch padrão>`); sem ele, só pede
revisão automaticamente. Quem mantém o projeto sozinho não pode aprovar
o próprio PR como dono. Com `gh`:
- exigido e sem o arquivo, ou sem dono para `/.github/`: item
  "importante" pedindo o `setup` de `datalogix/workflows`, com o
  comando e o `check` depois como em `ci.md`
- não exigido, com mais de uma pessoa no projeto: mantenha o arquivo e
  aponte como "sugestão" o `protect`, que passa a exigir a aprovação
- não exigido, e uma pessoa só nos últimos commits: pergunte se o
  projeto é mantido sozinho antes de sugerir apagar o arquivo; o `setup`
  pode criá-lo de novo
- ausente e não exigido: não sugira criar, nem por causa do aviso do
  `check`, que vale para todo pacote

## .gitattributes
- ausente: item "importante" que cria o arquivo com as regras
  abaixo, criado só se eu aprovar
- `* text=auto eol=lf` e regras de binários
- lockfiles versionados (`composer.lock`, lockfile JS) com
  `linguist-generated=true`, que os recolhe no diff dos PRs e os tira
  das estatísticas de linguagem; nunca como binário nem com `-diff`,
  que escondem as mudanças. Regra de um lockfile que o projeto não tem
  é obsoleta
- pacote: `export-ignore` para o que não deve ir no download do Composer:
  `/tests`, `/.github`, `/docs`, `/workbench`, `phpunit.xml*`,
  `phpstan.neon*`, `phpstan-baseline.neon`, `pint.json`, `rector.php`,
  `.editorconfig`,
  `.gitattributes`, `.gitignore`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `testbench.yaml`, `.git-blame-ignore-revs`, `eslint.config.*`,
  `.prettierrc*`, `.prettierignore`, `/.claude`, `/.ai`, `CLAUDE.md`,
  `composer.lock`, o lockfile JS e, quando o JS só serve ao desenvolvimento ou a um
  build versionado e nada instala o pacote pelo npm (ex.: `file:`
  apontando para `vendor/`), `package.json` e `vite.config.*`
  (mas não `resources/boost/`, que é distribuído)
  - confira que nada necessário em produção é excluído (`config/`,
    `resources/`, `database/`, `stubs/`, `routes/`, `lang/`, `LICENSE`,
    e o `package.json` quando a app instala o pacote pelo npm)
  - confira com `git archive --worktree-attributes HEAD | tar -t` o que
    de fato vai no pacote (com o `.gitattributes` ainda não commitado)
- aplicação e tipos JS: `export-ignore` não importa (o npm publica
  pelo `files` do package.json, etapa `npm`); foque em fim de linha e
  binários. Exceção: lib instalada por git, que o npm baixa do GitHub
  como tarball, respeitando `export-ignore`: nada que o `files`, o
  `exports` ou o `bin` usam pode estar excluído

## .editorconfig (obrigatório)
- ausente: item "importante" que cria o padrão do Laravel
  (`root = true`; em `[*]`: `charset = utf-8`, `end_of_line = lf`,
  `indent_style = space`, `indent_size = 4`,
  `insert_final_newline = true`, `trim_trailing_whitespace = true`;
  `[*.md]` sem trim; `[*.{yml,yaml}]` com `indent_size = 2`), criado
  só se eu aprovar; nos tipos JS, `indent_size = 2` em `[*]`, que é o
  padrão do Prettier
- coerente com o Prettier (que lê o `.editorconfig`): `tabWidth`,
  `useTabs` e `endOfLine` do config do Prettier não podem contradizê-lo;
  conflito é item "importante"
- coerente com o `* text=auto eol=lf` do `.gitattributes`
