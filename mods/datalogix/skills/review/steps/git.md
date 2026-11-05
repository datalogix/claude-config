# Etapa: git (.gitignore, .gitattributes e .editorconfig)

## .gitignore
- entradas faltando: `vendor/`, `node_modules/`, `.env`,
  `.phpunit.cache`, `.phpunit.result.cache`, `build/`, `coverage/`,
  `clover.xml` (pacote com cobertura, etapa `ci`), arquivos de IDE e
  SO; nos tipos JS, só os que se aplicam, mais `dist/` (saída do build
  da lib, da SPA ou do Node), `.nuxt/`, `.output/`, `.data/` (Nuxt),
  `.next/`, `out/` e
  `next-env.d.ts` (Next), `.env*` exceto o `.env.example`, `*.tgz`
  (`npm pack`)
- entradas obsoletas ou que ignoram algo que deveria ser versionado
- `composer.lock`:
  - pacote: normalmente NÃO versionado
  - aplicação: SEMPRE versionado
  Aponte se estiver invertido. O mesmo vale para o lockfile do npm numa
  aplicação (sempre versionado). Lib JS/TS: lockfile versionado
  (reproduz o ambiente de desenvolvimento e o CI; o npm não o publica).
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
  "importante" pedindo o `setup` de `datalogix/workflows`
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
- pacote: `export-ignore` para o que não deve ir no download do Composer:
  `/tests`, `/.github`, `/docs`, `/workbench`, `phpunit.xml*`,
  `phpstan.neon*`, `pint.json`, `rector.php`, `.editorconfig`,
  `.gitattributes`, `.gitignore`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `testbench.yaml`, `.git-blame-ignore-revs`, `eslint.config.*`,
  `.prettierrc*`, `.prettierignore`, `/.claude`, `/.ai`, `CLAUDE.md`
  (mas não `resources/boost/`, que é distribuído)
  - confira que nada necessário em produção é excluído (`config/`,
    `resources/`, `database/`, `stubs/`, `routes/`, `lang/`, `LICENSE`)
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
