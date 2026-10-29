# Etapa: code nos tipos JS (código JS/TS, uma pasta por vez)

Para libs JS/TS e aplicações Nuxt/Next. Leia todos os arquivos do
passo e analise. Arquivos gerados ficam fora (`dist/`, `.nuxt/`,
`.output/`, `.next/`, `*.d.ts` gerados).

- **Bugs e casos de borda**: `null`/`undefined`, arrays vazios,
  promessas sem `await` ou sem tratamento de erro, condições de
  corrida, datas e fuso horário, números com ponto flutuante em
  valores monetários.
- **Tipos**: `any` evitável, `as` forçado, `!` (non-null) sem
  garantia, `@ts-ignore`/`@ts-expect-error` sem motivo, tipos
  duplicados; `strict` ligado no `tsconfig.json` (desligado é item
  "importante").
- **Segurança**: validação de entrada nas bordas (dados de rede,
  formulário, arquivo, variável de ambiente), de preferência com
  schema (ex.: zod, valibot, se o projeto já usa um); `eval`/
  `new Function`; caminhos montados com entrada do usuário; segredos
  no código; dados sensíveis em logs.
- **Desempenho**: trabalho repetido em loop, requisições em série que
  podem ser paralelas, import pesado onde um mais leve basta.
- **Design**: funções e módulos longos, responsabilidade única,
  dependência circular entre módulos.
- **Consistência** com o resto do código e com as "Decisões do projeto".
- **Recursos da versão** de Node, TS e framework em uso, só se trouxer
  ganho.
- **Código morto ou duplicado**, exports que ninguém usa (fora da API
  pública).
- **Testes faltando** para o comportamento do passo.

## Lib
- importar a lib não pode ter efeito colateral (nada roda no topo do
  módulo além de declarações), coerente com o `sideEffects` do
  package.json
- API do Node (`fs`, `process`, `Buffer`) só se o alvo for Node, ou
  isolada numa entrada com a condição `node` no `exports`
- erros lançados com classe ou `code` próprios, que quem usa consegue
  distinguir; nunca `throw` de string
- nada que deveria ser `peerDependency` (framework) importado como
  dependência própria

## Servidor (aplicação Nuxt/Next)
Toda rota do servidor é uma porta de entrada pública:
- autenticação e autorização dentro de cada handler, não só no
  middleware nem só escondendo o botão na interface
- body, query e params validados antes do uso; erro de validação com
  status 4xx, sem stack nem mensagem interna na resposta
- CORS e métodos HTTP restritos ao necessário; proteção contra CSRF em
  rotas com cookie de sessão que alteram dados
- limite de taxa em login, envio de e-mail e rotas caras
- segredos só no servidor:
  - Nuxt: `useRuntimeConfig()` com as chaves privadas só em `server/`;
    nada secreto em `runtimeConfig.public`
  - Next: módulos com segredo importam `server-only`; nada secreto em
    variável `NEXT_PUBLIC_`
- Next: Server Actions são endpoints públicos (qualquer um pode
  chamá-las): valide e autorize dentro de cada uma; nunca confie em
  argumentos vindos do cliente, como ids de usuário
- Nuxt: estado em variável de módulo em `server/` é compartilhado
  entre requisições (e entre usuários)

## Nomenclatura
Regras de "Nomenclatura" de `code.md` (nesta mesma pasta), com as
convenções de JS/TS no lugar das do Laravel: camelCase em variáveis e
funções, PascalCase em classes, tipos e componentes, nomes de arquivo
no padrão já usado no projeto (Nuxt e Next dão significado ao nome em
`pages/`, `app/`, `server/` e `composables/`: renomear muda rota ou
auto-import). Renomear algo que é API pública: marque "Quebra a API
pública: sim" e siga as regras de estágio do tipo.

## Documentação no código e JSDoc/TSDoc
Mesmas regras de "Documentação no código" e "Docblocks" de `code.md`:
JSDoc/TSDoc (`/** ... */`) só é revisado no modo `docs`. Exceção: o
`@deprecated` exigido pelas regras de estágio ao renomear API pública.
