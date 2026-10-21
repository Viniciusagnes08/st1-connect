# ST1 Connect — Central de Demandas do Squad de BI

**Data original:** 20/10/2026  
**Revisão:** 20/10/2026, escopo exclusivo do Squad de BI e encaminhamento interáreas configurável.  
**Estado:** direção de produto e arquitetura aprovadas; especificação atualizada para revisão técnica e funcional. **Nenhuma implementação deste redesenho está ativa em produção.**  
**Repositório:** https://github.com/Viniciusagnes08/st1-connect  
**Ambiente atual:** https://st1-connect.vercel.app/

## 1. Decisão e objetivo

**O ST1 Connect é a porta de entrada e central operacional do Squad de BI da ST1 Internet, não um helpdesk geral da empresa.** Ele serve para receber, qualificar, executar e acompanhar solicitações de BI, dados, indicadores, relatórios, dashboards e automações de dados de responsabilidade formal do Squad.

Para pedidos fora desse escopo, o produto exerce o papel de **triagem e encaminhamento rastreável**: mostra a classificação e a orientação no próprio sistema, envia notificação por e-mail ao solicitante autenticado e encaminha o conjunto de informações necessárias ao **canal oficial configurado da área responsável**. Não se atribui ao BI a responsabilidade de executar trabalho de outras áreas nem se mistura encaminhamento com produtividade ou SLA de resolução do BI.

A configuração de encaminhamento é **por área/tipo de assunto**, não uma automação fixa para um único canal. Cada regra deve ter área, DRI/canal institucional verificados, dados a transmitir, condições e política de falha. Canal inexistente ou ambíguo significa **triagem manual**, não envio aleatório.

A experiência continua orientada à rapidez: catálogo em até dois cliques e formulários com duas a cinco perguntas específicas, quando possível; a meta de completar um caso simples em menos de 90 segundos será medida em testes com usuários.

## 2. Situação tecnológica observada e dependências

- Código existente em React, TypeScript e Vite com frontend no Vercel. Há módulos de chamados, visão geral, ativos, conhecimento, equipes, relatórios e configurações.
- Login com perfis **Administrador, Supervisor, Técnico e Solicitante**, sessões validadas no servidor; cadastro atual das contas em Blob privado.
- **Chamados e ativos ainda são registros locais no navegador (localStorage)** e não podem sustentar uma fila colaborativa com autorização server-side. É obrigatório migrar novos registros operacionais para banco transacional compartilhado antes de expor esta funcionalidade à equipe.
- Não foi confirmada na inspeção anterior uma integração PostgreSQL operacional no projeto, nem provedor de e-mail transacional, nem canais externos de Trello/webhook conectados ao ST1 Connect. **A especificação não significa que e-mails, cards ou mensagens estejam sendo enviados hoje.**
- Exemplos existentes (incluindo chamados e agentes fictícios) não são dados reais; não os migrar automaticamente.
- A estrutura atual de status e perfis pode ser reaproveitada, mas **estado de atendimento BI** e **estado de encaminhamento externo** são entidades distintas no novo backend.

## 3. Alternativas consideradas e escolha

| Alternativa | Vantagem | Limitação | Decisão |
| --- | --- | --- | --- |
| **Formulários nativos + banco compartilhado + roteador de integrações por área** | Experiência única, rastreabilidade, diferenciação de escopo e mensageria confiável | Exige banco, credenciais de provedores e homologação de destinos | **Aprovada** |
| Google Forms + notificações por planilha | Primeiro piloto mais rápido | Fragmenta autenticação, permissões, histórico e experiência | Não usar como arquitetura principal |
| E-mail genérico ao solicitante e a todas as áreas | Simples | Gera ruído, perda de ownership e exposição indevida | Rejeitada |

**Regra:** o ST1 Connect é a origem do protocolo e da trilha de auditoria; o Trello, e-mail setorial ou outro destino aprovado é o **sistema canônico de execução da área receptora**. Evitar criar segunda fila de execução ou duplicar atividades indevidamente.

## 4. Experiência de quem solicita

### 4.1. Catálogo principal orientado ao BI

Página interna **Solicitar**: título "O que você precisa do BI?", busca por palavras-chave e cards com frases humanas. O catálogo principal não será um menu geral de TI/Marketing.

Modelos iniciais priorizados (cada um possui formulário versionado, perguntas condicionais e resumo antes do envio):

| Formulário | Perguntas obrigatórias específicas | Resultado esperado |
| --- | --- | --- |
| **Novo dashboard ou relatório** | Objetivo/decisão, público, métricas, fonte disponível, periodicidade | Avaliar viabilidade, escopo, responsável e prioridade do BI |
| **Ajuste em dashboard existente** | Nome/link do painel, mudança desejada, motivo e exemplo | Solicitação de melhoria com evidências |
| **Erro ou divergência em indicador** | Painel/métrica, período e filtros, valor observado, referência/esperado | Triagem de confiabilidade, sem assumir causa |
| **Extração ou consulta de dados** | Campos, filtros/período, finalidade, formato e aprovação de acesso | Avaliar acesso permitido e produção de extração |
| **Integração entre bases de dados** | Sistemas/fonte e destino, campos envolvidos, frequência, resultado | Avaliar arquitetura, segurança e dependências |
| **Automação de dados/BI** | Rotina atual, gatilho, volume/frequência, resultado desejado | Levantamento técnico e impacto |
| **Acesso a relatório/dado sob gestão do BI** | Relatório/base, justificativa, área e aprovação aplicável | Solicitar acesso restrito de BI, não permissão geral de sistema |
| **Orientação sobre dados** | Assunto, dúvida objetiva e decisão pretendida | Esclarecer ou direcionar para a base de conhecimento |

**Casos de outras áreas** devem ficar num caminho secundário, como "Não sei se é com BI" ou ser identificados pelas regras ao preencher. Não oferecer como serviços executáveis do BI tarefas de rede, equipamento, manutenção geral de sistemas, Marketing, Finanças e RH.

### 4.2. Fluxo da interface

**Selecionar assunto → Responder perguntas objetivas → Revisar classificação e dados → Enviar → Acompanhar protocolo.**

- Nome, e-mail e área conhecida vêm do login. Para usuário logado, enviar notificações para o **e-mail verificado da conta**, nunca para texto de e-mail alterável no formulário.
- Exibir somente campos pertinentes; pré-preencher informações disponíveis, sem exigir descrição repetitiva. Campo de evidência opcional e controlado por política de arquivos.
- Classificação em tempo real com mensagem simples: **"Atendido pelo Squad de BI"**, **"Outra área responsável"** ou **"Vamos verificar a área responsável"**.
- Se for outra área, apresentar área/canal propostos e explicar que **o BI não executará a demanda**. Solicitar confirmação antes do primeiro encaminhamento externo para que a pessoa revise o conteúdo que será compartilhado.
- Caso o usuário discorde do enquadramento, oferecer **"Solicitar revisão da classificação"** com justificativa objetiva; vai à triagem BI sem envio externo até revisão.
- Na confirmação, mostrar protocolo, estado atual, próximos passos, destino e situação real de envio. Protocolo é gerado **antes** de tentar entregar notificações, dentro de transação persistida.
- "Enviado", "recebido", "em atendimento" e "resolvido" não podem ser tratados como sinônimos.

### 4.3. Links para colaboradores e convidados externos

- **Internos:** login obrigatório; formulário abre já vinculado ao ID do usuário, perfil e e-mail cadastrado.
- **Convidados externos:** somente link individual com token aleatório forte, hash no banco, validade, limite de usos, formulário permitido e destinatário pretendido. Link não libera outras telas nem lista solicitações.
- Confirmar o contato de convidado externo por endereço verificado/convite associado quando houver comunicação por e-mail. Não confiar em endereço digitado sem verificação como identidade corporativa.
- Em caso de link vencido, revogado ou utilizado, explicar no próprio formulário e oferecer retorno ao emissor; não criar registro falso.
- Quando o convidado puder enviar dados pessoais, definir termo de uso e retenção mínima. Tokens não aparecem em logs e são retirados da URL após validação.

## 5. Fronteira do Squad de BI: diretório de responsabilidade

O Administrador terá um módulo **Regras de encaminhamento** para manter uma tabela governada e versionada:

- **Assunto e palavras-chave / modelo de origem**.
- **Área proprietária do assunto**: BI (interno), CRM/Sistemas, Marketing, Redes/TI, Financeiro, RH ou outra área cadastrada explicitamente.
- **DRI institucional e canal canônico confirmado**; sem DRI e canal válidos, status **Sem destino confirmado** e triagem manual.
- **Tipo de integração**: Trello, caixa postal setorial, webhook interno aprovado ou entrega manual assistida. WhatsApp via API somente se houver canal corporativo homologado; não inferir envio automático de um link wa.me.
- **Configuração técnica**: identificador seguro do quadro/lista Trello, destinatário de e-mail allowlist ou webhook HTTPS autorizado; credenciais apenas no servidor; nenhuma chave no frontend.
- **Regra de elegibilidade e confiança**: classificação determinística pelos campos do formulário e opções fechadas, priorizando regras explícitas por serviço. Não criar "roteamento por IA" imprevisível como única decisão.
- **Modo**: encaminhamento após confirmação do solicitante (padrão para externo); triagem humana para casos ambíguos, de alto risco ou com conteúdo sensível.
- **Versão da regra** e data de revisão; mudanças valem para novos registros, sem reescrever histórico antigo.
- **Campos compartilháveis** por destino, anexos e permissões; exigir mínimo necessário.

Exemplos orientativos, ainda **sujeitos à confirmação de ownership e integração na ST1**:

| Assunto detectado | Tratamento | Destino potencial |
| --- | --- | --- |
| Criar painel, corrigir métrica ou extrair dados autorizados | BI | Fila interna do Squad |
| Erro funcional no Kommo CRM, funis, automações e permissões do CRM | Fora de escopo | CRM/Sistemas (DRI e Trello a validar) |
| Erro de interface ou acesso geral ao ST1 Sales | Fora de escopo, exceto métricas/painéis BI | Sistemas (canal a validar) |
| Meta Ads, mídia, criativos e landing pages | Fora de escopo | Marketing (canal a validar) |
| Wi-Fi, equipamentos e problemas de rede | Fora de escopo | Redes/TI (canal a validar) |
| Pagamentos, reembolsos, folha, questões de pessoal | Fora de escopo | Financeiro/RH (canal a validar) |
| Indicador relacionado a Kommo e BI | **Híbrido**: identificar domínio primário; registrar dependências | Um único owner principal; partes interessadas documentadas |

Princípio de governança: responsabilidade é definida pelo **problema primário**, não pela plataforma citada. Divergência de dados no dashboard é BI até prova de dependência externa; falha de automação comercial no Kommo é CRM, ainda que afete indicadores. Nunca atribuir nominalmente responsáveis atuais ou disponibilidade sem leitura da fonte operacional vigente.

## 6. Dois objetos operacionais separados

### 6.1. Chamado executável pelo BI

Criar **BI Ticket** com protocolo único, solicitante autenticado, versão do formulário, respostas, impacto, equipe BI, responsável após triagem, prioridade confirmada, status operacional (**Novo → Em atendimento → Pendente → Resolvido → Fechado**) e eventos auditáveis. SLA de execução somente quando aprovado pelo responsável do BI. O solicitante vê apenas seus chamados; perfil Supervisor/Admin acompanha a fila autorizada.

### 6.2. Encaminhamento para outra área

Criar **Registro de Encaminhamento** com protocolo único, solicitante, assunto, área sugerida, destino confirmado, canal, conteúdo encaminhado (minimizado), eventos e referências externas. **Não é ticket executável do BI e não recebe SLA de resolução BI.**

Estados:
1. **Recebido para triagem** — registrado; escopo/destino ainda em avaliação.
2. **Aguardando encaminhamento** — fora de escopo confirmado; envio agendado ou dependente de confirmação.
3. **Encaminhamento em processamento** — tentativa de entrega registrada.
4. **Encaminhado** — API do canal ou SMTP/provedor aceitou a mensagem/card; comprovante técnico anexado. Não prova leitura/aceite humano.
5. **Recebimento confirmado** — confirmação explícita da área ou evento de integração que realmente represente aceitação; e-mail entregue não é prova de aceite.
6. **Falha no encaminhamento** — entregas repetidas falharam ou não há destino válido; responsável de triagem recebe alerta para ação manual.
7. **Encaminhamento cancelado** — solicitante ou administrador cancela antes de envio, registrando motivo.

"Sem destino confirmado" é sinal de bloqueio dentro de **Recebido para triagem**, não um falso encaminhamento. Não marcar **Resolvido** pelo simples ato de redirecionar. Encerrar o acompanhamento do BI após comprovar entrega ao canal canônico e, quando disponível, aceite; resolução final fica na ferramenta da área proprietária. Manter no ST1 Connect registro e link externo para consulta.

## 7. Notificação ao solicitante no sistema e por e-mail

### 7.1. Mensagens em tela

- Após enviar, mostrar classificação, protocolo, área provável e motivo.
- Em **Minhas solicitações**, exibir timeline: registrada, classificação, enviada para qual canal, falha/reprocessamento, recebimento confirmado (somente com evidência), e orientação de continuidade.
- Ícone de notificações e caixa interna de mensagens de sistema: **encaminhamento iniciado**, **encaminhamento confirmado**, **falha que exige ação** e **alteração importante de destino**.
- Notificação e-mail deve espelhar uma mudança material; não enviar sequência redundante por cada retry técnico.

### 7.2. E-mail para quem solicitou

Destinatário: **e-mail vinculado ao login e validado pelo backend**; nunca usar o e-mail de outra pessoa inserido em campo livre. Para convidado externo, usar contato associado a convite verificado e política de consentimento/retenção.

Mensagem padronizada e objetiva com:
- Número e data da solicitação;
- Título/assunto e breve resumo aprovado;
- Explicação neutra de por que o pedido não é tratado pelo Squad de BI (quando aplicável);
- Área/canal responsável identificado, sem inventar pessoa;
- **Situação real**: em triagem, aguardando envio, encaminhado, recebimento confirmado ou falha;
- Instrução e link para acompanhamento no ST1 Connect, limitado ao solicitante;
- Referência externa apenas quando disponível e autorizada.

Modelo de conteúdo do e-mail:

**Assunto:** ST1 Connect | Solicitação ST1-xxxx encaminhada ao setor responsável

"Recebemos sua solicitação sobre [assunto]. Ela foi classificada como responsabilidade de [área] porque [justificativa curta]. Encaminhamos as informações para [canal confirmado] em [data/hora]. **Situação: Encaminhado — aguardando confirmação de recebimento.** Protocolo: [id]. Para acompanhar ou solicitar revisão da classificação, acesse [link privado]."

Se o conector falhar, o e-mail e a tela devem dizer **"Aguardando encaminhamento"** ou **"Falha no envio"**, jamais fingir que outra equipe recebeu.

### 7.3. E-mail não é disparado pelo frontend

Usar **provedor transacional conectado ao servidor**, com domínio remetente ST1 verificado, SPF/DKIM/DMARC e endereço de resposta institucional. Gmail do usuário não é equivalente a conector transacional da aplicação e não deve servir como envio automático permanente sem configuração corporativa aprovada. Registrar ID, timestamp, destino e estado técnico do provedor, sem armazenar segredos ou corpo completo em logs.

## 8. Entrega ao canal correto, com mensagem estruturada

Um **adaptador por canal** implementa a mesma interface lógica: validar destino → criar entrega idempotente → devolver referência externa e resultado → atualizar status técnico. Prioridade inicial de opções:

1. **Trello:** criar card no quadro/lista **canônicos da área**, com título e descrição padronizados; opcionalmente atribuir DRI se a identidade estiver confirmada. Salvar card ID e URL. Falha de autorização/quadros suspende encaminhamento e aciona triagem; não criar card substituto em quadro genérico.
2. **E-mail setorial:** enviar para endereço institucional allowlist, com resumo, protocolo e acesso seguro às respostas completas; rastrear aceite do provedor; recebimento humano exige confirmação explícita.
3. **Webhook interno aprovado:** POST assinado em endpoint HTTPS previamente cadastrado, com esquema de payload versionado e idempotency key; bloquear hosts privados, redirects e destinos arbitrários para mitigar SSRF. Não considerar apenas HTTP 200 como confirmação de execução sem contrato de ACK.
4. **Manual assistido:** mostrar mensagem pronta, botão de copiar, canal correto e checklist; somente marcar encaminhado mediante confirmação do operador e evidência anexada ao registro. Não simular envio.

**Conteúdo mínimo enviado à área:** protocolo, solicitante e contato corporativo (quando permitido), área solicitante, assunto, tipo, objetivo, impacto, urgência declarada, respostas relevantes do formulário, data/hora, justificativa de direcionamento, anexos por link privado autorizado e URL de referência. O canal não recebe credenciais, tokens ou dados de outros chamados. Para e-mail, preferir resumo + link autenticado a transcrição indiscriminada de dados sensíveis.

**Estrutura do card/assunto:** "[ST1 CONNECT] [TIPO] — [RESUMO] | [PROTOCOLO]". Texto deve ser factual e colaborativo: "Solicitação encaminhada ao time responsável para avaliação", não "vocês têm que resolver" ou atribuição de culpa.

O ST1 Connect mantém a fonte canônica da **triagem e prova do encaminhamento**. O Trello da área é a fonte canônica da execução da demanda. Quando houver retorno pelo canal, espelhar somente referências/status validados, sem atualizar múltiplos sistemas por suposição.

### 8.1. Política de entrega e tratamento de falha

- Persistir solicitação e eventos de **outbox** na mesma transação no PostgreSQL; processamento assíncrono por worker/job server-side para e-mails e conectores.
- **Não executar envio no corpo do request antes do commit**; cliente recebe protocolo e estado de entrega pendente, não falso sucesso.
- Cada envio possui chave idempotente por registro, destino, evento e versão, evitando duplicação em retries.
- Retries com backoff e limite configurável; após esgotar, fila de erro, notificação ao responsável pela triagem e ação **Reenviar** ou **Alterar destino**. Sucesso de um canal não deve ser apagado pela falha de outro.
- Manter eventos **e-mail aceito pelo provedor**, **canal externo aceitou a criação**, **área confirmou recebimento** separados.
- Ao alterar destino, cancelar tentativas futuras da rota antiga e registrar quem autorizou a mudança.
- Sem provedor de e-mail ou canal configurado, não habilitar **encaminhamento automático**. Mostrar "canal não configurado" e pendência real. O solicitante continua informado no próprio sistema.

## 9. Administração e acesso

Papéis existentes reaproveitados, com restrições explícitas no **servidor**:

| Perfil | Pode fazer |
| --- | --- |
| **Administrador** | Gerencia usuários, formulários, escopo BI, regras de roteamento, canais/credenciais indiretas, logs e auditoria; pode autorizar reenvio e revisão |
| **Supervisor (BI)** | Acompanha fila BI, classifica exceções, gera convites autorizados, solicita/revisa encaminhamentos de outras áreas; não visualiza segredos de conectores |
| **Técnico (BI)** | Executa tickets BI atribuídos, comenta tecnicamente, sinaliza fora de escopo para revisão; não publica formulário nem altera destino canônico |
| **Solicitante** | Cria demanda, vê o próprio protocolo, estado e mensagens, solicita revisão da classificação; não acessa fila de outras pessoas |
| **Convidado com link** | Preenche somente formulário vinculado ao convite; não acessa painel, diretório interno, dados de outros chamados ou histórico geral |

Administradores controlam um **Diretório de Áreas e Canais**, versionado, com prévia da mensagem e **teste de configuração sem produção de card real** quando suportado pelo conector. Alterar regras de escopo ou de destino exige trilha de autoria/data e não afeta envios concluídos.

A experiência deve ser acessível e responsiva, mantendo identidade ST1 Connect (nav lateral escura, laranja como ação primária, DM Sans/Outfit). Novos espaços da navegação:
- **Solicitar ao BI** — portal de formulários para solicitantes.
- **Meus pedidos** — tickets BI e encaminhamentos, em linhas visualmente diferenciadas.
- **Fila BI** — somente chamados executáveis do Squad.
- **Triagem e encaminhamentos** — exceções, bloqueios e situação dos envios.
- **Formulários** — editor de modelos para Admin.
- **Áreas e canais** — diretório/configurações para Admin.

Evitar lista de oito departamentos como se fossem equipes subordinadas ao Squad de BI.

## 10. Persistência e arquitetura

**Requisito bloqueante:** PostgreSQL gerenciado conectado às Vercel Functions por credencial privada. Não contratar serviço/plano pago sem análise de custo e autorização. Blob privado pode armazenar arquivos autorizados, não substituir o banco transacional.

Conjuntos de dados:
- **Identidade**: mapear IDs autenticados em Blob para usuários no banco; evitar dois cadastros divergentes.
- **Formulários**: templates, versões imutáveis, campos, condicionais, visibilidade e permissão interna/externa.
- **Escopo e roteamento**: áreas, regras versionadas, responsáveis institucionais, canais e status de validação do destino; segredos em env/secret manager, não em tabelas legíveis.
- **Solicitações**: submissões, respostas, autor, protocolo e decisão de triagem.
- **BI tickets**: execução BI, eventos, prioridades, SLAs validados, responsáveis e encerramento.
- **Encaminhamentos**: classificação, justificativa, canal, referência externa, estado, tentativas, aceite, reenvio e cancelamento.
- **Comunicações**: notificação interna, outbox, tentativas, provedor, eventos e confirmações.
- **Segurança**: convites hash/expiração/uso, regras de acesso, auditoria e limites de requisição.
- **Anexos**: referência a arquivos privados permitidos, autenticação e validade de acesso.

Endpoints segregados por domínio:
- **/api/forms/**: catálogo, modelos, prévia e publicação.
- **/api/submissions/**: submissão e decisão de escopo, validação e protocolo.
- **/api/bi-tickets/**: execução e leitura com autorização server-side.
- **/api/referrals/**: registrar e acompanhar encaminhamentos, cancelamentos e confirmações.
- **/api/routing/**: regras e canais, operações de Admin; dados sensíveis nunca expostos.
- **/api/notifications/**: caixa interna e preferências permitidas.
- **/api/public/**: convites externos verificados, submissão com rate limit e proteção antiabuso.

Usar cookies HTTP-only e verificação server-side das contas e permissões existentes; não confiar em role ou userId fornecidos pelo cliente. Validar vínculo do solicitante antes de expor qualquer resposta, log, comunicação ou anexo.

### Exigências de dados e compliance

Coletar somente dados necessários, validar esquema, tamanho de mensagens e tipos de arquivo. Sanitizar saídas, prevenir CSRF, SSRF, enumeração de protocolos, abuso de links, vazamento de segredo e duplo envio. Links de convidados devem ter expiração e ser revogáveis. Para compartilhamento com outra área, mostrar exatamente quais informações serão transmitidas; registros não autorizados ou de sensibilidade elevada exigem revisão humana.

Não sincronizar automaticamente dados fictícios atuais; oferecer importação com revisão e aprovação expressa, preservando histórico do navegador. Na ausência de banco ou conector, impedir declarações de sucesso e não mascarar falhas com localStorage.

## 11. Indicadores separados para a gestão

**BI operacional:** novos tickets BI, backlog, tempo de primeira resposta, tempo de atendimento, cumprimento de SLA validado, retrabalho e demanda por tipo/área.

**Triagem interáreas:** solicitações fora do escopo, distribuição por área, % classificadas corretamente após revisão, tempo até encaminhamento técnico, % de canais que aceitaram a entrega, % de áreas que confirmaram recebimento, falhas/reprocessamentos e destinos sem configuração.

Não considerar encaminhamento como **entrega do BI**, nem contar cumprimento de SLA da área receptora como SLA do Squad de BI. Dashboard deve distinguir "entrega ao canal" de "aceite da área".

## 12. Critérios de aceite e testes obrigatórios

1. **Escopo:** oito formulários principais aparecem no catálogo BI; solicitação de CRM funcional/Marketing/Redes é classificada fora do escopo sem entrar na fila executável BI.
2. **Híbridos:** divergência de métrica originada no dashboard aparece para triagem BI; mudança funcional do Kommo fica com CRM, com dependência documentada quando aplicável.
3. **Identidade:** usuário autenticado vê seus próprios registros e recebe avisos somente no e-mail de seu login; mudar parâmetro da API não permite receber notificações de outra conta.
4. **Mensagem no sistema:** cada novo pedido recebe protocolo e status persistente; encaminhamentos externos mostram destino, estado real e histórico mesmo após abrir de outro dispositivo autorizado.
5. **Integração configurável:** Admin configura ao menos um destino Trello e um e-mail setorial homologados; cada modelo/regra resolve para o destino correto, sem usar quadro genérico.
6. **Registro na área:** conector bem-sucedido gera um card/mensagem com identificador, solicitante, conteúdo necessário, data/hora, impacto, justificativa e referência segura. O evento contém ID externo.
7. **Notificação ao solicitante:** após aceite pelo provedor, há mensagem in-app e e-mail correspondente com protocolo, área, justificativa e situação; sem afirmar recebimento humano.
8. **Falha:** conector indisponível mantém estado de falha/pendência, permite retry idempotente, notifica triagem e não marca recebido/resolvido.
9. **Confirmação do receptor:** só muda para **Recebimento confirmado** após evento explícito confiável ou confirmação manual auditada. Envio por e-mail sozinho não atende esse critério.
10. **Convite externo:** token revogado, expirado ou já utilizado bloqueia acesso; convidado não vê dados internos nem recebe e-mail em endereço não verificado.
11. **Integridade:** envio cria solicitação e outbox em transação; formulário incompleto não gera protocolo de sucesso; reenvios não criam duas demandas para a mesma solicitação.
12. **Permissões:** Solicitante não vê solicitações de outros, Técnico não altera regras ou templates, Supervisor não visualiza segredos; autorização aplicada em API e não só no menu.
13. **Métricas:** relatórios isolam chamados executáveis BI de encaminhamentos e não contam "encaminhado" como "resolvido".
14. **UI e release:** testes unitários/integrados e E2E dos dois caminhos, responsividade móvel, acessibilidade, regressão dos fluxos existentes, build Vercel READY e teste com destinos de homologação antes do go-live.
15. **Não configuração:** sem PostgreSQL, e-mail transacional ou canal oficial, a interface explica a indisponibilidade e não anuncia entrega externa bem-sucedida.

## 13. Etapas de execução e limites

**Fase A — infraestrutura e identidade (bloqueante).** Aprovar e conectar banco transacional; implementar persistência e autorização por solicitante; tabela de regras/áreas, outbox, eventos auditáveis e planejamento de integrações. Validar remetente institucional e autorização de Trello/e-mail/webhook.

**Fase B — portal BI.** Implementar catálogo enxuto e oito formulários inteligentes, fila BI e meus pedidos. Alinhar SLA e time proprietário com a liderança do Squad antes de habilitar execução operacional.

**Fase C — triagem e canais.** Implementar classificação com confirmação, diretório de destinos, triagem de exceções, conectores aprovados, retries, e-mails e notificações internas. Testar canal a canal com destinos de homologação e redirecionamento auditável.

**Fase D — convites externos e publicação.** Links controlados, limites, confirmação de identidade quando necessário, QA de segurança e aceite operacional com solicitação externa simulada; somente então liberar distribuição de links.

**Fora do escopo inicial:** virar ferramenta corporativa de todas as áreas; atendimento completo das outras equipes dentro do Connect; integração funcional com Kommo/GLPI/IXC; automação de WhatsApp sem API autorizada; publicar links genéricos sem controle; inventar SLAs, responsáveis, e-mails ou quadros externos; migração automática dos tickets fictícios.

**Pendências de configuração, não impedimentos à especificação:** confirmar proprietários e destinos oficiais por área na fonte operacional vigente, autorizar provedores/credenciais de integração, configurar banco e definir política de segurança e retenção. Até isso existir, automações devem permanecer desligadas, com interface de configuração e estados de indisponibilidade.

---
**Histórico da decisão:** o documento original descrevia um helpdesk generalista com nove modelos de atendimento. A revisão aprovada substitui essa tese por **central exclusiva do Squad de BI + roteador de exceções interáreas**, com canal configurável por área, comunicação no sistema e e-mail para o solicitante e comprovação técnica de encaminhamento separada de aceite humano.
