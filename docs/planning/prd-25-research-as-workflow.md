# PRD-25: Pesquisa como Fluxo de Trabalho

**Status:** Rascunho — Fase de Especificação

**Data:** 2026-03-15

**Nota:** Este é um projeto pessoal de um desenvolvedor solo. Construído com princípios KISS (Keep It Simple, Stupid) e YAGNI (You Aren't Gonna Need It) em mente.

**Recursos Relacionados:**
- Modelo de Execução de Agente (orquestração de fluxo de trabalho)
- Webhooks Externos (disparar fluxos de pesquisa)

---

## 1. Resumo Executivo

### Classificação: APLICAÇÃO AD-PRODUCT-FORGE

**Este PRD descreve um recurso específico da plataforma de desenvolvimento de produto autônomo de Nicolas.** As capacidades de fluxo de trabalho de pesquisa são essenciais para processos de descoberta de mercado e validação do ad-product-forge, mas são específicas da aplicação, não infraestrutura de framework.

Permitir fluxos de trabalho de pesquisa multi-passo: encadear queries juntas, ramificar em resultados e agregar descobertas. Construir sobre ferramenta de pesquisa existente.

**Valor Principal (ad-product-forge):**
- Encadear múltiplas queries de pesquisa para análise de mercado, pesquisa de concorrente, validação de problema
- Ramificar fluxos de trabalho condicionalmente baseado em sinais de mercado (tamanho > X → pesquisar concorrentes)
- Combinar resultados de múltiplos ângulos de pesquisa em análise abrangente de mercado
- API simples, compatível com versões anteriores com chamadas de ferramenta de pesquisa existentes
- Permitir que agentes de pesquisa de Nicolas descobrem autonomamente oportunidades de mercado end-to-end

---

## 2. Declaração do Problema

### 2.1 Estado Atual

Pesquisa existe como uma **ferramenta** no framework de agente Mastra:
```typescript
tools: {
  research: async (query: string) => Promise<ResearchResult>
}
```

**Limitações:**
- Execução de query única apenas
- Nenhuma orquestração sequencial (não consegue encadear queries de pesquisa)
- Nenhuma lógica condicional (não consegue ramificar baseado em resultados intermediários)
- Nenhuma agregação de resultado (não consegue combinar múltiplos streams de pesquisa)
- Nenhum rastreamento de passo explícito ou recuperação de erro
- Limitado a invocação de ferramenta direta, não fluxos de trabalho reutilizáveis

### 2.2 Capacidade Desejada

Precisa suportar cenários de pesquisa como:
1. **Pesquisa Sequencial**: Pesquisar tópico A → refinar baseado em resultados → pesquisar subtópico B
2. **Pesquisa Condicional**: Se tamanho de mercado > X, então pesquisar concorrentes
3. **Pesquisa Multi-fonte**: Paralelizar buscas através de 3 ângulos diferentes, então combinar
4. **Pesquisa Iterativa**: Loop N vezes com refinamento de feedback
5. **Pesquisa Ciente de Recurso**: Verificar orçamento de custo/tempo antes de continuar

### 2.3 Por que Fluxos de Trabalho?

Fluxos de trabalho fornecem:
- **Pesquisa Encadeável** — Executar múltiplas queries em sequência
- **Ramificação Condicional** — Pular passos baseado em resultados
- **Composição Simples** — Reutilizar fluxos de trabalho em prompts de agente

---

## 3. Objetivos & Critérios de Sucesso

### 3.1 Objetivos Primários

1. **Permitir pesquisa baseada em fluxo de trabalho** — Criar abstração de Fluxo de Trabalho de Pesquisa
   - Objetivo: Todos cenários de pesquisa complexa representáveis como fluxos de trabalho
   - Sucesso: Suportar passos de pesquisa sequencial, condicional e paralelo

2. **Manter compatibilidade com versões anteriores** — Chamadas de ferramenta existentes ainda funcionam
   - Objetivo: Nenhuma alteração significativa ao código de agente
   - Sucesso: `agent.generate()` com ferramenta de pesquisa funciona sem alterações

3. **Fornecer primitivos específicos de pesquisa** — Nós de fluxo de trabalho otimizados para domínio
   - Objetivo: Fluxos de trabalho de pesquisa parecem naturais de escrever/ler
   - Sucesso: Nós integrados para query, filtro, agregação, rank

4. **Permitir orquestração de pesquisa** — Fluxos de pesquisa multi-passo complexos
   - Objetivo: Usuários conseguem construir e reutilizar fluxos de trabalho de pesquisa
   - Sucesso: Fluxos de trabalho pré-construídos para padrões comuns (análise de concorrente, dimensionamento de mercado, etc.)

### 3.2 Critérios de Sucesso

- Fluxos de trabalho definidos em código executam corretamente
- Passos sequenciais se completam em ordem
- Ramificação condicional funciona conforme esperado
- Resultados se agregam sem duplicação

---

## 4. Escopo & Definições

### 4.1 O Que Está Incluído
- Definição de fluxo de trabalho de pesquisa em código
- Passos sequenciais de query
- Ramificação condicional baseada em resultados
- Agregação e síntese de resultado
- Integração com ferramentas de agente existentes

### 4.2 O Que Está Excluído
- UI de criador de fluxo de trabalho
- Persistência de histórico de execução
- Pontos de controle de execução

---

## 5. Critérios de Sucesso

- [ ] Fluxos de trabalho de pesquisa executam end-to-end
- [ ] Resultados são agregados corretamente
- [ ] Fluxos de trabalho são reutilizáveis
- [ ] Compatibilidade com versões anteriores mantida

---

## 6. Dependências

- Framework Mastra (PRD-02)
- Ferramenta de pesquisa existente
- Sistema de fluxo de trabalho de agente

---

## 7. Timeline

- **Semana 1-2**: Implementação de fluxo de trabalho de pesquisa
- **Semana 3**: Testes e documentação

Total: ~20 horas para desenvolvedor solo

---

**Histórico do Documento:**
- v1.0 (2026-03-15): Simplificado para projeto pessoal de desenvolvedor solo
