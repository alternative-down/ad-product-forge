# PRD-15: Integração de Serviço de Email (Simplificado)

**Status:** Rascunho - Simplificado para Desenvolvedor Solo
**Data:** 2026-03-15
**Nota:** Projeto de desenvolvedor pessoal. Aplicar princípios KISS + YAGNI.

---

## 1. Resumo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve infraestrutura de comunicação por email específica do ad-product-forge.** Embora email seja um meio de comunicação geral, esta implementação específica é adaptada para os casos de uso dos agentes de Nicolas (contato com clientes, comunicação em equipe, notificações). O sistema de provedor de comunicação (PRD-02) é nível de framework; isto é integração de email específica da aplicação.

### Objetivo
Permitir que agentes enviem e recebam emails usando provedores padrão IMAP/SMTP.

### Valor (para ad-product-forge)
- Os agentes de Nicolas podem enviar emails para clientes e membros da equipe
- Agentes podem ler a caixa de entrada para perguntas e feedback de clientes
- Funciona com Gmail, Outlook, Fastmail
- Simples, sem recursos corporativos

---

## 2. Escopo

### Incluído
- Enviar emails via SMTP
- Ler caixa de entrada via IMAP
- Ferramentas de agente: `sendEmail()`, `getInbox()`, `readEmail()`
- Armazenar credenciais (via PRD-02)
- Log básico

### Não Incluído
- Provisionamento de email
- Sincronização contínua
- Domínios personalizados
- Templates
- Encaminhamento/aliases
- DKIM/SPF/DMARC
- Anexos
- Múltiplos emails por agente
- UI de email

---

## 3. Requisitos

### RF-1: Ferramenta sendEmail
```typescript
interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

// Retorna: { success: boolean, error?: string }
```

### RF-2: Ferramenta getInbox
```typescript
interface GetInboxParams {
  limit?: number; // padrão 10
}

// Retorna: Array<{
//   id: string;
//   from: string;
//   subject: string;
//   date: Date;
// }>
```

### RF-3: Ferramenta readEmail
```typescript
interface ReadEmailParams {
  id: string;
}

// Retorna: { body: string }
```

### RF-4: Armazenar Configuração de Email
- Endereço de email, credenciais SMTP/IMAP
- Via provider_configurations (PRD-02)

---

## 4. Banco de Dados

Nenhum necessário. Nenhum log obrigatório para desenvolvedor solo.

---

## 5. Implementação

### Fase 1: Wrapper de Serviço de Email (6h)
- Criar serviço de email com sendEmail(), getInbox(), readEmail()
- Tratamento básico de erro

### Fase 2: Ferramentas de Agente (3h)
- Conectar 3 ferramentas ao executor de agente

---

## 6. Critérios de Sucesso
- [ ] Agentes podem enviar emails
- [ ] Agentes podem ler caixa de entrada (últimos 10)
- [ ] Agentes podem ler corpo do email
- [ ] Funciona com Gmail/Outlook

---

## 7. Esforço
- **Total: ~9 horas**

---

## 8. Dependências
- PRD-02: Sistema de configuração de provedor
- `nodemailer` — SMTP
- `imapflow` — IMAP (alternativa: pacote npm `imap`)

---

**Fim do documento**
