# Etapa: pack (só libs JS/TS) — o pacote como o npm entrega

Objetivo: provar que alguém consegue instalar e usar a lib seguindo só
o README, a partir do que o npm publicaria. Os testes do projeto rodam
sobre o código-fonte e não pegam `exports`, `files` ou tipos errados.

## Lib instalada por git
Sem publicação (`private: true`, instalada com `npx github:...`, com
ou sem `--allow-git=root`), não use `npm pack`: ele recusa
package.json sem `version` e essa instalação não precisa dele; não
sugira acrescentá-lo só por isso.
Troque os dois `npm pack` e a instalação do `.tgz` da Preparação
por: com `cd <sandbox>/app && ...`, `npm init -y` (uma vez só) e `npm i
--allow-git=root git+file://<caminho absoluto do projeto>#<commit>`,
que só leva o que tem commit (avise se a árvore estiver suja). Confira
a lista de arquivos em `node_modules/<nome>`, com os mesmos critérios.
O clone local ignora o `export-ignore`, que o tarball do GitHub
respeita: arquivo dessa lista que falte em `git archive --format=tar
<commit> | tar -t`, salvo o gerado pelo `prepare`, não chega a quem
instala e é item "crítico".

## Preparação (tudo FORA do projeto)
- Sandbox: `~/.claude/reviews/<id>/sandbox/` (`<sandbox>` abaixo),
  criada com `mkdir -p <sandbox>/app`.
  Use sempre o caminho absoluto: o shell volta à raiz do projeto a cada
  comando, e um caminho relativo criaria a sandbox dentro dele. Se já
  existir uma sandbox (sessão interrompida), pergunte antes de apagá-la.
- Rode o script `build` do projeto, se existir (o `prepack` ou o
  `prepublishOnly` também rodariam na publicação).
- `npm pack --dry-run` (ou o equivalente do gerenciador): confira a
  lista de arquivos:
  - entram o build, os tipos, `README`, `LICENSE` e o que o `exports`
    e o `bin` apontam
  - não entram testes, código-fonte (a menos que seja intencional, com
    source maps), configs de desenvolvimento, `.env` ou fixtures
  - cada caminho de `exports`, `main`, `module`, `types` e `bin` existe
    no pacote
- `npm pack --pack-destination <sandbox>`.
- Projeto limpo em `<sandbox>/app`, tudo com `cd <sandbox>/app && ...`
  na mesma chamada (na raiz, o `npm init -y` reescreve o package.json
  do projeto, e o `--prefix` não o impede): `npm init -y`, instale o
  `.tgz` e as `peerDependencies` e, se a lib tiver entradas além do
  `bin`, `typescript` como dependência de desenvolvimento da sandbox
  (só para conferir os tipos). Se não houver rede ou falhar, pare e me
  avise.

## Conferir
Rode tudo com `cd <sandbox>/app && ...` na mesma chamada: na raiz do
projeto, o Node resolveria o nome da lib pelo próprio `exports`, e o
teste passaria sem olhar o que foi instalado.

1. Cada entrada do `exports`:
   - ESM: `node --input-type=module -e "import * as m from '<entrada>';
     console.log(Object.keys(m))"`
   - CJS, se o pacote declarar `require`: `node -e
     "console.log(Object.keys(require('<entrada>')))"`
   - lib só de navegador: pule a execução no Node e confira só os tipos
2. Tipos (numa lib só com `bin`, pule, sem instalar o `typescript`):
   um `check.mts` que importa cada entrada e usa o principal de cada
   uma, e dois configs na sandbox, ambos com `"strict": true` e
   `"files": ["check.mts"]`: um com `"module": "esnext"` e
   `"moduleResolution": "bundler"`, outro com `"module": "node16"` e
   `"moduleResolution": "node16"`. Rode `npx tsc --noEmit -p <config>`
   nos dois (sem config, o `tsc` só mostra a ajuda); nenhum erro nem
   `any` implícito vindo da lib. Numa lib com alvo Node, instale também
   `@types/node` na sandbox e use `"types": ["node"]` nos dois configs:
   sem isso, um tipo do Node no `.d.ts` da lib dá erro falso.
3. O exemplo de uso rápido do README, à risca, sem completar nada de
   cabeça: transforme-o num arquivo na sandbox e execute.
4. Cada comando do `bin`: rode com `--help` pelo `npx` da sandbox. Sem
   `--help` no código do `bin`, não o execute sem antes ler o que ele
   faz: se alterar algo fora da sandbox, confira só que ele resolve e
   anote.
5. `engines.node`: se a sandbox roda numa versão fora da faixa, anote.

## Relatório
Cada problema vira item no formato normal: arquivo faltando ou sobrando
no pacote, entrada do `exports` que não carrega, tipos que não
resolvem, README errado ou incompleto, `bin` que falha.
As correções são feitas na lib (ou no README), nunca na sandbox.

## Ao aplicar
Depois das correções aprovadas e da verificação completa da lib,
apague `<sandbox>/app` e o `.tgz` em `<sandbox>`, se houver, sem
perguntar (são desta sessão), e refaça o pack e a instalação do zero
para confirmar.
Na lib instalada por git, confirme só depois dos commits das correções,
com o novo `#<commit>`; sem commit, diga que a correção não foi
confirmada.

A sandbox é apagada quando eu disser "próxima" ou, na etapa avulsa,
ao fim dela; na lib instalada por git, só depois dessa confirmação.
