import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

const perfilOk = { nome: 'Pessoa usuária', anoIni: 2026, mesIni: 1, anoFim: 2027, mesFim: 12 };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-prov-financeiro',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
});

afterAll(async () => {
  await env.cleanup();
});

describe('isolamento por usuário', () => {
  it('o dono lê e grava seus próprios dados', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ana/cartoes/c1'), { nome: 'Nubank' });
    });
    const db = env.authenticatedContext('ana').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/ana/cartoes/c1')));
    await assertSucceeds(setDoc(doc(db, 'users/ana/cartoes/c1'), { nome: 'Nubank atualizado' }));
    await assertFails(setDoc(doc(db, 'users/ana/cartoes/c2'), { nome: 'Novo cartão' }));
  });

  it('outro usuário não lê nem grava', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ana/cartoes/c1'), { nome: 'Nubank' });
    });
    const db = env.authenticatedContext('bia').firestore();
    await assertFails(getDoc(doc(db, 'users/ana/cartoes/c1')));
    await assertFails(setDoc(doc(db, 'users/ana/cartoes/c2'), { nome: 'X' }));
    await assertFails(deleteDoc(doc(db, 'users/ana/cartoes/c1')));
  });

  it('sem login não acessa nada', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/ana/cartoes/c1')));
    await assertFails(setDoc(doc(db, 'users/ana/cartoes/c1'), { nome: 'X' }));
  });

  it('coleções fora de users/ são negadas', async () => {
    const db = env.authenticatedContext('ana').firestore();
    await assertFails(setDoc(doc(db, 'publico/x'), { a: 1 }));
    await assertFails(setDoc(doc(db, 'users/ana/planLocks/cards'), { revision: 1 }));
    await assertFails(getDoc(doc(db, 'users/ana/planLocks/cards')));
  });
});

describe('validação do perfil', () => {
  const ref = (uid: string) => doc(env.authenticatedContext(uid).firestore(), `users/${uid}/perfil/dados`);

  it('aceita perfil válido, com ou sem idade', async () => {
    await assertSucceeds(setDoc(ref('ana'), perfilOk));
    await assertSucceeds(setDoc(ref('ana'), { ...perfilOk, idade: 34 }));
  });

  it('rejeita nome vazio, idade inválida e campos desconhecidos', async () => {
    await assertFails(setDoc(ref('ana'), { ...perfilOk, nome: '' }));
    await assertFails(setDoc(ref('ana'), { ...perfilOk, idade: -1 }));
    await assertFails(setDoc(ref('ana'), { ...perfilOk, idade: 200 }));
    await assertFails(setDoc(ref('ana'), { ...perfilOk, admin: true }));
  });

  it('rejeita período invertido ou fora de 2022–2030', async () => {
    await assertFails(setDoc(ref('ana'), { ...perfilOk, anoIni: 2028, anoFim: 2027 }));
    await assertFails(setDoc(ref('ana'), { ...perfilOk, anoIni: 2021 }));
    await assertFails(setDoc(ref('ana'), { ...perfilOk, mesIni: 13 }));
  });

  it('só aceita o documento "dados"', async () => {
    const db = env.authenticatedContext('ana').firestore();
    await assertFails(setDoc(doc(db, 'users/ana/perfil/outro'), perfilOk));
  });
});

describe('subcoleções do módulo de cartões e contas fixas', () => {
  const caminhoItem = 'users/ana/cartoes/c1/faturas/2026-11/itens/abc-1';

  it('usuário Free grava faturas manuais, mas não pode gravar CSV diretamente', async () => {
    const db = env.authenticatedContext('ana').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/ana/cartoes/c1/faturas/2026-11'), { valor: 10, status: 'Pendente', origem: 'manual' }));
    await assertFails(setDoc(doc(db, 'users/ana/cartoes/c1/faturas/2026-12'), { valor: 10, status: 'Pendente', origem: 'csv' }));
    await assertFails(setDoc(doc(db, caminhoItem), { data: '06/10', descricao: 'LOJA', valor: 10 }));
    await assertSucceeds(setDoc(doc(db, 'users/ana/fixasPagas/2026-11'), { pagas: { x1: true } }, { merge: true }));
    await assertSucceeds(getDoc(doc(db, caminhoItem)));
  });

  it('nem mesmo o cliente Premium grava diretamente dados CSV ou altera assinatura', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ana/assinatura/status'), { status: 'authorized', plan: 'mensal' });
    });
    const db = env.authenticatedContext('ana').firestore();
    await assertSucceeds(getDoc(doc(db, 'users/ana/assinatura/status')));
    await assertFails(setDoc(doc(db, 'users/ana/cartoes/c1/faturas/2026-11'), { valor: 10, status: 'Pendente', origem: 'csv' }));
    await assertFails(setDoc(doc(db, caminhoItem), { data: '06/10', descricao: 'LOJA', valor: 10 }));
    await assertFails(setDoc(doc(db, 'users/ana/assinatura/status'), { status: 'authorized', plan: 'anual' }));
    await assertFails(setDoc(doc(db, 'users/ana/assinatura/eventos/fake'), { status: 'authorized' }));
    await assertFails(getDoc(doc(db, 'users/ana/assinatura/eventos/fake')));
  });

  it('outro usuário não lê nem grava lançamentos alheios', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), caminhoItem), { data: '06/10', descricao: 'LOJA', valor: 10 });
    });
    const db = env.authenticatedContext('bia').firestore();
    await assertFails(getDoc(doc(db, caminhoItem)));
    await assertFails(setDoc(doc(db, caminhoItem), { valor: 1 }));
    await assertFails(deleteDoc(doc(db, caminhoItem)));
  });

  it('criações limitadas passam pelo backend; renda continua disponível diretamente', async () => {
    const ana = env.authenticatedContext('ana').firestore();
    const bia = env.authenticatedContext('bia').firestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/ana/dividas/d1'), { nome: 'Empréstimo', parcelas: [] });
    });
    await assertFails(setDoc(doc(ana, 'users/ana/dividas/d2'), { nome: 'Outra dívida', parcelas: [] }));
    await assertFails(setDoc(doc(ana, 'users/ana/fixas/x1'), { nome: 'Conta fixa', valor: 10 }));
    await assertSucceeds(setDoc(doc(ana, 'users/ana/dividas/d1'), { nome: 'Empréstimo atualizado', parcelas: [] }));
    await assertSucceeds(setDoc(doc(ana, 'users/ana/rendas/r1'), { nome: 'Salário', valor: 1 }));
    await assertFails(getDoc(doc(bia, 'users/ana/dividas/d1')));
    await assertFails(getDoc(doc(bia, 'users/ana/rendas/r1')));
  });
});
