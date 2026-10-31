# ST1 Connect — Fase 00 multiárea: contenção de demonstração e preservação local

**Data:** 31/10/2026
**Escopo aprovado pelo Product Owner:** plataforma interna corporativa para múltiplas áreas. O Squad BI é a primeira operação habilitada no banco, não a definição de todo o produto.
**Ambiente de trabalho:** branch `feature/st1-connect-bi-foundation`, Preview Vercel. Produção fora do escopo.
**Decisão:** evolução incremental do React existente, sem perder identidade visual, login, banco, membership BI e histórico.

## Problema confirmado

- `src/App.tsx` inicia 48 tickets, 10 ativos, 6 agentes e SLA fictícios de `src/domain.ts`; guarda alterações em `localStorage['st1-connect:v1']`.
- O BI em `src/features/bi/BIWorkspace.tsx` lê/grava a base privada `st1_bi` via APIs autenticadas. Dados reais são exclusivos da origem validada.
- Misturar ambos na mesma navegação faz indicadores e equipamentos fabricados parecerem operacionais.
- Informações editadas nos navegadores podem ser legítimas, mas não é seguro migrar automaticamente os registros demonstrativos para o banco.
- Navegadores isolam `localStorage` por origem. Uma URL de deploy Preview diferente não consegue ler automaticamente registros armazenados na produção ou em outro deploy.

## Objetivo da Fase 00

1. Substituir o shell operacional antigo por um **portal multiárea**:
   - `Visão geral`: somente solicitações da conta autenticada, lidas do backend.
   - `Minhas solicitações`: lista real, sempre filtrada pelo servidor por proprietário.
   - `Squad BI`: componente e APIs existentes preservados integralmente.
   - `Outras áreas`: catálogo de áreas **não habilitadas**, com comunicação explícita. Não criar tickets falsos, nem prometer automações.
   - `Dados locais anteriores`: exportação **somente no navegador** de snapshots antigos (origem atual), sem leitura por servidor e sem apagar armazenamento.
   - `Meu acesso`: painel existente preservado.
2. Impedir qualquer entrada/rota operacional para os módulos antigos alimentados por seeds. URLs `/#/tickets`, `/#/assets`, `/#/teams`, `/#/reports`, `/#/knowledge`, `/#/settings` direcionam ao portal operacional, nunca à demonstração.
3. Garantir a distinção entre estados `carregando`, `dados disponíveis`, `sem dados` e `erro`. API indisponível **nunca** será mostrada como 0.
4. Sem alterações de schema, role, usuários, senha, protocolo ou dados em produção.
5. Encerrar controles emergenciais de recuperação administrativa do Preview já utilizados; sem alterar o fluxo de senha normal.

## Alternativas avaliadas

- **Excluir dados antigos e substituir pela Central BI:** não, gera perda local e contraria plataforma multiárea.
- **Migrar seeds para Supabase:** não, contamina a fonte operacional e falsifica produtividade.
- **Shell multiárea novo sobre autenticação e APIs existentes (escolhido):** menor impacto, preservar código legado no repositório para auditoria e recuperar exportações, mantendo módulos futuros explicitamente desabilitados.

## Modelo de informação

- `GET /api/requests` retorna apenas solicitações do usuário autenticado. **Não representa volume total da empresa**; home informa precisamente esse recorte.
- O BI usa `GET /api/bi-members` e `GET /api/bi-tickets` com papéis e membership. Sem acesso de outros squads a essa fila.
- `other`: áreas como Sistemas/CRM, TI/Infraestrutura, Marketing/Comunicação e Financeiro/Administrativo são **rotas conceituais**, não cadastros aprovados nem bases já integradas.
- Contagens são calculadas apenas após resposta válida do servidor. Zero significa consulta bem-sucedida e sem ocorrências; `—` significa indisponibilidade ou ainda carregando.
- Exportação local preserva exatamente os valores das chaves `st1-connect:v1` e `st1-connect:v1:recovery`, sem editar, limpar ou sobrescrever. Inclui metadados de origem e horário da exportação.

## Segurança e privacidade

- Não apresentar senhas, hashes de autenticação ou credenciais no UI/arquivo de exportação.
- Não enviar conteúdo do armazenamento local ao Supabase ou Vercel.
- Não migrar dados locais sem classificação manual de registros reais versus demonstrativos.
- O formulário de BI e o gerenciamento de contas preservam a autorização server-side existente.
- Desligar `ST1_ADMIN_RECOVERY_ENABLED` e expirar `ST1_EMAIL_RECOVERY_EXPIRES_AT` só no Preview após garantir que recuperação anterior está concluída.
- Todos os painéis futuros devem consultar fontes verificáveis, nunca `createSeedData`.

## Testes de aceitação

- Login da conta já existente abre a Visão geral corporativa, não o antigo painel simulado.
- `/#/bi` continua disponível, com cadastro/consulta protegidos por sessão e membership existente.
- `/#/tickets`, `/#/assets`, `/#/reports` e demais rotas legadas não exibem exemplos.
- Falha de `/api/requests` apresenta mensagem de erro e botão Recarregar, nunca KPI 0.
- Resposta vazia válida gera 0 em `Meus pedidos` e `Sem solicitações registradas`; os recortes são explicitamente pessoais.
- Exportação de armazenamento local não executa `setItem`, `removeItem` nem `clear`; se storage indisponível, informa erro, não simula vazio.
- Usuário solicitante vê home e seus pedidos; membro BI autorizado vê fila dentro da Central BI.
- Mobile tem menu fechável, navegação via teclado, estados `aria-live` e layouts responsivos.
- CI `npm test` e `npm run build`, Preview READY e `/api/health` = `database:ready` após publicação.
