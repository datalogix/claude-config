# Etapa: composer (dependências PHP)

Rode, quando disponíveis: `composer validate --strict`,
`composer outdated --direct`, `composer audit`. Analise:

- **Uso real**: para cada pacote em `require`, procure uso no código
  (namespaces, facades, classes, providers, config). Aponte os que
  parecem não usados; `composer why <pacote>` mostra se outro pacote
  também o exige (aí removê-lo do `require` não o desinstala). É só
  sugestão: pacotes usados via config ou provider dão falso positivo.
- **require vs require-dev** trocados.
- **Dependências implícitas**: classes de pacotes que só chegam como
  dependência transitiva; devem ser declaradas.
- **conflict**: versões que sabidamente quebram o projeto; entradas
  obsoletas.
- **suggest**: integrações opcionais usadas com `class_exists`/
  `interface_exists` que deveriam estar lá, com descrição útil; entradas
  que não fazem mais sentido.
- **Metadados**: `description`, `keywords`, `license`, `autoload`,
  `autoload-dev`, `config.sort-packages`,
  `minimum-stability`/`prefer-stable`.
- **Scripts** (convenção de `datalogix/workflows`: o CI roda
  `composer test`, então CI, máquina local e Claude testam do mesmo
  jeito; `lint` e `format` são locais: o CI roda o Pint direto e, só
  numa aplicação, o PHPStan):
  - `test`: aplicação
    `["@php artisan config:clear --ansi", "@php artisan test"]`;
    pacote `@php vendor/bin/pest` (ou `phpunit`)
  - `lint`: `@php vendor/bin/pint --test` (com `--blade` nas condições
    abaixo) e, se existirem, `@php vendor/bin/phpstan analyse` e
    `@php vendor/bin/rector --dry-run`
  - `format`: `@php vendor/bin/pint` (com `--blade` idem)
  - `test` e `lint` só checam e terminam (nada de `--fix` nem watch);
    quem corrige é o `format`. Suítes longas: na aplicação, comece o
    `test` com `Composer\\Config::disableProcessTimeout`; no pacote,
    use `"config": {"process-timeout": 0}` e mantenha o `test` como
    um comando só (com uma lista, o CI não passa `--no-coverage` e as
    combinações sem driver falham com o Clover do `phpunit.xml`)
  - o que faltar ou divergir é item "importante", com o JSON sugerido
    pronto; nomes já usados pelo projeto para o mesmo fim (`analyse`,
    `pint`) viram sugestão de renomear, sem quebrar quem os chama.
    Referência de uma aplicação sem PHPStan e Rector:

    ```json
    "test": ["@php artisan config:clear --ansi", "@php artisan test"],
    "lint": "@php vendor/bin/pint --test",
    "format": "@php vendor/bin/pint"
    ```
- **Testes**: Pest e plugins (`pest-plugin-laravel` etc.) coerentes com
  a versão do PHPUnit; PHPUnit sem restrições conflitantes.
- **Vulnerabilidades** (`audit`): separe as de runtime das de dev.
- **Desatualizados** (`outdated`): só liste, numa linha em
  "Recomendações gerais"; atualizar é o modo `deps`.
- **Formatação (obrigatória)**: `laravel/pint` 1.20+ em `require-dev`
  (o job de Pint do CI usa `--diff`, que exige essa versão), com os
  scripts `lint` e `format` acima; `pint.json` não é exigido (o
  padrão do Pint basta). O que faltar é item "importante"; se faltar
  o Pint, o item oferece `composer require --dev laravel/pint`,
  aplicado só se eu aprovar.
- **Blade**: com views Blade, o Pint também as formata (versão 1.30+,
  com `--blade` ou a regra `Pint/laravel_blade` num `pint.json` já
  existente). Pint mais antigo ou script sem `--blade` é item
  "importante". Precisa de Node; na primeira execução o Pint pede para
  instalar as dependências do Prettier: só aceite com minha aprovação.
- **Ferramentas ausentes**: se faltar PHPStan/Larastan ou Rector,
  sugira (severidade "sugestão") com o motivo, sem instalar.

## Pacote
- restrições de versão: nem amplas demais (`*`, `>=`) nem travadas numa
  minor; coerência entre `php`, `illuminate/*` e a matriz do CI
- prefira `illuminate/*` específicos a `laravel/framework` em `require`
- `extra.laravel` (providers, aliases) correto
- `orchestra/testbench` em `require-dev` cobrindo todas as versões do
  Laravel suportadas
- **Licença**: compare com `templates/LICENSE` da skill (MIT,
  `Copyright (c) Datalogix`):
  - `LICENSE` (ou `LICENSE.md`) ausente na raiz: item "importante" que
    cria o arquivo igual ao modelo, aplicado só se eu aprovar; se o
    vendor do `name` não for `datalogix`, pergunte o titular antes
  - `license` do composer.json (e do `package.json`, se houver) igual à
    licença do arquivo (`MIT`)
  - MIT com texto ou titular diferente do modelo: item "sugestão" com
    a diferença; outra licença (Apache, GPL etc.): pergunte, nunca troque

## Aplicação
- `laravel/framework` em `require` é o normal
- restrições com `^` e lockfile versionado; versões fixas só com motivo
- `config.platform.php` batendo com a versão de PHP de produção, se o
  projeto usa isso
- pacotes de desenvolvimento (Telescope, Debugbar, Sail) só em
  `require-dev` e sem serem carregados em produção

Ao aplicar, rode `composer update` só dos pacotes afetados.
