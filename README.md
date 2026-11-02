# PROV. — aplicativo financeiro

Aplicativo Next.js 16 (App Router) com Firebase Authentication, Cloud Firestore e backend de assinaturas Mercado Pago. Este repositório é independente do repositório `prov-landing` e deve ter seu próprio projeto/deploy na Vercel.

## Rodar localmente

Requisitos: Node.js 20.9+ e Java 11+ para os emuladores Firebase.

```bash
npm ci
Copy-Item .env.example .env.local
npm run emulators
```

Em outro terminal:

```bash
npm run dev:emu
```

O app fica em `http://localhost:3000`; os emuladores Auth e Firestore usam as portas 9099 e 8080. O Firebase Admin SDK aponta para os emuladores quando `NEXT_PUBLIC_USE_EMULATORS=true`, sem conta de serviço real.

## Planos e regras de acesso

Os valores e a lista de recursos têm uma única fonte no backend, em `src/lib/planos.ts`:

- Free: painel básico, rendas, contas fixas, dívidas, cartões, faturas manuais, perfil e configurações.
- Premium mensal: R$ 11,99/mês.
- Premium anual: R$ 119,88 a cada 12 meses.
- Premium inclui importação CSV. Gráficos e análises completas ainda estão em desenvolvimento e não são apresentados como recurso pronto.

Usuários sem `users/{uid}/assinatura/status` são Free. Os dados financeiros existentes não precisam ser migrados nem apagados. As regras do Firestore permitem faturas manuais e impedem o cliente de alterar a assinatura ou gravar lançamentos CSV. O endpoint de importação revalida a assinatura no Mercado Pago.

## Fluxo de assinatura

1. A landing direciona o visitante para `/cadastro` (grátis) ou `/cadastro?plano=mensal|anual`.
2. O app mantém Firebase Authentication; cadastro grátis vai ao painel sem chamar o Mercado Pago.
3. Para Premium, o backend valida o Firebase ID Token e escolhe preço, recorrência, pagador e `external_reference` no servidor.
4. O backend cria a assinatura pendente em `POST /preapproval` e redireciona para o `init_point` fornecido pelo Mercado Pago.
5. Webhooks HMAC são verificados. O backend consulta a assinatura e sua fatura recorrente mais recente no Mercado Pago; só concede Premium se o contrato estiver `authorized`, usuário/valor/recorrência corresponderem e a cobrança mais recente tiver `payment.status=approved`.
6. O app reconcilia assinatura e última fatura diretamente com o provedor ao verificar o plano e antes de cada importação CSV. Pagamento ausente, pendente ou recusado mantém Free. Notificações repetidas são registradas e versões antigas do provedor não substituem um estado mais novo.
7. A página Planos permite solicitar cancelamento no backend. O app só reflete o cancelamento após confirmá-lo na API do Mercado Pago.

Rotas: `POST /api/billing/checkout`, `GET /api/billing/status`, `POST /api/billing/cancel`, `GET /api/billing/plans`, `POST /api/billing/csv-import` e `POST /api/webhooks/mercadopago`.

## Variáveis de ambiente

Configure-as no projeto Vercel do **app**. Os valores abaixo são nomes, nunca cole credenciais reais neste arquivo.

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | App web Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | App web Firebase |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Projeto Firebase usado pelo cliente |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App web Firebase |
| `NEXT_PUBLIC_USE_EMULATORS` | `true` somente no desenvolvimento local com emuladores |
| `NEXT_PUBLIC_APP_URL` | Origem HTTPS do app neste ambiente; HTTP permitido apenas em localhost |
| `FIREBASE_ADMIN_PROJECT_ID` | Projeto Firebase acessado pelo backend |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Conta de serviço privada do backend |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Chave privada da mesma conta; preservar as quebras de linha `\\n` na Vercel |
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token privado da aplicação Mercado Pago deste ambiente |
| `MERCADOPAGO_TEST_PAYER_EMAIL` | Opcional em local/Preview para usar o e-mail de comprador de teste; nunca usar em Production |
| `MERCADOPAGO_WEBHOOK_SECRET` | Segredo HMAC da URL de webhook deste ambiente |

Não crie valores reais em `.env.example` nem os versiona. A chave privada Firebase, Access Token e segredo HMAC não podem usar prefixo `NEXT_PUBLIC_`.

### Ambientes da Vercel

- **Preview**: URL própria de Preview; Firebase de teste/emulador isolado quando disponível; Access Token de credenciais de teste da aplicação vendedora; e-mail de conta compradora de teste se o fluxo exigir; segredo HMAC do webhook de teste. Credenciais de teste Mercado Pago podem ter prefixos diferentes por produto/conta, portanto escolha pelo ambiente no painel e não pelo prefixo.
- **Production**: URL oficial HTTPS; Firebase de produção; Access Token de produção da aplicação; sem `MERCADOPAGO_TEST_PAYER_EMAIL`; segredo HMAC configurado para o webhook de produção.
- Configure os escopos Preview e Production separadamente. Variáveis `NEXT_PUBLIC_*` são incorporadas ao build do frontend, então faça novo deploy após alterar valores.

O projeto Firebase precisa ter E-mail/senha e Google habilitados em Authentication. Publique `firestore.rules` e índices do repositório no projeto correto após validar as regras. A conta de serviço do Firebase deve ter as permissões necessárias para Authentication e Firestore.

## Testes e verificações locais

```bash
npm run typecheck
npm run lint
npm test
npm run test:rules
npm run build
```

`npm run test:rules` inicializa o emulador Firestore; requer Java e download dos binários do Firebase Emulator na primeira execução. Testes locais não criam cobranças reais nem substituem uma validação manual com conta de teste.

## Integrações oficiais

- [Documentação de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)
- [Referência da API de Assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview)
- [Documentação de contas de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/test-accounts)
- [Firebase Admin SDK para Node.js](https://firebase.google.com/docs/admin/setup)

O processo completo de preparação do app e da landing está em [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md).
