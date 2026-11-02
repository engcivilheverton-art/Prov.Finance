'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Props = { aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode; rodape?: ReactNode };

/** Diálogo nativo (<dialog>): foco, Esc e fundo escurecido vêm do navegador. O conteúdo só existe enquanto aberto. */
export function Modal({ aberto, titulo, onFechar, children, rodape }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    <dialog ref={ref} onClose={onFechar} onClick={(e) => { if (e.target === ref.current) onFechar(); }}>
      {aberto && (
        <>
          <div className="dlg-cab">
            <h2>{titulo}</h2>
            <button type="button" aria-label="Fechar" onClick={onFechar}>✕</button>
          </div>
          <div className="dlg-corpo">{children}</div>
          {rodape && <div className="dlg-rodape">{rodape}</div>}
        </>
      )}
    </dialog>
  );
}
