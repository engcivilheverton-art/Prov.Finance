'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/Modal';
import { PremiumBadge } from '@/components/PremiumBadge';
import { SEM_CATEGORIA, type CategoriaComId, type RegraCategoria } from '@/lib/categorias';
import type { ItemFatura } from '@/types/finance';

export function SeletorCategoria({
  item, categoria, categorias, premium, onChange, onUpgrade,
}: {
  item: ItemFatura; categoria: string; categorias: CategoriaComId[]; premium: boolean;
  onChange: (categoriaId: string | null) => void; onUpgrade: () => void;
}) {
  if (item.valor <= 0 || item.ignorado || item.programado) return null;
  const selecionada = categorias.find((c) => c.nome === categoria)?.id ?? '';
  return (
    <span className="categoria-seletor">
      <select className={`filtro categoria-select ${categoria === SEM_CATEGORIA ? 'categoria-sem' : ''}`} aria-label={`Categoria do lançamento ${item.descricao}`} value={selecionada}
        onChange={(event) => premium ? onChange(event.target.value || null) : onUpgrade()}>
        <option value="">Sem categoria</option>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      {!premium && <button type="button" className="categoria-cadeado" onClick={onUpgrade} aria-label="Editar categorias é exclusivo do Premium"><PremiumBadge /></button>}
    </span>
  );
}

export function ResumoCategorias({
  itens, categoriaDe,
}: { itens: ItemFatura[]; categoriaDe: (descricao: string) => string }) {
  const totais = useMemo(() => {
    const valores = new Map<string, number>();
    for (const item of itens) {
      if (item.programado || item.ignorado || item.valor <= 0) continue;
      const nome = categoriaDe(item.descricao);
      valores.set(nome, (valores.get(nome) ?? 0) + item.valor);
    }
    return [...valores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [itens, categoriaDe]);
  const total = totais.reduce((sum, [, valor]) => sum + valor, 0);
  const maior = Math.max(0, ...totais.map(([, valor]) => valor));
  if (!totais.length) return null;
  return (
    <section className="categoria-resumo" aria-label="Gastos por categoria">
      <h3>Gastos por categoria</h3>
      {totais.map(([nome, valor]) => {
        const pct = total > 0 ? Math.round(valor / total * 100) : 0;
        const largura = maior > 0 ? Math.max(2, valor / maior * 100) : 0;
        return <div className="categoria-resumo-linha" key={nome}>
          <span className="categoria-resumo-nome">{nome}</span>
          <span className="categoria-resumo-trilho" aria-hidden="true"><i className={nome === SEM_CATEGORIA ? 'categoria-resumo-sem' : ''} style={{ width: `${largura}%` }} /></span>
          <span className="categoria-resumo-valor">R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · {pct}%</span>
        </div>;
      })}
    </section>
  );
}

function CampoPalavras({ categoria, onSalvar, disabled }: { categoria: CategoriaComId; onSalvar: (valor: string) => Promise<void>; disabled: boolean }) {
  const [valor, setValor] = useState(categoria.palavras.join(', '));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  async function salvar() {
    setSalvando(true); setErro('');
    try { await onSalvar(valor); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar as palavras-chave.'); }
    finally { setSalvando(false); }
  }
  return <div className="categoria-editor-palavras">
    <label className="sr-only" htmlFor={`palavras-${categoria.id}`}>Palavras-chave de {categoria.nome}, separadas por vírgula</label>
    <input id={`palavras-${categoria.id}`} value={valor} disabled={disabled || salvando} maxLength={LIMITES_UI.palavra * LIMITES_UI.palavras}
      placeholder="Palavras-chave separadas por vírgula" onChange={(e) => setValor(e.target.value)} />
    <button type="button" className="btn btn-sec btn-mini" disabled={disabled || salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar'}</button>
    {erro && <span className="aviso aviso-erro" role="alert">{erro}</span>}
  </div>;
}

const LIMITES_UI = { palavra: 40, palavras: 100 };

export function GerenciadorCategorias({
  aberto, onFechar, categorias, regras, premium, onAdicionar, onSalvarPalavras, onRemoverCategoria, onDefinirRegra, onRemoverRegra,
}: {
  aberto: boolean; onFechar: () => void; categorias: CategoriaComId[]; regras: RegraCategoria[]; premium: boolean;
  onAdicionar: (nome: string) => Promise<void>; onSalvarPalavras: (categoria: CategoriaComId, palavras: string) => Promise<void>;
  onRemoverCategoria: (id: string) => Promise<void>; onDefinirRegra: (chave: string, categoriaId: string | null) => Promise<void>; onRemoverRegra: (id: string) => Promise<void>;
}) {
  const [novoNome, setNovoNome] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const contagem = useMemo(() => regras.reduce<Record<string, number>>((out, regra) => ({ ...out, [regra.categoriaId]: (out[regra.categoriaId] ?? 0) + 1 }), {}), [regras]);

  async function adicionar() {
    setErro('');
    try { await onAdicionar(novoNome); setNovoNome(''); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível adicionar a categoria.'); }
  }
  async function removerCategoria(categoria: CategoriaComId) {
    const quantidade = contagem[categoria.id] ?? 0;
    const complemento = quantidade ? `\n\n${quantidade} regra(s) de estabelecimento também será(ão) removida(s). Os lançamentos voltam a “Sem categoria”.` : '\n\nOs lançamentos voltarão a “Sem categoria”.';
    if (!window.confirm(`Remover a categoria “${categoria.nome}”?${complemento}`)) return;
    setSalvando(true); setErro('');
    try { await onRemoverCategoria(categoria.id); }
    catch { setErro('Não foi possível remover a categoria. Tente novamente.'); }
    finally { setSalvando(false); }
  }
  async function mudarRegra(chave: string, categoriaId: string | null) {
    setErro('');
    try { await onDefinirRegra(chave, categoriaId); }
    catch { setErro('Não foi possível atualizar a regra.'); }
  }

  return <Modal aberto={aberto} titulo="Categorias dos lançamentos" onFechar={onFechar}>
    <div className="pilha gerenciador-categorias">
      <p className="suave pequeno">As palavras-chave classificam os lançamentos do CSV sem diferenciar acentos ou maiúsculas. Separe as palavras por vírgula. As regras de estabelecimento têm prioridade.</p>
      {!premium && <div className="aviso aviso-info">A edição de categorias é exclusiva do Premium. <PremiumBadge /></div>}
      {categorias.map((categoria) => <section className="gerenciador-categoria" key={`${categoria.id}:${categoria.palavras.join('\u001f')}`}>
        <div className="gerenciador-categoria-cab"><strong>{categoria.nome}</strong><span className="suave pequeno">{contagem[categoria.id] ?? 0} regra(s)</span>
          <button type="button" className="btn btn-perigo btn-mini" disabled={!premium || salvando} onClick={() => void removerCategoria(categoria)}>Remover</button>
        </div>
        <CampoPalavras categoria={categoria} disabled={!premium || salvando} onSalvar={(valor) => onSalvarPalavras(categoria, valor)} />
      </section>)}
      <div className="acoes gerenciador-adicionar">
        <label className="sr-only" htmlFor="nova-categoria">Nova categoria</label>
        <input id="nova-categoria" value={novoNome} maxLength={30} placeholder="Nova categoria" disabled={!premium || salvando} onChange={(e) => setNovoNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void adicionar(); } }} />
        <button type="button" className="btn btn-sec" disabled={!premium || salvando} onClick={() => void adicionar()}>＋ Adicionar</button>
      </div>
      <h3>Regras que você definiu</h3>
      {!regras.length ? <p className="suave pequeno">Nenhuma regra ainda. Ao classificar um lançamento, a regra aparece aqui.</p> : regras.map((regra) => <div className="gerenciador-regra" key={regra.id}>
        <span>{regra.chave}</span>
        <select aria-label={`Categoria para ${regra.chave}`} value={regra.categoriaId} disabled={!premium || salvando} onChange={(e) => void mudarRegra(regra.chave, e.target.value || null)}>
          <option value="">Sem categoria</option>{categorias.map((categoria) => <option key={categoria.id} value={categoria.id}>{categoria.nome}</option>)}
        </select>
        <button type="button" className="btn btn-perigo btn-mini" aria-label={`Remover regra de ${regra.chave}`} disabled={!premium || salvando} onClick={() => void onRemoverRegra(regra.id).catch(() => setErro('Não foi possível remover a regra.'))}>Remover</button>
      </div>)}
      {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
      <p className="suave pequeno">Descrições de compras são usadas apenas para classificar seus lançamentos e não são registradas em logs.</p>
    </div>
  </Modal>;
}
