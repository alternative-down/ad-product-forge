# Visão da Plataforma - Anotações Originais

**Data:** 2026-03-15
**Autor:** Nicolas Fraga Faust

---

## Anotações Cruas - Transcrição Original

Agora precisamos alterar o app, hoje ele tá criando os agentes de forma fixa, oque é ok para validação.

Porém para a aplicação nos precisamos salvar e carregar os agentes do banco de dados e criar eles em tempo de execução.

O mesmo vale para env dos providers de comunicação dos agentes.

Então precisamos usar o SQLite para registrar as token/pass de forma criptografada, e do registro dos dados de agente.

Eu quero que use o drizzle com sqlite, crie os schemas, usando as migrations e rode as migrations.

Tambem definir criptografia dos dados sensíveis.

A parte do módulo de comunicação também vamos precisar alterar para usar drizzle que hoje está usando sqlclient diretamente.

Criar workflow para o agente poder acionar e fazer contratação de novos agentes (nesse workflow devemos ter uma forma de definir algumas coisas como a parte de criação da account e provider de comunicação que vai ser disponibilizado, dentre outras coisas).

Precisamos tbm de alguma forma dar aos agentes acesso a uma organização do Github para que eles possam criar e manipular os repositórios git. Além disso vamos precisar também definir como vamos escutar os eventos do Github para poder acionar os agentes.

Os agentes também vão precisar poder fazer deploy da aplicacoes criadas por eles, hoje eu tenho uma máquina no hertzenr com coolify rodando, então podemos usar ela.

Também tenho um domínio, podemos iniciar com abertura da configuração do dominio como wildcard apontando para a máquina. Porém hoje o registro Br não oferece essa funcionalidade então vai ser necessário migrar o controle para outro lugar que permita configurações mais avançadas para o domínio.

Dessa forma os agentes podem apenas configurar a aplicação no coolify e com isso já estar acessível.

Cada agente vai ter seu email também, então vai precisar de configuração do domínio para poder criar email organizacional.
Hoje já temos o provider de smpt/imap, precisamos definir que serviço de email que vai ser usado para configurar esse domínio e ter acesso a caixa de entrada e envio de email por agente.

Precisamos também ver como vamos poder integrar o sistema com redes sociais, fóruns e outros sites.

Para que os agentes possam fazer a divulgação do que eles criam e também poder interagir com a comunidade e identificar novas oportunidades.

Precisamos também ver como integrar com plataformas de marketing para que possam realizar campanhas.

Precisamos também desenvolver um controle de fluxo de caixa que pode limitar as ações ou controlar o fluxo e priorização
E tbm tipo microerp para os agentes.

Devemos pensar em como fazer a integração para registrar os gastos, recebimentos, previsões, etc. Isso pode controlar a execução dos agentes.

Mas os agentes também precisam desses dados para poderem tocar a empresa virtual deles, então temos que fornecer ao menos um micro ERP com integração para contabilizar os gastos e recebimentos, folha de pagamento (o quanto $ cada agente custa), etc.

Precisamos também criar templates de aplicações web, que já traga o básico para que os agentes possam usar no desenvolvimento.

Como por exemplo, Auth, Gateway de pagamento, integração com sistema de chamado, etc.

Além do erp também vamos precisar de um sistema de chamados (este pode ser também um dos providers de comunicação (como temos hj Discord/email) assim pode ter também para tickets abertos nos sistemas que eles criaram e possam atender aos usuários, para prestar suporte.

Além do workflow de contratação também vamos precisar do workflow de demissão.

Vamos precisar também da criação de agendamento de heartbeat para fazer o wake dos agentes de tempos em tempos caso eles estejam muito tempo em stand-by, para que possam ver oque tem pendente ou continuar o serviço caso tenham encerrado a execução prematuramente.

Precisamos tbm dar Tool de criação de crons/agendamentos para os próprios agentes configurarem quando querem fazer algo.

A ideia aqui é que o cron receba a configuração de agendamento/repetição e também uma mensagem.

Essa mensagem deve virar uma entrada em `agent_notifications`, gerando o evento que aciona o `wakeQueue`, assim o agente recebe a instrução que ele criou para si mesmo e pode executar.

Hoje o módulo de comunicação interno apenas permite mensagem direta, não permitindo grupos.

Precisamos pensar na implementação de grupos para que os agentes possam criar grupos de coordenação entre eles, podendo organizar-se melhor. Após fazer esse processo para o chat interno também já deve permitir dar suporte para os demais providers (email, Discord) assim eles poderão criar canais e/ou enviar email para vários CC.

Precisa ser alterado o research que hoje está como uma Tool mas deve passar a ser um workflow.

Precisamos também montar um schema de papel e função, onde vai determinar oque cada agente por fazer ou tem acesso.

Sendo função um agrupador e é com a qual o agente está vinculado, e papel são as definições/configuração propriamente do que pode ser feito (Tools, Providers, Workflows, Etc.)

Isso seria como a definição do agente dentro da empresa. Então os próprios agentes com permissão podem alterar essas informações e montar as funções e papéis para eles mesmos fazerem as definições. Logo, precisamos que tenha um agent master que tenha permissão irrestrita e ele possa iniciar as configurações e ir liberando coisas para os demais conforme ele contrata e/ou outros.

Precisamos também ver formas de os agentes criarem Tools para eles mesmos, quer seja usando Skills ou então alguma Tool que faremos para permitir a criação e execução de Tools que os próprios agentes criaram... Isso para permitir que eles mesmos evoluam e possam criar integrações ou utilidades que possam ser usadas.

Outra coisa é também sobre webhook/client, ou outras coisas externas que precisam acionar algum agente ou de forma roteada, criada por eles mesmo ou precontigurado (como Github eventos, Coolify eventos, Pagamento Recebido, ADs, etc.)

Pois precisa de alguma forma que essas coisas caiam internamente e os agentes sejam wakeUp para poderem tomar ações.

Precisamos também dar para os agentes Tools para criação de artefatos de marketing

Imagens, Animações, Vídeos, Etc.

Por exemplo nanobanana, Vimeo, tts, stt.

Precisamos também dar para os agentes um navegador (não sei como fazer isso hoje no mastra, eu já tentei com playwright-cli o agente até tentou instalar o navegador mas deu algum problema que o playwright não conseguiu achar o navegador após ele ter instado (pode ser algo com o Path do filesystem/sandbox do mastra ou alguma outra coisa. De toda forma, precisamos dar um serviço de browser (também nem valha a pena ser na própria sandbox dele, mas sim um serviço fora como o openclaw faz )

Talvez seja interessante dar um subagent para os agentes que use um modelo LLM mais barato para eles fazerem tarefas internas que demandem muito uso de contexto ou coleta de informações, assim o agente primário fica como um supervisor/orquestrador (isso é uma ideia, não tenho certeza se vai se encaixar muito bem, até por que já existem outros agents é isso pode confundir o LLM, então talvez não seja adequado).

Precisamos também ter agents que não fazem parte da empresa, eles vão ser algo como "consultores especialista" "público alvo" etc.

Esses vão ser criados sobre demanda quando os agentes internos precisarem de algo... Como por exemplo fazer uma "pre-entrevista" com uma persona para extrair coisas de uma ideia.
Para pedir explicações sobre algo, dentre outras coisas. Esses externos não vão terás mesmas permissões e acessos, só vão poder enviar e receber mensagem, eles só vão ser acordados por mensagens que foram enviadas para eles.

Precisamos também dar um Mínio para os agentes poderem usar como storage. BullMQ e/ou trigger.dev
Ou eles vão instalar por aplicação (talvez o storage seja único, mas outros por app)

Base de conhecimento para os agentes pode estar no próprio ERP (usando workspace do mastra para fazer embeddings e Search com semântico fulltext e GraphRAG) usando algo similar com oque já foi desenvolvido pra memória de longo prazo do agente.

* gestão se Secrets (talvez) (ou seja, um vault para o agente)
* CRM além do ERP
* Biling foi falado previamente no template de aplicação, ele deve ser integrado a plataforma (assas, stripe)
* Sistema de projetos/tarefas
* Sistema de assinatura eletrônica

---

## Visão Organizada da Plataforma de Agentes

### Objetivo geral

Estruturar uma plataforma em que agentes possam operar como uma empresa digital: serem criados e geridos dinamicamente, executar tarefas, interagir entre si e com sistemas externos, desenvolver produtos, operar canais de comunicação, controlar recursos da operação e evoluir com autonomia controlada.

---

## 1. Fundação da plataforma

### 1.1 Persistência de agentes e configuração dinâmica

Hoje os agentes são criados de forma fixa, o que atende à validação inicial. Para a evolução da aplicação, os agentes precisam passar a ser:

* persistidos em banco de dados;
* carregados dinamicamente em tempo de execução;
* configuráveis sem depender de definição fixa em código.

Também será necessário persistir as configurações de ambiente dos providers de comunicação associados a cada agente.

### 1.2 Banco de dados e acesso a dados

A base deve utilizar **SQLite com Drizzle**, incluindo:

* definição de schemas;
* uso de migrations;
* execução das migrations;
* refatoração dos módulos que hoje usam `sqlclient` diretamente para também utilizarem Drizzle.

### 1.3 Proteção de dados sensíveis

As informações sensíveis, como tokens, senhas e credenciais de providers, devem ser armazenadas de forma criptografada.

Também deve ser avaliada a necessidade de um componente específico de **gestão de secrets / vault para agentes**, para centralizar e controlar esses dados.

---

## 2. Estrutura organizacional dos agentes

### 2.1 Papel, função e permissões

A plataforma deve possuir um schema de **papéis** e **funções** para determinar o que cada agente pode fazer e ao que pode ter acesso.

Conceitos:

* **Função**: agrupador organizacional ao qual o agente está vinculado.
* **Papel**: definição efetiva de permissões e capacidades, como acesso a Tools, Providers, Workflows e demais recursos.

Isso representa a definição do agente dentro da empresa.

### 2.2 Administração interna

Agentes com permissão devem poder:

* criar e alterar papéis e funções;
* ajustar permissões;
* estruturar a organização interna da empresa digital.

Deve existir também um **agent master**, com permissão irrestrita, responsável por iniciar a configuração da plataforma e liberar acessos para os demais agentes conforme contratações, mudanças de função e demais necessidades.

### 2.3 Agentes externos sob demanda

Além dos agentes internos da empresa, será necessário suportar **agentes externos**, usados como:

* consultores especialistas;
* público-alvo/personas;
* interlocutores temporários para entrevistas, validações e explicações.

Esses agentes:

* serão criados sob demanda;
* não terão as mesmas permissões nem acessos dos agentes internos;
* poderão apenas enviar e receber mensagens;
* só serão acordados quando receberem mensagens direcionadas a eles.

---

## 3. Ciclo de vida dos agentes

### 3.1 Workflow de contratação

Deve ser criado um workflow para permitir que agentes possam iniciar e executar a contratação de novos agentes.

Esse workflow deve permitir definir, entre outras coisas:

* criação da conta do novo agente;
* provider de comunicação que será disponibilizado;
* configurações iniciais de operação;
* demais parâmetros necessários para o ingresso do agente na empresa.

### 3.2 Workflow de demissão

Também será necessário um workflow de demissão, para desligamento estruturado de agentes.

---

## 4. Comunicação e coordenação entre agentes

### 4.1 Evolução do chat interno

Hoje o módulo de comunicação interno permite apenas mensagens diretas. Será necessário evoluí-lo para suportar **grupos**, permitindo que os agentes criem espaços de coordenação e organização coletiva.

### 4.2 Expansão do conceito para outros providers

Após esse suporte existir no chat interno, a mesma lógica deve servir de base para outros providers, como:

* e-mail, com múltiplos destinatários e CC;
* Discord, com criação de canais e interações em grupo.

### 4.3 E-mail organizacional por agente

Cada agente deverá possuir seu próprio e-mail institucional.

Para isso será necessário:

* definir o serviço de e-mail que será utilizado;
* configurar o domínio para suportar e-mail organizacional;
* garantir acesso à caixa de entrada e envio de e-mails por agente;
* integrar isso com o provider SMTP/IMAP já existente.

### 4.4 Sistema de chamados como canal de comunicação

Além do ERP, a plataforma também precisará de um **sistema de chamados**, que pode ser tratado também como um provider de comunicação.

Esse sistema permitirá que agentes:

* recebam tickets abertos nos sistemas criados por eles;
* atendam usuários;
* prestem suporte;
* usem esse canal de forma integrada com outros meios como Discord e e-mail.

---

## 5. Despertar, agendamento e continuidade de execução

### 5.1 Heartbeat / wake recorrente

Será necessário criar um mecanismo de **heartbeat agendado** para acordar agentes periodicamente quando estiverem muito tempo em stand-by.

Objetivos:

* verificar pendências;
* retomar trabalho interrompido;
* evitar abandono prematuro de execução.

### 5.2 Criação de crons pelos próprios agentes

Os próprios agentes devem receber uma Tool para criação de **crons/agendamentos**.

Esse recurso deve permitir informar:

* configuração do agendamento e repetição;
* uma mensagem associada ao evento.

Fluxo esperado:

* a mensagem será registrada em `agent_notifications`;
* esse registro irá acionar o `wakeQueue`;
* o agente receberá a instrução criada por ele próprio e poderá executá-la.

---

## 6. Workflows, Tools e autonomia operacional

### 6.1 Research como workflow

O componente de **research**, que hoje existe como Tool, deve ser transformado em **workflow**.

### 6.2 Criação de Tools pelos próprios agentes

Deve ser estudada e implementada uma forma de os agentes poderem criar Tools para si mesmos.

Isso pode ocorrer, por exemplo, por meio de:

* Skills;
* uma Tool própria para criação e execução de Tools definidas pelos agentes.

Objetivo:

* permitir autoevolução da plataforma;
* permitir criação de integrações e utilidades sob demanda;
* ampliar a autonomia operacional dos agentes.

### 6.3 Subagentes para tarefas internas

Existe a possibilidade de fornecer aos agentes um **subagente** com modelo LLM mais barato para tarefas internas que demandem muito contexto, coleta de informações ou processamento auxiliar.

A ideia seria manter o agente principal como supervisor/orquestrador. No entanto, isso deve ser avaliado com cuidado, pois pode:

* encaixar bem em alguns cenários;
* gerar confusão conceitual ou operacional em outros.

---

## 7. Integrações externas orientadas a eventos

### 7.1 Webhooks, clients e roteamento interno

A plataforma precisa de uma camada para receber eventos externos e encaminhá-los internamente para os agentes corretos.

Isso inclui integrações criadas pelos próprios agentes ou pré-configuradas, como:

* eventos do GitHub;
* eventos do Coolify;
* pagamentos recebidos;
* anúncios e plataformas de ads;
* outros gatilhos externos.

Esses eventos devem entrar no sistema de forma roteada, gerando wake-up dos agentes para tomada de ação.

### 7.2 GitHub

Os agentes devem ter acesso a uma organização do GitHub para:

* criar repositórios;
* manipular repositórios Git;
* operar fluxos relacionados ao ciclo de desenvolvimento.

Também será necessário definir como escutar os eventos do GitHub para acionar agentes automaticamente.

### 7.3 Redes sociais, fóruns e presença pública

Será necessário estudar e implementar integrações com:

* redes sociais;
* fóruns;
* outros sites e canais públicos.

Objetivos:

* divulgar o que os agentes criam;
* interagir com a comunidade;
* identificar oportunidades;
* captar sinais externos relevantes ao negócio.

### 7.4 Plataformas de marketing

Também será necessário integrar com plataformas de marketing para execução de campanhas.

---

## 8. Infraestrutura de desenvolvimento, deploy e operação

### 8.1 Templates de aplicações web

A plataforma deve fornecer **templates base** para aplicações web, já contendo componentes essenciais para acelerar o desenvolvimento pelos agentes.

Exemplos:

* autenticação;
* gateway de pagamento;
* integração com sistema de chamados;
* demais componentes recorrentes.

### 8.2 Billing integrado à plataforma

O billing, citado anteriormente nos templates, deve ser tratado como parte integrada da plataforma, com suporte a serviços como:

* Asaas;
* Stripe.

### 8.3 Deploy automatizado via Coolify

Os agentes devem ser capazes de fazer deploy das aplicações criadas por eles.

Infraestrutura disponível atualmente:

* uma máquina na Hetzner;
* Coolify rodando nessa máquina.

Direcionamento inicial:

* usar essa infraestrutura como base de deploy;
* permitir que os agentes configurem a aplicação no Coolify;
* tornar o sistema acessível após a configuração.

### 8.4 Domínio e DNS

Também será necessário organizar a configuração do domínio para suportar:

* wildcard apontando para a máquina;
* flexibilidade de DNS para deploy das aplicações;
* criação de e-mail organizacional.

Como o Registro.br não oferece a flexibilidade desejada hoje, será necessário migrar o controle do domínio para um serviço que permita configurações mais avançadas.

### 8.5 Navegador para os agentes

Os agentes também precisarão de acesso a um navegador.

Há tentativa prévia de uso com `playwright-cli` no Mastra, mas houve problema no reconhecimento do navegador após instalação, possivelmente relacionado a:

* path de filesystem;
* sandbox;
* forma de execução no ambiente.

Diante disso, pode ser mais adequado disponibilizar um **serviço externo de browser**, em vez de depender da sandbox local do agente.

### 8.6 Storage e infraestrutura assíncrona

Também será necessário disponibilizar infraestrutura complementar para os agentes, incluindo:

* **MinIO** como storage;
* **BullMQ** e/ou **trigger.dev** para filas e execução assíncrona.

Ainda precisa ser definido se esses recursos serão:

* compartilhados entre aplicações;
* ou instalados de forma isolada por aplicação.

Uma possibilidade considerada é:

* storage único;
* demais componentes variando por app conforme necessidade.

---

## 9. Gestão operacional da empresa digital

### 9.1 Fluxo de caixa e governança de execução

Será necessário desenvolver um **controle de fluxo de caixa** que possa:

* limitar ações dos agentes;
* controlar o fluxo operacional;
* influenciar a priorização de atividades;
* servir como mecanismo de governança da execução.

### 9.2 Micro ERP para agentes

Os agentes também precisarão de um **micro ERP** para tocar a empresa virtual.

Esse ERP deve permitir, no mínimo:

* registrar gastos;
* registrar recebimentos;
* trabalhar com previsões;
* contabilizar folha de pagamento;
* refletir o custo de cada agente em valor monetário.

Além do uso administrativo, os próprios agentes devem ter acesso a esses dados para orientar suas decisões.

### 9.3 CRM

Além do ERP, a plataforma também precisará de um **CRM**.

### 9.4 Sistema de projetos e tarefas

Também será necessário um sistema de **projetos/tarefas**.

### 9.5 Assinatura eletrônica

A plataforma deverá prever integração com **sistema de assinatura eletrônica**.

---

## 10. Conhecimento, memória e base de consulta

A base de conhecimento dos agentes pode ficar dentro do próprio ERP, usando o workspace do Mastra para:

* embeddings;
* busca semântica e full-text;
* GraphRAG.

A ideia é aproveitar algo semelhante ao que já foi desenvolvido para a memória de longo prazo dos agentes.

---

## 11. Artefatos criativos e marketing

Os agentes devem receber Tools para criação de artefatos de marketing, incluindo:

* imagens;
* animações;
* vídeos;
* voz e áudio.

Exemplos citados:

* nanobanana;
* Vimeo;
* TTS;
* STT.

---

## 12. Resumo estrutural das frentes

As frentes centrais identificadas até aqui são:

1. persistência e configuração dinâmica de agentes;
2. segurança e gestão de credenciais;
3. papéis, funções e governança organizacional;
4. workflows de contratação, demissão e operação;
5. comunicação interna e externa;
6. despertadores, agendamentos e continuidade;
7. eventos externos e automação orientada a gatilhos;
8. desenvolvimento, deploy e infraestrutura base;
9. operação de negócio via ERP/CRM/financeiro;
10. conhecimento, memória e busca semântica;
11. marketing, presença pública e canais de divulgação;
12. autonomia progressiva dos agentes na criação de ferramentas e capacidades.

---

## Observação final

Este documento consolida e organiza as ideias levantadas até agora, funcionando como uma visão estruturada das capacidades, módulos e decisões arquiteturais que a plataforma deverá contemplar.
