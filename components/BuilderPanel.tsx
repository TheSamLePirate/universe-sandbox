import React, { useState } from 'react';
import { X, Check } from 'lucide-react';

interface BuilderPanelProps {
  onClose: () => void;
  onAddBody: (data: NewBodyData) => void;
}

export interface NewBodyData {
    name: string;
    mass: number;
    distance: number;
    velocity: number;
    color: string;
    radius: number;
}

const COLORS = ['#EB4D4B', '#22A6B3', '#D980FA', '#F79F1F', '#7ED6DF', '#BadC58', '#FFBE76'];

const BuilderPanel: React.FC<BuilderPanelProps> = ({ onClose, onAddBody }) => {
  const [name, setName] = useState('New Planet');
  const [mass, setMass] = useState(20);
  const [dist, setDist] = useState(250);
  const [vel, setVel] = useState(3.0);
  const [color, setColor] = useState(COLORS[0]);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      onAddBody({
          name,
          mass,
          distance: dist,
          velocity: vel,
          color,
          radius: Math.max(4, Math.log(mass) * 3) // Approx radius based on mass
      });
      onClose();
  };

  return (
    <div 
        className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
    >
      <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl w-96 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">
            <X size={20} />
        </button>
        
        <h2 className="text-xl font-bold text-white mb-6">Create Celestial Body</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-xs text-slate-400 uppercase mb-1">Name</label>
                <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:border-blue-500 outline-none"
                    maxLength={15}
                />
            </div>

            <div>
                <label className="block text-xs text-slate-400 uppercase mb-1">Mass (Gravity strength)</label>
                <input 
                    type="range" min="1" max="1000" step="10" 
                    value={mass} onChange={e => setMass(Number(e.target.value))}
                    className="w-full"
                />
                <div className="text-right text-xs text-blue-300 font-mono">{mass} units</div>
            </div>

            <div>
                <label className="block text-xs text-slate-400 uppercase mb-1">Distance from Center</label>
                <input 
                    type="range" min="50" max="1000" step="10" 
                    value={dist} onChange={e => setDist(Number(e.target.value))}
                    className="w-full"
                />
                <div className="text-right text-xs text-blue-300 font-mono">{dist} units</div>
            </div>

            <div>
                <label className="block text-xs text-slate-400 uppercase mb-1">Initial Tangential Velocity</label>
                <input 
                    type="range" min="0" max="10" step="0.1" 
                    value={vel} onChange={e => setVel(Number(e.target.value))}
                    className="w-full"
                />
                <div className="text-right text-xs text-blue-300 font-mono">{vel.toFixed(1)} units/frame</div>
            </div>

            <div>
                <label className="block text-xs text-slate-400 uppercase mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                    {COLORS.map(c => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-white' : 'opacity-70 hover:opacity-100'}`}
                        />
                    ))}
                </div>
            </div>

            <button 
                type="submit" 
                className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
                <Check size={18} /> Spawn Body
            </button>
        </form>
      </div>
    </div>
  );
};

export default BuilderPanel;