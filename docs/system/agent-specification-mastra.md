# Especificação Técnica: Agentes Autônomos (Mastra.ai)

## 1. Introdução
Este documento detalha a arquitetura e o modelo de implementação dos agentes autônomos para o sistema **ad-product-forge**, utilizando o framework **Mastra.ai** como base para a lógica de execução, ferramentas e fluxos de trabalho.

## 2. Identidade e Estrutura do Agente
Cada agente é tratado como um "funcionário" da empresa digital, possuindo:
- **Persona:** Definição comportamental e tom de voz.
- **Nome/Email:** Identificadores únicos para roteamento de mensagens e logs.
- **Papel (Role):** Define o conjunto inicial de `tools` e `skills`.
- **Thread Única:** Cada agente possui uma thread principal de mensagens que mantém a continuidade histórica.

## 3. Modelo de Execução (Run Loop)
A execução de tarefas é disparada por eventos no runtime do agente.

### 3.1 Ciclo de Vida de um Run
1. **Trigger:** Um novo job chega na fila do agente.
2. **Setup:** O runtime clona a thread principal do agente para criar um ambiente de execução isolado (Short-term context).
3. **Execution Steps (Step-by-Step Memory):**
   - Antes de cada step, o runtime realiza uma busca híbrida (Vetorial + BM25) na memória isolada do agente.
   - Os resultados são injetados no contexto como uma mensagem de sistema (`<memory>...</memory>`).
   - O agente não chama a memória via ferramenta; a injeção é automática pelo runtime.
4. **Completion:** O agente finaliza a tarefa.

### 3.2 Fechamento e Compactação
Após a conclusão do run:
1. **Atualização de Memória:** O runtime analisa as novas informações trocadas e atualiza a base de conhecimento (Long-term memory).
2. **Resumo Executivo:** O agente gera um resumo curto da execução.
3. **Sincronização:** Apenas o **prompt inicial** e o **resumo executivo** são devolvidos para a thread principal. O histórico detalhado do run é arquivado/descartado para evitar o inchaço do contexto (Context Bloat).

## 4. Comunicação entre Agentes
A comunicação é estritamente assíncrona e baseada em eventos.
- **Protocolo:** Envio de mensagens para a fila de jobs do agente destino.
- **Sincronia Simulada:** O agente de origem pode aguardar um reply por uma janela (ex: 5 minutos).
- **Polling Inter-Step:** Entre passos de execução, o runtime verifica se há novos replies na fila de entrada e os injeta no contexto atual.

## 5. Gestão de Memória (Isolated Knowledge)
Cada agente possui um repositório de conhecimento isolado.
- **Tecnologia:** LibSQL (SQLite) com LibSQLVector para armazenamento de embeddings.
- **Abordagem Observacional:** Implementada via ObservationalMemory do Mastra, com gestão customizada de persistência e recuperação via workspace e GraphRAG.

## 6. Implementação com Mastra.ai
- **Mastra Agent:** Utilizado para configurar o modelo (LLM), instruções de sistema e registro de ferramentas.
- **Mastra Workflows:** Para definir sequências complexas de execução que exigem controle de estado e passos determinísticos.
- **Mastra Tools:** Encapsulamento de habilidades (skills) como funções TypeScript tipadas.
- **Mastra Syncs:** Podem ser usados para rotinas de manutenção de memória (Heartbeats) e ingestão de dados externos.

## 7. Infraestrutura de Suporte
- **Armazenamento:** LibSQL (SQLite) para persistência de mensagens, contexto e observações.
- **Vetores:** LibSQLVector para embeddings de memória de longo prazo.
- **Observabilidade:** Logs contextuais e métricas de execução por run/agente via ObservationalMemory.
- **Cron/Heartbeat:** Pode ser implementado no runtime do agente ou integrado com sistema externo conforme necessário.

## 8. Status Atual
1. Stack de banco de dados: LibSQL (SQLite) com LibSQLVector para embeddings.
2. Wrapper de orquestração implementado via Mastra Agent com LongTermMemory processor.
3. Sistema de memória integrado com observações, workspace e GraphRAG.
