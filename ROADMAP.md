# Roadmap - ad-product-forge

**Última Atualização:** 2026-03-16
**Versão:** 2.0 (Consolidada)

---

## 📌 Quick Summary

**28 PRDs válidos** organizados em **6 fases de implementação**

- **Fase 1:** Fundação (PRD-01, PRD-27)
- **Fase 2:** Agendamentos + Ferramentas (PRD-10, PRD-02, PRD-25)
- **Fase 3:** Comunicação + Browser (PRD-18, PRD-07)
- **Fase 4:** Agentes + Conhecimento (PRD-03, PRD-04, PRD-19)
- **Fase 5:** Accountability ⭐ (PRD-22, PRD-26)
- **Fase 6+:** Integrações (PRD-33, PRD-06, PRD-05, PRD-23, ...)

---

## 📚 Documentação Completa

Toda a documentação detalhada está em **`docs/`**:

| Arquivo | Conteúdo |
|---------|----------|
| **[docs/VISION.md](./docs/VISION.md)** | Anotações originais detalhadas (visão raw + organizada) |
| **[docs/ROADMAP.md](./docs/ROADMAP.md)** | Roadmap consolidado (este é o documento principal) |
| **[docs/PRD_REFERENCE.md](./docs/PRD_REFERENCE.md)** | Referência de todos os 28 PRDs |
| **[docs/PRD_DEPENDENCIES.md](./docs/PRD_DEPENDENCIES.md)** | Ordem de implementação + dependências |
| **[docs/ROADMAP_MAPPING.md](./docs/ROADMAP_MAPPING.md)** | Mapeamento PRDs → 12 Frentes Estratégicas |

---

## 🎯 Começar Aqui

1. **Novo no projeto?** → Leia [docs/VISION.md](./docs/VISION.md)
2. **Quer ver o plano geral?** → Leia [docs/ROADMAP.md](./docs/ROADMAP.md)
3. **Quer implementar?** → Consulte [docs/PRD_DEPENDENCIES.md](./docs/PRD_DEPENDENCIES.md) para ordem das fases
4. **Precisa de referência de PRDs?** → Veja [docs/PRD_REFERENCE.md](./docs/PRD_REFERENCE.md)

---

## 🔑 Conceitos-Chave

### 12 Frentes Estratégicas
1. Persistência e Configuração Dinâmica
2. Segurança e Gestão de Credenciais
3. Papéis, Funções e Governança
4. Workflows de Contratação/Demissão
5. Comunicação Interna e Externa
6. Despertadores, Agendamentos e Continuidade
7. Eventos Externos e Automação
8. Desenvolvimento, Deploy e Infraestrutura
9. Operação de Negócio (ERP/Financeiro) ⭐
10. Conhecimento, Memória e Busca Semântica
11. Marketing, Presença Pública e Divulgação
12. Autonomia Progressiva - Criação de Ferramentas

### PRD Prioritário
- **PRD-22: Micro-ERP System (Fluxo de Caixa)** - Fase 5
- Mecanismo core que traz accountability aos agentes
- "Caixa da empresa" centralizado com contas a pagar/receber

---

## ⚠️ Decisões Importantes

- ✅ **PRD-26 (Roles) adiado para Fase 5** - Muito complexo
- ✅ **PRD-10 inclui refactoring de notificações** - Tabela nova, tirar Read/Unread do chat
- ✅ **Email organizacional é CONFIG** (domínio + SMTP), não PRD
- ✅ **GitHub é CONFIG + investigação** (GitHub App vs conta por agente)
- ✅ **MinIO + BullMQ em aberto** - Serviços compartilhados, não imediato
- ✅ **5 PRDs descartados** - PRD-09, 13, 14, 15, 17, 30

---

## 📊 Status

| Categoria | Quantidade |
|-----------|-----------|
| PRDs Válidos | 28 |
| Descartados | 5 |
| Fases | 6 |
| Frentes | 12 |

---

## 🚀 Próximas Ações

Veja [docs/PRD_DEPENDENCIES.md](./docs/PRD_DEPENDENCIES.md) para começar a implementação com a Fase 1.

---

**Para documentação detalhada, consulte os arquivos em `docs/`**
