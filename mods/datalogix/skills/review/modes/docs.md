# Modo: docs — documentação, incluindo docblocks

Revisa SÓ documentação. Outros problemas não entram no relatório (no
máximo uma linha em "Recomendações gerais" se forem críticos).

Passos, um por vez:
1. README, `/docs`, CLAUDE.md, skills e guidelines: checklist de
   `steps/docs.md`.
2. Código PHP e recursos (config, stubs), uma pasta por vez:
   comentários e docblocks. Nos tipos JS, o código JS/TS das pastas da
   etapa `code`: comentários e JSDoc/TSDoc.
3. Front-end, uma pasta por vez (se existir): comentários e JSDoc/TSDoc.

## Comentários
Regras de "Documentação no código" de `steps/code.md`. Nos arquivos
de `config/`, o comentário de cada opção é documentação: mantenha e
corrija.

## Docblocks (só neste modo)
- mantenha e corrija os que acrescentam o que a assinatura não expressa:
  generics (`Collection<int, User>`), array shapes
  (`array{id: int, name: string}`), `@throws`, `@template`,
  `@deprecated` (com o substituto), `@property`/`@method` em classes com
  mágica (models, facades), `@mixin`, e diretivas de ferramentas
  (`@phpstan-ignore`, `@codeCoverageIgnore`, `@internal`, `@api`)
- adicione só onde faltar uma dessas informações em código público, ou
  onde o comportamento não é óbvio pelo nome e pela assinatura
- remova os que só repetem nome, tipos declarados ou o óbvio
  (`@param string $name The name`, `@return void`)
- corrija os desatualizados: parâmetro inexistente, tipo diferente da
  assinatura, `@throws` de exceção que não é mais lançada
- facades: `@method static` batendo com os métodos reais da classe
- formato consistente em todo o projeto
- JSDoc/TSDoc: as mesmas regras, com `@param`/`@returns` só onde o
  tipo TS não diz tudo, `@example` nas funções públicas de uma lib,
  `@deprecated` com o substituto e `@internal` no que fica fora da API
- docblocks não mudam comportamento, mas rode a verificação PHP
  (análise estática lê docblocks); JSDoc/TSDoc alterado roda também a
  verificação front-end
