'use client';

import { useEffect } from 'react';

const CHAVE_TEMA = 'prov:tema';

export function ThemeToggle() {
  useEffect(() => {
    let salvo: string | null = null;
    try { salvo = localStorage.getItem(CHAVE_TEMA); } catch { /* Usa a preferência do sistema se o armazenamento estiver indisponível. */ }
    if (salvo === 'escuro' || salvo === 'claro') document.documentElement.dataset.tema = salvo;
    else delete document.documentElement.dataset.tema;
  }, []);

  function alternar() {
    const raiz = document.documentElement;
    const temaAtual = raiz.dataset.tema ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro');
    const proximo = temaAtual === 'escuro' ? 'claro' : 'escuro';
    raiz.dataset.tema = proximo;
    try { localStorage.setItem(CHAVE_TEMA, proximo); } catch { /* O tema permanece ativo até a página ser fechada. */ }
  }

  return (
    <button type="button" className="btn btn-sec btn-mini tema-botao" aria-label="Alternar entre tema claro e escuro" onClick={alternar}>
      <span className="tema-escuro">🌙 Tema escuro</span><span className="tema-claro">☀️ Tema claro</span>
    </button>
  );
}
