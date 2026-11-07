import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteField, doc, getDoc, setDoc } from 'firebase/firestore';

/** Roda com `npm run test:rules` (emulador do Firestore). Exige o trecho de regras aplicado em firestore.rules. */
let env: RulesTestEnvironment;

const pctOk = { fixas: 35, cartaoDividas: 25, dizimo: 10, lazer: 10, investimento: 20 };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-prov-financeiro',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => { await env.clearFirestore(); });
afterAll(async () => { await env.cleanup(); });

describe('caixinhas/config', () => {
  const ref = (uid: string) => doc(env.authenticatedContext(uid).firestore(), `users/${uid}/caixinhas/config`);

  it('o dono grava e lê percentuais válidos', async () => {
    await assertSucceeds(setDoc(ref('ana'), { pct: pctOk }));
    await assertSucceeds(getDoc(ref('ana')));
  });

  it('rejeita percentual fora de 0–100, texto, chave faltando e chave extra', async () => {
    await assertFails(setDoc(ref('ana'), { pct: { ...pctOk, lazer: 101 } }));
    await assertFails(setDoc(ref('ana'), { pct: { ...pctOk, lazer: -1 } }));
    await assertFails(setDoc(ref('ana'), { pct: { ...pctOk, lazer: '10' } }));
    await assertFails(setDoc(ref('ana'), { pct: { fixas: 50 } }));
    await assertFails(setDoc(ref('ana'), { pct: { ...pctOk, outra: 5 } }));
    await assertFails(setDoc(ref('ana'), { pct: pctOk, extra: true }));
  });

  it('só existe o documento "config" e só o dono acessa', async () => {
    const db = env.authenticatedContext('ana').firestore();
    await assertFails(setDoc(doc(db, 'users/ana/caixinhas/outro'), { pct: pctOk }));
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'users/ana/caixinhas/config'), { pct: pctOk }); });
    const outro = env.authenticatedContext('bia').firestore();
    await assertFails(getDoc(doc(outro, 'users/ana/caixinhas/config')));
    await assertFails(setDoc(doc(outro, 'users/ana/caixinhas/config'), { pct: pctOk }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/ana/caixinhas/config')));
  });
});

describe('caixinhasGastos/{AAAA-MM}', () => {
  const ref = (uid: string, ym: string) => doc(env.authenticatedContext(uid).firestore(), `users/${uid}/caixinhasGastos/${ym}`);

  it('o dono lança, atualiza e remove um valor sem apagar os demais', async () => {
    await assertSucceeds(setDoc(ref('ana', '2026-11'), { valores: { lazer: 120.5 } }, { merge: true }));
    await assertSucceeds(setDoc(ref('ana', '2026-11'), { valores: { dizimo: 300 } }, { merge: true }));
    await assertSucceeds(setDoc(ref('ana', '2026-11'), { valores: { lazer: deleteField() } }, { merge: true }));
    await assertSucceeds(getDoc(ref('ana', '2026-11')));
  });

  it('exige id AAAA-MM e rejeita valor negativo, texto, chave desconhecida e campo extra', async () => {
    await assertFails(setDoc(ref('ana', '2026-13'), { valores: { lazer: 10 } }));
    await assertFails(setDoc(ref('ana', 'novembro'), { valores: { lazer: 10 } }));
    await assertFails(setDoc(ref('ana', '2026-11'), { valores: { lazer: -10 } }));
    await assertFails(setDoc(ref('ana', '2026-11'), { valores: { lazer: '10' } }));
    await assertFails(setDoc(ref('ana', '2026-11'), { valores: { moradia: 10 } }));
    await assertFails(setDoc(ref('ana', '2026-11'), { valores: { lazer: 10 }, extra: 1 }));
  });

  it('outro usuário não lê nem grava', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'users/ana/caixinhasGastos/2026-11'), { valores: { lazer: 10 } }); });
    const dbBia = env.authenticatedContext('bia').firestore();
    await assertFails(getDoc(doc(dbBia, 'users/ana/caixinhasGastos/2026-11')));
    await assertFails(setDoc(doc(dbBia, 'users/ana/caixinhasGastos/2026-11'), { valores: { lazer: 99 } }));
  });
});
