'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { mensagemDeErroAuth, useAuth } from '@/lib/auth-context';

type Modo = 'entrar' | 'criar';

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

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

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
