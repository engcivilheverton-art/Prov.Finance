# PROV. — checklist de publicação independente

> Use esta lista depois de revisar os arquivos. Nenhuma alteração na Vercel/Firebase/Mercado Pago e nenhum deploy foi executado por este trabalho.

## 1. Repositórios e projetos Vercel

- [ ] Manter `prov-financeiro` e `prov-landing` como repositórios distintos.
- [ ] Criar/importar um projeto Vercel para cada repositório.
- [ ] Conferir que cada projeto usa a raiz do repositório correta e instala com `npm ci`.
- [ ] Definir domínio/URLs finais e o `NEXT_PUBLIC_APP_URL` em cada ambiente da landing.
- [ ] Garantir que `GET https://<app>/api/billing/plans` seja acessível a partir do servidor da landing. Proteção SSO de Preview pode impedir essa consulta.

## 2. Firebase do app

- [ ] Ativar E-mail/senha e Google em Firebase Authentication.
- [ ] Confirmar que a configuração pública Firebase (`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`) é do projeto correspondente ao ambiente.
- [ ] Configurar a conta de serviço privada do backend (`FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`) com permissões necessárias de Authentication e Firestore.
- [ ] Manter `NEXT_PUBLIC_USE_EMULATORS=true` apenas localmente; na Vercel usar `false` ou deixar sem valor.
- [ ] Validar e publicar `firestore.rules` e `firestore.indexes.json` no projeto correto após os testes.
- [ ] Não apagar nem migrar destrutivamente coleções/dados de usuários existentes. Ausência de documento de assinatura significa Free.

## 3. Mercado Pago — Preview

- [ ] Usar credenciais de teste da aplicação do vendedor de teste no ambiente Preview. Confirme que o painel está na aba **Teste**; não deduza o ambiente somente pelo prefixo do token.
- [ ] Configure em **Preview** do projeto `prov-financeiro`: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL` e, se necessário, `MERCADOPAGO_TEST_PAYER_EMAIL` com a conta compradora de teste.
- [ ] Não configure o e-mail de teste em Production.
- [ ] Configure a notificação para `https://<preview-publico>/api/webhooks/mercadopago` e ative `subscription_preapproval` e `subscription_authorized_payment`.
- [ ] Copie o segredo HMAC correspondente ao endpoint/ambiente para `MERCADOPAGO_WEBHOOK_SECRET` do Preview.
- [ ] Se a proteção Preview bloquear o Mercado Pago, use uma URL Preview publicamente acessível ou outra forma de expor o endpoint; não compartilhe bypass tokens.

## 4. Mercado Pago — Production

- [ ] Ativar as credenciais de produção e confirmar conta, aplicação, URL e dados comerciais antes da troca.
- [ ] Configure em **Production** do app: Access Token real, segredo HMAC de produção, Firebase de produção e `NEXT_PUBLIC_APP_URL` HTTPS oficial.
- [ ] Não usar comprador de teste, e-mail de teste, credenciais de Preview ou segredo de webhook de Preview em Production.
- [ ] Cadastrar webhook separado em `https://<dominio-oficial>/api/webhooks/mercadopago`, com `subscription_preapproval` e `subscription_authorized_payment`.
- [ ] Definir a mesma URL oficial no `NEXT_PUBLIC_APP_URL` do app e no `NEXT_PUBLIC_APP_URL` da landing.

## 5. Variáveis da landing

- [ ] Em Preview: `NEXT_PUBLIC_SITE_URL` aponta à landing Preview e `NEXT_PUBLIC_APP_URL` aponta ao app Preview.
- [ ] Em Production: `NEXT_PUBLIC_SITE_URL` aponta ao domínio público da landing e `NEXT_PUBLIC_APP_URL` aponta ao app oficial.
- [ ] Configurar `NEXT_PUBLIC_CONTACT_EMAIL` somente se quiser exibir contato no rodapé.
- [ ] Não adicionar tokens/segredos Firebase ou Mercado Pago à landing.

## 6. Validação antes de promover

- [ ] Rodar `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:rules` e `npm run build` no app.
- [ ] Rodar `npm ci`, `npm run typecheck`, `npm run lint` e `npm run build` na landing.
- [ ] Criar conta Free por e-mail e por Google; confirmar redirecionamento ao painel sem checkout.
- [ ] Confirmar que conta antiga sem `users/{uid}/assinatura/status` continua Free e mantém os dados.
- [ ] Testar CTA mensal (R$ 11,99) e anual (R$ 119,88 a cada 12 meses); autenticar antes do checkout e confirmar que o preço vem do backend.
- [ ] Abandonar checkout e confirmar que não há Premium.
- [ ] Testar webhook HMAC inválido, duplicado e evento repetido; confirmar que não libera acesso sem consulta válida à assinatura.
- [ ] Confirmar status remoto pendente, autorizado, pausado e cancelado no app; validar cancelamento pelo app e no Mercado Pago.
- [ ] Confirmar que só há acesso Premium quando o contrato está autorizado e a fatura recorrente mais recente tem `payment.status=approved`; ausência, pendência e recusa mantêm Free.
- [ ] Testar uma fatura recorrente aprovada e recusada com conta/cartão de teste e observar o estado reportado pelo Mercado Pago.
- [ ] Confirmar que usuário Free pode criar/editar cartão e fatura manualmente; CSV deve ser negado no servidor.
- [ ] Confirmar que usuário não consegue escrever/alterar assinatura ou acessar dados de outro UID pelas regras do Firestore.
- [ ] Confirmar que a seção Planos da landing recebe preços/benefícios de `/api/billing/plans` e que CTAs chegam às rotas correspondentes do app.
- [ ] Fazer redeploy Preview depois de mudar variáveis; verificar autenticação, checkout e notificações antes de promover.

## 7. Publicação

- [ ] Revisar logs Vercel sem valores de token, chave privada ou dados pessoais.
- [ ] Confirmar domínio, páginas legais, URLs de retorno e política de privacidade/termos finais.
- [ ] Promover Production somente após aprovação explícita do responsável pelo PROV.
- [ ] Fazer uma compra real controlada depois da publicação e verificar webhook, assinatura remota e acesso no app.

## Referências

- [Mercado Pago — Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview)
- [Mercado Pago — API de Assinaturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview)
- [Mercado Pago — Webhooks de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks)
- [Firebase — Admin SDK](https://firebase.google.com/docs/admin/setup)
