'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  CATEGORIAS_PADRAO, ID_META_SEMENTE, LIMITES_CATEGORIAS, categoriaDoItem, chaveBase, idCategoriaPadrao, idRegraCategoria,
  validarChaveRegra, validarNomeCategoria, validarPalavrasCategoria,
  type CategoriaComId, type CategoriaUsuario, type RegraCategoria,
} from '@/lib/categorias';

type EstadoCategorias = {
  uid: string | null; categorias: CategoriaComId[]; regras: RegraCategoria[];
  categoriasProntas: boolean; regrasProntas: boolean; semeado: boolean; erro: string | null;
};
const estadoVazio = (uid: string | null): EstadoCategorias => ({ uid, categorias: [], regras: [], categoriasProntas: false, regrasProntas: false, semeado: false, erro: null });

/** Um listener por coleção e um marcador estável para semear os padrões somente na primeira visita. */
export function useCategorias(uid: string | undefined) {
  const [estado, setEstado] = useState<EstadoCategorias>(() => estadoVazio(null));
  const tentandoSemear = useRef(new Set<string>());
  const caminho = uid ? `users/${uid}` : null;

  useEffect(() => {
    if (!uid || !caminho) return;
    const atualizar = (fn: (current: EstadoCategorias) => EstadoCategorias) => setEstado((current) => fn(current.uid === uid ? current : estadoVazio(uid)));
    const stopCats = onSnapshot(collection(db, caminho, 'categorias'), (snap) => {
      const categorias = snap.docs.filter((d) => d.id !== ID_META_SEMENTE).map((d) => ({ id: d.id, ...(d.data() as CategoriaUsuario) }));
      const meta = snap.docs.find((d) => d.id === ID_META_SEMENTE);
      atualizar((s) => ({ ...s, uid, categorias, categoriasProntas: true, semeado: meta?.data().semeado === true, erro: null }));
    }, () => atualizar((s) => ({ ...s, uid, categoriasProntas: true, erro: 'Não foi possível carregar as categorias.' })));
    const stopRules = onSnapshot(collection(db, caminho, 'regrasCategoria'), (snap) => {
      const regras = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RegraCategoria, 'id'>) }));
      atualizar((s) => ({ ...s, uid, regras, regrasProntas: true, erro: null }));
    }, () => atualizar((s) => ({ ...s, uid, regrasProntas: true, erro: 'Não foi possível carregar as regras de categoria.' })));
    return () => { stopCats(); stopRules(); };
  }, [uid, caminho]);

  const visivel = estado.uid === uid ? estado : estadoVazio(uid ?? null);
  const categorias = visivel.categorias;
  const regras = visivel.regras;
  const pronto = visivel.categoriasProntas && visivel.regrasProntas;
  const erro = visivel.erro;

  useEffect(() => {
    if (!uid || !pronto || visivel.semeado || erro || categorias.length || tentandoSemear.current.has(uid)) return;
    tentandoSemear.current.add(uid);
    const batch = writeBatch(db);
    for (const categoria of CATEGORIAS_PADRAO) {
      const id = idCategoriaPadrao(categoria.nome);
      batch.set(doc(db, `users/${uid}/categorias/${id}`), categoria);
    }
    batch.set(doc(db, `users/${uid}/categorias/${ID_META_SEMENTE}`), { semeado: true });
    void batch.commit().catch(() => {
      tentandoSemear.current.delete(uid);
      setEstado((current) => current.uid === uid ? { ...current, erro: 'Não foi possível preparar as categorias iniciais. Tente atualizar a página.' } : current);
    });
  }, [uid, pronto, visivel.semeado, erro, categorias.length]);

  const categoriaDe = useCallback((descricao: string) => {
    return categoriaDoItem(descricao, categorias, regras);
  }, [categorias, regras]);

  const adicionarCategoria = useCallback(async (nome: string) => {
    if (!uid) throw new Error('Entre na sua conta para editar categorias.');
    if (categorias.length >= LIMITES_CATEGORIAS.categorias) throw new Error(`Você pode ter até ${LIMITES_CATEGORIAS.categorias} categorias.`);
    const erroNome = validarNomeCategoria(nome, categorias);
    if (erroNome) throw new Error(erroNome);
    await setDoc(doc(db, `users/${uid}/categorias/${crypto.randomUUID()}`), {
      nome: nome.trim().replace(/\s+/g, ' '), palavras: [], ordem: categorias.reduce((max, c) => Math.max(max, c.ordem), -1) + 1,
    } satisfies CategoriaUsuario);
  }, [uid, categorias]);

  const salvarPalavras = useCallback(async (categoria: CategoriaComId, raw: string) => {
    if (!uid) throw new Error('Entre na sua conta para editar categorias.');
    const palavras = [...new Set(raw.split(',').map((p) => p.trim()).filter(Boolean))];
    const erroPalavras = validarPalavrasCategoria(palavras);
    if (erroPalavras) throw new Error(erroPalavras);
    await setDoc(doc(db, `users/${uid}/categorias/${categoria.id}`), { nome: categoria.nome, ordem: categoria.ordem, palavras });
  }, [uid]);

  const definirRegra = useCallback(async (descricao: string, categoriaId: string | null) => {
    if (!uid) throw new Error('Entre na sua conta para editar categorias.');
    const chave = chaveBase(descricao);
    if (!categoriaId) {
      const id = await idRegraCategoria(chave);
      await deleteDoc(doc(db, `users/${uid}/regrasCategoria/${id}`));
      return;
    }
    const erroChave = validarChaveRegra(chave);
    if (erroChave) throw new Error(erroChave);
    if (!categorias.some((categoria) => categoria.id === categoriaId)) throw new Error('Escolha uma categoria válida.');
    const id = await idRegraCategoria(chave);
    if (!regras.some((regra) => regra.id === id) && regras.length >= LIMITES_CATEGORIAS.regras) throw new Error(`Você pode ter até ${LIMITES_CATEGORIAS.regras} regras de estabelecimento.`);
    await setDoc(doc(db, `users/${uid}/regrasCategoria/${id}`), { chave, categoriaId } satisfies Omit<RegraCategoria, 'id'>);
  }, [uid, categorias, regras]);

  const removerRegra = useCallback(async (regraId: string) => {
    if (!uid) throw new Error('Entre na sua conta para editar categorias.');
    await deleteDoc(doc(db, `users/${uid}/regrasCategoria/${regraId}`));
  }, [uid]);

  const removerCategoria = useCallback(async (categoriaId: string) => {
    if (!uid) throw new Error('Entre na sua conta para editar categorias.');
    const ligadas = regras.filter((regra) => regra.categoriaId === categoriaId);
    for (let inicio = 0; inicio < ligadas.length; inicio += 499) {
      const batch = writeBatch(db);
      for (const regra of ligadas.slice(inicio, inicio + 499)) batch.delete(doc(db, `users/${uid}/regrasCategoria/${regra.id}`));
      if (inicio + 499 >= ligadas.length) batch.delete(doc(db, `users/${uid}/categorias/${categoriaId}`));
      await batch.commit();
    }
    if (!ligadas.length) await deleteDoc(doc(db, `users/${uid}/categorias/${categoriaId}`));
  }, [uid, regras]);

  const carregando = !!uid && (!pronto || !visivel.semeado && categorias.length === 0);
  const regrasOrdenadas = useMemo(() => [...regras].sort((a, b) => a.chave.localeCompare(b.chave)), [regras]);
  return { categorias, regras: regrasOrdenadas, carregando, erro, categoriaDe, adicionarCategoria, salvarPalavras, definirRegra, removerRegra, removerCategoria };
}
