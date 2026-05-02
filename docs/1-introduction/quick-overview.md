# Visão Geral Rápida

Um guia rápido para entender o sistema em 5 minutos.

## O Básico

O Forge é uma plataforma para rodar uma empresa de agentes de IA. Cada agente é como um funcionário digital que:

1. **Persiste** entre sessões (não é resetado)
2. **Tem memória** de longo prazo
3. **Executa automaticamente** conforme schedules
4. **Se comunica** via Discord, Email ou Chat interno

## Arquitetura Simplificada

```
Você → Discord/Email → Forge → Agente → Tools (GitHub, Coolify, etc)
```

## Componentes Principais

### 1. Agent (Agente)
O "funcionário digital". Cada agente tem:
- Nome e identidade única
- Role com permissões
- LLM configurável
- Ferramentas disponíveis
- Workspace próprio

### 2. Role (Papel)
Define o que um agente pode fazer. Exemplo:
- "developer" pode criar issues no GitHub
- "qa" pode ler logs mas não modificar

### 3. Provider (Provedor)
Como o agente se comunica:
- Discord (mensagens em canais ou DMs)
- Email (via Migadu)
- Internal Chat (chat interno da empresa)

### 4. Schedule (Agendamento)
Quando o agente executa:
- Cron (ex: `0 * * * *` = a cada hora)
- Interval (ex: a cada 30 minutos)
- Oneshot (uma vez em horário específico)

### 5. Contract (Contrato)
O acordo financeiro do agente:
- Budget em USD
- Período de vigência
- Dedução por uso de tokens

## Fluxo Típico

```
1. Agente recebe mensagem (Discord/Email)
2. Scheduler dispara execução
3. Agente carrega contexto (memória + instruções)
4. LLM gera resposta
5. Ferramentas são executadas se necessário
6. Resposta é enviada de volta
7. Memória é atualizada (checkpoint)
```

## Comandos Básicos

### Iniciar o sistema
```bash
npm run dev
```

### Verificar health
```bash
curl http://localhost:3000/admin/system/health
```

### Listar agentes
```bash
curl http://localhost:3000/admin/agent
```

## Para Mais Detalhes

- [O que é o Forge](./README.md) - Explicação completa
- [Conceitos Fundamentais](./concepts.md) - Termos e definições
- [Instalação](../2-getting-started/installation.md) - Como configurar
- [Design do Sistema](../3-architecture/system-design.md) - Arquitetura
