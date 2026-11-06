'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { mensagemDeErroAuth, useAuth } from '@/lib/auth-context';
import { planoValido, type PlanoId } from '@/lib/planos';

type Modo = 'entrar' | 'criar';

export default function LoginForm({ initialMode, plan }: { initialMode: Modo; plan: string }) {
  const { user, loading, entrarComEmail, criarConta, entrarComGoogle, recuperarSenha } = useAuth();
  const router = useRouter();
  const [modo, setModo] = useState<Modo>(initialMode);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const checkoutTentado = useRef(false);
  const plano: PlanoId | null = planoValido(plan) ? plan : null;

  useEffect(() => {
    if (loading || !user) return;
    if (!plano) {
      router.replace('/dashboard');
      return;
    }
    if (checkoutTentado.current) return;
    checkoutTentado.current = true;
    let ativo = true;
    setEnviando(true);
    void (async () => {
      try {
        const idToken = await user.getIdToken();
        const response = await fetch('/api/billing/checkout', {
          method: 'POST', headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ plan: plano }),
        });
        const data = await response.json() as { checkoutUrl?: string; error?: string };
        if (!response.ok || !data.checkoutUrl) throw new Error(data.error || 'Não foi possível iniciar o checkout.');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!ativo) return;
        window.location.assign(data.checkoutUrl);
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : 'Não foi possível iniciar o checkout.');
      } finally {
        if (ativo) setEnviando(false);
      }
    })();
    return () => { ativo = false; };
  }, [loading, user, plano, router]);

  async function executar(acao: () => Promise<void>) {
    setErro(''); setInfo(''); setEnviando(true);
    try { await acao(); } catch (e) { setErro(mensagemDeErroAuth(e)); } finally { setEnviando(false); }
  }

  function aoEnviar(ev: FormEvent) {
    ev.preventDefault();
    if (modo === 'criar' && !nome.trim()) { setErro('Informe seu nome.'); return; }
    void executar(() => modo === 'entrar' ? entrarComEmail(email.trim(), senha) : criarConta(nome.trim(), email.trim(), senha));
  }

  function esqueciSenha() {
    if (!email.trim()) { setErro('Digite seu e-mail acima para receber o link de recuperação.'); return; }
    void executar(async () => { await recuperarSenha(email.trim()); setInfo('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.'); });
  }

  // A checagem inicial do Firebase é assíncrona. Evita mostrar a tela de
  // entrada por um instante para quem já está autenticado e está contratando.
  if (plano && loading) {
    return (
      <main className="login-pagina">
        <div className="card login-card" role="status" aria-live="polite">
          <div className="eyebrow" style={{ textAlign: 'center' }}>PROV.</div>
          <h1 style={{ textAlign: 'center', fontSize: '1.6rem' }}>Preparando seu checkout</h1>
          <p style={{ textAlign: 'center' }}>Estamos confirmando sua sessão segura. Você será encaminhado ao Mercado Pago em instantes.</p>
        </div>
      </main>
    );
  }

  if (plano && user) {
    return (
      <main className="login-pagina">
        <div className="card login-card" role="status" aria-live="polite">
          <div className="eyebrow" style={{ textAlign: 'center' }}>PROV.</div>
          <h1 style={{ textAlign: 'center', fontSize: '1.6rem' }}>{erro ? 'Não foi possível abrir o checkout' : 'Indo para o checkout'}</h1>
          <p style={{ textAlign: 'center' }}>{erro || 'Sua conta está conectada. Você será redirecionado ao checkout seguro do Mercado Pago em instantes.'}</p>
          {erro && <button type="button" className="btn" onClick={() => window.location.reload()}>Tentar novamente</button>}
        </div>
      </main>
    );
  }

  return (
    <main className="login-pagina">
      <div className="card login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo logo" src="/logo-prov.png" alt="PROV" />
        <div className="eyebrow" style={{ textAlign: 'center' }}>Gestão financeira pessoal</div>
        <h1 style={{ textAlign: 'center', fontSize: '1.6rem' }}>{plano ? 'Continue para contratar o Premium' : 'Assuma o controle da sua vida financeira.'}</h1>
        {plano && <div className="aviso aviso-info">Plano escolhido: <strong>{plano === 'mensal' ? 'Premium mensal — R$ 11,99/mês' : 'Premium anual — R$ 119,88/ano'}</strong>. Após entrar ou criar sua conta, você seguirá para o checkout. O acesso Premium só será liberado após confirmação do pagamento.</div>}

        <div className="abas" role="tablist" aria-label="Acesso">
          <button type="button" role="tab" className="aba" aria-selected={modo === 'entrar'} onClick={() => { setModo('entrar'); setErro(''); }}>Entrar</button>
          <button type="button" role="tab" className="aba" aria-selected={modo === 'criar'} onClick={() => { setModo('criar'); setErro(''); }}>Criar conta grátis</button>
        </div>

        <button type="button" className="btn btn-sec" style={{ width: '100%' }} disabled={enviando} onClick={() => void executar(entrarComGoogle)}>
          Continuar com Google
        </button>
        <div className="separador">ou com e-mail</div>
        <form className="pilha" onSubmit={aoEnviar}>
          {modo === 'criar' && <div className="campo"><label htmlFor="nome">Nome</label><input id="nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required /></div>}
          <div className="campo"><label htmlFor="email">E-mail</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="campo"><label htmlFor="senha">Senha</label><input id="senha" type="password" autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} minLength={6} required value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
          {erro && <div className="aviso aviso-erro" role="alert">{erro}</div>}
          {info && <div className="aviso aviso-ok" role="status">{info}</div>}
          <button type="submit" className="btn" disabled={enviando}>{enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : plano ? 'Criar conta e continuar' : 'Criar conta grátis'}</button>
          {modo === 'entrar' && <button type="button" className="btn-link" onClick={esqueciSenha} disabled={enviando}>Esqueci minha senha</button>}
        </form>
      </div>
    </main>
  );
}
