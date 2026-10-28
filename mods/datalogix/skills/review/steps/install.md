# Etapa: install (só pacotes) — instalação real

Objetivo: provar que alguém consegue instalar e usar o pacote seguindo
só o README, numa aplicação Laravel limpa. Os testes com Testbench não
pegam isso.

## Preparação (tudo FORA do projeto)
- Sandbox: `~/.claude/reviews/<id>/sandbox/` (`<sandbox>` abaixo).
  Use sempre o caminho absoluto: o shell volta à raiz do projeto a cada
  comando, e um caminho relativo criaria a sandbox dentro dele. Se já
  existir uma sandbox (sessão interrompida), pergunte antes de apagá-la.
- Pacote como o Composer entregaria (respeitando `export-ignore`),
  extraído em `<sandbox>/package/`:
  `mkdir -p <sandbox>/package`, `ref=$(git stash create)` e depois
  `git archive --worktree-attributes --format=tar "${ref:-HEAD}" |
  tar -x -C <sandbox>/package`. Inclui mudanças não commitadas em
  arquivos versionados (com árvore limpa, `git stash create` não
  imprime nada e o `HEAD` é usado). Arquivos novos ainda não
  adicionados ao git NÃO entram: se houver (`git status --porcelain`
  com `??`), avise.
- Aplicação limpa com a versão mais recente do Laravel suportada pelo
  pacote:
  `composer create-project laravel/laravel <sandbox>/app "<versão>"`
  com SQLite. Se não houver rede ou falhar, pare e me avise.
- No `composer.json` da app, um repositório `path` com
  `"url": "../package"` e `"options": {"symlink": false}`.

## Seguir o README à risca
Execute exatamente o que o README manda, na ordem, sem completar nada
de cabeça:
1. `composer require <pacote>` (com `@dev` se for necessário pelo
   repositório local; anote isso, não é falha do pacote)
2. publicações, migrations, configuração e qualquer passo descrito
3. o exemplo de uso rápido: transforme-o numa rota, comando ou teste
   na app e execute
4. depois, verifique:
   - `php artisan about` e `php artisan route:list` sem erros
   - `php artisan optimize` (config e rotas em cache; também views e
     eventos no Laravel 11+) e o exemplo funcionando de novo com os
     caches; depois `php artisan optimize:clear`
   - cada tag registrada no provider publica algo:
     `php artisan vendor:publish --tag=<tag>` (sem `--tag` o comando é
     interativo)
   - nada de `tests/`, `docs/` ou arquivos de desenvolvimento dentro de
     `vendor/<pacote>`

## Relatório
Cada problema vira item no formato normal: README errado ou incompleto,
passo que falha, tag de publicação faltando, incompatível com cache,
arquivo de desenvolvimento no pacote, erro com a configuração padrão.
As correções são feitas no pacote (ou no README), nunca na sandbox.

## Ao aplicar
Depois das correções aprovadas e da verificação completa do pacote,
refaça a instalação do zero na sandbox para confirmar. Se eu pedir,
repita com a versão MÍNIMA do Laravel suportada.

A sandbox é apagada quando eu disser "próxima".
