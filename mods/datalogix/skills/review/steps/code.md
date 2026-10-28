# Etapa: code (código PHP, uma pasta por vez)

Leia todos os arquivos do passo e analise. Numa aplicação, aplique
também os checklists extras que o arquivo do tipo indica para a pasta:
`http.md` e `jobs.md` (nesta mesma pasta).

- **Bugs e casos de borda**: null, coleções vazias, tipos, timezone.
- **Segurança**: validação de entrada, autorização, mass assignment,
  comparações de segredo em tempo constante (`hash_equals`), dados
  sensíveis em logs.
- **Desempenho**: N+1, queries em loop, cache ausente.
- **Design**: responsabilidade única, classes/métodos longos,
  dependência de classe concreta onde há Contract.
- **Consistência** com o resto do código e com as "Decisões do projeto".
- **Recursos da versão** de PHP/Laravel em uso, só se trouxer ganho.
- **Código morto ou duplicado**.
- **Testes faltando** para o comportamento do passo.

## Nomenclatura
Classes, métodos, propriedades, parâmetros e variáveis:
- o nome diz o que faz/contém, sem precisar ler a implementação
- métodos são verbos (`sendCode`, `resolveUser`); booleanos usam
  `is`/`has`/`can`/`should`
- sem abreviações obscuras, nomes genéricos (`data`, `info`, `temp`) ou
  nomes que mentem (um `get` que altera estado)
- o mesmo conceito tem o mesmo nome em todo o projeto
- convenções do Laravel: camelCase em métodos e propriedades de classe;
  atributos de model seguem as colunas (snake_case); chaves de config
  e eventos no padrão já usado no projeto
- renomear algo que é API pública (definição no arquivo do tipo): marque
  "Quebra a API pública: sim" e siga as regras de estágio do tipo
  (alias `@deprecated` ou renomeação direta)

## Documentação no código (só o realmente necessário)
- documente apenas as partes importantes: regra de negócio não óbvia,
  decisão de design, workaround, risco de segurança, efeito colateral
  inesperado, referência a issue/RFC
- não documente o que o nome e a assinatura já dizem; se algo precisa
  de comentário para ser entendido, prefira melhorar o nome ou extrair
  um método
- remova comentários que repetem o código, código comentado e TODOs
  resolvidos

## Docblocks
Ignore. Não adicione, não remova, não altere e não aponte nada sobre
docblocks (`/** ... */`). Eles só são revisados no modo `docs`.
Exceção: o `@deprecated` exigido pelas regras de estágio ao renomear API
pública.
