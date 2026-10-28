# Regras para pacotes Laravel

## Reconhecimento extra
- **Estágio**: maior tag semver (`git tag --list --sort=-v:refname`,
  ignorando pré-releases como `-beta`) ou, sem tags, o `version` do
  composer.json.
  - **pré-v1**: nenhuma versão `1.0.0` ou superior
  - **v1+**: existe versão `1.0.0` ou superior
- **Testes**: a base é sempre o `orchestra/testbench`, com qualquer
  runner (`TestCase` estendendo `Orchestra\Testbench\TestCase`, com
  `getPackageProviders()` etc.; no Pest, ligado por `uses()` no
  `tests/Pest.php`). Se não estiver em `require-dev`, pare antes de
  tudo e proponha adicioná-lo na versão compatível com o Laravel
  suportado; só instale se eu aprovar.

## Etapas, nesta ordem
1. `git` — .gitignore, .gitattributes e .editorconfig
2. `ci` — integração contínua
3. `composer` — dependências PHP
4. `npm` — dependências do package.json, se existir
5. `code` — código PHP, uma pasta por vez
6. `resources` — config, database, routes, lang, stubs, uma por vez
7. `frontend` — views, CSS, JS, TS, uma pasta por vez, se existir
8. `docs` — README, /docs, CLAUDE.md, skills e guidelines
9. `install` — instalação real numa aplicação Laravel limpa
10. `closing` — fechamento

## API pública
Tudo que quem instala o pacote usa ou estende:
- classes, interfaces, traits, enums e métodos/propriedades `public` e
  `protected` fora de namespaces marcados como internos (`Internal`,
  `@internal`)
- Contracts, facades e seus métodos, helpers globais
- eventos (nome da classe e propriedades), comandos Artisan e opções
- chaves de config, nomes de tabelas e colunas, migrations publicadas
- views e componentes publicáveis (nome, namespace, props, slots)
- chaves de tradução, tags de publicação, rotas e nomes de rota
- skills e guidelines distribuídas em `resources/boost/`

## Regras por estágio

### pré-v1 (ainda não lançado)
- checagem de git não é obrigatória; só avise se a árvore estiver suja
- quebras de API continuam marcadas e exigem aprovação, mas sem alias
  `@deprecated`: renomeie e remova direto
- migrations existentes podem ser editadas (com aprovação)
- fechamento sem CHANGELOG, UPGRADE ou sugestão de versão

### v1+ — obrigatório
- **Checagem de git antes de CADA passo**:
  - `git status --porcelain` vazio (o passo anterior foi commitado)
  - fora da branch padrão (`main`/`master`); se estiver nela, pare e
    sugira criar uma (ex.: `review/<data>`)
  - registre no progresso o commit de início do passo
- Quebras de API: alias `@deprecated` apontando o substituto; remoção só
  na próxima major
- Migrations já lançadas nunca são editadas; mudança exige migration
  nova
- Não suba versões mínimas (PHP, Laravel, dependências) sem necessidade;
  prefira ampliar a faixa (`^11.0` → `^11.0|^12.0`); subir o mínimo é
  quebra de compatibilidade
- Fechamento: CHANGELOG, UPGRADE e sugestão de versão (`steps/closing.md`)
