'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { mensagemDeErroAuth, useAuth } from '@/lib/auth-context';

type Modo = 'entrar' | 'criar';
type Plano = 'mensal' | 'anual';

export default function LoginPage() {
  const { user, loading, entrarComEmail, criarConta, entrarComGoogle, recuperarSenha } = useAuth();
  const router = useRouter();
  const [modo, setModo] = useState<Modo>('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [plano, setPlano] = useState<Plano | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planoSelecionado = params.get('plano');
    if (params.get('modo') === 'criar') setModo('criar');
    if (planoSelecionado === 'mensal' || planoSelecionado === 'anual') {
      setPlano(planoSelecionado);
    }
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (!plano) {
      router.replace('/dashboard');
      return;
    }

    let cancelado = false;
    async function abrirCheckout() {
      setEnviando(true);
      setErro('');
      try {
        const token = await user!.getIdToken();
        const resposta = await fetch('/api/billing/mercadopago/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ plano }),
        });
        const dados = await resposta.json();
        if (!resposta.ok || typeof dados.initPoint !== 'string') {
          throw new Error(dados.error || 'Não foi possível iniciar o pagamento.');
        }
        if (!cancelado) window.location.assign(dados.initPoint);
      } catch (e) {
        if (!cancelado) {
          setErro(e instanceof Error ? e.message : 'Não foi possível iniciar o pagamento.');
          setEnviando(false);
        }
      }
    }
    void abrirCheckout();
    return () => { cancelado = true; };
  }, [loading, user, plano, router]);

  async function executar(acao: () => Promise<void>) {
    setErro('');
    setInfo('');
    setEnviando(true);
    try {
      await acao();
    } catch (e) {
      setErro(mensagemDeErroAuth(e));
    } finally {
      setEnviando(false);
    }
  }

  function aoEnviar(ev: FormEvent) {
    ev.preventDefault();
    if (modo === 'criar' && !nome.trim()) {
      setErro('Informe seu nome.');
      return;
    }
    void executar(() =>
      modo === 'entrar' ? entrarComEmail(email.trim(), senha) : criarConta(nome.trim(), email.trim(), senha),
    );
  }

  function esqueciSenha() {
    if (!email.trim()) {
      setErro('Digite seu e-mail acima para receber o link de recuperação.');
      return;
    }
    void executar(async () => {
      await recuperarSenha(email.trim());
      setInfo('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.');
    });
  }

  return (
    <main className="login-pagina">
      <div className="card login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo" src="/logo-prov.png" alt="PROV" />
        <p style={{ textAlign: 'center', color: 'var(--texto-suave)' }}>Planejador financeiro pessoal</p>

        {plano && <div className="aviso aviso-info">Plano {plano}: após entrar ou criar sua conta, você seguirá para o checkout seguro do Mercado Pago.</div>}
        {enviando && user && <div className="aviso aviso-info" role="status">Preparando checkout…</div>}

        <div className="abas" role="tablist" aria-label="Acesso">
          <button type="button" role="tab" className="aba" aria-selected={modo === 'entrar'} onClick={() => { setModo('entrar'); setErro(''); }}>
            Entrar
          </button>
          <button type="button" role="tab" className="aba" aria-selected={modo === 'criar'} onClick={() => { setModo('criar'); setErro(''); }}>
            Criar conta
          </button>
        </div>

        <button type="button" className="btn btn-claro" style={{ width: '100%' }} disabled={enviando} onClick={() => void executar(entrarComGoogle)}>
          Continuar com Google
        </button>

        <div className="separador">ou com e-mail</div>

        <form className="pilha" onSubmit={aoEnviar}>
          {modo === 'criar' && (
            <div className="campo">
              <label htmlFor="nome">Nome</label>
              <input id="nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
          )}
          <div className="campo">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
              minLength={6}
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>

          {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
          {info && <div className="aviso aviso-ok" role="status">{info}</div>}

          <button type="submit" className="btn" disabled={enviando}>
            {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
          </button>

          {modo === 'entrar' && (
            <button type="button" className="btn-link" onClick={esqueciSenha} disabled={enviando}>
              Esqueci minha senha
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
