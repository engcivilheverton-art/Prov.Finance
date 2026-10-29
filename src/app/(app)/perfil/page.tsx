'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';
import { carregarPerfil, MESES, mesesNoPeriodo, salvarPerfil } from '@/lib/perfil';
import { PERFIL_PADRAO, type Perfil } from '@/types/finance';

const ANOS = [2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];

export default function PerfilPage() {
  const { user } = useAuth();
  const [perfil, setPerfil] = useState<Perfil>(PERFIL_PADRAO);
  const [idadeTexto, setIdadeTexto] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

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

  if (carregando) return <p style={{ color: 'var(--texto-suave)' }}>Carregando…</p>;

  return (
    <form onSubmit={aoSalvar} style={{ maxWidth: 640 }}>
      <div className="rotulo">Configuração</div>
      <h1 className="titulo">Meu perfil</h1>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-cab">Dados pessoais</div>
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
        <div className="card-cab">Período de análise dos gráficos</div>
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
  );
}
