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
Quem fez as mudanças não deve ser o único a revisá-las. As skills
abaixo revisam com subagentes de contexto limpo, que não veem esta
conversa, então podem rodar nesta sessão. Pergunte quais rodar e
PARE até a resposta:
- `- [ ] Rodar o /code-review sobre as mudanças da revisão`, sempre,
  sobre a branch da revisão ou o intervalo desde o primeiro commit
  registrado no progresso;
- `- [x] Rodar o /security-review sobre as mudanças da revisão`, só
  se as mudanças da revisão tocam áreas sensíveis: autenticação,
  autorização (policies, gates, middleware), validação de entrada,
  queries cruas, uploads, sessão, cookies, CORS, headers de
  segurança, criptografia, segredos ou dependências. Escrita marcada,
  como sugestão: só vale se eu marcar. Abaixo dela, recuado, os
  arquivos sensíveis que mudaram. Sem nenhum, não a mostre.
  Ela revisa só o que a branch atual tem a mais que a padrão: na
  branch padrão (a de `git symbolic-ref --short
  refs/remotes/origin/HEAD`, sem o `origin/`, ou `main`/`master`), não
  a mostre; diga que ela não teria o que analisar e sugira fazer as
  próximas revisões numa branch própria (ex.: `review/<data>`).

Rode as marcadas nesta ordem, pela ferramenta de skills (Skill), sem
nível (`max` e `ultra` só se eu pedir). Sem a ferramenta, ou se uma
skill não estiver disponível, diga e oriente-me a rodá-la.

Os achados das duas viram um único relatório extra, no ciclo normal
(aprovo o que aplicar). Mostre todos, sem descartar nem rebaixar
nenhum: quem fez as mudanças não filtra a revisão delas. Se discordar
de um achado, diga por quê no próprio item e deixe a decisão comigo.
Um achado que repete um item já recusado numa etapa ou uma "Decisão do
projeto" continua no relatório, com a marca "já recusado em <etapa>"
ou "já decidido" e o motivo registrado no progresso.

Para mudanças grandes antes do merge, mencione o `/code-review ultra`
(roda na nuvem e é cobrado): só eu posso rodá-lo.

## 3. Resumo final
Etapas feitas, passos pulados ("pula"), itens aplicados e recusados,
"Decisões tomadas", testes adicionados, quebras de API e perguntas que
ficaram pendentes.
