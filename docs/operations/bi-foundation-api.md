# ST1 Connect — contrato inicial da API do Squad BI

O módulo operacional fica protegido por sessão HTTP-only existente e `BI_CONNECT_ENABLED=true`. Os dados não vêm do localStorage.

| Método e endpoint | Perfil e escopo | Resposta |
| --- | --- | --- |
| `GET /api/health` | Público, somente disponibilidade | `{service,database}` (200/503) |
| `GET /api/bi-members?mode=self` | Usuário logado | vínculo de membro do Squad |
| `GET /api/bi-members` | Administrador | contas e memberships, sem hashes/senhas |
| `POST /api/bi-members` | Administrador + Origem válida | ativa/desativa membro em conta existente |
| `GET /api/requests` | Qualquer login ativo | solicitações do próprio ID no servidor |
| `GET /api/bi-tickets` | Admin/Supervisor/Técnico + membership BI | fila de até 100 chamados BI |
| `GET /api/bi-tickets?id=<uuid>` | Autor do pedido ou membro BI | detalhe + histórico |
| `POST /api/bi-tickets` | Usuário ativo + Origem válida | protocolo BI ou resposta idempotente |
| `PATCH /api/bi-tickets` | Membro BI ativo + Origem válida | status, responsável inicial e evento |

### Exemplo de abertura

```http
POST /api/bi-tickets HTTP/1.1
Content-Type: application/json
Idempotency-Key: 3c4040d7-51e5-4cf5-a0f6-151343e314b2
Origin: https://st1-connect.vercel.app

{"title":"Corrigir painel de vendas","description":"O indicador de vendas está divergente desde a última atualização."}
```

O `requester_user_id` e o e-mail são extraídos da sessão validada no servidor, **não** de campos fornecidos pelo navegador. Dados com chaves não permitidas no JSON são rejeitados. Após a criação, `GET /api/requests` traz o registro para a conta solicitante.

### Contrato de status

| Origem | Destinos válidos |
| --- | --- |
| Novo | Em atendimento, Pendente (motivo obrigatório) |
| Em atendimento | Pendente (motivo), Resolvido (solução) |
| Pendente | Em atendimento, Resolvido (solução) |
| Resolvido | Fechado, Em atendimento (justificativa de reabertura) |
| Fechado | Nenhum nesta primeira versão |

**Nota:** o prazo e a prioridade ficam sem classificação até definição pelo Squad; nenhum SLA é inventado automaticamente. Endpoints de formulários externos, notificações e roteamento ainda não fazem parte da Fase A.
