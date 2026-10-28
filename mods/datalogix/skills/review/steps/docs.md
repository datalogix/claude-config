# Etapa: docs (README, /docs, CLAUDE.md, skills e guidelines)

Use o código atual e a lista "Mudanças para documentar" do progresso.

## README
Pacote:
- o que o pacote faz e para quem
- requisitos (PHP, Laravel) batendo com o composer.json
- instalação, publicação de config/migrations/views/assets, build do
  front-end se necessário, configuração mínima
- exemplo de uso rápido que funciona de verdade (confira contra o código)
- links para documentação detalhada, changelog, contribuição e
  licença, só os que existirem

Aplicação:
- o que a aplicação faz, em uma ou duas frases
- requisitos (PHP, Node, banco, Redis, extensões)
- setup local passo a passo: clonar, `.env`, dependências, chave,
  migrations e seeders, build, como rodar (servidor, fila, agendador)
- como rodar testes e formatação pelos scripts (`composer test`,
  `composer lint`, `composer format` e os do `package.json`)
- deploy: link ou resumo do processo (o detalhe vai para `/docs`)

Em ambos: corrija ou remova trechos desatualizados.

## Documentação detalhada
- pacote: todo comando Artisan, opção de config, evento, Contract e
  ponto de extensão público documentado
- aplicação: arquitetura geral, deploy, filas e agendamento, integrações
  externas, decisões importantes
- se o README passar de ~300 linhas ou tiver mais de ~6 seções de
  referência, mova o detalhe para `/docs`, um arquivo por assunto, com
  `docs/README.md` como índice; o README fica com visão geral,
  instalação/setup, uso rápido e links
- se `/docs` já existir, atualize em vez de recriar e mantenha a
  estrutura, a menos que eu aprove mudar
- links relativos, sem nenhum quebrado
- idioma: seção 11 do `SKILL.md`
- ao final, marque como "documentado" na lista "Mudanças para
  documentar" o que foi coberto; não apague: o fechamento usa a lista

## CLAUDE.md
- reflete o projeto atual: domínio, stack (versões, runner de testes,
  ferramentas), comandos de teste e formatação, o que não tocar
- coerente com as "Decisões do projeto" e com o que a revisão mudou
- sem repetir o README nem as convenções que já vêm de
  `datalogix/workflows`

## Skills e guidelines
- distribuídas pelo pacote (`resources/boost/`): descrevem a API atual,
  com classes, componentes, opções e comandos que existem de verdade e
  exemplos que funcionam; nada removido ou renomeado na revisão
- do projeto (`.claude/skills`, `.claude/commands`, `.ai/skills`,
  `.ai/guidelines`): refletem as "Decisões do projeto"
- cada `SKILL.md` com `name` e `description` claros, dizendo quando
  usar; conteúdo enxuto, sem repetir o README
- nada que contradiga outra skill, guideline ou o `CLAUDE.md`
