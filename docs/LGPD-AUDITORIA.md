# Revisão técnica de privacidade do PROV

**Escopo:** revisão do código e dos arquivos de configuração deste repositório, em 16/11/2026. Não é parecer jurídico nem auditoria dos consoles Firebase, Netlify, Mercado Pago ou do repositório separado da landing page.

## Verificações feitas no código

- O Firestore organiza os dados em `users/{uid}/...`; as regras comparam o UID autenticado ao dono do caminho e negam por padrão os caminhos não cobertos. Os testes existentes incluem tentativas sem login e entre usuários diferentes.
- O backend verifica ID tokens Firebase com revogação antes de operações administrativas.
- A importação lê o arquivo no navegador, envia lançamentos ao endpoint autenticado e não persiste o arquivo bruto. Os logs da rota registram etapa, identificador de requisição e tipo de erro, sem conteúdo de lançamentos.
- O relatório para IA é preparado localmente e copiado para a área de transferência por ação do usuário; não foi encontrada chamada do app para um serviço de IA.
- O formulário de suporte monta um `mailto:`; o envio ocorre somente se a pessoa confirmar no próprio cliente de e-mail.
- Não foi encontrada integração com pixel publicitário ou SDK de analytics no código analisado. O app usa armazenamento local para preferências do tema e do gráfico Free, além da sessão do Firebase.
- A cobrança é processada pelo Mercado Pago. O app mantém o identificador e o estado da assinatura para conciliação; o checkout de pagamento é externo.

## Controles implementados nesta revisão

- Página pública `/privacidade`, com descrição dos dados, finalidades, fornecedores, direitos, relatório para IA, importação CSV, exclusão e canal de contato.
- Link para a política na tela de acesso, suporte e perfil.
- Endpoint autenticado `GET /api/privacy/export`, que exporta em JSON o documento do usuário e suas subcoleções recursivamente. A resposta é privada e não armazenável em cache.
- Endpoint `POST /api/privacy/delete-account`, que exige sessão autenticada nos últimos 10 minutos e confirmação digitando o e-mail da conta. Se existir assinatura Mercado Pago, confirma o vínculo e tenta cancelá-la antes de apagar a árvore de documentos do Firestore e a conta Firebase Authentication.
- Webhooks de assinatura deixam de gravar eventos quando a conta/contrato local já não existe, reduzindo a chance de recriar dados após a exclusão.
- Na tela Perfil, controles para baixar os dados e solicitar exclusão; a preferência local do gráfico também é removida no dispositivo durante a exclusão.
- Aviso no suporte para não enviar senhas, credenciais bancárias ou número completo de cartão.

## Itens externos que ainda precisam de confirmação do responsável

1. **Identificação do controlador:** inserir a razão social/nome legal e os dados de contato/endereço que devem constar publicamente. A página usa a marca PROV e o e-mail de suporte, mas a identificação empresarial precisa ser completada antes de divulgar como política final.
2. **Bases legais e retenção:** validar com assessoria jurídica a base aplicável por finalidade e os prazos de retenção, inclusive registros fiscais, logs e backups. A política descreve critérios gerais, não inventa prazos.
3. **Transferências e fornecedores:** conferir região efetiva do projeto Firestore, configurações de backup, contratos/DPA e mecanismo de transferência internacional aplicável a Firebase/Google, Netlify e Mercado Pago. A região não pode ser confirmada apenas pelo repositório.
4. **Produção Firebase:** confirmar que a versão atual de `firestore.rules` está publicada no projeto de produção e que autenticação, IAM e contas de serviço seguem menor privilégio. Os testes locais não provam a configuração ativa do console.
5. **Landing de vendas:** conferida no Netlify: a landing (`prov-landing.netlify.app`) aponta para o app (`prov-financeiro.netlify.app`). A rota de privacidade da landing agora oferece um resumo e encaminha para a política completa do app; o rodapé já aponta para ela. Os documentos da integração foram atualizados para Netlify e para o webhook real implementado em `/api/webhooks/mercadopago`. O repositório analisado não apresenta formulário de captação nem SDK de analytics. Os termos da landing ainda são provisórios e precisam ser concluídos antes de divulgação ampla.
6. **Pequeno porte e encarregado:** confirmar se a operação atende aos critérios regulatórios para eventual dispensa de encarregado. Mesmo quando dispensado, o canal para titulares precisa continuar disponível.
7. **Incidentes:** definir responsáveis e um procedimento operacional para avaliar e comunicar incidentes nos prazos aplicáveis da Resolução CD/ANPD nº 15/2024.
8. **Dependências:** `npm audit --omit=dev` encontrou 10 vulnerabilidades no app (1 baixa e 9 moderadas), concentradas em dependências transitivas do Firebase Admin (`uuid`, `google-gax`, `fast-xml-parser` e `node-forge`). Corrigi-las completamente pede atualização major do Firebase Admin e atualização correspondente do runtime; não apliquei essa mudança sem revisão de compatibilidade. A landing reportou zero vulnerabilidades de produção. A instalação completa da landing reportou 6 vulnerabilidades moderadas em dependências de desenvolvimento.
9. **Acesso Premium concedido por variável de ambiente:** o app mantém uma lista de e-mails em `PROV_PREMIUM_FREE_EMAILS`. A exclusão da conta remove os registros do app, mas não altera essa lista no Netlify; se um e-mail for removido da conta e não deva receber Premium ao se cadastrar novamente, o responsável deve removê-lo também dessa variável.

## Referências oficiais

- [Lei nº 13.709/2018 — texto atualizado](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html)
- [Direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares)
- [Resolução CD/ANPD nº 2/2022 — agentes de pequeno porte](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022)
- [Comunicação de incidente de segurança — ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
- [Transferência internacional — ANPD](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados)

## Resultado dos comandos de verificação

- `npm run typecheck`: passou.
- `npm run lint`: passou sem erros; um aviso já existente em `src/vendor/calculadora-trabalhador/ct-core.js` sobre parâmetro não usado.
- Testes unitários dos fluxos novos de privacidade e gravação do webhook: 9 passaram.
- `npm test`: 92 passaram e 3 falharam nos testes existentes de leitura/parcelamento CSV do Bradesco (`tests/unit/csv.test.ts` e `tests/unit/parcelamentos.test.ts`). Os arquivos de parser CSV não foram alterados nesta revisão.
- `npm run test:rules`: não executou porque o ambiente não tem Java no `PATH`, exigido pelo emulador Firestore.
- `npm run build`: passou; as rotas `/privacidade`, `/api/privacy/export` e `/api/privacy/delete-account` foram incluídas no build.
- Landing (`prov-landing`): `npm run typecheck`, `npm run lint` e `npm run build` passaram após instalar as dependências travadas no lockfile. O lint informou que `next lint` será removido no Next.js 16; não impediu a execução.
- `npm audit --omit=dev`: app encontrou 10 vulnerabilidades moderadas em dependências transitivas; landing encontrou zero vulnerabilidades de produção.
