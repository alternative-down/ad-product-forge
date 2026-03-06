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

Também queremos evitar o erro de olhar apenas para “dor explícita”: há oportunidades em desejo, entretenimento e necessidades latentes (quando o usuário nem sabe nomear o problema).

---

## 4) Princípios (definidos até agora)
- Pensar no sistema como **radar de oportunidades**, não só “gerador de ideias”
- Não ficar preso a uma única premissa de coleta
- Combinar múltiplos caminhos de descoberta
- Registrar tudo para análise posterior (rastreabilidade)
- Tratar a coleta como geração contínua de **insumos** por vias diferentes
- Unificar **coleta ativa** e **coleta passiva** no mesmo ciclo de inteligência

---

## 5) Frentes de descoberta consideradas
### Coleta ativa (mercado/exploração)
- Mineração de dores em comunidades (Discord, Reddit, etc.)
- Extração de pedidos/reclamações em produtos SaaS existentes
- Reclamações públicas (ex.: plataformas de reclamação)
- Mapeamento de gaps de features e usabilidade de concorrentes
- Agentes LLM em personas para explorar e relatar fricções
- Uso de contas dedicadas para navegação/avaliação em fluxos reais
- Fontes de inspiração/opinião e análise crítica de narrativas de mercado

### Coleta passiva (operação dos produtos)
- Atendimentos e tickets
- Solicitações de funcionalidades
- Comentários/reações em redes sociais
- Problemas recorrentes e erros operacionais
- Casos em que a IA precisou agir e não teve capacidade/ferramenta para concluir
- Sinais de uso real pós-lançamento para retroalimentar o radar

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
- Necessidades latentes inferidas por contexto e rotina (entrelinhas)

---

## 6.1) Modelo conceitual discutido
Ordem para entender oportunidade com mais profundidade:
1. Contexto
2. Rotina/comportamento real
3. Tensão (dor, desejo ou entretenimento)
4. Problema (quando nomeável)

---

## 7) O que precisamos definir na sequência
1. Escopo da V1 do radar
2. Formato mínimo de registro bruto
3. Critérios de qualidade do sinal
4. Critérios de priorização da oportunidade
5. Frequência/cadência de operação

---

## 7.1) Pipeline conceitual (balaio → inteligência)
1. Ingestão bruta (fontes variadas, estruturadas ou não)
2. Normalização mínima
3. Mineração (sinais explícitos e implícitos)
4. Categorização
5. Pontuação/reflexão
6. Rankeamento
7. Saída acionável (itens prontos para proposta de app)

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
- 2026-03-05: alinhado que as fontes não se limitam a “sinais de dor”; também entram inspiração, opinião e benchmark
- 2026-03-05: alinhado modelo de insumos por coleta ativa + coleta passiva
- 2026-03-05: definida retroalimentação pós-lançamento (atendimento, solicitações, social, falhas e limites de execução da IA)
- 2026-03-05: reforçado que oportunidade pode nascer de dor, desejo ou entretenimento
- 2026-03-05: incluída necessidade latente (dor não explícita) via leitura de contexto/rotina/entrelinhas
- 2026-03-05: consolidado fluxo “balaio” com ingestão ampla + pipeline único (minerar, categorizar, pontuar, ranquear)
