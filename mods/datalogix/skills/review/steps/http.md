# Checklist extra: camada HTTP (aplicações)

Aplicado junto com `code.md` (nesta mesma pasta) em `app/Http`,
`app/Policies`, `app/Models` e `app/Livewire`.

## Controllers
- finos: validação no FormRequest, regra de negócio em Action/Service,
  sem queries complexas inline
- autorização em TODA ação que lê ou altera dado de alguém
  (`authorize`, `Gate`, policy, `can` middleware)
- route model binding com escopo (`scopeBindings`) quando o recurso
  pertence a outro (ex.: comentário do post)
- respostas e códigos de status corretos (201, 204, 403, 404, 422)
- redirecionamentos para URL vinda do usuário só com validação (open
  redirect)

## Form Requests
- todas as entradas validadas; nada lido direto de `$request->all()`
  sem passar pela validação (`validated()`/`safe()`)
- `authorize()` coerente, não `return true` por padrão quando há regra
- uploads: `mimes`/`mimetypes`, tamanho máximo, nunca confiar no nome
  do arquivo enviado
- limites em paginação e listas (`per_page` máximo)

## Models
- `$fillable` ou `$guarded` definidos; sem `forceFill`/`unguard` com
  dado do usuário
- `$hidden` para senhas, tokens e segredos; `casts` corretos (datas,
  enums, `encrypted`, `hashed`)
- relacionamentos com tipo de retorno; scopes nomeados
- eventos de model com efeitos colaterais escondidos

## Policies
- uma por recurso, cobrindo todas as ações usadas
- regra de dono/organização correta (o erro mais comum: checar só se
  está logado)

## API Resources
- não vazam campos internos ou sensíveis
- formato estável (mudança é API pública)
- relacionamentos com `whenLoaded` para evitar N+1

## Middleware
- ordem e grupos corretos; exceções de CSRF justificadas
- `throttle` nas ações sensíveis

## Testes
Feature test por rota: sucesso, validação (422), sem autenticação (401
ou redirect) e sem permissão (403). Testes de policy para regras não
triviais.
