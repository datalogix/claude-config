# Etapa: npm (dependências do package.json)

Só se existir `package.json`. Use o gerenciador do projeto (pelo
lockfile: npm, pnpm, yarn ou bun). O CI de `datalogix/workflows` só
conhece npm, pnpm e yarn: com o lockfile do bun, ele roda
`npm install` sem lockfile, então numa aplicação isso é item
"importante". Rode, quando disponíveis: `outdated` e `audit` (ex.:
`npm outdated`, `npm audit --omit=dev`, `npm audit`).
Analise:

- **Uso real**: para cada pacote em `dependencies` e `devDependencies`,
  procure uso (imports em JS/TS, `@import`/`@plugin` em CSS,
  `vite.config.*`, `tailwind.config.*`, `postcss.config.*`, configs de
  ESLint/Prettier/Stylelint, scripts). Aponte os que parecem não usados
  e use `npm explain <pacote>` (ou equivalente) para ver se outro
  pacote também o exige (aí removê-lo não o desinstala). É só sugestão:
  plugins usados só via config dão falso positivo.
- **dependencies vs devDependencies**: com JS compilado (Vite), quase
  tudo é `devDependencies`; numa lib publicada no npm, o que vai em
  runtime fica em `dependencies` e o framework (Vue, React) em
  `peerDependencies`, repetido em `devDependencies` para os testes.
  Nuxt e Next: o que o servidor importa em produção fica em
  `dependencies` (o build do Nuxt embute quase tudo, mas o Next
  `standalone` e o `next start` leem o `node_modules`).
- **Dependências implícitas**: imports de pacotes que só chegam como
  dependência transitiva.
- **Redundantes**: duas bibliotecas para a mesma coisa (moment e dayjs),
  pacotes que o framework já traz.
- **Versões**: restrições amplas demais (`*`, `latest`), majors muito
  atrasadas, conflitos de `peerDependencies`, coerência entre Vite,
  plugins do Laravel e Tailwind.
- **Lockfile**: existe, versionado, coerente com o gerenciador; mais de
  um lockfile no projeto é problema.
- **Metadados**: `private: true` se não é publicado no npm (sempre nas
  aplicações Nuxt/Next), `type: "module"` coerente com os configs,
  `engines` se o projeto depende de uma versão do Node.
- **Publicação (só lib JS/TS)**:
  - `exports` em todas as entradas, com a condição `types` primeiro e
    `import`/`require` batendo com os formatos do build; `main`,
    `module` e `types` só como fallback, coerentes com o `exports`
  - `files` listando só o que vai no pacote (o build, não `src/` nem
    testes); a lista real é conferida na etapa `pack`
  - `sideEffects: false` se nenhum módulo tem efeito ao importar
    (lista os que têm, ex.: CSS)
  - `name`, `version`, `description`, `license`, `repository`,
    `keywords`; `publishConfig` com `access: "public"` em pacote com
    escopo publicado no npm público
  - script `prepublishOnly` (ou `prepack`) rodando o `build`, para
    não publicar sem build
- **Scripts** (convenção de `datalogix/workflows`: numa aplicação, o
  CI roda `typecheck`, `lint` e `test` do `package.json` quando
  existem, pelo gerenciador do lockfile; num pacote, o CI não roda JS,
  mas os scripts são os mesmos; nos tipos JS, o CI próprio roda esses
  e o `build`, etapa `ci`):
  - `dev` e `build` (`vite`, `vite build`) se houver Vite; Nuxt:
    `nuxt dev`, `nuxt build` e `nuxt preview`; Next: `next dev`,
    `next build` e `next start`; lib: `build` com a ferramenta dela
    (ex.: `tsup`, `tsdown`, `unbuild`)
  - `lint`: `eslint . && prettier --check .` (o CI não roda `format`,
    então o Prettier entra pelo `lint`)
  - `format`: `prettier --write . && eslint . --fix`
  - `test`: `vitest run` (ou `jest` enquanto não migrar); o placeholder
    do `npm init` (`no test specified`) conta como ausente
  - `typecheck`: `tsc --noEmit` (ou `vue-tsc --noEmit`) se houver TS;
    Nuxt: `nuxt typecheck`
  - lint do Next: ESLint direto (`eslint .`), não o `next lint`, que
    as versões novas removeram
  - `lint`, `test` e `typecheck` só checam e terminam (nada de `--fix`
    nem watch: `vitest run`, não `vitest`)
  - com JS/TS próprio, o que faltar ou divergir é item "importante",
    com o JSON sugerido pronto; sem JS/TS próprio, só `dev`/`build`
- **Lint e formatação (obrigatórios se houver JS/TS próprio)**: arquivos
  JS/TS/Vue/JSX do projeto (`resources/js`, `src/`, `app/` etc.), fora
  os gerados (`public/build`, `dist/`, `.min.*`, `.nuxt/`, `.next/`);
  Alpine inline no Blade não conta. No Nuxt, o `@nuxt/eslint` serve
  de flat config; no Next, o `eslint-config-next`.
  Exige: `eslint` e `prettier` em `devDependencies`; flat config do
  ESLint (`eslint.config.{js,mjs,cjs,ts}`) e config do Prettier
  (`.prettierrc*`, `prettier.config.*` ou chave no `package.json`);
  `eslint-config-prettier`; `typescript-eslint` se houver TS;
  `prettier-plugin-tailwindcss` se houver Tailwind; scripts `lint` e
  `format` (acima). O que faltar é item "importante" que oferece
  instalar pelo gerenciador do projeto (ex.:
  `npm i -D eslint prettier eslint-config-prettier`), só se eu
  aprovar.
- **Vulnerabilidades**: separe as de runtime das de build/desenvolvimento.
- **Desatualizados** (`outdated`): só liste, numa linha em
  "Recomendações gerais"; atualizar é o modo `deps`.

Ao aplicar, atualize só os pacotes afetados e rode a verificação
completa, incluindo o `build`.
