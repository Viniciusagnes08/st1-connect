# ST1 Connect — Central de Solicitações Inteligentes
**Data:** 20/10/2026  
**Status:** arquitetura aprovada pelo solicitante; especificação de implementação para revisão.  
**Projeto:** [ST1 Connect](https://github.com/Viniciusagnes08/st1-connect) → [Vercel](https://st1-connect.vercel.app/).

## 1. Resultado esperado
Substituir a abertura genérica de chamados por um catálogo de formulários rápidos e específicos para cada problema. Colaboradores entram com login e pessoas externas respondem somente por convite/link controlado. Toda resposta válida gera um chamado real e compartilhado no backend, com fila, equipe, situação, SLA e histórico.

**Meta de experiência:** chegar ao formulário apropriado em até dois cliques e permitir preencher um caso simples em menos de 90 segundos, meta de usabilidade a validar por teste com usuários, não uma promessa medida. Exibir entre 2 e 5 perguntas de negócio por formulário; informações conhecidas devem vir preenchidas automaticamente.

## 2. Estado atual validado
- O frontend atual é React + TypeScript + Vite, hospedado no Vercel. O painel tem navegação por hash: Visão geral, Chamados, Ativos, Conhecimento, Equipes, Relatórios e Configurações.
- A autenticação é feita no servidor em `api/auth.js`, com perfis Administrador, Supervisor, Técnico e Solicitante; suas contas estão em Vercel Blob privado.
- Os **chamados e ativos ainda ficam no `localStorage`**. O código atual não oferece banco transacional nem autorização no servidor para chamados. Isso impede colaboração segura; migrar os registros é um pré-requisito antes do uso operacional do módulo.
- Não há integração ativa com notificações de e-mail/WhatsApp, Kommo, GLPI ou IXC. Não afirmar essas integrações como existentes.
- O projeto Vercel foi identificado; nenhuma configuração atual de banco PostgreSQL conectado foi encontrada na inspeção das integrações acessíveis. A conexão transacional requer provisionamento antes da ativação da nova funcionalidade.

## 3. Alternativas consideradas
1. **Formulários nativos + PostgreSQL gerenciado — ESCOLHIDO.** Melhor experiência, trilha de auditoria e vínculo com chamados; exige provisionar banco, migração e API.
2. **Google Forms + sincronização:** viabiliza pilotos com rapidez, mas fragmenta as telas, exige integrações e dificulta condições, papéis e rastreabilidade.
3. **Vercel Blob JSON para tudo:** requer pouca infraestrutura adicional, mas não é adequado como banco transacional de chamados com escritas simultâneas. Mantê-lo para arquivos privados, não para filas compartilhadas.

## 4. Escopo funcional da primeira versão
### 4.1. Catálogo de solicitações
Rota interna `#/solicitar`. Cards com ícone, título curto, frase de contexto e busca. Seções:
- Acessos e sistemas
- CRM, Kommo e ST1 Sales
- BI, dados e indicadores
- Rede e conectividade
- Equipamentos
- Serviços internos
- Orientações

Busca por sinônimos e nome de aplicativo; apresentação dos formulários mais utilizados pelo usuário quando houver histórico. Não exibir filas técnicas ao solicitante.

### 4.2. Formulário contextual
Rota interna `#/formulario/:slug` e página pública direta `/f/:slug?convite=TOKEN` (a rota pública deve ser resolvida pelo frontend sem depender do hash). Mostrar andamento `1. Assunto → 2. Informações → 3. Confirmar` e resumo antes de enviar.

Campos obrigatórios comuns: nome, contato, tipo de problema, descrição objetiva; nome e e-mail vêm da sessão quando há login. Campos opcionais: local, equipamento, evidência. Campos técnicos só aparecem conforme a escolha anterior. Sempre validar no servidor o conjunto de campos e opções publicado na versão do formulário.

A prioridade deve ser sugerida a partir de impacto/urgência (não o próprio solicitante definir "Crítica" diretamente) e confirmada pelo time. Solicitações repetidas no mesmo minuto devem ter proteção contra duplo envio.

### 4.3. Biblioteca inicial de modelos
Modelos editáveis, com valores e roteamento iniciais sujeitos à confirmação do administrador antes de publicação operacional:
| Modelo | Perguntas específicas | Destino inicial |
| --- | --- | --- |
| Não consigo acessar | Sistema, mensagem de erro, desde quando, quem foi afetado | Sistemas |
| Solicitar novo acesso | Sistema, finalidade, área, aprovação requerida | Sistemas |
| Erro no Kommo | Funil/tela, erro, impacto, momento | Sistemas |
| Problema no ST1 Sales | Módulo, ação tentada, erro, impacto | Sistemas |
| Divergência em BI | Painel, métrica, período/filtro, esperado vs. observado | Sistemas (triagem para BI) |
| Falha na conexão interna | Unidade/ambiente, início, quantidade de pessoas afetadas | Redes |
| Equipamento com defeito | Tipo/identificação, sintoma, impacto | Suporte |
| Solicitação operacional | Área, resultado esperado, necessidade, prazo desejado | Administrativo |
| Orientação/ajuda | Tema, dúvida objetiva, resultado esperado | Suporte |

**Não inventar agentes ou prazos reais.** No protótipo, as equipes aparecem como sugestões; publicação de destino e metas de SLA requer validação pela ST1. Exigir descrição concreta e opções fechadas sempre que possível. Não usar "Outro motivo" como saída genérica; para assuntos não mapeados, oferecer "Preciso de orientação" com triagem explícita.

### 4.4. Construtor de formulários
Rota `#/formularios` para Administrador, com tabela e ações: Criar, Duplicar, Editar, Pré-visualizar, Publicar, Arquivar e Compartilhar.

Editor em três painéis ou passos: **Identificação** (título, explicação, ícone, categoria); **Perguntas** (texto curto, texto longo, escolha única, múltipla, data e número, obrigatório, ajuda contextual, visibilidade condicional); **Destino e acesso** (equipe, público interno/externo, política de links). Arrastar e reordenar é opcional; botões subir/descer devem funcionar por teclado. Exibir prévia real em layout móvel.

Alterar um modelo publicado cria **nova versão**; respostas antigas continuam ligadas à versão que originou o chamado. Formularios arquivados deixam de receber novas respostas, mas preservam histórico. O Administrador decide quem pode publicar; Supervisor pode gerar links de modelos já aprovados; Técnico e Solicitante apenas preenchem.

### 4.5. Compartilhamento
Ao clicar em **Compartilhar**:
- Copiar link interno para colaboradores.
- Criar convite externo **individual e revogável**, com token aleatório de pelo menos 256 bits, armazenado apenas como hash no banco, escopo de formulário e versão, data de expiração e limite de utilização (padrão: 1 envio). Nunca expor segredos em relatórios ou logs.
- Abrir WhatsApp com texto preenchido e link; abrir cliente de e-mail com assunto e corpo; copiar texto.
- Administrador/Supervisor pode revogar o convite e acompanhar situação `ativo / usado / expirado / revogado`.
- A primeira versão não fará envio automático por WhatsApp ou e-mail sem provedor conectado; compartilhar é uma ação explícita do operador por canais existentes, com confirmação visual de que o link foi copiado/aberto, sem fingir entrega.
- Para envio a vários colaboradores internos, usar links de autenticação normal e o atalho de formulário; não gerar um link público irrestrito por conveniência.

### 4.6. Respostas e chamados
Toda submissão aceita entra numa transação única que registra formulário, versão, respostas, solicitante, chamado, equipe e evento no histórico. A UI mostra `Recebido • Chamado ST1-xxxxx` com instrução de acompanhamento. Visitantes externos recebem comprovante sem acesso à fila interna; colaboradores autenticados veem o andamento de seus chamados. Não inserir demo tickets em tabelas operacionais.

Chamados aparecem na Central com rótulo `Via formulário` e título composto de modelo + resposta resumida. Supervisor/Admin podem reencaminhar com justificativa. Alterações e notas seguem rastro de auditoria; mensagens de atualização interna não devem vazar ao público.

## 5. Persistência e migração
**Banco obrigatório:** PostgreSQL gerenciado, conectado por variável privada (`DATABASE_URL`) às Vercel Functions. Avaliar Neon/Postgres via integração autorizada no Vercel; **não provisionar plano pago sem revisão de custo e autorização**. Usar migração SQL versionada. Modelo relacional:
- `users` (identidade, papel, ativo; incorporar ou mapear IDs existentes do Blob)
- `form_templates`, `form_versions`, `form_fields`
- `share_invites` (token hash, expiração, max_uses, uses, revogado)
- `form_submissions`, `form_answers`
- `tickets`, `ticket_events`, `ticket_assignees`
- `assets`, `teams`, `audit_log`
- `request_limits` para limitação por IP/convite e mitigação de abuso, com retenção mínima.

FKs, índices por equipe/status/data e transações no backend. Os arquivos de evidência, se habilitados, vão ao Blob privado com validação de formato/tamanho, referência no Postgres e URLs temporárias autorizadas. Nada de credenciais, dados pessoais ou resposta sensível no `localStorage`.

**Migração da demonstração:** manter o conteúdo local intacto; oferecer importação explícita só para administrador, com revisão, origem identificada e confirmação, nunca sincronização automática dos 48 chamados fictícios.

## 6. API e isolamento
Endpoints sob `/api/forms` e `/api/tickets`, retornando JSON e erros consistentes.
- `GET /api/forms/catalog`: listar modelos internos publicados respeitando perfil.
- `GET /api/forms/:slug`: obter versão publicada e perguntas permitidas.
- `POST /api/forms`, `PATCH /api/forms/:id`, `POST /api/forms/:id/publish`: Administrador.
- `POST /api/forms/:id/invites`, `POST /api/forms/invites/:id/revoke`: Administrador/Supervisor.
- `GET /api/public/forms/:slug?convite=...`: valida convite e devolve campos públicos sem PII privada.
- `POST /api/public/forms/:slug/submit`: valida token, campos, limites e grava ticket.
- `POST /api/forms/:id/submit`: colaborador autenticado.
- `GET /api/tickets`, `GET /api/tickets/:id`, `PATCH /api/tickets/:id`: controle de acesso no **servidor** por papel, equipe e `requester_user_id`.

Para sessões existentes, reutilizar cookie HTTP-only e validação de usuário no backend, não confiar em `role` fornecido pelo navegador. Contas sem convite válido não podem acessar formulários externos reservados. Respostas de APIs jamais retornam hash de token, credenciais ou campos confidenciais.

## 7. Segurança, LGPD e resiliência
- Sanitizar entradas, limitar tamanho/tipo de arquivo, escapar conteúdo, prevenir envio duplicado e CSRF, exigir HTTPS; `sameSite=Strict` para sessão interna.
- Validar Origem nos POST internos. Nos formulários externos, link de uso limitado + rate limiting no backend, opção de proteção anti-bot quando o tráfego justificar; sem API externa de CAPTCHA conectada inicialmente.
- Token público na URL pode entrar em histórico: remover da barra após abertura, usar `Referrer-Policy: no-referrer` na rota pública e não carregar pixels de terceiros; não registrar URLs com query contendo convite.
- Limitar exposição de informações na confirmação pública; e-mail de contato como dado para retorno, sem divulgação a terceiros.
- Idempotência para submissão; erros de persistência não devem exibir "chamado criado".
- Sem `DATABASE_URL`, manter painel existente acessível, mas bloquear novas submissões com mensagem de configuração, sem simular sucesso ou salvar no navegador.
- Não gerar disparos em massa não solicitados, nem links sem expiração.

## 8. Interfaces e estados
- Navegação: link principal **Solicitar ajuda** visível a todos, **Formulários** apenas para administração/compartilhamento e **Chamados** como fila.
- Mobile-first: cards tocáveis >=44px, etapas curtas, teclado adequado, resumo do que será enviado e confirmação inequívoca.
- Estados reais: carregando, vazio, sem autorização, link expirado/usado/revogado, conexão indisponível, envio em curso, erro recuperável e sucesso com protocolo.
- Identidade visual: ST1 Connect já aprovado — azul-escuro, branco, laranja; fontes Outfit e DM Sans; preservar layout existente, evitar refatoração de módulos não relacionados.
- Acessibilidade: labels visíveis, resumo de erros, foco ao mudar de etapa, leitores de tela, navegação por teclado e respeito a redução de movimento.

## 9. Critérios objetivos de aceite
1. Um colaborador autenticado abre um dos nove modelos em até dois cliques; campos condicionais aparecem corretamente; envio produz protocolo compartilhado e visível por seu gestor.
2. Administrador cria uma versão de formulário, publica e gera convite; formulário externo só abre com convite válido para aquela versão.
3. Um convite de uso único não pode ser reutilizado, expirado nem revogado; validação no servidor.
4. Formulário incompleto/inconsistente é rejeitado no frontend e backend; rejeição não gera chamado.
5. Resposta concluída gera chamado e histórico de modo atômico; falha do banco não retorna sucesso.
6. Solicitante vê apenas seus próprios registros; Supervisor visualiza fila autorizada; Técnico não consegue modificar modelos; Admin controla publicação e revogação.
7. Sessões, tokens e segredos não são persistidos no frontend; testes negativos cobrem acesso por mudança manual de URL/API.
8. Novos chamados e respostas persistem após atualizar, fechar navegador e abrir em outro dispositivo autorizado.
9. Enviar via WhatsApp/e-mail abre a aplicação de destino corretamente, mas a UI **não informa "enviado"** sem confirmação do serviço.
10. Suite atual de atendimento continua verde; testes adicionais cobrem convites, autorização, idempotência, roteamento e formulários; build do Vercel `READY` e verificação funcional em produção antes de divulgar links.

## 10. Ordem da implementação
**Fase A — dados e segurança (bloqueante):** provisionamento aprovado do Postgres, migrações, compartilhamento de tickets e autenticação de endpoints. Não abrir recursos públicos antes da validação.

**Fase B — formulários internos:** biblioteca e construtor, nove modelos iniciais, submissão compartilhada, fila e permissões.

**Fase C — externos controlados:** convites de uso único, verificação server-side, submissão externa, cópia/WhatsApp/e-mail, revogação, auditoria e QA de abuso.

**Fase D — operação real:** validação de roteamento/SLA e nomes de equipes com a liderança ST1, testes de ponta a ponta, monitoramento de falhas, treinamento e publicação.

### Limites do primeiro lançamento
Não incluir: integração automática com Kommo/GLPI/IXC, disparo automático para WhatsApp, automações externas sem provedor, anexos ilimitados, formulários públicos abertos por padrão, nem registros fictícios expostos como chamados reais. Esses itens são evoluções futuras com autorização e escopo próprios.
