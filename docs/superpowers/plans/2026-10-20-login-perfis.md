# ST1 Connect — Login e perfis de acesso

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ativar autenticação real por e-mail/senha com quatro perfis e controle de usuários no ST1 Connect.

**Architecture:** React/Vite mantém a interface atual. Vercel Functions fazem cadastro inicial, autenticação e administração de contas usando somente segredos do servidor. As contas ficam em Blob privado com proteção de escritas concorrentes por ETag; sessões são assinadas com HMAC e armazenadas em cookies HttpOnly; leituras e mutações da identidade são verificadas no servidor.

**Tech Stack:** React 19, TypeScript, Vite, Node.js crypto, Vercel Functions e Vercel Blob privado.

---

### Task 1: API e armazenamento
- [ ] Criar `api/_core.js` com leitura e escrita condicionais de `auth/users.json`, hash scrypt de senhas, cookies assinados e validação de origem.
- [ ] Criar `api/auth.js` para status, cadastro único do administrador, login, sessão, logout e alteração de senha.
- [ ] Criar `api/users.js` para listagem, criação, perfil e desativação, acessível exclusivamente ao Administrador.
- [ ] Exercitar casos de credenciais inválidas, sessões expiradas, usuário desativado e transições privilegiadas.

### Task 2: Interface de login e permissões
- [ ] Criar `src/auth.ts` com tipos e regras de visibilidade.
- [ ] Criar `src/AuthGate.tsx` e `src/auth.css` com autenticação, configuração inicial e gerenciamento de contas.
- [ ] Integrar ao `src/App.tsx`: bloquear painel até sessão válida, mostrar nome/papel, permitir sair e abrir administração somente para Admin.
- [ ] Filtrar chamados em visualizações de solicitantes, restringir ações de tratamento a agentes e superiores; restringir relatórios, equipes e configurações a papéis autorizados.
- [ ] Preservar aviso de demonstração: os dados dos chamados seguem locais e não são backend multiusuário.

### Task 3: Publicação
- [ ] Salvar instruções de ativação no `README.md`.
- [ ] Confirmar segredos no Vercel e store privado conectado; não expor valores.
- [ ] Commitar alteração e acompanhar deployment da branch de produção.
- [ ] Verificar página de login e endpoints de sessão no site público.
- [ ] Explicar que o cadastro inicial necessita o código secreto configurado no painel Vercel.

**Observação de segurança:** até a migração de tickets e ativos para API com autorização no servidor, o sistema não é adequado ao tratamento de chamados confidenciais de múltiplas pessoas.