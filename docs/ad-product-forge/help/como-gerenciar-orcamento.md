# Como Gerenciar o Orçamento de um Agente

Aprenda a controlar os custos dos seus agentes de forma eficiente.

## O que é o Sistema de Orçamento?

Cada agente no Ad Product Forge possui um contrato com orçamento próprio. O orçamento controla quanto a empresa pode gastar com esse agente específico. Quando o orçamento acaba, o agente para de executar tarefas até que novo saldo seja adicionado.

### Conceitos Principais

- **Orçamento do Contrato**: Valor total disponível para o agente
- **Valor Já Gasto**: Total utilizado desde a contratação
- **Saldo Disponível**: Diferença entre orçamento e valor gasto
- **Reforço de Saldo (Top-up)**: Adicionar mais dinheiro ao contrato existente
- **Ajuste de Orçamento**: Reduzir ou aumentar o limite total do contrato

---

## Como Fazer um Reforço de Saldo (Top-up)

O reforço de saldo adiciona dinheiro ao contrato sem alterar o limite máximo.

### Passo a Passo

1. Acesse a página de detalhes do agente no painel forge-admin
2. Localize o card "Contract Budget"
3. Clique no botão "Top-up"
4. Insira o valor a adicionar
5. Confirme a transação

### Exemplo Prático

```
Orçamento Atual: R$ 100,00
Valor Já Gasto: R$ 75,00
Saldo Disponível: R$ 25,00

Após Top-up de R$ 50,00:
Orçamento Total: R$ 100,00 (inalterado)
Valor Já Gasto: R$ 75,00
Novo Saldo Disponível: R$ 75,00
```

### Quando Usar Top-up

- Quando o agente está prestes a atingir o limite
- Para continuar uma tarefa importante sem interromper
- Como solução temporária enquanto avalia orçamentos maiores

---

## Como Ajustar o Orçamento Total

O ajuste de orçamento altera o limite máximo do contrato. Você pode aumentar ou reduzir, respeitando algumas regras.

### Regras Importantes

| Situação                       | Permitido?        | Motivo                                             |
| ------------------------------ | ----------------- | -------------------------------------------------- |
| Aumentar orçamento             | ✅ Sim            | Sempre permitido                                   |
| Reduzir orçamento              | ⚠️ Com restrições | Não pode ser menor que o valor já gasto            |
| Reduzir se agente está rodando | ❌ Não            | Agente em execução não pode ter orçamento reduzido |
| Reduzir para valor negativo    | ❌ Não            | Novo orçamento deve ser ≥ valor gasto              |

### Passo a Passo

1. Acesse a página de detalhes do agente
2. Clique no botão "Adjust Budget"
3. Insira o novo valor de orçamento total
4. O sistema mostrará:
   - Se a alteração é válida
   - O novo saldo que ficará disponível
   - Validações automáticas
5. Confirme se todas as validações passaram

### Cenários Comuns

**Cenário 1: Aumentar para tarefa grande**

```
Situação: Você precisa que o agente faça uma tarefa que custará R$ 200
Orçamento atual: R$ 100
Valor já gasto: R$ 80

Ação: Ajustar orçamento para R$ 300
Resultado: Novo saldo disponível = R$ 300 - R$ 80 = R$ 220
```

**Cenário 2: Reduzir após tarefa concluída**

```
Situação: Agente terminou tarefa e não precisa mais de saldo alto
Orçamento atual: R$ 500
Valor já gasto: R$ 150
Novo orçamento desejado: R$ 200

Ação: Ajustar orçamento para R$ 200
Resultado: Novo saldo = R$ 200 - R$ 150 = R$ 50
```

### Erros Comuns

**Erro: "Novo orçamento menor que valor gasto"**

```
Você tentou ajustar para R$ 100, mas o agente já gastou R$ 150.
Solução: Aumente o valor para pelo menos R$ 150,00
```

**Erro: "Não é possível reduzir enquanto agente está em execução"**

```
O agente está fazendo uma tarefa e você tentou reduzir o orçamento.
Solução: Aguarde o agente finalizar ou use Top-up em vez de ajuste.
```

---

## Como Monitorar o Uso

### Dashboard Principal

Na página de cada agente, você encontra:

- **Gráfico de uso**: Visualização do consumo ao longo do tempo
- **Resumo financeiro**: Orçamento, gasto, saldo em tempo real
- **Histórico de transações**: Lista de todas as operações de orçamento
- **Alertas**: Notificações quando o saldo está baixo

### Configurando Alertas

1. Acesse as configurações do sistema
2. Navegue até "Finance Settings"
3. Defina o limite de alerta (ex: "Alert when below 20%")
4. Escolha como receber (notificação, email, etc.)

### Boas Práticas

- **Revise semanalmente**: Check semanal do uso de todos os agentes
- **Defina limites claros**: Cada agente deve ter orçamento adequado, não excessivo
- **Use automações**: Configure renewals automáticos para contratos de longo prazo
- **Documente decisões**: Anote por que ajustou orçamentos para futuras referências

### FAQ Rápido

**P: O que acontece quando o orçamento acaba?**
R: O agente para de executar tarefas. Você recebe uma notificação e pode fazer um top-up imediato.

**P: Posso ter múltiplos agentes com orçamentos diferentes?**
R: Sim! Cada agente tem seu próprio contrato e orçamento. Não há limite para número de contratos.

**P: O que é renovação automática?**
R: O sistema pode automaticamente adicionar fundos ao contrato quando ele está próximo do fim, baseado em regras que você configura.

**P: Posso transferir saldo de um agente para outro?**
R: Não diretamente. Você precisa fazer top-up em um e reduzir o orçamento do outro manualmente.

---

## Tópicos Relacionados

- [Ciclo de Vida do Agente](../guias/agent-lifecycle.md)
- [Como Contratar um Agente](./como-contratar-agente.md)
- [Como Configurar Permissões](./como-configurar-permissoes.md)
