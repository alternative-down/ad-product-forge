# PRD-12: Serviços de Infraestrutura Compartilhada

**Status:** ⏸️ Em Aberto - Esperar Necessidade Surgir
**Data:** 2026-03-16
**Versão:** 2.0
**Nota:** Projeto pessoal por desenvolvedor solo. Serviços compartilhados de infraestrutura disponibilizados para agentes usarem em suas aplicações.

---

## Propósito

Fornecer serviços de infraestrutura compartilhada que agentes podem usar em suas aplicações criadas:

### 1. MinIO (S3-like Object Storage)
- Armazenar artefatos (código, documentos, relatórios, imagens, vídeos, etc.)
- Compartilhado entre aplicações (agentes compartilham a mesma instância)
- Acesso programático via S3 API
- Uso: Agentes podem configurar MinIO em suas aplicações

### 2. BullMQ / trigger.dev (Queue & Async Processing)
- Fila de jobs para processamento assíncrono
- Retry automático com backoff exponencial
- Compartilhado entre aplicações ou por aplicação (a definir)
- Uso: Agentes podem usar para tarefas longas em suas aplicações

---

## Decisão

**Em aberto.** Implementar quando surgir necessidade real de algum desses serviços em aplicações criadas pelos agentes.

Não é desenvolvimento específico para a plataforma ad-product-forge, é apenas infraestrutura disponível que fica acessível para os agentes usarem em suas próprias aplicações.

---

**Fim do documento**
