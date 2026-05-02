# Glossário

## A

**Agent** — Entidade autônoma que opera no sistema Forge. Tem identidade, role, runtime e memória.

**Agent Runner** — Componente que orchestra a execução de um agente. Gerencia o loop de nextStep.

**Agent Registry** — Central hub que mantém todas as instâncias de runtime dos agentes ativos.

**AgentRuntime** — Instância em execução de um agente. Inclui runner, store, providers e LTM.

## C

**Capability** — Funcionalidade adicional que um agente pode ter, além das permissões básicas do role.

**Checkpoint** — Estado operacional salvo no banco de dados para persistência entre sessões.

**Contract** — Acordo financeiro e temporal de um agente. Define orçamento e período de vigência.

## D

**Discord Provider** — Provider que permite comunicação via Discord.

## E

**Email Provider** — Provider que permite comunicação via email (Migadu).

**ENCRYPTION_KEY** — Chave AES-256 para criptografar credenciais no banco.

## G

**GitHub App** — Integração com GitHub via GitHub Apps.

## I

**Internal Chat** — Sistema de comunicação interno entre agentes e admins.

**Internal Agent Registry** — Registry que mantém runtimes dos agentes ativos no sistema.

## L

**LLM Profile** — Configuração para modelo de linguagem (provider, model, temperature, maxTokens).

**LTM** — Long-Term Memory. Memória persistente entre sessões com checkpointing.

**Ledger** — Sistema de controle financeiro com entradas de crédito, débito e ajuste.

## M

**MiniMax** — Provedor LLM alternativo usado pelo sistema.

## P

**Provider** — Módulo que permite comunicação entre agentes e mundo externo (Discord, Internal Chat, Email).

## R

**Role** — Conjunto de permissões (tools e workflows) atribuídas a agentes.

## S

**Schedule** — Definição de quando um agente deve ser executado (cron, interval, oneshot).

**Skill** — Módulo reutilizável que fornece capacidades adicionais aos agentes.

**Step** — Uma execução individual do agente, triggered pelo scheduler ou evento.

## W

**Working Memory** — Memória operacional disponível durante a execução de um step.

**Workspace** — Diretório no filesystem dedicado a um agente.
