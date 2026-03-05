# Feature Request — Opportunity Radar

## Status
Draft (em discussão)

## 1) Visão
Construir um sistema que identifica oportunidades de produto antes da maioria, transformando sinais dispersos de mercado em hipóteses de negócio acionáveis.

> Observação: micro-SaaS é um formato de execução possível, não a limitação do sistema.

---

## 2) Objetivo
Ter uma máquina contínua para:
1. Descobrir oportunidades com potencial real
2. Organizar evidências de forma estruturada
3. Priorizar com critérios claros
4. Gerar propostas de produto menores e testáveis

---

## 3) Problema que estamos resolvendo
Hoje, ideação costuma depender de:
- inspiração pontual
- opinião pessoal
- sinais fracos sem estrutura

Queremos sair de ideação ad-hoc para um processo repetível e orientado por evidência.

---

## 4) Princípios (definidos até agora)
- Pensar no sistema como **radar de oportunidades**, não só “gerador de ideias”
- Não ficar preso a uma única premissa de coleta
- Combinar múltiplos caminhos de descoberta
- Registrar tudo para análise posterior (rastreabilidade)

---

## 5) Frentes de descoberta consideradas
- Mineração de dores em comunidades (Discord, Reddit, etc.)
- Extração de pedidos/reclamações em produtos SaaS existentes
- Reclamações públicas (ex.: plataformas de reclamação)
- Mapeamento de gaps de features e usabilidade de concorrentes
- Agentes LLM em personas para explorar e relatar fricções
- Uso de contas dedicadas para navegação/avaliação em fluxos reais

---

## 6) Oportunidades de análise levantadas
- Churn e abandono
- Fricções de onboarding
- Workarounds/gambiarras recorrentes
- Jobs-to-be-done ocultos
- Gargalos operacionais manuais
- Gaps por nicho/localização
- Migração entre ferramentas e motivos
- Diferença entre promessa de marketing e uso real

---

## 7) O que precisamos definir na sequência
1. Escopo da V1 do radar
2. Fontes prioritárias (ordem de ataque)
3. Formato mínimo de registro bruto
4. Critérios de qualidade do sinal
5. Critérios de priorização da oportunidade
6. Frequência/cadência de operação

---

## 8) Open Questions
- Qual profundidade de coleta por fonte na V1?
- Qual equilíbrio entre coleta automática vs revisão humana?
- Como evitar excesso de ruído sem perder sinais fracos relevantes?
- Quais critérios determinam “oportunidade pronta para virar proposta de produto”?

---

## 9) Decisões já tomadas
- Enquadramento principal: **Opportunity Radar**
- Vamos discutir e refinar por partes antes de implementação técnica

---

## 10) Log de discussão
- 2026-03-05: reposição de premissas; foco mudou de “gerar ideias de micro-SaaS” para “detectar oportunidades de forma contínua”
- 2026-03-05: consolidada visão de múltiplas fontes + agentes + registro para análise posterior
