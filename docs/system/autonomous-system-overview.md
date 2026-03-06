# Sistema Autônomo — Visão Geral

## Status
Draft

## Premissa global
Criar uma empresa digital operada por agentes LLMs, sem intervenção humana, funcionando de forma automática e coordenada.

Isso vale para o ciclo completo:
1. coleta de dados
2. enriquecimento e organização semântica
3. mineração e extração de oportunidades
4. priorização/ranking
5. análise de viabilidade
6. decisão de status
7. geração de propostas de solução
8. encaminhamento para execução

## Princípios operacionais
- **Autonomia fim-a-fim**: sem etapas manuais de aprovação.
- **Rastreabilidade**: cada decisão automática deixa trilha de evidência.
- **Revisão contínua**: oportunidades e decisões podem ser reavaliadas por novos sinais.
- **Estados explícitos**: itens percorrem status claros (priorizar, despriorizar, delayed, descartar, etc.).
- **Ciclo fechado de aprendizado**: dados de operação dos produtos alimentam novas decisões.
- **Controle financeiro mínimo**: empresa mantém caixa com visão simples de contas a pagar, contas a receber, custos e fluxo de caixa.

## Processo 1 (inicial) — Coleta ativa na internet
- Um agente de coleta (firecrawl) recebe um prompt com:
  - locais iniciais sugeridos
  - instrução para explorar também novos lugares relacionados
- Retorno esperado da coleta ativa:
  - link do conteúdo
  - conteúdo bruto
  - contexto adicional da coleta
- Esses dados são registrados localmente.
- A mesma estrutura também pode chegar por endpoint de ingestão (canal passivo para outras fontes).
- Endpoint(s) de hooks externos recebem notificações de sistemas terceiros (financeiro, email, etc.).
- Cada novo insumo registrado dispara 1 job na fila (trigger/bull), processado por agente LLM.
- Objetivo: ampliar a descoberta de sinais além da lista inicial, com exploração guiada.

## Base semântica do sistema
- Grafo em Neo4j
- Embeddings em nós e arestas
- Busca fulltext com BM25
- Grafo de conhecimento construído continuamente pelos agentes (relações, categorização, evidências)

## Identidade dos agentes
Cada agente do sistema possui:
- persona
- nome
- email
- papel

## Modelo organizacional
- agentes são tratados como funcionários da empresa digital
- tools/skills iniciais são definidos conforme papel/cargo/função do agente

## Comunicação entre agentes
- agentes podem se comunicar diretamente entre si
- comunicação direta é parte nativa da coordenação autônoma do sistema

## Modelo de thread por agente
- cada agente possui uma única thread de mensagens
- tudo que acontece com o agente roda nessa thread
- a thread é o canal principal de contexto e continuidade do agente
- execuções do agente podem criar ramificações por execução
- ao fim de cada run, o histórico detalhado é compactado para manter só:
  - prompt inicial da execução
  - resumo executivo do run
- abordagem operacional possível: executar em thread clonada e retornar somente o resultado compacto para a thread principal

## Fila de jobs por agente
- cada agente possui sua própria fila de eventos/jobs
- cada job dispara um run
- fila alimenta as execuções do agente e suas ramificações

## Memória por agente
- cada agente terá memória própria e isolada
- memória combina abordagem atual do OpenClaw + padrão observacional semelhante ao Mastra (referência)
- gestão de memória/contexto e execução será específica deste projeto (modelo próprio)
- memória não é acionada por tool manual do agente
- durante um run, runtime recupera memória por step (semântica + fulltext/BM25) e injeta no contexto como mensagem da thread (ex.: `<memory>`)
- criação/atualização de memória ocorre no fim da execução, antes do resumo executivo ser devolvido para a thread primária

## Agendamento por agente
- agentes podem criar crons para tarefas recorrentes
- agentes também podem usar heartbeat para manutenção/checagens periódicas
- ideia funcional inspirada na abordagem já usada no OpenClaw

Observação:
- referência conceitual inspirada em abordagens recentes de memória/thread (ex.: ecossistema Mastra), com adaptação própria do projeto.

## Papel dos agentes LLM no sistema
- agentes de coleta/interpretação
- agentes de enriquecimento e relacionamento semântico
- agentes mineradores (exploração livre e guiada)
- agentes de categorização e proposta de valor
- agentes de análise de viabilidade

## Processo posterior (quando operação estiver estável)
- Condição: sem novo sistema em construção e apps em produção estáveis.
- Definição atual de app estável: em produção com poucas issues na semana (menos de 10).
- O agente percorre a fila de problemas extraídos (FIFO).
- Rodada mínima: 3 problemas analisados (ou todos os disponíveis, se houver menos de 3).
- Para cada problema:
  - usa o `context` do item
  - pode consultar o grafo para relações e sinais complementares
  - produz uma proposta de valor
  - analisa o que precisa ser feito para atender a proposta
  - estima custo e esforço para atendimento
  - registra métricas numéricas (complexidade, features, custo, potencial de receita/MRR)
  - valida fit com as restrições da plataforma (web, micro-SaaS, recorrência/crédito/one-time)
  - valida se o custo é suportável pelo fluxo de caixa
- Se não encaixar no momento, o problema volta para o final da fila.
- Após concluir a rodada, propostas avaliadas são ranqueadas por métricas (custo-benefício, complexidade, rapidez e valor).
- Problema selecionado para seguir no pipeline é marcado como `ideation`.
- Etapa de ideação prepara documentação do projeto (overview, briefing, PRD, features, arquitetura/organização) em repositório baseado em template, já clonado e linkado ao remoto.
- Antes do desenvolvimento completo da solução, sistema cria landing page focada na dor para coletar leads.
- Agentes podem contatar interessados e coletar informações adicionais.
- Sistema também pode enviar status reports e outras notificações para esses interessados.
- Interessados podem ser usados como beta testers com incentivos (desconto, créditos ou uso gratuito por período).
- Sistema executa marketing social e distribuição (fóruns/comunidades/redes) para aquisição e validação contínua.
- Integrações candidatas para publicação/distribuição: APIs Hub, diretas/PKD, Buffer (decisão técnica posterior).
- Com documentação pronta, sistema gera plano de desenvolvimento.
- Cada tarefa do plano vira issue.
- Antes de executar cada tarefa, sistema analisa complexidade/tempo/passos e decompõe tarefas grandes em menores.
- Depois, sistema executa tarefas continuamente por motor de desenvolvimento autônomo, item por item da fila.
- Agentes serão criados usando Mastra.
- Automaker entra apenas por picks pontuais do que for útil/necessário.
- Com tarefas concluídas e validação local finalizada, sistema faz deploy em ambiente de teste (staging).
- Em staging, agentes testam e corrigem como se fosse produção.
- Após estabilização em staging, sistema promove para produção.
- Todo app sobe com base padrão de observabilidade (métricas + logs + eventos contextuais) e canais de suporte.
- Canais de suporte padrão: embutido no app + email.
- Tickets de suporte são atendidos por agentes LLM.
- Agentes de suporte têm acesso ao repositório e às documentações.
- Agentes usam busca por embeddings e BM25 para responder e auxiliar usuários.
- Eventos de runtime podem acionar o criador de issues automaticamente.
- Agentes de suporte também podem acionar esse mesmo criador de issues quando identificarem problema acionável.
- Problemas identificados no atendimento podem virar issue mesmo sem erro explícito em log.
- O criador de issues coleta contexto adicional antes da abertura.
- Essas issues entram na mesma esteira de desenvolvimento e CI/CD do restante do sistema.
- Respostas e sinais vindos de marketing social também podem alimentar leads, problemas e novas issues.
- Nova rodada de produto inicia automaticamente quando:
  - fluxo de caixa operacional 30d >= 0
  - runway projetado >= 3 meses
  - produção sem issue crítica aberta por 7 dias
  - MRR atual >= 1.15x média dos 2 meses anteriores
## Papel das regras determinísticas
- pontuação/ranking consistente
- transições de estado com critérios claros
- redução de variabilidade entre execuções

## Diretriz de definição de stack
- Não definir stack antecipadamente durante a fase de planejamento funcional/conceitual.
- Toda tecnologia (fila, orquestrador, banco, framework, etc.) deve ficar registrada como **opção a avaliar**.
- A escolha oficial de stack ocorre apenas na etapa de documentação técnica/arquitetural.

## Observação
Esta premissa (100% autônomo) deve ser aplicada como base em todas as features do sistema.
