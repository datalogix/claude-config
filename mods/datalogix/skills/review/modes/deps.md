# Modo: deps — revisar e atualizar dependências

Passos, um por vez:
1. Composer: revisão (`steps/composer.md`), se existir `composer.json`.
2. Composer: atualizações, se existir `composer.json`.
3. npm: revisão (`steps/npm.md`), se existir `package.json`.
4. npm: atualizações.

## Passos de atualização
- liste o desatualizado (`composer outdated --direct`, `npm outdated` ou
  equivalente) em três grupos: patch, minor e major
- patch e minor: um item por grupo
- major: um item por pacote, com o que muda (changelog ou guia de
  upgrade; busque na web se precisar), o que afeta no código e se exige
  mudar a restrição no composer.json/package.json
- upgrade de major do próprio Laravel, Nuxt ou Next: item separado,
  com o guia de upgrade oficial, e só com aprovação
- vulnerabilidades (`audit`) com prioridade, separando runtime de dev
- pacote ou lib JS/TS: não suba versão mínima de PHP, Laravel, Node,
  `peerDependencies` ou dependências só para atualizar; amplie a faixa
  (`^11.0` → `^11.0|^12.0`). Subir o mínimo é quebra de
  compatibilidade (regras de estágio do tipo)
- aplicação: pode subir mínimos, mas confira se o PHP/Node de produção
  atende (pergunte se não souber)
- aplique um item por vez: atualize só aqueles pacotes, ajuste o código
  se preciso, rode a verificação completa (com `build`); se falhar após
  2 tentativas, reverta aquele item e siga
- o lockfile é atualizado junto; nunca regenere o lockfile inteiro
