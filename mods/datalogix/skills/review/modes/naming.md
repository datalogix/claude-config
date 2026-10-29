# Modo: naming — nomenclatura

Revisa SÓ nomes. Outros problemas não entram no relatório (no máximo
uma linha em "Recomendações gerais" se forem críticos).

Passos, um por vez:
1. Glossário: levante os conceitos do projeto e os nomes usados para
   cada um (ex.: `token` vs `code` vs `otp`); proponha um nome por
   conceito. As respostas vão para "Decisões do projeto" e valem para
   os passos seguintes.
2. Código PHP (tipos Laravel) ou JS/TS (tipos JS), uma pasta por vez.
3. Front-end, uma pasta por vez (se existir).
4. Nomes que atravessam o projeto: chaves de config, nomes de rota,
   eventos, comandos Artisan, views, tabelas e colunas, chaves de
   tradução, tags de publicação; nos tipos JS, entradas do `exports`,
   rotas de páginas e de API, variáveis de ambiente, chaves de
   cookies e `localStorage`.

## O que revisar
Regras de "Nomenclatura" de `steps/code.md` (nos tipos JS, as de
`steps/code-js.md`), aplicadas a classes,
interfaces, traits, enums e casos, métodos, propriedades, constantes,
parâmetros, variáveis, arquivos e pastas, componentes Blade/Livewire,
funções e variáveis JS/TS e classes CSS próprias. Também:
- interfaces, traits e abstratas no padrão já usado (sufixo
  `Contract`/`Interface`, prefixo `Has`/`Interacts`)
- nome da classe igual ao do arquivo; namespace igual à pasta
- testes com nomes que descrevem o comportamento
- tudo coerente com o glossário

## Renomeações
- o que for API pública (definição no arquivo do tipo) é marcado como
  quebra e segue as regras de estágio do tipo
- tabelas e colunas: siga as regras de migrations do estágio; sempre
  com aprovação
- atualize todas as referências, incluindo strings, views, config,
  docs e skills, e busque pelo nome antigo antes de concluir
