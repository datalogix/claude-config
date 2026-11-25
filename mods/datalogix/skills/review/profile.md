# Perfil do projeto

Lido pela seção 2 do `SKILL.md` ao gerar ou regenerar o perfil, e
pelos passos que citam suas regras de testes. Descubra e registre:

- **Tipo**:
  - pacote Laravel (`types/laravel-package.md`): tem `extra.laravel` no
    composer.json, ou `type: library`
  - aplicação Laravel (`types/laravel-app.md`): tem `artisan` e
    `bootstrap/app.php`
  - aplicação JS/TS (`types/js-app.md`), sem `composer.json`, com uma
    destas formas:
    - Nuxt ou Next: tem `nuxt.config.*` ou `next.config.*` na raiz
    - Vue ou React: tem `index.html` na raiz e `vite` com `vue` ou
      `react` no `package.json`, sem `exports`
    - Node: tem o script `start` e não é lib JS/TS pela regra abaixo
  - lib JS/TS (`types/js-library.md`): tem `package.json`, sem
    `composer.json` nem config de Nuxt/Next, com `exports`, `main`,
    `module` ou `bin`, e sem `private: true`, ou com ele e instalada
    por git (`npx github:...` no README, com ou sem
    `--allow-git=root`)
  Na dúvida (monorepo com workspaces, app Vite sem Vue nem React, outro
  meta-framework como Astro ou SvelteKit, nenhum dos quatro), pergunte.
  Depois leia o arquivo do tipo e faça o
  reconhecimento extra que ele pede (estágio, requisitos de testes).
  Lib JS/TS e aplicação JS/TS são os **tipos JS**; pacote e
  aplicação Laravel, os **tipos Laravel**.
- Tipos Laravel: versões de PHP e Laravel suportadas/em uso. Tipos JS:
  versão do Node (`engines`, `.nvmrc`/`.node-version`), do TypeScript
  e do framework (Nuxt, Next, Vue, React).
- **Testes PHP** (só tipos Laravel): o padrão é o Pest.
  - Pest instalado (`pestphp/pest` no composer.json e `vendor/bin/pest`
    existindo): use o Pest. Senão, PHPUnit (`vendor/bin/phpunit`), com
    os requisitos do arquivo do tipo, e aponte a migração para Pest
    como item "sugestão" (com `pestphp/pest-plugin-drift`, que converte
    os testes); nunca converta sem aprovação.
  - Sem runner: item "importante" que oferece
    `composer require --dev pestphp/pest pestphp/pest-plugin-laravel
    --with-all-dependencies` numa aplicação, ou só `pestphp/pest` num
    pacote (o Testbench já basta), e `vendor/bin/pest --init`, só se eu
    aprovar.
  - Comando: script `test` do composer.json se existir; senão
    `php artisan test` numa aplicação e o binário num pacote, como o
    CI de `datalogix/workflows`.
  - Todo teste novo no estilo do runner em uso: Pest (`it()`/`test()`,
    `expect()`) ou classes PHPUnit estendendo o `TestCase` do projeto.
    Nunca misture runners; converter só pela migração aprovada.
- **Testes JS/TS** (com JS/TS próprio; nos tipos JS, sempre): o
  padrão é o Vitest.
  - Vitest instalado: use-o. Jest instalado: use o Jest e aponte a
    migração para Vitest como item "sugestão"; nunca converta sem
    aprovação.
  - Sem runner: item "importante" que oferece instalar o Vitest pelo
    gerenciador do projeto (ex.: `npm i -D vitest`), só se eu aprovar.
  - Comando: script `test` do `package.json` se existir; senão
    `npx --no-install vitest run` (ou `npx --no-install jest`).
- **Ferramentas de qualidade**: nos tipos Laravel, Pint,
  PHPStan/Larastan, Rector (em `vendor/bin` e no composer.json, com a
  versão do Pint). Use só as que existirem; não instale.
  Pint (tipos Laravel) e ESLint + Prettier se houver JS/TS próprio
  são obrigatórios; PHPStan/Larastan e Rector são opcionais. Registre
  no perfil os que faltam (viram item nas etapas `composer` e `npm`,
  ou `frontend` se houver JS/TS sem `package.json`; os opcionais, só
  como "sugestão").
- **Pastas**: nos tipos Laravel, código (`src/` ou `app/`); recursos
  na raiz (`config/`, `database/`, `routes/`, `lang/`, `stubs/`). Nos
  tipos JS, as pastas que o arquivo do tipo lista para cada etapa.
  Em todos, front-end (Blade, Vue, JSX, CSS, JS, TS em `resources/`,
  `stubs/`, `app/`, `components/` ou outra pasta), registrando a stack
  (Livewire, Alpine, Tailwind, Vite, Inertia, TypeScript), o gerenciador
  pelo lockfile, os scripts do `package.json`, as ferramentas (Vitest/
  Jest, Playwright/Cypress, ESLint, Prettier, Stylelint, `tsc`) e o que
  é gerado e deve ser ignorado (`public/build`, `dist/`, `.min.*`,
  `.nuxt/`, `.output/`, `.next/`).
- **Skills e guidelines**:
  - `.claude/skills/*/SKILL.md`, `.claude/commands/*.md` (Claude Code)
  - `.ai/skills/*/SKILL.md`, `.ai/guidelines/*` (Laravel Boost, do
    projeto)
  - `resources/boost/skills/*/SKILL.md`, `resources/boost/guidelines/*`
    (Laravel Boost, distribuídas por um pacote) e toda outra pasta com
    `SKILL.md` que um `plugin.json`, um `marketplace.json` ou o `files`
    entrega (ex.: `mods/<nome>/skills/`)
  Leia só o frontmatter (`name`, `description`) e classifique:
  - **Ferramenta da revisão** (`.claude/`, `.ai/`): mapeie cada uma para
    as etapas em que se aplica, pela descrição. Se não estiver claro,
    pergunte.
  - **Produto** (`resources/boost/` e essas outras pastas): revisado na
    etapa de documentação.
  - Mesma skill em `.claude/skills` e `.ai/skills`: a de `.ai/` é a
    fonte.
  Mostre no perfil: skill · origem · etapas.
- **Arquivos de comunidade da organização**: com remoto no GitHub,
  veja se `<owner>/.github` existe e é público (`gh api
  repos/<owner>/.github --jq .private`) e liste, na raiz dele, em
  `.github/` e em `docs/` (`gh api repos/<owner>/.github/contents/
  <pasta>`), os que o GitHub usa como padrão nos repositórios da
  organização: `FUNDING.yml`, `CODE_OF_CONDUCT.md`,
  `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `GOVERNANCE.md`,
  `ISSUE_TEMPLATE/`, `PULL_REQUEST_TEMPLATE.md` e
  `DISCUSSION_TEMPLATE/`. Registre no perfil. Nunca sugira criar no
  projeto um que a organização já fornece: a cópia substituiria o
  padrão e divergiria dele. `LICENSE` não é herdado. Sem `gh`, sem
  remoto no GitHub, ou com o repositório inexistente ou privado,
  registre "nenhum".
- **Notas de versão**: `CHANGELOG.md`, `UPGRADE.md` e, com remoto no
  GitHub, as releases com texto (`gh release list` e `gh release view
  <tag> --json body`). Registre no perfil: "CHANGELOG", "GitHub
  Releases", os dois ou "nenhuma".
- Leia `CLAUDE.md`, `CONTRIBUTING.md` e `.editorconfig` se existirem.
