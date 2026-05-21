# PRD-11: Framework de Ferramenta Customizada

**Status:** ⏸️ Adiado - Necessária Revisão Arquitetural
**Data:** 2026-03-15
**Versão:** 1.0

---

## ⏸️ Nota de Adiamento

**Decisão:** Adiado para segundo momento. Necessária revisão arquitetural e alinhamento com sistema de Skills.

**Contexto:** Agentes já possuem Skills e podem criar Skills dinamicamente. Conceitual customização de ferramentas pode ser integrada ao sistema de Skills existente em vez de ser um framework separado. Potencial: local centralizado de Skills criadas por agentes, disponíveis para todos.

**Próximas Etapas:** Reavaliar após implementação de PRDs posteriores e consolidar com arquitetura de Skills.

---

## Nota de Projeto Pessoal

Este é um projeto de desenvolvimento pessoal. Recursos seguem os princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It). Escopo focado em funcionalidade principal para fluxo de trabalho de desenvolvedor solo.

---

## 1. Visão Geral

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de extensibilidade de ferramentas específica para ad-product-forge.** Framework de ferramenta customizada permite que agentes de Nicolas criem dinamicamente ferramentas especializadas para produtos e domínios específicos. Esta é extensão de capacidade específica da aplicação, não infraestrutura principal do framework.

**Objetivo:** Permitir que agentes criem e usem ferramentas customizadas dinamicamente sem reiniciar a aplicação.

**Por quê (para ad-product-forge):** Agentes devem ser capazes de estender suas capacidades em tempo de execução envolvendo Skills ou definindo integrações HTTP simples para novos produtos e serviços.

**Prioridade:** Alta
**Timeline:** 3-4 semanas

---

## 2. Problema

- Ferramentas são estáticas (definidas na inicialização)
- Agentes não conseguem criar novas ferramentas quando necessário
- Adicionar uma nova ferramenta requer mudanças de código e reinicialização
- Nenhum mecanismo para agentes compartilharem ferramentas entre si

---

## 3. Casos de Uso

1. **Agente envolve uma Skill:** Agente de pesquisa cria uma ferramenta que chama uma Skill para obter dados
2. **Agente define integração HTTP:** Agente cria uma ferramenta para um endpoint de API simples
3. **Agente descobre ferramentas:** Agente encontra e reutiliza ferramentas criadas por outros agentes

---

## 4. Requisitos

### Recursos Principais

**FR1: Criação de Ferramenta**

- Agentes podem criar ferramentas customizadas com nome, descrição e implementação
- Criação de ferramenta especifica: nome, descrição, tipo, detalhes de implementação
- Sistema valida definições de ferramenta antes de salvar

**FR2: Métodos de Implementação de Ferramenta**

- **Wrapper de Skill:** Referenciar uma Skill existente por ID
- **Integração HTTP:** Chamar um endpoint de API externo

**FR3: Armazenamento & Persistência de Ferramenta**

- Ferramentas customizadas armazenadas em tabela simples de banco de dados
- Ferramentas persistem através de reinicializações de agente
- Ferramentas incluem metadados: timestamp de criação, criador

**FR4: Acesso & Execução de Ferramenta**

- Agentes podem chamar ferramentas customizadas como ferramentas de sistema
- Ferramentas executam com proteção de timeout (padrão 30 segundos)
- Execução de ferramenta é registrada
- Validação de entrada contra schema de ferramenta

---

## 5. Critérios de Sucesso

- Agentes podem criar, persistir e usar ferramentas customizadas
- Criação de ferramenta leva <5 segundos
- Execução de ferramenta customizada funciona confiável
- Execução de ferramenta é registrada para debugging
- Validação de schema de ferramenta previne definições inválidas

---

## 6. Requisitos Não-Funcionais

**Performance:**

- Criação de ferramenta: <5 segundos
- Execução de ferramenta funciona confiável

**Confiabilidade:**

- Falha de execução de ferramenta não derruba agente
- Chamadas falhadas são registradas; agente pode retornar
- Persistência de ferramenta sobrevive reinicialização de agente

**Segurança:**

- Integrações HTTP apenas para APIs públicas (sem vazamento de credenciais)
- Todas as modificações registradas com timestamp e criador

---

## 7. Escopo

### Incluído

- Criação e validação de ferramenta
- Implementação de wrapper de Skill
- Implementação de integração HTTP
- Persistência de ferramenta
- Execução de ferramenta com logging

### Não Incluído

- Versionamento e gerenciamento de ciclo de vida de ferramenta
- API de descoberta/busca de ferramenta
- Composição de ferramentas (combinando ferramentas)
- UI de construtor visual de ferramenta
- Análise avançada

---

## 8. Dependências

- **Sistema de Skills:** Deve referenciar Skills existentes
- **Banco de Dados de Agente:** Deve suportar tabelas de ferramentas
- **Execução de Agente:** Ferramentas devem integrar com tool calling
- **Sistema de Permissão:** Precisa de permissão `tool:create`

---

## 9. Abordagem Técnica

### Schema do Banco de Dados

**Tabela `forge_custom_tools`:**

```
- tool_id (UUID, chave primária)
- agent_id (UUID)
- tool_name (VARCHAR, único por agente)
- tool_description (TEXT)
- tool_type (ENUM: skill, http)
- implementation_type (ENUM: skill, http)
- implementation_config (JSON)
- required_inputs (JSON schema)
- created_at (TIMESTAMP)
```

---

## Exemplos de Definições de Ferramenta

### Ferramenta Wrapper de Skill

```json
{
  "toolName": "send_slack_message",
  "toolDisplayName": "Send Slack Message",
  "toolDescription": "Send messages to Slack channels",
  "toolType": "skill",
  "implementation": {
    "type": "skill",
    "skillId": "slack-send-message",
    "parameterMapping": {
      "channel": "slackChannel",
      "message": "messageContent"
    }
  },
  "requiredInputs": {
    "type": "object",
    "properties": {
      "slackChannel": { "type": "string" },
      "messageContent": { "type": "string" }
    },
    "required": ["slackChannel", "messageContent"]
  }
}
```

### Ferramenta de Integração HTTP

```json
{
  "toolName": "weather_lookup",
  "toolDisplayName": "Get Weather",
  "toolDescription": "Fetch current weather for a location",
  "toolType": "http",
  "implementation": {
    "type": "http",
    "endpoint": "https://api.openweathermap.org/data/2.5/weather",
    "method": "GET",
    "auth": {
      "type": "apikey",
      "headerName": "appid",
      "credentialName": "openweather_api_key"
    },
    "queryParams": {
      "q": "{location}",
      "units": "metric"
    }
  },
  "requiredInputs": {
    "type": "object",
    "properties": {
      "location": { "type": "string" }
    },
    "required": ["location"]
  }
}
```
