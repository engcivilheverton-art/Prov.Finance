'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { carregarPerfil, MESES, mesesNoPeriodo, salvarPerfil } from '@/lib/perfil';
import { PERFIL_PADRAO, type Perfil } from '@/types/finance';

const ANOS = [2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

export default function PerfilPage() {
  const { user, sair } = useAuth();
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil>(PERFIL_PADRAO);
  const [idadeTexto, setIdadeTexto] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [mensagemPrivacidade, setMensagemPrivacidade] = useState('');
  const [emailConfirmacao, setEmailConfirmacao] = useState('');
  const [exportando, setExportando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    if (!user) return;
    carregarPerfil(user.uid)
      .then((p) => {
        const base = p ?? { ...PERFIL_PADRAO, nome: user.displayName ?? '' };
        setPerfil(base);
        setIdadeTexto(base.idade !== undefined ? String(base.idade) : '');
      })
      .catch(() => setMsg({ tipo: 'erro', texto: 'Não foi possível carregar o perfil.' }))
      .finally(() => setCarregando(false));
  }, [user]);

  const meses = mesesNoPeriodo(perfil);
  const atualizar = <K extends keyof Perfil>(campo: K, valor: Perfil[K]) =>
    setPerfil((p) => ({ ...p, [campo]: valor }));

  async function aoSalvar(ev: FormEvent) {
    ev.preventDefault();
    setMsg(null);
    if (!user) return;
    if (!perfil.nome.trim()) return setMsg({ tipo: 'erro', texto: 'Informe seu nome.' });
    if (meses === 0) return setMsg({ tipo: 'erro', texto: 'O início do período deve ser anterior ao fim.' });

    const idade = idadeTexto.trim() === '' ? undefined : Number(idadeTexto);
    if (idade !== undefined && (!Number.isInteger(idade) || idade < 0 || idade > 120)) {
      return setMsg({ tipo: 'erro', texto: 'Idade inválida.' });
    }

    setSalvando(true);
    try {
      await salvarPerfil(user.uid, { ...perfil, nome: perfil.nome.trim(), idade });
      setMsg({ tipo: 'ok', texto: 'Perfil salvo.' });
    } catch {
      setMsg({ tipo: 'erro', texto: 'Não foi possível salvar. Tente novamente.' });
    } finally {
      setSalvando(false);
    }
  }

  async function baixarDados() {
    if (!user) return;
    setMensagemPrivacidade('');
    setExportando(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/privacy/export', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || 'Não foi possível baixar seus dados.');
      }
      const arquivo = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = arquivo;
      link.download = `prov-dados-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(arquivo), 0);
      setMensagemPrivacidade('Arquivo dos dados da conta preparado para download.');
    } catch (error) {
      setMensagemPrivacidade(error instanceof Error ? error.message : 'Não foi possível baixar seus dados.');
    } finally {
      setExportando(false);
    }
  }

  async function excluirConta(ev: FormEvent) {
    ev.preventDefault();
    if (!user?.email || emailConfirmacao.trim().toLowerCase() !== user.email.toLowerCase()) {
      setMensagemPrivacidade('Digite o e-mail desta conta para confirmar.');
      return;
    }
    if (!window.confirm('Esta ação é permanente. A assinatura será cancelada e os dados do PROV serão excluídos. Deseja continuar?')) return;

    setMensagemPrivacidade('');
    setExcluindo(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/privacy/delete-account', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ confirmEmail: emailConfirmacao.trim() }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({})) as { error?: string; code?: string };
      if (!response.ok) throw new Error(data.code === 'RECENT_LOGIN_REQUIRED'
        ? 'Por segurança, saia da conta, entre novamente e repita a solicitação.'
        : data.error || 'Não foi possível excluir a conta.');
      try { localStorage.removeItem(`prov:dashboard:free-chart:${user.uid}`); } catch { /* A exclusão dos dados no servidor já foi concluída. */ }
      await sair();
      router.replace('/login?conta=excluida');
    } catch (error) {
      setMensagemPrivacidade(error instanceof Error ? error.message : 'Não foi possível excluir a conta.');
    } finally {
      setExcluindo(false);
    }
  }

  if (carregando) return <p style={{ color: 'var(--suave)' }}>Carregando…</p>;

  return (
    <div style={{ maxWidth: 640 }}>
      <form onSubmit={aoSalvar}>
      <div className="pagina-cab">
        <div><div className="sub">Configuração</div><h1>Meu perfil</h1></div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-cab"><h2>Dados pessoais</h2></div>
        <div className="card-corpo grade-2">
          <div className="campo col-total">
            <label htmlFor="nome">Nome</label>
            <input id="nome" value={perfil.nome} onChange={(e) => atualizar('nome', e.target.value)} maxLength={120} />
          </div>
          <div className="campo">
            <label htmlFor="idade">Idade (opcional)</label>
            <input id="idade" inputMode="numeric" value={idadeTexto} onChange={(e) => setIdadeTexto(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-cab"><h2>Período de análise dos gráficos</h2></div>
        <div className="card-corpo">
          <div className="grade-2">
            <div className="campo">
              <label htmlFor="mesIni">Mês de início</label>
              <select id="mesIni" value={perfil.mesIni} onChange={(e) => atualizar('mesIni', Number(e.target.value))}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="anoIni">Ano de início</label>
              <select id="anoIni" value={perfil.anoIni} onChange={(e) => atualizar('anoIni', Number(e.target.value))}>
                {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="mesFim">Mês de fim</label>
              <select id="mesFim" value={perfil.mesFim} onChange={(e) => atualizar('mesFim', Number(e.target.value))}>
                {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="anoFim">Ano de fim</label>
              <select id="anoFim" value={perfil.anoFim} onChange={(e) => atualizar('anoFim', Number(e.target.value))}>
                {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div className="aviso aviso-info" style={{ marginTop: '1rem' }}>
            {meses > 0
              ? `${MESES[perfil.mesIni - 1]}/${perfil.anoIni} → ${MESES[perfil.mesFim - 1]}/${perfil.anoFim} · ${meses} meses`
              : 'O início deve ser anterior ao fim.'}
          </div>
        </div>
      </div>

      {msg && (
        <div className={`aviso ${msg.tipo === 'ok' ? 'aviso-ok' : 'aviso-erro'}`} role="status" style={{ marginBottom: '1rem' }}>
          {msg.texto}
        </div>
      )}

      <button type="submit" className="btn" disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar perfil'}
      </button>
      </form>

      <section className="card" style={{ marginTop: '1.5rem' }} aria-labelledby="privacidade-dados-titulo">
        <div className="card-cab"><h2 id="privacidade-dados-titulo">Seus dados e privacidade</h2></div>
        <div className="card-corpo pilha">
          <p className="suave">Baixe uma cópia dos dados da conta e dos registros financeiros armazenados no PROV.</p>
          {mensagemPrivacidade && <p className="aviso aviso-info" role="status">{mensagemPrivacidade}</p>}
          <button type="button" className="btn btn-sec" onClick={() => void baixarDados()} disabled={exportando || excluindo}>
            {exportando ? 'Preparando arquivo…' : 'Baixar meus dados'}
          </button>
          <p className="pequeno"><a href="/privacidade">Leia a Política de Privacidade</a></p>
        </div>
      </section>

      <section className="card" style={{ marginTop: '1rem', borderColor: 'var(--dn)' }} aria-labelledby="excluir-conta-titulo">
        <div className="card-cab"><h2 id="excluir-conta-titulo">Excluir conta e dados</h2></div>
        <form className="card-corpo pilha" onSubmit={(ev) => void excluirConta(ev)}>
          <p className="suave">A exclusão cancela uma assinatura ativa e remove a conta e os dados do PROV. Registros que precisem ser mantidos por obrigação legal ou para defesa de direitos podem permanecer pelo prazo aplicável; o Mercado Pago também trata os dados de pagamento conforme suas próprias regras.</p>
          <p className="pequeno">Por segurança, a sessão precisa ter sido autenticada nos últimos 10 minutos. Caso contrário, entre novamente antes de repetir a solicitação.</p>
          <div className="campo">
            <label htmlFor="confirmar-exclusao">Digite o e-mail da sua conta para confirmar</label>
            <input id="confirmar-exclusao" type="email" autoComplete="off" value={emailConfirmacao} onChange={(ev) => setEmailConfirmacao(ev.target.value)} />
          </div>
          <button type="submit" className="btn btn-perigo" disabled={excluindo || exportando || !user?.email || emailConfirmacao.trim().toLowerCase() !== user.email.toLowerCase()}>
            {excluindo ? 'Excluindo conta…' : 'Excluir permanentemente minha conta'}
          </button>
        </form>
      </section>
    </div>
  );
}
