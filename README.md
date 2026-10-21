# ST1 Connect

Central de serviços da ST1, com interface em português e fluxos inspirados em práticas de helpdesk e gestão de serviços utilizadas pelo GLPI. Implementação independente, feita com React, TypeScript e Vite.

## O que está implementado

- **Visão geral:** chamados abertos, em atendimento, vencidos e cumprimento de prazo; evolução diária; distribuição por situação; fila prioritária e carga das equipes. Os indicadores são calculados a partir dos chamados cadastrados.
- **Chamados:** criação, busca, filtros por equipe/categoria/prioridade/situação, lista e Kanban, ordenação, paginação, atribuição, histórico de interações e exportação CSV.
- **Ciclo de atendimento:** Novo, Em atendimento, Pendente, Resolvido e Fechado. Pendência exige motivo; resolução exige solução; fechamento requer resolução anterior.
- **Prazo de resolução:** horas corridas, pausa durante pendência, retomada com ajuste do vencimento e congelamento do resultado após a solução. A prioridade é selecionada manualmente. Alterar a prioridade de um chamado existente preserva seu prazo original e registra essa decisão no histórico.
- **Ativos:** inventário pesquisável, cadastro, situação, equipe, local interno e chamados vinculados.
- **Conhecimento:** seis artigos de orientação, pesquisa no conteúdo, filtros por categoria e abertura de chamado a partir do artigo.
- **Equipes:** distribuição de chamados e responsabilidades.
- **Relatórios:** períodos de 7, 14 e 30 dias, resolução por coorte de abertura, tempo médio, distribuição por categoria/prioridade, eventos diários e CSV.
- **Configurações:** nome do workspace e metas de prazo aplicadas a novos chamados; restauração dos exemplos com confirmação.

## Natureza desta versão

Esta é uma **demonstração funcional do painel e dos fluxos**, identificada dentro da interface. A carga inicial tem 48 chamados, dez ativos, seis agentes fictícios e seis artigos. Os registros e as metas não representam dados reais ou políticas aprovadas da ST1.

Os dados são armazenados no **localStorage do navegador**, sem envio a um servidor. Alterações ficam disponíveis nesse mesmo navegador e origem; não são compartilhadas entre dispositivos ou colaboradores. Limpar os dados do navegador remove os registros locais. A exportação CSV exporta chamados, não representa um backup completo de configurações e ativos.

Há **autenticação de contas e sessões no servidor**, com cadastro persistido em Vercel Blob privado, perfis (Administrador, Supervisor, Técnico e Solicitante), gerenciamento de acessos pelo administrador, alteração de senha e bloqueio temporário após tentativas de senha incorreta. A interface limita os módulos por perfil. **Os chamados e ativos continuam em localStorage e as permissões sobre esses dados de demonstração são apenas de interface, não uma autorização sobre dados persistidos no servidor.** Portanto, não utilize a versão para informações internas confidenciais ou como sistema multiusuário de produção. Não há banco de dados central dos chamados, anexos, notificações por e-mail/WhatsApp ou integração com GLPI, Kommo, IXC ou ST1 Sales. Os avisos de prazo são calculados na interface enquanto o aplicativo está aberto.

## Login e ativação inicial

A primeira visita ao endereço do ST1 Connect abre o formulário de ativação. O primeiro administrador informa **nome, e-mail, senha forte com pelo menos 12 caracteres (letras e números)** e o código disponível em **Vercel → Project → Settings → Environment Variables → ST1_SETUP_TOKEN**. Esse valor é secreto e **não deve ser publicado no GitHub, enviado por mensagem ou colocado em variáveis VITE_**. Apenas o primeiro cadastro usa esse código; em seguida, o administrador cria as contas em **Meu acesso → Usuários e permissões**.

Os perfis previstos nesta versão são:

- **Administrador:** todos os módulos e gestão de contas.
- **Supervisor:** painel geral, chamados, ativos, equipes e relatórios.
- **Técnico:** painel geral, chamados, ativos e conhecimento.
- **Solicitante:** abertura de chamado, leitura dos próprios chamados criados nesta instância do navegador e base de conhecimento.

Para trocar a senha, entre em **Meu acesso → Minha conta**. Em caso de perda da senha, solicite ao administrador uma redefinição; não existe recuperação por e-mail. **Não use o recurso para armazenar senhas de colaboradores em chamados.**

Configuração em produção: **ST1_AUTH_SECRET** (chave privada da sessão), **ST1_SETUP_TOKEN** (código de ativação) e **BLOB_READ_WRITE_TOKEN** (fornecido pelo Blob privado). O armazenamento privado não deve ser tornado público. O handler em `api/auth.js` verifica credenciais, sessão, papéis e alterações de usuários no servidor e devolve cookies HTTP-only, Secure e SameSite=Strict. Alterações no documento de contas utilizam ETag/if-match para minimizar conflitos de escrita.

## Execução local

Requer Node.js 22.12 ou superior. As dependências estão fixadas no `package.json` e no `package-lock.json`.

```bash
npm ci
npm run dev
```

O servidor de desenvolvimento utiliza a porta 4173. Para gerar a versão de produção:

```bash
npm test
npm run build
npm run preview
```

## Estrutura

```text
src/
  App.tsx             Navegação, painel, chamados, criação e atendimento
  AuthGate.tsx        Login, ativação, gestão de contas e troca de senha
  auth.css            Identidade visual e responsividade do login
  SecondaryPages.tsx  Ativos, conhecimento, equipes, relatórios e configurações
  domain.ts           Tipos, demonstração, validação, SLA, transições e CSV
  domain.test.ts      Testes de regras de atendimento e exportação
  styles.css          Interface principal e responsividade
  secondary.css       Interface dos módulos complementares
  main.tsx            Inicialização e fontes locais
public/
  favicon.svg         Identidade do aplicativo
api/auth.js           Sessões e usuários armazenados no servidor
vercel.json           Compilação, roteamento e cabeçalhos
```

## Testes e decisões

Os testes verificam pausa e retomada do SLA, pausas consecutivas, resolução durante pendência, obrigatoriedade de motivo e solução, fechamento, reabertura, congelamento de prazos e exportação CSV. A exportação trata delimitadores, aspas, quebras de linha e entradas que poderiam ser interpretadas como fórmulas de planilha.

Formulários usam validação, diálogos nativos mantêm o foco, os controles têm rótulos acessíveis, a navegação funciona por teclado e há uma tabela textual alternativa para o gráfico principal. A interface respeita a preferência por redução de movimento.

O painel utiliza o fuso de Fortaleza. Indicadores da fila mostram a posição atual; os gráficos e indicadores de resolução usam o período selecionado. Os relatórios identificam separadamente a coorte de chamados abertos no período e os eventos de resolução por dia.

## Publicação no Vercel

O projeto usa o preset Vite, comando `npm run build` e diretório de saída `dist`. A configuração necessária está versionada. A autenticação agora **exige as variáveis de ambiente descritas acima**. O aplicativo não inicia o login caso elas estejam ausentes.

A integração com o GitHub permite novas publicações a partir de alterações na branch de produção do repositório.

## Evolução para uso operacional

A próxima etapa técnica é conectar a API de chamados e um banco de dados persistente com autorização por registro, substituir os dados demonstrativos e vincular os solicitantes aos seus chamados. O controle de papéis da navegação não substitui o controle de acesso a dados em um backend. A arquitetura mantém as regras de domínio separadas dos componentes para apoiar essa evolução.

Depois disso, podem entrar catálogo por área, aprovações, anexos, notificações, calendário de atendimento, auditoria no servidor e integrações com os sistemas da ST1. Nenhuma dessas conexões é simulada como ativa nesta versão.

## Referências de produto

- [GLPI: ciclo de vida dos chamados](https://help.glpi-project.org/documentation/modules/assistance/tickets/ticketlifecycle)
- [GLPI: níveis de serviço](https://help.glpi-project.org/documentation/modules/configuration/service_levels)
- [GLPI: ativos](https://help.glpi-project.org/documentation/modules/assets)
- [GLPI: base de conhecimento](https://help.glpi-project.org/documentation/modules/tools/knowledgebase)

O ST1 Connect não é uma distribuição do GLPI e não utiliza seu código, suas credenciais ou sua identidade visual.
