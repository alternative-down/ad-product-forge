# MCP Tools

## O que é?

MCP (Model Context Protocol) permite expandir as capacidades dos agentes com ferramentas externas. Os agentes podem conectar-se a servidores MCP que expõem ferramentas personalizadas.

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP TOOLS ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │    AGENTE   │───▶│ MCP Client   │───▶│ MCP Server       │  │
│  │             │    │ (per agent)  │    │ (stdio ou http)  │  │
│  └─────────────┘    └──────────────┘    └───────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│                   ┌──────────────┐                             │
│                   │ Tool Cache   │                             │
│                   │ (Map)         │                             │
│                   └──────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Estrutura de Dados

### Servidor MCP Global (`mcpServerConfigs`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID único |
| `name` | string | Nome do servidor |
| `description` | string | Descrição opcional |
| `command` | string | Comando para iniciar (stdio) |
| `args` | JSON | Argumentos do comando |
| `envVars` | JSON | Variáveis de ambiente |
| `transport` | enum | `stdio` ou `http_streamable` |
| `url` | string | URL do servidor (http) |
| `headers` | JSON | Headers HTTP customizados |
| `isActive` | boolean | Se está ativo |

### Configuração por Agente (`agentMcpConfigs`)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID único |
| `agentId` | string | ID do agente |
| `serverId` | string | ID do servidor MCP |
| `isActive` | boolean | Se está ativo |

## Fluxo de Carregamento

```
1. getAgentMcpServers(agentId)
   └── Busca configs de agente + servidores ativos

2. Para cada servidor:
   └── Se stdio:
       command + args + envVars
   └── Se http_streamable:
       url + headers

3. Cria/recupera MCPClient do cache

4. mcpClient.listTools()
   └── Retorna ferramentas com namespace "nomeServidor_nomeFerramenta"

5. Ferramentas ficam disponíveis no agente
```

## Transports

### STDIO

Para servidores MCP que rodam como processos:

```typescript
{
  transport: 'stdio',
  command: '/usr/local/bin/meu-servidor-mcp',
  args: ['--debug'],
  envVars: {
    API_KEY: 'secret'
  }
}
```

### HTTP Streamable

Para servidores MCP expostos via HTTP:

```typescript
{
  transport: 'http_streamable',
  url: 'https://meu-servidor.com/mcp',
  headers: {
    Authorization: 'Bearer token'
  }
}
```

## Operações da Store

### Servidores Globais

```typescript
// Criar
createMcpServerConfig(data)

// Buscar
getMcpServerConfig(id)
listMcpServerConfigs({ isActive?: boolean })
searchMcpServerConfigs(query)

// Atualizar
updateMcpServerConfig(id, data)

// Deletar
deleteMcpServerConfig(id)
```

### Configuração por Agente

```typescript
// Criar
createAgentMcpConfig(data)

// Buscar
getAgentMcpConfig(id)
listAgentMcpConfigs(agentId, { isActive?: boolean })
getAgentMcpServers(agentId) // Join com servidor

// Atualizar
updateAgentMcpConfig(id, data)

// Deletar
deleteAgentMcpConfig(id)
```

## Exemplo de Uso

```typescript
// 1. Criar servidor MCP global
await createMcpServerConfig({
  name: 'minha-api',
  description: 'Ferramentas da minha API',
  command: 'npx',
  args: ['@minhaorg/mcp-server'],
  envVars: { API_URL: 'https://api.exemplo.com' },
  transport: 'stdio',
  isActive: true
});

// 2. Associar a um agente
await createAgentMcpConfig({
  agentId: 'agente-123',
  serverId: 'servidor-mcp-id',
  isActive: true
});

// 3. Agente carrega ferramentas automaticamente
// Ferramentas ficam disponíveis como:
// - minha-api_ferramenta1
// - minha-api_ferramenta2
```

## Cache de Clientes

O `client-manager.ts` mantém cache de `MCPClient` por agente:

- Evita reconectar a cada execução
- Para limpar: `clearAgentMCPClient(agentId)`
- Conexões são fechadas ao limpar

## Erros Comuns

| Erro | Causa | Solução |
|------|-------|---------|
| `Failed to get tools` | Servidor MCP não responde | Verificar se servidor está ativo |
| Empty tools | Agent não tem configs MCP | Associar servidor ao agente |
| Connection timeout | URL inacessível | Verificar firewall/network |
