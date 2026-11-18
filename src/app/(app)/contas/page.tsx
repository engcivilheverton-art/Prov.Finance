'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { PremiumBadge } from '@/components/PremiumBadge';
import { GerenciadorCategorias } from '@/components/CategoriasCSV';
import { Modal } from '@/components/Modal';
import { UpgradeModal } from '@/components/UpgradeModal';
import { useAuth } from '@/lib/auth-context';
import { useColecao } from '@/lib/colecao';
import { chaveDe, useColecoes } from '@/lib/colecoes';
import { db } from '@/lib/firebase';
import { brl } from '@/lib/formato';
import { lerArquivoExtrato, parseCsvExtrato, chaveExtrato, type LinhaExtrato, type MapeamentoCsv } from '@/lib/contas-importacao';
import { AVISO_CONVERSAO_EXTRATO, MODELO_EXTRATO_CSV, PRIVACIDADE_IA_EXTRATO, PROMPT_CONVERSAO_EXTRATO } from '@/lib/contas-textos';
import { usePlanLimits } from '@/lib/use-plan-limits';
import { useCategorias } from '@/lib/use-categorias';
import type { Cartao } from '@/types/finance';
import type { ContaBancaria, MovimentacaoConta, TipoContaBancaria, TipoMovimentacaoConta } from '@/types/contas';
import type { Com } from '@/types/finance';

const BANCOS: { nome: string; logo?: string }[] = [
  { nome: 'Itaú', logo: '/logos/itau.png' }, { nome: 'Caixa', logo: '/logos/caixa.png' },
  { nome: 'Santander', logo: '/logos/santander.png' }, { nome: 'Banco do Brasil', logo: '/logos/banco_do_brasil.png' },
  { nome: 'C6 Bank' }, { nome: 'Mercado Pago', logo: '/logos/mercado_pago.png' },
  { nome: 'Inter', logo: '/logos/inter.png' }, { nome: 'Bradesco', logo: '/logos/bradesco.png' },
  { nome: 'Nubank', logo: '/logos/nubank.png' }, { nome: 'Outro' },
];
const CORES = ['#0B3B8C', '#DC2626', '#F59E0B', '#2563EB', '#16A34A', '#7C3AED', '#0891B2', '#DB2777', '#334155', '#059669'];
const TIPO_LABEL: Record<TipoMovimentacaoConta, string> = { entrada: 'Entrada', saida: 'Saída', transferencia: 'Transferência', pagamento_fatura: 'Pagamento de fatura' };

function FormEdicaoMovimentacao({ initial, onSave, onCancel }: { initial: Com<MovimentacaoConta>; onSave: (movement: MovimentacaoConta, saveRule: boolean) => Promise<void>; onCancel: () => void }) {
  const { user } = useAuth(); const cats = useCategorias(user?.uid);
  const cards = useColecao<Cartao>(user ? ['users', user.uid, 'cartoes'] : null);
  const [kind, setKind] = useState<TipoMovimentacaoConta>(initial.tipo);
  const [description, setDescription] = useState(initial.descricao);
  const [amount, setAmount] = useState(String(initial.valor));
  const [date, setDate] = useState(initial.data);
  const [category, setCategory] = useState(initial.categoriaId ?? '');
  const [saveRule, setSaveRule] = useState(false);
  const [cardId, setCardId] = useState(initial.cartaoId ?? '');
  const [invoiceYm, setInvoiceYm] = useState(initial.ymFatura ?? new Date().toISOString().slice(0, 7));
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); const value = Number(amount.replace(',', '.'));
    if (!description.trim() || !(value > 0) || !date) return setError('Informe descrição, valor maior que zero e data.');
    try {
      const saved = { ...initial } as MovimentacaoConta & { id?: string };
      delete saved.id;
      await onSave({ ...saved, tipo: kind, valor: value, data: date, descricao: description.trim(), ...(kind === 'saida' && category ? { categoriaId: category } : { categoriaId: undefined }), ...(kind === 'pagamento_fatura' ? { ...(cardId ? { cartaoId: cardId } : {}), ymFatura: invoiceYm } : { cartaoId: undefined, ymFatura: undefined }) }, saveRule);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
  }
  return <form className="pilha" onSubmit={submit}><div className="grade-2">
    <div className="campo"><label>Tipo</label><select value={kind} onChange={(e) => setKind(e.target.value as TipoMovimentacaoConta)}><option value="entrada">Entrada</option><option value="saida">Despesa</option><option value="pagamento_fatura">Pagamento de fatura</option></select></div>
    <div className="campo"><label>Descrição</label><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></div>
    <div className="campo"><label>Valor (R$)</label><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
    <div className="campo"><label>Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
    {kind === 'saida' && <div className="campo"><label>Categoria</label><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Sem categoria</option>{cats.categoriasAtivas.map((cat) => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}</select>{category && <label className="pequeno"><input type="checkbox" checked={saveRule} onChange={(e) => setSaveRule(e.target.checked)} /> Usar também em lançamentos futuros parecidos</label>}</div>}
    {kind === 'pagamento_fatura' && <><div className="campo"><label>Cartão relacionado (opcional)</label><select value={cardId} onChange={(e) => setCardId(e.target.value)}><option value="">Não vincular</option>{cards.itens.map((card) => <option key={card.id} value={card.id}>{card.nome}</option>)}</select></div><div className="campo"><label>Mês da fatura</label><input type="month" value={invoiceYm} onChange={(e) => setInvoiceYm(e.target.value)} /></div></>}
  </div>{error && <div className="aviso aviso-erro" role="alert">{error}</div>}<div className="acoes"><button className="btn btn-sec" type="button" onClick={onCancel}>Cancelar</button><button className="btn">Salvar alterações</button></div></form>;
}

function FormEdicaoTransferencia({ initial, onSave, onCancel }: { initial: Com<MovimentacaoConta>; onSave: (data: { descricao: string; valor: number; data: string }) => Promise<void>; onCancel: () => void }) {
  const [description, setDescription] = useState(initial.descricao);
  const [amount, setAmount] = useState(String(initial.valor));
  const [date, setDate] = useState(initial.data);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); const value = Number(amount.replace(',', '.'));
    if (!description.trim() || !(value > 0) || !date) return setError('Informe descrição, valor maior que zero e data.');
    try { await onSave({ descricao: description.trim(), valor: value, data: date }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a transferência.'); }
  }
  return <form className="pilha" onSubmit={submit}><div className="grade-2">
    <div className="campo"><label>Descrição</label><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} /></div>
    <div className="campo"><label>Valor (R$)</label><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
    <div className="campo"><label>Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
  </div>{error && <div className="aviso aviso-erro" role="alert">{error}</div>}<div className="acoes"><button className="btn btn-sec" type="button" onClick={onCancel}>Cancelar</button><button className="btn">Salvar transferência</button></div></form>;
}

function FormConta({ initial, onSave, onCancel }: { initial?: Com<ContaBancaria> | null; onSave: (data: ContaBancaria) => Promise<void>; onCancel: () => void }) {
  const initialIsListed = !!initial && BANCOS.some((bank) => bank.nome === initial.instituicao);
  const [institution, setInstitution] = useState(initial ? initialIsListed ? initial.instituicao : 'Outro' : '');
  const [customInstitution, setCustomInstitution] = useState(initial && !initialIsListed ? initial.instituicao : '');
  const [name, setName] = useState(initial?.nome ?? '');
  const [type, setType] = useState<TipoContaBancaria>(initial?.tipo ?? 'corrente');
  const [balance, setBalance] = useState(String(initial?.saldoInicial ?? '0'));
  const [balanceDate, setBalanceDate] = useState(initial?.dataSaldoInicial ?? new Date().toISOString().slice(0, 10));
  const [color, setColor] = useState(initial?.cor ?? CORES[0]);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(balance.replace(',', '.'));
    if (!institution || institution === 'Outro' && !customInstitution.trim() || !name.trim() || !Number.isFinite(value) || !balanceDate) return setError('Preencha instituição, nome, saldo e data do saldo.');
    const bank = BANCOS.find((item) => item.nome === institution);
    try {
      await onSave({ instituicao: institution === 'Outro' ? customInstitution.trim() : institution, nome: name.trim(), tipo: type, saldoInicial: value, dataSaldoInicial: balanceDate, cor: color, ...(bank?.logo ? { logo: bank.logo } : {}), arquivada: initial?.arquivada ?? false, criadaEm: initial?.criadaEm ?? new Date().toISOString() });
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar a conta.'); }
  }
  return <form className="pilha" onSubmit={submit}>
    <div className="grade-2">
      <div className="campo"><label>Instituição</label><select value={institution} onChange={(e) => setInstitution(e.target.value)}><option value="">Escolha o banco</option>{BANCOS.map((bank) => <option key={bank.nome}>{bank.nome}</option>)}</select></div>
      {institution === 'Outro' && <div className="campo"><label>Nome da instituição</label><input value={customInstitution} onChange={(e) => setCustomInstitution(e.target.value)} maxLength={60} placeholder="Informe o banco ou carteira" /></div>}
      <div className="campo"><label>Nome da conta</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta principal" maxLength={50} /></div>
      <div className="campo"><label>Tipo</label><select value={type} onChange={(e) => setType(e.target.value as TipoContaBancaria)}><option value="corrente">Conta corrente</option><option value="poupanca">Poupança</option><option value="digital">Conta digital</option><option value="dinheiro">Dinheiro em espécie</option></select></div>
      <div className="campo"><label>Saldo inicial (R$)</label><input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} /></div>
      <div className="campo"><label>Data do saldo</label><input type="date" value={balanceDate} onChange={(e) => setBalanceDate(e.target.value)} /></div>
      <div className="campo"><label>Cor</label><div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap' }}>{CORES.map((c) => <button key={c} type="button" aria-label={'Cor ' + c} aria-pressed={color === c} onClick={() => setColor(c)} style={{ width: 30, height: 30, background: c, borderRadius: '50%', border: color === c ? '3px solid var(--ink)' : '1px solid var(--linha)', cursor: 'pointer' }} />)}</div></div>
    </div>
    {error && <div className="aviso aviso-erro" role="alert">{error}</div>}
    <div className="acoes" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-sec" onClick={onCancel}>Cancelar</button><button className="btn">Salvar conta</button></div>
  </form>;
}

function FormMovimentacao({ accountId, otherAccounts, onSave }: { accountId: string; otherAccounts: Com<ContaBancaria>[]; onSave: (rows: { accountId: string; movement: MovimentacaoConta }[]) => Promise<void> }) {
  const { user } = useAuth();
  const cats = useCategorias(user?.uid);
  const cards = useColecao<Cartao>(user ? ['users', user.uid, 'cartoes'] : null);
  const [kind, setKind] = useState<TipoMovimentacaoConta>('saida');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState('');
  const [otherId, setOtherId] = useState(otherAccounts[0]?.id ?? '');
  const [cardId, setCardId] = useState('');
  const [invoiceYm, setInvoiceYm] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(amount.replace(',', '.'));
    if (!description.trim() || !(value > 0) || !date) return setError('Informe descrição, valor maior que zero e data.');
    if (kind === 'transferencia' && (!otherId || otherId === accountId)) return setError('Escolha outra conta para a transferência.');
    setSaving(true); setError('');
    try {
      const transferId = kind === 'transferencia' ? crypto.randomUUID() : undefined;
      const base = { tipo: kind, valor: value, data: date, descricao: description.trim(), origem: 'manual' as const };
      const rows = kind === 'transferencia' ? [
        { accountId, movement: { ...base, tipo: kind, direcao: 'saida' as const, contaDestinoId: otherId, transferenciaId: transferId } },
        { accountId: otherId, movement: { ...base, tipo: kind, direcao: 'entrada' as const, contaDestinoId: accountId, transferenciaId: transferId } },
      ] : [{ accountId, movement: { ...base, ...(kind === 'saida' && category ? { categoriaId: category } : {}), ...(kind === 'pagamento_fatura' ? { ...(cardId ? { cartaoId: cardId } : {}), ymFatura: invoiceYm } : {}) } }];
      await onSave(rows);
      setDescription(''); setAmount('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }
  return <form className="pilha" onSubmit={submit}>
    <div className="grade-2">
      <div className="campo"><label>Tipo</label><select value={kind} onChange={(e) => setKind(e.target.value as TipoMovimentacaoConta)}><option value="saida">Despesa</option><option value="entrada">Entrada</option><option value="pagamento_fatura">Pagamento de fatura</option><option value="transferencia">Transferência entre contas</option></select></div>
      <div className="campo"><label>Descrição</label><input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Ex.: Mercado" /></div>
      <div className="campo"><label>Valor (R$)</label><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" /></div>
      <div className="campo"><label>Data</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      {kind === 'saida' && <div className="campo"><label>Categoria</label><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Sem categoria</option>{cats.categoriasAtivas.map((cat) => <option key={cat.id} value={cat.id}>{cat.nome}</option>)}</select></div>}
      {kind === 'pagamento_fatura' && <><div className="campo"><label>Cartão relacionado (opcional)</label><select value={cardId} onChange={(e) => setCardId(e.target.value)}><option value="">Não vincular</option>{cards.itens.map((card) => <option key={card.id} value={card.id}>{card.nome}</option>)}</select></div><div className="campo"><label>Mês da fatura</label><input type="month" value={invoiceYm} onChange={(e) => setInvoiceYm(e.target.value)} /></div></>}
      {kind === 'transferencia' && <div className="campo"><label>Conta de destino</label><select value={otherId} onChange={(e) => setOtherId(e.target.value)}>{otherAccounts.map((account) => <option key={account.id} value={account.id}>{account.nome} · {account.instituicao}</option>)}</select></div>}
    </div>
    {kind === 'pagamento_fatura' && <p className="aviso aviso-info">Pagamento de fatura reduz o saldo da conta e não será somado novamente como despesa no painel.</p>}
    {kind === 'transferencia' && <p className="aviso aviso-info">A transferência será registrada nas duas contas e não entrará nos totais de renda ou despesas.</p>}
    {error && <div className="aviso aviso-erro" role="alert">{error}</div>}
    <button className="btn" disabled={saving}>{saving ? 'Salvando…' : 'Salvar lançamento'}</button>
  </form>;
}

export default function ContasPage() {
  const { user } = useAuth(); const uid = user?.uid; const limits = usePlanLimits();
  const categorias = useCategorias(uid);
  const accounts = useColecao<ContaBancaria>(uid ? ['users', uid, 'contas'] : null);
  const accountMovementPaths = uid && !accounts.carregando ? accounts.itens.map((account) => ['users', uid, 'contas', account.id, 'movimentacoes']) : null;
  const allMovements = useColecoes<MovimentacaoConta>(accountMovementPaths);
  const active = accounts.itens.filter((account) => !account.arquivada);
  const [selectedId, setSelectedId] = useState('');
  const selected = accounts.itens.find((account) => account.id === selectedId) ?? active[0];
  const movements = useColecao<MovimentacaoConta>(uid && selected ? ['users', uid, 'contas', selected.id, 'movimentacoes'] : null);
  const [edit, setEdit] = useState<Com<ContaBancaria> | 'new' | null>(null);
  const [upgrade, setUpgrade] = useState(false); const canAdd = limits.canAdd('bankAccounts', active.length);
  const [upgradeResource, setUpgradeResource] = useState('contas bancárias ou importação de extrato');
  const [gerenciadorCategorias, setGerenciadorCategorias] = useState(false);
  const [showImport, setShowImport] = useState(false); const [rows, setRows] = useState<LinhaExtrato[]>([]); const [rowTypes, setRowTypes] = useState<TipoMovimentacaoConta[]>([]);
  const [rowCategories, setRowCategories] = useState<(string | undefined)[]>([]);
  const [rowIgnored, setRowIgnored] = useState<boolean[]>([]);
  const [rowDuplicate, setRowDuplicate] = useState<boolean[]>([]);
  const [saveRulesForFuture, setSaveRulesForFuture] = useState(false);
  const [format, setFormat] = useState<'csv' | 'ofx' | null>(null); const [parseErrors, setParseErrors] = useState<{ linha: number; erro: string }[]>([]); const [importError, setImportError] = useState(''); const [importNotice, setImportNotice] = useState(''); const [importing, setImporting] = useState(false); const fileRef = useRef<HTMLInputElement>(null);
  const [rawCsv, setRawCsv] = useState(''); const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [csvMapping, setCsvMapping] = useState<MapeamentoCsv>({ data: 0, descricao: 1, valor: 2 });
  const [showManual, setShowManual] = useState(false); const [olderOpen, setOlderOpen] = useState(false);
  const [movementYm, setMovementYm] = useState(new Date().toISOString().slice(0, 7));
  const [editingMovement, setEditingMovement] = useState<Com<MovimentacaoConta> | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Com<MovimentacaoConta> | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);
  const sortedMovements = useMemo(() => [...movements.itens].sort((a, b) => b.data.localeCompare(a.data)), [movements.itens]);
  const filteredMovements = sortedMovements.filter((movement) => movement.data.startsWith(movementYm));
  const monthIncome = filteredMovements.filter((movement) => !movement.ignorada && (movement.tipo === 'entrada' || movement.tipo === 'transferencia' && movement.direcao === 'entrada')).reduce((sum, movement) => sum + movement.valor, 0);
  const monthExpenses = filteredMovements.filter((movement) => !movement.ignorada && (movement.tipo === 'saida' || movement.tipo === 'pagamento_fatura' || movement.tipo === 'transferencia' && movement.direcao === 'saida')).reduce((sum, movement) => sum + movement.valor, 0);
  const balance = !selected ? 0 : selected.saldoInicial + movements.itens.reduce((sum, movement) => {
    if (movement.ignorada) return sum;
    if (movement.tipo === 'entrada') return sum + movement.valor;
    if (movement.tipo === 'saida' || movement.tipo === 'pagamento_fatura') return sum - movement.valor;
    return sum + (movement.direcao === 'entrada' ? movement.valor : -movement.valor);
  }, 0);
  const accountBalance = (account: Com<ContaBancaria>) => {
    const rows = allMovements.dados[chaveDe(['users', uid ?? '', 'contas', account.id, 'movimentacoes'])] ?? [];
    return account.saldoInicial + rows.reduce((sum, movement) => {
      if (movement.ignorada) return sum;
      if (movement.tipo === 'entrada') return sum + movement.valor;
      if (movement.tipo === 'saida' || movement.tipo === 'pagamento_fatura') return sum - movement.valor;
      return sum + (movement.direcao === 'entrada' ? movement.valor : -movement.valor);
    }, 0);
  };
  const imports = [...new Set(movements.itens.flatMap((movement) => movement.importacaoId ? [movement.importacaoId] : []))];
  const canImport = limits.canUseCsvImport;
  const previewIncome = rows.reduce((sum, row, index) => !rowIgnored[index] && (rowTypes[index] ?? row.tipo) === 'entrada' ? sum + row.valor : sum, 0);
  const previewExpenses = rows.reduce((sum, row, index) => !rowIgnored[index] && (rowTypes[index] ?? row.tipo) === 'saida' ? sum + row.valor : sum, 0);

  async function saveMovementBatch(entries: { accountId: string; movement: MovimentacaoConta }[]) {
    if (!uid) throw new Error('Faça login para continuar.');
    for (let offset = 0; offset < entries.length; offset += 400) {
      const batch = writeBatch(db);
      for (const entry of entries.slice(offset, offset + 400)) batch.set(doc(db, 'users', uid, 'contas', entry.accountId, 'movimentacoes', crypto.randomUUID()), entry.movement);
      await batch.commit();
    }
  }
  async function handleFile(file?: File) {
    if (!file) return;
    setImportError(''); setImportNotice('');
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Este arquivo excede 10 MB. Exporte um período menor e tente novamente.');
      if (!/\.(csv|ofx|qfx)$/i.test(file.name)) throw new Error('Selecione um arquivo CSV, OFX ou QFX.');
      let savedMapping: MapeamentoCsv | undefined;
      if (uid && selected) {
        const saved = await getDoc(doc(db, 'users', uid, 'modelosImportacaoExtrato', selected.id));
        const mapping = saved.data()?.mapeamento;
        if (mapping && typeof mapping === 'object' && Number.isInteger((mapping as MapeamentoCsv).data) && Number.isInteger((mapping as MapeamentoCsv).descricao)) savedMapping = mapping as MapeamentoCsv;
      }
      const parsed = await lerArquivoExtrato(file, savedMapping);
      setRawCsv(parsed.texto ?? ''); setCsvColumns(parsed.cabecalhos ?? []);
      setCsvMapping(savedMapping ?? { data: 0, descricao: 1, valor: 2 });
      const seenKeys = new Set<string>();
      const occurrences = new Map<string, number>();
      const duplicates = parsed.linhas.map((line) => {
        const base = line.data + '|' + line.valor.toFixed(2) + '|' + line.descricao.toLowerCase().replace(/\s+/g, ' ').trim();
        const occurrence = (occurrences.get(base) ?? 0) + 1; occurrences.set(base, occurrence);
        const key = line.idExterno ? 'ext-' + line.idExterno.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : chaveExtrato(line, occurrence);
        const duplicate = movements.itens.some((saved) => saved.id === key || saved.chaveDuplicidade === key) || seenKeys.has(key);
        seenKeys.add(key);
        return duplicate;
      });
      setRows(parsed.linhas); setRowTypes(parsed.linhas.map((line) => line.tipo)); setRowCategories(parsed.linhas.map((line) => line.tipo === 'saida' ? categorias.categoriasAtivas.find((category) => category.nome === categorias.categoriaDe(line.descricao))?.id : undefined)); setRowDuplicate(duplicates); setRowIgnored(duplicates); setSaveRulesForFuture(false); setParseErrors(parsed.erros); setFormat(parsed.formato); setShowImport(true);
    } catch { setImportError('Não foi possível ler este arquivo.'); }
  }
  function applyCsvMapping() {
    const parsed = parseCsvExtrato(rawCsv, csvMapping);
    setRows(parsed.linhas); setRowTypes(parsed.linhas.map((line) => line.tipo));
    setRowCategories(parsed.linhas.map((line) => line.tipo === 'saida' ? categorias.categoriasAtivas.find((category) => category.nome === categorias.categoriaDe(line.descricao))?.id : undefined));
    const seenKeys = new Set<string>();
    const occurrences = new Map<string, number>();
    const duplicates = parsed.linhas.map((line) => {
      const base = line.data + '|' + line.valor.toFixed(2) + '|' + line.descricao.toLowerCase().replace(/\s+/g, ' ').trim();
      const occurrence = (occurrences.get(base) ?? 0) + 1; occurrences.set(base, occurrence);
      const key = line.idExterno ? 'ext-' + line.idExterno.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : chaveExtrato(line, occurrence);
      const duplicate = movements.itens.some((saved) => saved.id === key || saved.chaveDuplicidade === key) || seenKeys.has(key);
      seenKeys.add(key); return duplicate;
    });
    setRowIgnored(duplicates); setRowDuplicate(duplicates); setSaveRulesForFuture(false); setParseErrors(parsed.erros);
    if (parsed.linhas.length && uid && selected) {
      const mapping = { data: csvMapping.data, descricao: csvMapping.descricao, ...(csvMapping.valor !== undefined ? { valor: csvMapping.valor } : {}), ...(csvMapping.debito !== undefined ? { debito: csvMapping.debito } : {}), ...(csvMapping.credito !== undefined ? { credito: csvMapping.credito } : {}) };
      void setDoc(doc(db, 'users', uid, 'modelosImportacaoExtrato', selected.id), { banco: selected.instituicao, mapeamento: mapping, atualizadoEm: new Date().toISOString() });
    }
  }
  async function commitImport() {
    if (!uid || !user || !selected || !rows.length) return;
    setImporting(true); setImportError(''); setImportNotice('');
    try {
      const importId = crypto.randomUUID();
      const occurrences = new Map<string, number>();
      const prepared = rows.map((row, index) => {
        const base = row.data + '|' + row.valor.toFixed(2) + '|' + row.descricao.toLowerCase().replace(/\s+/g, ' ').trim();
        const occurrence = (occurrences.get(base) ?? 0) + 1; occurrences.set(base, occurrence);
        const key = row.idExterno ? 'ext-' + row.idExterno.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) : chaveExtrato(row, occurrence);
        return { row, index, type: rowTypes[index] ?? row.tipo, key };
      });
      if (prepared.length > 10_000) throw new Error('Este arquivo tem mais de 10 mil lançamentos. Divida o extrato em períodos menores para importar com segurança.');
      const token = await user.getIdToken();
      let imported = 0; let ignored = 0;
      for (let offset = 0; offset < prepared.length; offset += 250) {
        const batch = prepared.slice(offset, offset + 250);
        const response = await fetch('/api/accounts/import', {
          method: 'POST',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify({
            accountId: selected.id,
            importId,
            format: format ?? 'csv',
            items: batch.map(({ row, index, type, key }) => ({
            id: key,
            chaveDuplicidade: key,
            tipo: type,
            valor: row.valor,
            data: row.data,
            descricao: row.descricao,
            ...(rowIgnored[index] ? { ignorada: true } : {}),
            ...(type === 'transferencia' ? { direcao: row.direcao ?? 'saida' } : {}),
            ...(type === 'saida' && rowCategories[index] ? { categoriaId: rowCategories[index] } : {}),
            })),
          }),
        });
        const result = await response.json().catch(() => ({})) as { importados?: number; ignorados?: number; error?: string; code?: string };
        if (response.status === 403) { setUpgrade(true); throw new Error(result.error ?? 'Importar extratos é exclusivo do Premium.'); }
        if (!response.ok) throw new Error((offset ? 'A importação foi parcialmente concluída. ' : '') + (result.error ?? 'Não foi possível concluir a importação.'));
        imported += result.importados ?? 0;
        ignored += result.ignorados ?? 0;
      }
      if (saveRulesForFuture) {
        const categoryRules = new Map<string, string>();
        prepared.forEach(({ row, index, type }) => { if (type === 'saida' && rowCategories[index] && !rowIgnored[index]) categoryRules.set(row.descricao, rowCategories[index]!); });
        try { for (const [description, categoryId] of categoryRules) await categorias.definirRegra(description, categoryId); }
        catch { setImportNotice('Os lançamentos foram importados, mas não foi possível salvar uma ou mais regras de categoria para próximos extratos.'); }
      }
          setRows([]); setRowIgnored([]); setShowImport(false); setFormat(null); setParseErrors([]);
      setImportNotice((current) => current || imported + ' lançamento(s) importado(s). ' + ignored + ' duplicado(s) ignorado(s).');
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Não foi possível importar.'); }
    finally { setImporting(false); }
  }
  async function undoImport(importId: string) {
    if (!uid || !selected) return;
    const snapshots = await getDocs(collection(db, 'users', uid, 'contas', selected.id, 'movimentacoes'));
    const matched = snapshots.docs.filter((snapshot) => snapshot.get('importacaoId') === importId);
    if (!confirm('Desfazer esta importação? ' + matched.length + ' lançamento(s) serão removidos.')) return;
    for (let offset = 0; offset < matched.length; offset += 400) {
      const batch = writeBatch(db); matched.slice(offset, offset + 400).forEach((snapshot) => batch.delete(snapshot.ref)); await batch.commit();
    }
  }
  async function deleteAccount(account: Com<ContaBancaria>) {
    if (!uid) return;
    const snapshot = await getDocs(collection(db, 'users', uid, 'contas', account.id, 'movimentacoes'));
    if (snapshot.size) { alert('Esta conta tem ' + snapshot.size + ' lançamento(s). Ela será arquivada para preservar o histórico.'); await accounts.mesclar(account.id, { arquivada: true }); return; }
    if (confirm('Excluir a conta ' + account.nome + '? Ela não tem lançamentos.')) await accounts.remover(account.id);
  }
  async function deleteMovement(movement: Com<MovimentacaoConta>) {
    if (!uid || !selected || !confirm('Excluir "' + movement.descricao + '"?')) return;
    if (movement.tipo === 'transferencia' && movement.transferenciaId) {
      const paired = await Promise.all(accounts.itens.map(async (account) => ({
        account,
        rows: await getDocs(collection(db, 'users', uid, 'contas', account.id, 'movimentacoes')),
      })));
      const matches = paired.flatMap(({ rows }) => rows.docs.filter((row) => row.get('transferenciaId') === movement.transferenciaId));
      for (let offset = 0; offset < matches.length; offset += 400) {
        const batch = writeBatch(db); matches.slice(offset, offset + 400).forEach((row) => batch.delete(row.ref)); await batch.commit();
      }
      return;
    }
    await movements.remover(movement.id);
  }
  async function saveTransfer(movement: Com<MovimentacaoConta>, data: { descricao: string; valor: number; data: string }) {
    if (!uid || !movement.transferenciaId) throw new Error('Não foi possível localizar o par desta transferência.');
    const allRows = await Promise.all(accounts.itens.map((account) => getDocs(collection(db, 'users', uid, 'contas', account.id, 'movimentacoes'))));
    const matches = allRows.flatMap((snapshot) => snapshot.docs.filter((row) => row.get('transferenciaId') === movement.transferenciaId));
    if (matches.length !== 2) throw new Error('A transferência não tem as duas pontas registradas. Confira as contas antes de editar.');
    const batch = writeBatch(db);
    for (const row of matches) batch.update(row.ref, data);
    await batch.commit();
    setEditingTransfer(null);
  }
  async function toggleIgnored(movement: Com<MovimentacaoConta>) {
    if (movement.tipo === 'transferencia' && movement.transferenciaId && uid) {
      const allRows = await Promise.all(accounts.itens.map((account) => getDocs(collection(db, 'users', uid, 'contas', account.id, 'movimentacoes'))));
      const matches = allRows.flatMap((snapshot) => snapshot.docs.filter((row) => row.get('transferenciaId') === movement.transferenciaId));
      const batch = writeBatch(db); matches.forEach((row) => batch.update(row.ref, { ignorada: !movement.ignorada })); await batch.commit();
      return;
    }
    await movements.mesclar(movement.id, { ignorada: !movement.ignorada });
  }

  return <>
    <div className="pagina-cab"><div><div className="sub">Bancos e saldo</div><h1>Contas</h1><p className="suave">Acompanhe saldos, entradas, despesas e transferências.</p></div>
      <div className="acoes"><button className="btn btn-sec" type="button" onClick={() => limits.premium ? setGerenciadorCategorias(true) : (setUpgradeResource('edição de categorias'), setUpgrade(true))}>Categorias {!limits.carregando && !limits.premium && <PremiumBadge />}</button><button className="btn btn-sec" type="button" disabled={limits.carregando} onClick={() => canAdd ? setEdit('new') : (setUpgradeResource('contas bancárias'), setUpgrade(true))}>Adicionar conta {!canAdd && <PremiumBadge />}</button></div>
    </div>
    {!limits.premium && <p className="suave pequeno">Plano Free: até 1 conta bancária. Seus dados permanecem salvos se o plano mudar.</p>}
    <section className="card card-corpo pilha" style={{ marginBottom: '1.2rem' }} aria-labelledby="aviso-csv-titulo">
      <h2 id="aviso-csv-titulo">Não tem o arquivo CSV?</h2>
      <p>{AVISO_CONVERSAO_EXTRATO}</p>
      <div className="acoes">
        <button type="button" className="btn btn-sec" onClick={() => void navigator.clipboard?.writeText(PROMPT_CONVERSAO_EXTRATO).then(() => setPromptCopied(true)).catch(() => setImportError('Não foi possível copiar. Selecione e copie o texto do prompt nas instruções.'))}>{promptCopied ? 'Copiado!' : 'Copiar texto para a IA'}</button>
        <a className="btn btn-sec" download="modelo-extrato-prov.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent(MODELO_EXTRATO_CSV)}>Baixar modelo de CSV</a>
      </div>
      <p className="aviso aviso-alerta">{PRIVACIDADE_IA_EXTRATO}</p>
      <details><summary className="btn-link">Ver como fazer</summary><ol><li>Abra a IA de sua preferência.</li><li>Anexe o PDF do extrato e cole o texto copiado.</li><li>Copie a tabela gerada para um arquivo .csv ou peça para a IA gerar o arquivo.</li><li>Volte aqui e envie o CSV.</li></ol></details>
      <p className="pequeno suave">O PROV lê OFX e CSV localmente; não envia seus extratos a uma IA. A importação de PDF pelo próprio app fica para a fase 2.</p>
    </section>
    {accounts.erro && <div className="aviso aviso-erro" role="alert">{accounts.erro}</div>}
    {accounts.carregando ? <div className="card vazio">Carregando contas…</div> : accounts.itens.length === 0 ? <div className="card vazio"><h2>Adicione sua primeira conta</h2><p>Informe o saldo inicial e registre movimentações para acompanhar os valores.</p><button className="btn" onClick={() => setEdit('new')}>Adicionar conta</button></div> : <>
      <div className="grade-2" style={{ marginBottom: '1rem' }}>{accounts.itens.map((account) => <div key={account.id} className="card card-corpo" style={{ borderTop: '4px solid ' + account.cor, opacity: account.arquivada ? .65 : 1 }}>
        <button type="button" onClick={() => setSelectedId(account.id)} className="btn-link" aria-pressed={selected?.id === account.id} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
          <span><strong>{account.nome}</strong><span className="pequeno suave" style={{ display: 'block' }}>{account.instituicao} · {account.tipo}{account.arquivada ? ' · Arquivada' : ''}</span></span>
          {account.logo && <Image src={account.logo} alt="" width={32} height={32} style={{ objectFit: 'contain' }} />}
        </button>
        <div className="num" style={{ fontSize: '1.5rem', marginTop: '.8rem' }}>{brl(selected?.id === account.id ? balance : accountBalance(account))}</div>
        <div className="acoes" style={{ marginTop: '.8rem' }}><button type="button" className="btn btn-sec btn-mini" onClick={() => { setSelectedId(account.id); setEdit(account); }}>Editar</button>{!account.arquivada && <button type="button" className="btn btn-sec btn-mini" onClick={() => void accounts.mesclar(account.id, { arquivada: true })}>Arquivar</button>}<button type="button" className="btn btn-perigo btn-mini" onClick={() => void deleteAccount(account)}>Excluir</button></div>
      </div>)}</div>
      {selected && <>
        <div className="pagina-cab"><div><h2>{selected.nome} · Movimentações</h2><p className="suave pequeno">Saldo inicial de {brl(selected.saldoInicial)} em {selected.dataSaldoInicial}; saldo calculado com as movimentações.</p></div><div className="acoes"><button className="btn" onClick={() => setShowManual(!showManual)}>{showManual ? 'Fechar lançamento' : 'Novo lançamento'}</button><button className="btn btn-sec" disabled={limits.carregando || importing} onClick={() => canImport ? fileRef.current?.click() : (setUpgradeResource('importação de extratos'), setUpgrade(true))}>Importar extrato {!limits.carregando && !canImport && <PremiumBadge />}</button><input ref={fileRef} type="file" accept=".csv,.ofx,.qfx,text/csv,application/x-ofx" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void handleFile(file); }} /></div></div>
        {importError && <div className="aviso aviso-erro" role="alert">{importError}</div>}
        {importNotice && <div className="aviso aviso-info" role="status">{importNotice}</div>}
        {showManual && <div className="card card-corpo" style={{ marginBottom: '1rem' }}><FormMovimentacao accountId={selected.id} otherAccounts={active.filter((account) => account.id !== selected.id)} onSave={saveMovementBatch} /></div>}
        {showImport && <div className="card card-corpo" style={{ marginBottom: '1rem' }}>
          <div className="pagina-cab"><div><h3>Revisar importação {format?.toUpperCase()}</h3><p className="suave pequeno">O arquivo é lido neste navegador e não fica armazenado. Revise tipos e descrições antes de confirmar.</p></div><button className="btn btn-sec btn-mini" onClick={() => { setShowImport(false); setRows([]); setRawCsv(''); setCsvColumns([]); }}>Cancelar</button></div>
          {format === 'csv' && rows.length === 0 && csvColumns.length > 0 && <div className="card card-corpo pilha" style={{ marginBottom: '1rem' }}>
            <h4>Mapear as colunas do CSV</h4><p className="suave pequeno">Não reconheci este cabeçalho. Escolha as colunas e salve o modelo para os próximos extratos desta conta.</p>
            <div className="grade-2">
              <div className="campo"><label>Data</label><select value={csvMapping.data} onChange={(e) => setCsvMapping((m) => ({ ...m, data: Number(e.target.value) }))}>{csvColumns.map((column, index) => <option key={index} value={index}>{column || 'Coluna ' + (index + 1)}</option>)}</select></div>
              <div className="campo"><label>Descrição</label><select value={csvMapping.descricao} onChange={(e) => setCsvMapping((m) => ({ ...m, descricao: Number(e.target.value) }))}>{csvColumns.map((column, index) => <option key={index} value={index}>{column || 'Coluna ' + (index + 1)}</option>)}</select></div>
              <div className="campo"><label>Valor único</label><select value={csvMapping.valor ?? ''} onChange={(e) => setCsvMapping((m) => ({ ...m, valor: e.target.value === '' ? undefined : Number(e.target.value) }))}><option value="">Usar débito/crédito</option>{csvColumns.map((column, index) => <option key={index} value={index}>{column || 'Coluna ' + (index + 1)}</option>)}</select></div>
              <div className="campo"><label>Débito (opcional)</label><select value={csvMapping.debito ?? ''} onChange={(e) => setCsvMapping((m) => ({ ...m, debito: e.target.value === '' ? undefined : Number(e.target.value) }))}><option value="">Não selecionado</option>{csvColumns.map((column, index) => <option key={index} value={index}>{column || 'Coluna ' + (index + 1)}</option>)}</select></div>
              <div className="campo"><label>Crédito (opcional)</label><select value={csvMapping.credito ?? ''} onChange={(e) => setCsvMapping((m) => ({ ...m, credito: e.target.value === '' ? undefined : Number(e.target.value) }))}><option value="">Não selecionado</option>{csvColumns.map((column, index) => <option key={index} value={index}>{column || 'Coluna ' + (index + 1)}</option>)}</select></div>
            </div>
            <button type="button" className="btn" onClick={applyCsvMapping}>Aplicar e salvar mapeamento</button>
          </div>}
          {parseErrors.length > 0 && <details className="aviso aviso-alerta"><summary>{parseErrors.length} linha(s) precisam de atenção</summary>{parseErrors.slice(0, 20).map((item) => <div key={item.linha + item.erro}>Linha {item.linha}: {item.erro}</div>)}</details>}
          <div className="acoes"><span className="k"><small>Entradas previstas</small><b>{brl(previewIncome)}</b></span><span className="k"><small>Saídas previstas</small><b>{brl(previewExpenses)}</b></span><span className="k"><small>Possíveis duplicadas</small><b>{rowDuplicate.filter(Boolean).length}</b></span></div>
          <label className="pequeno"><input type="checkbox" checked={saveRulesForFuture} onChange={(e) => setSaveRulesForFuture(e.target.checked)} /> Salvar categorias escolhidas como regras para próximos extratos</label>
          <p className="suave pequeno">{rows.length} lançamento(s) reconhecido(s). Linhas duplicadas aparecem marcadas e ficam desativadas para evitar uma reimportação.</p>
          <div className="lista" style={{ maxHeight: 420, overflow: 'auto' }}>{rows.slice(0, 150).map((row, index) => <div className="linha" key={row.linha + '-' + index}><span>{row.data}</span><span className="grow"><strong>{row.descricao}</strong>{rowDuplicate[index] && <small className="selo selo-ambar" style={{ display: 'block', width: 'fit-content' }}>Já importada</small>}</span><select aria-label={'Tipo do lançamento ' + row.descricao} value={rowTypes[index] ?? row.tipo} onChange={(e) => setRowTypes((current) => current.map((type, i) => i === index ? e.target.value as TipoMovimentacaoConta : type))}>{Object.entries(TIPO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(rowTypes[index] ?? row.tipo) === 'saida' && <select aria-label={'Categoria de ' + row.descricao} value={rowCategories[index] ?? ''} onChange={(e) => setRowCategories((current) => current.map((category, i) => i === index ? e.target.value || undefined : category))}><option value="">Sem categoria</option>{categorias.categoriasAtivas.map((category) => <option key={category.id} value={category.id}>{category.nome}</option>)}</select>}<label className="pequeno"><input type="checkbox" checked={rowIgnored[index] ?? false} disabled={rowDuplicate[index]} onChange={(e) => setRowIgnored((current) => current.map((ignored, i) => i === index ? e.target.checked : ignored))} /> Ignorar</label><b>{brl(row.valor)}</b></div>)}</div>
          {rows.length > 150 && <p className="aviso aviso-info">A prévia mostra as primeiras 150 linhas; a importação inclui todas as {rows.length} linhas.</p>}
          {importError && <div role="alert" className="aviso aviso-erro">{importError}</div>}
          <button type="button" className="btn" disabled={importing || rows.length === 0} onClick={() => void commitImport()}>{importing ? 'Importando…' : 'Confirmar importação'}</button>
        </div>}
        <div className="acoes" style={{ justifyContent: 'space-between', margin: '1rem 0' }}>
          <label className="campo" style={{ maxWidth: 220 }}><span>Mês das movimentações</span><input type="month" value={movementYm} onChange={(e) => setMovementYm(e.target.value)} /></label>
          <div className="acoes"><span className="k">Entradas: <b>{brl(monthIncome)}</b></span><span className="k">Saídas: <b>{brl(monthExpenses)}</b></span></div>
        </div>
        <div className="card card-corpo">
          <div className="acoes" style={{ justifyContent: 'space-between', marginBottom: '.5rem' }}><strong>{filteredMovements.length} lançamento(s) em {movementYm}</strong><span className="suave pequeno">Despesas do mês: {brl(monthExpenses)}</span></div>
          {imports.length > 0 && <div className="pequeno suave" style={{ marginBottom: '.6rem' }}>Importações recentes: {imports.slice(0, 3).map((id) => <button key={id} type="button" className="btn-link" onClick={() => void undoImport(id)}>Desfazer</button>)}</div>}
          {movements.carregando ? <p className="suave">Carregando lançamentos…</p> : !filteredMovements.length ? <p className="suave">Nenhum lançamento nesta conta para este mês.</p> : <div className="lista">{filteredMovements.map((movement) => <div className="linha" key={movement.id} style={{ opacity: movement.ignorada ? .5 : 1 }}><span>{movement.data}</span><span className="grow"><strong>{movement.descricao}</strong><small className="suave" style={{ display: 'block' }}>{TIPO_LABEL[movement.tipo]}{movement.ignorada ? ' · Ignorada' : ''}</small></span><span className="num" style={{ color: movement.tipo === 'entrada' || movement.direcao === 'entrada' ? 'var(--verde)' : undefined }}>{movement.tipo === 'entrada' || movement.direcao === 'entrada' ? '+' : '−'}{brl(movement.valor)}</span><button className="btn btn-sec btn-mini" onClick={() => movement.tipo === 'transferencia' ? setEditingTransfer(movement) : setEditingMovement(movement)}>Editar</button><button type="button" className="btn btn-sec btn-mini" onClick={() => void toggleIgnored(movement)}>{movement.ignorada ? 'Considerar' : 'Ignorar'}</button><button className="btn btn-perigo btn-mini" aria-label={'Excluir ' + movement.descricao} onClick={() => void deleteMovement(movement)}>✕</button></div>)}</div>}
        </div>
        {accounts.itens.some((account) => account.arquivada) && <div style={{ marginTop: '1rem' }}><button className="btn btn-sec btn-mini" onClick={() => setOlderOpen(!olderOpen)}>{olderOpen ? 'Ocultar' : 'Ver'} contas arquivadas</button>{olderOpen && <div className="lista">{accounts.itens.filter((account) => account.arquivada).map((account) => <div key={account.id} className="linha">{account.nome} · {account.instituicao}<button className="btn btn-sec btn-mini" onClick={() => void accounts.mesclar(account.id, { arquivada: false })}>Restaurar</button></div>)}</div>}</div>}
      </>}
    </>}
    <Modal aberto={edit !== null} titulo={edit === 'new' ? 'Nova conta bancária' : 'Editar conta'} onFechar={() => setEdit(null)}>
      <FormConta initial={edit && edit !== 'new' ? edit : null} onCancel={() => setEdit(null)} onSave={async (data) => { if (!uid) throw new Error('Faça login para continuar.'); if (edit && edit !== 'new') await accounts.salvar(edit.id, data); else await limits.create('bankAccounts', data); setEdit(null); }} />
    </Modal>
    <Modal aberto={editingMovement !== null} titulo="Editar lançamento" onFechar={() => setEditingMovement(null)}>
      {editingMovement && <FormEdicaoMovimentacao initial={editingMovement} onCancel={() => setEditingMovement(null)} onSave={async (data, saveRule) => { await movements.salvar(editingMovement.id, data); if (saveRule && data.categoriaId) await categorias.definirRegra(data.descricao, data.categoriaId); setEditingMovement(null); }} />}
    </Modal>
    <Modal aberto={editingTransfer !== null} titulo="Editar transferência entre contas" onFechar={() => setEditingTransfer(null)}>
      {editingTransfer && <FormEdicaoTransferencia initial={editingTransfer} onCancel={() => setEditingTransfer(null)} onSave={(data) => saveTransfer(editingTransfer, data)} />}
    </Modal>
    <GerenciadorCategorias aberto={gerenciadorCategorias} onFechar={() => setGerenciadorCategorias(false)} categorias={categorias.categorias} regras={categorias.regras} premium={limits.premium}
      onAdicionar={categorias.adicionarCategoria} onSalvarPalavras={categorias.salvarPalavras} onRenomearCategoria={categorias.renomearCategoria} onArquivarCategoria={categorias.arquivarCategoria} onDefinirRegra={categorias.definirRegra} onRemoverRegra={categorias.removerRegra} />
    <UpgradeModal aberto={upgrade} onFechar={() => setUpgrade(false)} recurso={upgradeResource} />
  </>;
}
