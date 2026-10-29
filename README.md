# PROV · Planejador Financeiro

Next.js (App Router) + TypeScript, Firebase Authentication (Google e e-mail/senha), Cloud Firestore e Firebase Emulator Suite.

## Rodando localmente (com emuladores, sem conta Firebase)

Requisitos: Node 20+ e Java 11+ (os emuladores do Firestore rodam em Java).

```bash
npm install
cp .env.example .env.local      # já vem com NEXT_PUBLIC_USE_EMULATORS=true
npm run emulators               # terminal 1 — Auth :9099, Firestore :8080, UI :4000
npm run dev:emu                 # terminal 2 — app em http://localhost:3000
```

No emulador o login com Google abre uma janela de simulação: não precisa de credenciais reais.

## Testes

```bash
npm run test:rules   # regras de segurança do Firestore, contra o emulador
npm run typecheck
npm run lint
```

## Estrutura

- `src/app/login` — entrar / criar conta (Google e e-mail/senha)
- `src/app/(app)` — área autenticada (menu lateral no desktop, barra inferior no celular)
- `src/lib/firebase.ts` — inicialização, conecta aos emuladores quando `NEXT_PUBLIC_USE_EMULATORS=true`
- `src/types/finance.ts` — modelo de dados (`users/{uid}/...`)
- `firestore.rules` — cada usuário só acessa `users/{seuUid}/**`; o perfil é validado

## Produção

1. No console do Firebase, crie um app web e ative os provedores **E-mail/senha** e **Google** em Authentication.
2. Preencha `.env.local` com as chaves do app e use `NEXT_PUBLIC_USE_EMULATORS=false`.
3. Publique as regras: `npx firebase deploy --only firestore:rules`.

## Etapas

1. Base do projeto, autenticação e perfil (concluída)
2. Cartões e faturas, importação de CSV
3. Dívidas, rendas, contas fixas
4. Dashboard e gráficos, caixinhas, investimentos
5. Migração dos dados do backup JSON atual
