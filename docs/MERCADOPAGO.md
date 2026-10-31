# Configuração do Mercado Pago

O fluxo de assinatura usa a API de Assinaturas do Mercado Pago. O app autentica o usuário com Firebase, cria o checkout no servidor e só considera o status recebido após consultar novamente a API do Mercado Pago por um webhook assinado.

## Variáveis no Vercel

No projeto Vercel `prov-financeiro`, em **Settings → Environment Variables**, configure as variáveis de produção:

| Variável | Tipo | Valor |
| --- | --- | --- |
| `MERCADOPAGO_ACCESS_TOKEN` | Secreta | O Access Token de produção já está cadastrado no Vercel |
| `MERCADOPAGO_WEBHOOK_SECRET` | Secreta | Assinatura secreta exibida na configuração de Webhooks do Mercado Pago |
| `FIREBASE_ADMIN_PROJECT_ID` | Servidor | `provfinance-33283` |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Servidor | E-mail da conta de serviço Firebase/GCP |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Secreta | Chave privada PEM dessa conta de serviço; mantenha as quebras de linha ou use `\n` |
| `NEXT_PUBLIC_APP_URL` | Pública | `https://prov-financeiro.vercel.app` |

As três variáveis Firebase Admin e as duas variáveis Mercado Pago nunca devem começar com `NEXT_PUBLIC_`. Não envie os valores secretos por chat, GitHub ou arquivos versionados. Para Firebase Admin, use uma conta de serviço dedicada, com o menor conjunto de permissões necessário para validar tokens e atualizar os documentos de assinatura no Firestore. Para testar em Preview, configure credenciais de teste separadas e também os parâmetros públicos do Firebase nesse ambiente; não reutilize as chaves de produção sem decidir que o Preview usará o projeto de produção.

Depois de alterar variáveis, gere um novo deployment do app.

## Webhook no Mercado Pago

No painel de desenvolvedores, abra a aplicação que possui o Access Token e configure a URL:

```text
https://prov-financeiro.vercel.app/api/billing/mercadopago/webhook
```

Para esta integração sem plano associado, ative os eventos **Vinculação de uma assinatura (`subscription_preapproval`)**, **Pagamento recorrente de uma assinatura (`subscription_authorized_payment`)** e **Pagamentos (`payment`)**. O endpoint consulta a API do Mercado Pago para resolver a assinatura e grava seu status no Firestore somente depois de validar a assinatura HMAC (`x-signature`).

Configure primeiro o ambiente de teste e depois a produção. No Vercel, mantenha valores separados: `MERCADOPAGO_ACCESS_TOKEN` de teste apenas em **Preview** e o token de produção apenas em **Production**. Faça o mesmo para `MERCADOPAGO_WEBHOOK_SECRET`. Para que os retornos e notificações do Preview apontem para o deployment de teste, configure `NEXT_PUBLIC_APP_URL` com a URL estável da branch nesse ambiente. O Preview também precisa das configurações Firebase e das credenciais Firebase Admin necessárias ao servidor; não rode testes de checkout até essas variáveis estarem configuradas.

## Firestore

Publique as regras atualizadas de `firestore.rules` no projeto Firebase `provfinance-33283`. O usuário pode ler o próprio documento `users/{uid}/assinatura/status`, mas não pode gravá-lo pelo SDK web; as atualizações vêm do backend com Firebase Admin.

Com Firebase CLI instalado e autenticado, no diretório do app:

```sh
firebase use provfinance-33283
firebase deploy --only firestore:rules
```

Também é possível colar o conteúdo de `firestore.rules` na aba **Firestore Database → Regras** e publicar pelo console Firebase.

## Valores dos planos

O valor é definido no servidor em `src/lib/mercadopago.ts` e não é aceito do navegador. O plano mensal cobra R$ 11,99 a cada mês; o anual cobra R$ 119,88 a cada 12 meses. Se os preços da landing forem alterados, atualize esse mapa e `prov-landing/lib/landing-config.ts` juntos.

O retorno do checkout não concede acesso por si só. A assinatura só é marcada `authorized` quando o backend recebe um webhook válido e confirma o estado atual na API do Mercado Pago.
