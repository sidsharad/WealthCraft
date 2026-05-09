import React from "react";
import { User, ArrowRight } from "lucide-react";

interface PassDeviceScreenProps {
  nextPlayerName: string;
  summary?: string | null;
  onContinue: () => void;
}

export default function PassDeviceScreen({ nextPlayerName, summary, onContinue }: PassDeviceScreenProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--navy)] p-6">
      <div className="text-center animate-scale-in">
        <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-float">
          <User size={48} className="text-[var(--gold)]" />
        </div>
        
        <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tight">
          Pass the Device
        </h2>
        <p className="text-white/60 mb-10 text-lg">
          It's <span className="text-[var(--gold)] font-black">{nextPlayerName}'s</span> turn.
        </p>

        {summary && (
          <div className="bg-white/5 rounded-2xl p-6 mb-8 border border-[var(--gold)]/30 max-w-sm mx-auto text-left animate-slide-up">
            <h3 className="text-[10px] font-black uppercase text-[var(--gold)] tracking-widest mb-3">Your Turn Summary</h3>
            <p className="text-sm text-white font-bold whitespace-pre-line leading-relaxed">
              {summary}
            </p>
          </div>
        )}

        <div className="bg-white/5 rounded-2xl p-6 mb-10 border border-white/10 max-w-xs mx-auto">
          <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-2">Next Up</p>
          <p className="text-sm text-white/80 leading-relaxed italic">
            Please hand the device to <span className="text-[var(--gold)] font-black">{nextPlayerName}</span>.
          </p>
        </div>

        <button
          onClick={onContinue}
          className="btn-primary flex items-center gap-2 mx-auto px-10 py-4 text-xl group"
        >
          I am {nextPlayerName} <ArrowRight size={24} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}
