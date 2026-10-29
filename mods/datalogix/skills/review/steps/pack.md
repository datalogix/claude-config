# Etapa: pack (só libs JS/TS) — o pacote como o npm entrega

Objetivo: provar que alguém consegue instalar e usar a lib seguindo só
o README, a partir do que o npm publicaria. Os testes do projeto rodam
sobre o código-fonte e não pegam `exports`, `files` ou tipos errados.

## Preparação (tudo FORA do projeto)
- Sandbox: `~/.claude/reviews/<id>/sandbox/` (`<sandbox>` abaixo).
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
- Projeto limpo em `<sandbox>/app`: `npm init -y`, instale o `.tgz` e
  as `peerDependencies`, e `typescript` como dependência de
  desenvolvimento da sandbox (só para conferir os tipos). Se não houver
  rede ou falhar, pare e me avise.

## Conferir
1. Cada entrada do `exports`:
   - ESM: `node --input-type=module -e "import * as m from '<entrada>';
     console.log(Object.keys(m))"`
   - CJS, se o pacote declarar `require`: `node -e
     "console.log(Object.keys(require('<entrada>')))"`
   - lib só de navegador: pule a execução no Node e confira só os tipos
2. Tipos: um `check.ts` que importa cada entrada e usa o principal de
   cada uma, compilado com `tsc --noEmit` duas vezes, com
   `"moduleResolution": "bundler"` e com `"node16"`
   (`"module": "node16"`); nenhum erro nem `any` implícito vindo da lib.
3. O exemplo de uso rápido do README, à risca, sem completar nada de
   cabeça: transforme-o num arquivo na sandbox e execute.
4. Cada comando do `bin`: rode com `--help` (ou sem argumentos) pelo
   `npx` da sandbox.
5. `engines.node`: se a sandbox roda numa versão fora da faixa, anote.

## Relatório
Cada problema vira item no formato normal: arquivo faltando ou sobrando
no pacote, entrada do `exports` que não carrega, tipos que não
resolvem, README errado ou incompleto, `bin` que falha.
As correções são feitas na lib (ou no README), nunca na sandbox.

## Ao aplicar
Depois das correções aprovadas e da verificação completa da lib,
refaça o pack e a instalação do zero na sandbox para confirmar.

A sandbox é apagada quando eu disser "próxima".
