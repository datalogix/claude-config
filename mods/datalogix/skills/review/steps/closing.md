# Etapa: closing (fechamento)

Depois da última etapa da revisão completa.

## 1. Notas de versão (conforme o tipo e o estágio)
Pacote ou lib JS/TS v1+:
- entrada no `CHANGELOG.md` (crie se não existir, formato Keep a
  Changelog, seção "Unreleased") com Added, Changed, Deprecated,
  Removed, Fixed e Security, a partir de "Mudanças para documentar" do
  progresso (a lista inteira, inclusive o já documentado)
- `UPGRADE.md` com passo a passo se houver quebra de API
- sugestão da próxima versão em semver a partir da última tag: major se
  houver quebra de API, minor se houver funcionalidade nova, patch se só
  houver correções

Aplicação (Laravel ou Nuxt/Next) em produção — notas de deploy:
- migrations novas e se alguma é lenta ou exige ordem/duas fases
- chaves novas de `.env` e de config (no Next, as `NEXT_PUBLIC_`
  exigem novo build)
- comandos a rodar (caches, `queue:restart`, seeders obrigatórios)
- URLs que mudaram e os redirecionamentos criados
- mudanças em API pública, jobs ou webhooks e o plano de compatibilidade
- `CHANGELOG.md` só se o projeto já mantiver um

Mostre as notas na conversa e grave-as no progresso; no projeto, só no
`CHANGELOG.md` existente.

Pacote ou lib pré-v1, ou aplicação não lançada: pule este item.
Não crie tag nem release; eu faço.
Em `report`: só descreva o que entraria nas notas, sem criar arquivos,
e pule a seção 2.

## 2. Revisão independente
Quem fez as mudanças não deve ser o único a revisá-las, então não rode
você mesmo: PARE e me oriente a rodar, de preferência numa sessão nova,
nesta ordem:
- `/code-review` sobre as mudanças da revisão (a branch dela ou o
  intervalo desde o primeiro commit registrado no progresso)
- `/security-review`, se o projeto lida com autenticação, autorização,
  tokens, senhas, pagamentos ou dados pessoais
- opcional, para mudanças grandes antes do merge: `/code-review ultra`
  (roda na nuvem e pode ter custo)

Se eu colar os achados aqui, trate-os como um relatório extra: numerados,
com o ciclo normal.

## 3. Resumo final
Etapas feitas, passos pulados ("pula"), itens aplicados e recusados,
"Decisões tomadas", testes adicionados, quebras de API e perguntas que
ficaram pendentes.
