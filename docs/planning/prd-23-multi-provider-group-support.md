# PRD-23: Suporte de Grupo Multi-Provedor

**Status:** Planejamento

**Data:** 2026-03-15

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

---

## Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Estender PRD-18 (participants internos) para suportar grupos em provedores externos:** Discord (canals) e Email (CC/BCC).

**Objetivo:** Depois que chat interno suportar grupos, estender mesma lógica para Discord e Email.

---

## Problema

- PRD-18 adiciona participants ao chat interno
- Provedores externos (Discord, Email) não têm conceito de grupos
- Agentes precisam criar grupos em Discord e enviar email para múltiplos

---

## Solução

Implementar grupos como extensão de PRD-18:

**Discord:**
- Agentes conseguem criar canals
- Enviar mensagens para channels
- Gerenciar membros do canal

**Email:**
- Agentes conseguem enviar para múltiplos via CC/BCC
- Histórico de email em grupo

---

## Critérios de Sucesso

- [ ] Agentes criam canals em Discord
- [ ] Mensagens Discord chegam em múltiplos
- [ ] Email com CC/BCC funciona
- [ ] Histórico mantido
- [ ] Integrado com PRD-18

---

## Dependências

- PRD-18: Internal Group Chat (participants)
- Discord API
- Email (SMTP/IMAP com CC/BCC)

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Extensão de PRD-18 para Discord e Email
