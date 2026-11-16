'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth-context';

const EMAIL_SUPORTE = 'prov.suport@gmail.com';

export default function SuportePage() {
  const { user } = useAuth();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [aviso, setAviso] = useState('');

  function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const corpo = [
      `Nome: ${nome.trim() || 'Não informado'}`,
      `E-mail para retorno: ${email.trim()}`,
      '',
      'Descrição do problema:',
      mensagem.trim(),
    ].join('\n');
    const destino = `mailto:${EMAIL_SUPORTE}?subject=${encodeURIComponent(`[PROV] ${assunto.trim()}`)}&body=${encodeURIComponent(corpo)}`;
    setAviso('Seu aplicativo de e-mail será aberto com a mensagem pronta. Revise os dados e toque em Enviar.');
    window.location.href = destino;
  }

  return (
    <section style={{ maxWidth: 760, marginInline: 'auto' }}>
      <div className="pagina-cab">
        <div><div className="sub">Estamos aqui para ajudar</div><h1>Suporte</h1></div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-cab"><h2>Fale com a equipe PROV</h2></div>
        <div className="card-corpo pilha">
          <p className="suave">Conte o que aconteceu. Inclua detalhes que ajudem a entender o problema, como a ferramenta usada e as etapas que você seguiu. Não inclua senha, credenciais bancárias ou número completo de cartão.</p>
          <form className="pilha" onSubmit={enviar}>
            <div className="grade-2">
              <div className="campo">
                <label htmlFor="suporte-nome">Nome</label>
                <input id="suporte-nome" autoComplete="off" maxLength={120} value={nome} onChange={(ev) => setNome(ev.target.value)} placeholder="Seu nome" />
              </div>
              <div className="campo">
                <label htmlFor="suporte-email">E-mail para retorno</label>
                <input id="suporte-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(ev) => setEmail(ev.target.value)} />
              </div>
            </div>
            <div className="campo">
              <label htmlFor="suporte-assunto">Assunto</label>
              <input id="suporte-assunto" required maxLength={120} value={assunto} onChange={(ev) => setAssunto(ev.target.value)} placeholder="Ex.: não consigo importar meu CSV" />
            </div>
            <div className="campo">
              <label htmlFor="suporte-mensagem">Como podemos ajudar?</label>
              <textarea id="suporte-mensagem" required rows={7} maxLength={5000} value={mensagem} onChange={(ev) => setMensagem(ev.target.value)} placeholder="Descreva o problema e o que você tentou fazer." />
            </div>
            {aviso && <p className="aviso aviso-info" role="status">{aviso}</p>}
            <div className="acoes">
              <button type="submit" className="btn">Preparar e-mail para o suporte</button>
              <a className="btn btn-sec" href={`mailto:${EMAIL_SUPORTE}`}>Abrir e-mail diretamente</a>
            </div>
          </form>
        </div>
      </div>

      <p className="suave pequeno">Contato: <a href={`mailto:${EMAIL_SUPORTE}`}>{EMAIL_SUPORTE}</a>. O PROV abrirá um rascunho no aplicativo de e-mail do seu dispositivo; a mensagem só será enviada quando você confirmar o envio por lá. <a href="/privacidade">Política de Privacidade</a>.</p>
    </section>
  );
}
