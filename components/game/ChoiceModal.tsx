import React from "react";
import { HelpCircle, DollarSign, Zap, Ticket } from "lucide-react";

interface ChoiceModalProps {
  isOpen: boolean;
  type: "lottery" | "ipo" | "emergency";
  onConfirm: (payload: any) => void;
  onClose: () => void;
  playerCash: number;
  /** Pre-rolled emergency cost. Must be provided when type === "emergency". */
  emergencyAmount?: number;
}

export default function ChoiceModal({
  isOpen,
  type,
  onConfirm,
  onClose,
  playerCash,
  emergencyAmount,
}: ChoiceModalProps) {
  if (!isOpen) return null;

  // ─── Content definitions ────────────────────────────────────────────────────

  if (type === "lottery") {
    return (
      <Modal>
        <Header icon={<Ticket size={32} className="text-yellow-500" />} title="Play Lottery?" />
        <p className="text-gray-500 text-sm mt-2 text-center mb-6">
          Pay 2L to roll. Roll 1–2: 0L return, 3–4: 2L return, 5–6: 5L return.
        </p>
        <div className="space-y-3">
          <button disabled={playerCash < 2} onClick={() => onConfirm({ play: true })} className="btn-primary w-full py-4 text-sm font-black uppercase tracking-widest disabled:opacity-30">
            Pay 2L &amp; Play
          </button>
          <button onClick={() => onConfirm({ play: false })} className="btn-secondary w-full py-4 text-sm font-black uppercase tracking-widest">
            Skip
          </button>
          <button onClick={onClose} className="btn-secondary w-full py-4 text-sm font-black uppercase tracking-widest">Cancel</button>
        </div>
      </Modal>
    );
  }

  if (type === "ipo") {
    return (
      <Modal>
        <Header icon={<Zap size={32} className="text-purple-500" />} title="IPO Investment" />
        <p className="text-gray-500 text-sm mt-2 text-center mb-6">
          Invest up to 2L cash to receive double in stocks.
        </p>
        <div className="space-y-3">
          <button disabled={playerCash < 2} onClick={() => onConfirm({ amount: 2 })} className="btn-primary w-full py-4 text-sm font-black uppercase tracking-widest disabled:opacity-30">
            Invest 2L
          </button>
          <button disabled={playerCash < 1} onClick={() => onConfirm({ amount: 1 })} className="btn-primary w-full py-4 text-sm font-black uppercase tracking-widest disabled:opacity-30">
            Invest 1L
          </button>
          <button onClick={() => onConfirm({ amount: 0 })} className="btn-secondary w-full py-4 text-sm font-black uppercase tracking-widest">
            Skip
          </button>
          <button onClick={onClose} className="btn-secondary w-full py-4 text-sm font-black uppercase tracking-widest">Cancel</button>
        </div>
      </Modal>
    );
  }

  // type === "emergency"
  // emergencyAmount is pre-rolled by the dispatcher when the modal was first triggered.
  // Cancelling and re-opening will pass the same value from page state, so it never re-rolls.
  const amount = emergencyAmount ?? 3;
  return (
    <Modal>
      <Header icon={<DollarSign size={32} className="text-red-500" />} title="Emergency!" />
      <p className="text-gray-500 text-sm mt-2 text-center mb-6">
        You must pay a mandatory emergency fee of <strong>{amount}L</strong> to the bank.
      </p>
      <div className="space-y-3">
        <button
          onClick={() => onConfirm({ amount })}
          className="bg-red-600 hover:bg-red-700 text-white font-black w-full py-4 text-sm uppercase tracking-widest rounded-2xl transition-colors"
        >
          Pay {amount}L
        </button>
        <button onClick={onClose} className="btn-secondary w-full py-4 text-sm font-black uppercase tracking-widest">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

// ─── Shared shell ─────────────────────────────────────────────────────────────

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-sm">{children}</div>
    </div>
  );
}

function Header({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="text-center mb-2">
      <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
        {icon}
      </div>
      <h2 className="text-2xl font-black text-[var(--navy)]">{title}</h2>
    </div>
  );
}
