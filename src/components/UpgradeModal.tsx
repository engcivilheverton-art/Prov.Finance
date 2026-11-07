'use client';

import Link from 'next/link';
import { Modal } from '@/components/Modal';

export function UpgradeModal({ aberto, onFechar, recurso }: { aberto: boolean; onFechar: () => void; recurso?: string }) {
  return (
    <Modal aberto={aberto} titulo="Recurso Premium" onFechar={onFechar}>
      <div className="pilha">
        <p>Esta funcionalidade{recurso ? ` (${recurso})` : ''} é exclusiva do plano Premium.</p>
        <p className="suave">Seus dados existentes continuam salvos. Conheça os planos para liberar este recurso.</p>
        <div className="acoes" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-sec" onClick={onFechar}>Agora não</button>
          <Link href="/planos" className="btn" style={{ textDecoration: 'none' }}>Ver planos</Link>
        </div>
      </div>
    </Modal>
  );
}
