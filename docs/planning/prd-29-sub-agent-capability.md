# PRD-29: Capacidade de Sub-agentes

**Status:** OPCIONAL / INVESTIGAÇÃO

**Data:** 2026-03-15

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Investigação:** Usar agentes com modelo LLM mais barato para tarefas internas, mantendo agente primário como orquestrador/supervisor.

**Status:** OPCIONAL - Avaliar viabilidade antes de implementar.

---

## Problema

- Agente primário usa modelo caro para tarefas internas
- Tarefas de coleta de informações, processamento auxiliar consomem contexto desnecessariamente
- Custo pode ser otimizado

---

## Ideia

Usar **sub-agente** com LLM mais barato:
- Sub-agente executa tarefa interna
- Agente primário é orquestrador/supervisor
- Comunicação via chat interno

---

## Preocupações

1. **Confusão conceitual:** Múltiplos agentes pode confundir LLM
2. **Coordenação:** Como sincronizar estado entre agentes
3. **Viabilidade:** Pode não funcionar bem na prática

---

## Próximos Passos

1. ⚠️ Avaliar viabilidade com teste
2. ⚠️ Definir quando usar sub-agentes
3. ⚠️ Descartar se inviável

---

## Status

**Recomendação:** Adiar até ter experiência com múltiplos agentes. Depois avaliar se faz sentido.

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Investigação de sub-agentes com LLM mais barato
