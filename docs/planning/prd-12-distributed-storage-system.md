# PRD-12: Sistema de Armazenamento Distribuído

**Status:** ⏸️ Em Aberto - Esperar Necessidade Surgir
**Data:** 2026-03-15
**Versão:** 1.0
**Nota:** Projeto pessoal por desenvolvedor solo. MinIO é um "serviço externo compartilhado" a ser implementado quando a necessidade surgir.

---

## Propósito

**MinIO (S3-like Object Storage)** para que agentes usem como storage:
- Armazenar artefatos gerados (código, documentos, relatórios, imagens, vídeos)
- Compartilhado entre aplicações ou por aplicação (a definir)
- Acesso programático via S3 API

**Decisão:** Em aberto. Implementar quando surgir a necessidade real de storage para agentes.

---

## Sumário Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de armazenamento de arquivo específica para ad-product-forge.** Sistema de armazenamento permite que agentes de Nicolas persistam artefatos gerados (código, documentos, relatórios). Isto é específico da aplicação, não infraestrutura do framework.

### Objetivo
Implementar um sistema simples de armazenamento de arquivo local para agentes persistirem artefatos e arquivos.

### Recursos Principais
1. **Armazenamento Local** - Armazenar arquivos no sistema de arquivo local
2. **Upload/Download de Arquivo** - Operações básicas de arquivo
3. **Armazenamento de Agente** - Agentes podem armazenar e recuperar artefatos
4. **Rastreamento de Metadados** - Rastrear caminhos de arquivo e info no banco de dados

### Fora do Escopo
- Sistemas de backup/recuperação
- Integração com armazenamento em nuvem
- Criptografia avançada
- Versionamento
- Links de compartilhamento/acesso público
- Scanning de vírus
- Busca de texto completo

---

## Modelo de Dados

### Metadados de Arquivo
```typescript
file_metadata {
  id: UUID
  file_path: string (relativo ao diretório de armazenamento)
  file_name: string
  size_bytes: bigint
  content_type: string (opcional)
  uploaded_at: timestamp
  uploaded_by: string (agent_id)
}
```

---

## Endpoints da API

### Operações de Arquivo
- `POST /api/storage/upload` — Fazer upload de arquivo
- `GET /api/storage/:file_id` — Fazer download de arquivo
- `GET /api/storage/metadata/:file_id` — Obter metadados de arquivo
- `DELETE /api/storage/:file_id` — Deletar arquivo
- `GET /api/storage/list` — Listar arquivos para agente

### API de Armazenamento de Agente (em contexto de agente)
```typescript
agent.storage.uploadFile(fileName: string, content: Buffer): Promise<{
  fileId: string
  fileName: string
  sizeBytes: number
}>

agent.storage.downloadFile(fileId: string): Promise<Buffer>

agent.storage.deleteFile(fileId: string): Promise<void>

agent.storage.listFiles(): Promise<FileInfo[]>
```

---

## Notas de Implementação

### Setup de Armazenamento Local
- Armazenar arquivos em diretório local (ex: `./storage/files/`)
- Organizar por subdiretórios agent_id
- Criar diretório se faltando na inicialização

### Banco de Dados
- Usar Drizzle ORM + LibSQL existente
- Criar tabela: `file_metadata`
- Indexar em uploaded_by e file_path

### Operações de Arquivo
- Usar módulo fs do Node.js para I/O de arquivo
- Operações simples de arquivo (leitura/escrita)
- Limite de tamanho de arquivo: 500MB por arquivo
- Armazenar uploaded_by para controle de acesso básico

### Controle de Acesso
- Acesso simples apenas do proprietário (agente pode acessar apenas seus arquivos)
- Verificar uploaded_by em todos os downloads

### Tratamento de Erros
- Lidar com erros de I/O de arquivo graciosamente
- Retornar mensagens de erro significativas
- Registrar operações de armazenamento

### Testes
- Testes unitários para upload/download
- Testes de integração MinIO (com container de teste)
- Testes de controle de acesso

---

## Critérios de Sucesso
- Arquivos podem ser feitos upload para armazenamento local
- Arquivos podem ser baixados pelo proprietário
- Metadados de arquivo armazenados e consultáveis
- Operações de deleção funcionam
- Controle de acesso executado (apenas proprietário)

---

## Dependências
- Drizzle ORM (existente)
- LibSQL (existente)
- Módulo fs do Node.js (built-in)

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Simplificado para projeto pessoal de desenvolvedor solo
