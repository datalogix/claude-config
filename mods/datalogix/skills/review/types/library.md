# Regras para libs JS/TS

Pacote publicado no npm (ou num registry privado), sem Laravel: tem
`package.json`, sem `composer.json` nem config de Nuxt/Next.

## Reconhecimento extra
- **Estágio**: maior tag semver (`git tag --list --sort=-v:refname`,
  ignorando pré-releases como `-beta`) ou, sem tags, o `version` do
  package.json.
  - **pré-v1**: nenhuma versão `1.0.0` ou superior
  - **v1+**: existe versão `1.0.0` ou superior
- **Build**: a ferramenta (tsup, tsdown, unbuild, Vite em modo lib,
  `tsc`), a pasta de saída (`dist/` etc.), os formatos (ESM, CJS) e
  onde saem os tipos (`.d.ts`).
- **Alvo**: Node, navegador ou ambos (pelo `engines`, pelo `exports`
  com condições `node`/`browser` e pelas APIs usadas); framework como
  `peerDependencies` (ex.: lib de componentes Vue ou React).
- **Publicação**: registry (`publishConfig`), workflow de publicação
  se houver, e se o `name` tem escopo (`@org/lib`).
- **Testes**: o runner de JS/TS da seção 2 do `SKILL.md`; não há
  testes PHP nem verificação PHP neste tipo.

## Etapas, nesta ordem
1. `git` — .gitignore, .gitattributes e .editorconfig
2. `ci` — integração contínua (workflows do próprio projeto)
3. `npm` — dependências, scripts e campos de publicação
4. `code` — código JS/TS (`steps/code-js.md`), uma pasta por vez;
   numa lib de componentes, aplique também as seções de componentes
   de `steps/frontend.md` (Vue ou React)
5. `docs` — README, /docs, CLAUDE.md, skills e guidelines
6. `pack` — o pacote como o npm entrega, instalado num projeto limpo
7. `closing` — fechamento

## API pública
Tudo que quem instala a lib usa ou de que depende:
- cada entrada do `exports` (ou `main`/`module`/`types` sem
  `exports`): o caminho, e o que ela exporta (funções, classes,
  constantes, tipos e interfaces TS), com as assinaturas, as opções e
  seus padrões
- erros lançados (classe, `name`, `code`) e eventos emitidos
- comandos do `bin` e suas opções
- arquivos expostos além do JS: CSS, assets, JSON
- faixa de `peerDependencies` e de `engines.node`, e os formatos
  publicados (ESM, CJS)
Módulos fora do `exports` e o que estiver marcado `@internal` NÃO são
API pública.

## Regras por estágio

### pré-v1 (ainda não lançada)
- checagem de git não é obrigatória; só avise se a árvore estiver suja
- quebras de API continuam marcadas e exigem aprovação, mas sem alias
  `@deprecated`: renomeie e remova direto
- fechamento sem CHANGELOG, UPGRADE ou sugestão de versão

### v1+ — obrigatório
- **Checagem de git antes de CADA passo**:
  - `git status --porcelain` vazio (o passo anterior foi commitado)
  - fora da branch padrão (`main`/`master`); se estiver nela, pare e
    sugira criar uma (ex.: `review/<data>`)
  - registre no progresso o commit de início do passo
- Quebras de API: o nome antigo continua exportado, apontando para o
  novo, com `@deprecated` no JSDoc indicando o substituto; remoção só
  na próxima major
- Não suba versões mínimas (Node, `peerDependencies`) sem necessidade;
  prefira ampliar a faixa (`^3.0` → `^3.0 || ^4.0`); subir o mínimo,
  tirar um formato (ex.: CJS) ou uma entrada do `exports` é quebra de
  compatibilidade
- Fechamento: CHANGELOG, UPGRADE e sugestão de versão (`steps/closing.md`)
