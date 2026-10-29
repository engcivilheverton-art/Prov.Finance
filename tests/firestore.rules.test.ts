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

const perfilOk = { nome: 'Heverton', anoIni: 2026, mesIni: 1, anoFim: 2027, mesFim: 12 };

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
    const db = env.authenticatedContext('ana').firestore();
    await assertSucceeds(setDoc(doc(db, 'users/ana/cartoes/c1'), { nome: 'Nubank' }));
    await assertSucceeds(getDoc(doc(db, 'users/ana/cartoes/c1')));
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
