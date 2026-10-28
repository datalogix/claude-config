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
  tudo é `devDependencies`; num pacote publicado no npm, o que vai em
  runtime fica em `dependencies`.
- **Dependências implícitas**: imports de pacotes que só chegam como
  dependência transitiva.
- **Redundantes**: duas bibliotecas para a mesma coisa (moment e dayjs),
  pacotes que o framework já traz.
- **Versões**: restrições amplas demais (`*`, `latest`), majors muito
  atrasadas, conflitos de `peerDependencies`, coerência entre Vite,
  plugins do Laravel e Tailwind.
- **Lockfile**: existe, versionado, coerente com o gerenciador; mais de
  um lockfile no projeto é problema.
- **Metadados**: `private: true` se não é publicado no npm,
  `type: "module"` coerente com os configs, `engines` se o projeto
  depende de uma versão do Node.
- **Scripts** (convenção de `datalogix/workflows`: numa aplicação, o
  CI roda `typecheck`, `lint` e `test` do `package.json` quando
  existem, pelo gerenciador do lockfile; num pacote, o CI não roda JS,
  mas os scripts são os mesmos):
  - `dev` e `build` (`vite`, `vite build`) se houver Vite
  - `lint`: `eslint . && prettier --check .` (o CI não roda `format`,
    então o Prettier entra pelo `lint`)
  - `format`: `prettier --write . && eslint . --fix`
  - `test`: `vitest run` (ou `jest` enquanto não migrar); o placeholder
    do `npm init` (`no test specified`) conta como ausente
  - `typecheck`: `tsc --noEmit` (ou `vue-tsc --noEmit`) se houver TS
  - `lint`, `test` e `typecheck` só checam e terminam (nada de `--fix`
    nem watch: `vitest run`, não `vitest`)
  - com JS/TS próprio, o que faltar ou divergir é item "importante",
    com o JSON sugerido pronto; sem JS/TS próprio, só `dev`/`build`
- **Lint e formatação (obrigatórios se houver JS/TS próprio)**: arquivos
  JS/TS/Vue/JSX do projeto (`resources/js` etc.), fora os gerados
  (`public/build`, `dist/`, `.min.*`); Alpine inline no Blade não conta.
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
