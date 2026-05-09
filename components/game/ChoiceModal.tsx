import React, { useMemo } from "react";
import { HelpCircle, DollarSign, Zap, Ticket } from "lucide-react";

interface ChoiceModalProps {
  isOpen: boolean;
  type: "lottery" | "ipo" | "emergency";
  onConfirm: (payload: any) => void;
  onClose: () => void;
  playerCash: number;
}

export default function ChoiceModal({ isOpen, type, onConfirm, onClose, playerCash }: ChoiceModalProps) {
  if (!isOpen) return null;

  const content = useMemo(() => {
    const items = {
      lottery: {
        title: "Play Lottery?",
        description: "Pay 2L to roll. Roll 1-2: 0L return, 3-4: 2L return, 5-6: 5L return.",
        icon: <Ticket size={32} className="text-yellow-500" />,
        options: [
          { label: "Pay 2L & Play", value: { play: true }, disabled: playerCash < 2, color: "btn-primary" },
          { label: "Skip", value: { play: false }, disabled: false, color: "btn-secondary" }
        ]
      },
      ipo: {
        title: "IPO Investment",
        description: "Invest up to 2L cash to receive double in stocks.",
        icon: <Zap size={32} className="text-purple-500" />,
        options: [
          { label: "Invest 2L", value: { amount: 2 }, disabled: playerCash < 2, color: "btn-primary" },
          { label: "Invest 1L", value: { amount: 1 }, disabled: playerCash < 1, color: "btn-primary" },
          { label: "Skip", value: { amount: 0 }, disabled: false, color: "btn-secondary" }
        ]
      },
      emergency: (() => {
        const rand = Math.random();
        const amount = rand < 0.5 ? 3 : rand < 0.8 ? 5 : 10;
        return {
          title: "Emergency!",
          description: `You must pay a mandatory emergency fee of ${amount}L to the bank.`,
          icon: <DollarSign size={32} className="text-red-500" />,
          options: [
            { label: `Pay ${amount}L`, value: { amount }, disabled: false, color: "bg-red-600 hover:bg-red-700 text-white font-black" }
          ]
        };
      })()
    };
    return items[type];
  }, [type, playerCash]);

  return (
    <div className="modal-overlay">
      <div className="modal-card max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
            {content.icon}
          </div>
          <h2 className="text-2xl font-black text-[var(--navy)]">{content.title}</h2>
          <p className="text-gray-500 text-sm mt-2">{content.description}</p>
        </div>

        <div className="space-y-3">
          {content.options.map((opt, i) => (
            <button
              key={i}
              disabled={opt.disabled}
              onClick={() => onConfirm(opt.value)}
              className={`${opt.color} w-full py-4 text-sm font-black uppercase tracking-widest disabled:opacity-30`}
            >
              {opt.label}
            </button>
          ))}
          <button 
            onClick={onClose}
            className="btn-secondary w-full py-4 text-sm font-black uppercase tracking-widest"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
