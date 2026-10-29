# Modo: report — só relatório, sem alterar nada

Com `report` (ou `report <modo>`):
- Faça o reconhecimento e rode a linha de base só para registrar o
  resultado; se algo falhar, anote e continue. Não instale nada; se
  faltar `vendor/` ou `node_modules/`, anote e pule o que depender deles.
- Percorra todas as etapas do tipo (ou todos os passos do modo), na
  ordem, um passo por vez, cada um num subagente, mas SEM pausas e SEM
  aplicar nada: não edite arquivos do projeto e não rode nada que o
  altere (`composer update`, `npm install`, migrations, publicações).
- As etapas `install` e `pack` também são só analisadas: leia o README
  e o provider (ou o `exports` e o `files` da lib) e aponte o que
  impediria a instalação, sem criar a sandbox nem rodar o build.
- Sem `CLAUDE.md`: não pare; registre como item "importante" (rodar
  `/init`) e siga.
- A etapa `ci` roda o `check` de `datalogix/workflows` normalmente
  nos tipos Laravel (ele só lê); `setup` e `protect` nunca.
- Grave em `~/.claude/reviews/<id>/report-<AAAA-MM-DD>.md`:
  1. resumo: perfil, tipo, estágio, resultado da linha de base
  2. placar: quantidade de itens por severidade, por etapa
  3. os 10 itens mais importantes do projeto inteiro
  4. o relatório de cada passo, no formato normal
  5. por onde começar (quais etapas ou modos primeiro)
  6. "Perguntas", com as regras da seção 7 do `/datalogix:review`
     (decidir antes de perguntar, exemplo em cada opção): todas numa
     seção única no fim, com os itens que dependem de cada uma; nas que
     normalmente bloqueariam, anote a suposição usada e siga
- Não marque nenhuma etapa como concluída; registre só que o report foi
  gerado, com data e commit.
- Na conversa, mostre só o resumo, o placar, os 10 itens e o caminho do
  arquivo.
