# Configuração do Mercado Pago

O aplicativo cria assinaturas a partir do backend em `POST /api/billing/checkout`, com preço definido em `src/lib/planos.ts`. O Mercado Pago hospeda o checkout; o app não confia no retorno do navegador para conceder Premium.

## Variáveis na Netlify

No projeto Netlify `prov-financeiro`, configure Deploy Preview e Production separadamente:

| Variável | Deploy Preview | Production |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Credencial de teste do vendedor de teste | Credencial real da aplicação |
| `MERCADOPAGO_WEBHOOK_SECRET` | Segredo HMAC do webhook de teste | Segredo HMAC do webhook de produção |
| `NEXT_PUBLIC_APP_URL` | URL do Deploy Preview configurado | `https://prov-financeiro.netlify.app` |
| `MERCADOPAGO_TEST_PAYER_EMAIL` | E-mail do comprador de teste (opcional) | Não configurar |

O backend também exige no ambiente de produção Firebase `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL` e `FIREBASE_ADMIN_PRIVATE_KEY`. Nunca coloque tokens, chaves privadas ou segredo HMAC em `NEXT_PUBLIC_*`, no GitHub ou na landing.

Depois de alterar variáveis, faça um novo deployment desse ambiente.

## Webhook

Configure a URL pública do ambiente correspondente:

```text
Deploy Preview: https://<url-do-deploy-preview>/api/webhooks/mercadopago
Production:     https://prov-financeiro.netlify.app/api/webhooks/mercadopago
```

Ative os eventos `subscription_preapproval` e `subscription_authorized_payment`. Copie o segredo de assinatura HMAC exibido para aquele webhook e salve no escopo correspondente de `MERCADOPAGO_WEBHOOK_SECRET`. O endpoint rejeita assinaturas inválidas e consulta o estado atual da assinatura e da última fatura à API do Mercado Pago.

Premium só é concedido quando o contrato remoto está `authorized`, corresponde ao usuário/plano/valor cadastrados e a fatura recorrente mais recente tem `payment.status=approved`. Sem fatura aprovada, com cobrança pendente/recusada, contrato pausado/cancelado ou consulta inconsistente, o acesso fica Free.

## Firestore

As alterações de assinatura são feitas no servidor com Firebase Admin SDK. O app web pode ler o documento próprio de status, mas não pode criar ou alterar a assinatura nem consultar dados de outro usuário pelas regras.

Antes de publicar regras, confirme o projeto Firebase alvo. Como o alias padrão local é o emulador `demo-prov-financeiro`, use `firebase deploy --only firestore:rules --project <ID_DO_PROJETO>` somente quando quiser publicar no projeto escolhido.

## Planos

- Novas contratações na campanha Black Friday: mensal por R$ 9,90 a cada mês; anual por R$ 94,80 a cada 12 meses (equivalente a R$ 7,90 por mês).
- Contratos anteriores continuam validados pelos valores originais (R$ 11,99/mês ou R$ 119,88/ano). A alteração do preço no app não muda cobranças recorrentes já criadas no Mercado Pago.

Os valores e recursos centralizados estão em `src/lib/planos.ts`. A landing consulta `GET /api/billing/plans`; não mantenha um segundo catálogo de valores.
