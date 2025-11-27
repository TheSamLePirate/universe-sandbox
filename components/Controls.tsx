

import React from 'react';
import { Play, Pause, RefreshCw, ZoomIn, ZoomOut, Plus, List, Grid, Settings, MessageSquare, Hammer, Glasses, Target, CircleDashed, Rocket } from 'lucide-react';
import { Preset } from '../types';

interface ControlsProps {
  isRunning: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  speed: number;
  onSpeedChange: (val: number) => void;
  onZoom: (delta: number) => void;
  onOpenBuilder: () => void;
  onOpenSettings: () => void;
  presets: Preset[];
  currentPresetId: string;
  onSelectPreset: (id: string) => void;
  showGrid: boolean;
  onToggleGrid: () => void;
  showAssistant: boolean;
  onToggleAssistant: () => void;
  isCreationMode: boolean;
  onToggleCreationMode: () => void;
  showObserver: boolean;
  onToggleObserver: () => void;
  isFollowingCoM: boolean;
  onToggleFollowCoM: () => void;
  showCenterOfMass: boolean;
  onToggleShowCoM: () => void;
  
  // Rocket Props
  showRocketPanel: boolean;
  onToggleRocketPanel: () => void;
}

const Controls: React.FC<ControlsProps> = ({
  isRunning,
  onTogglePlay,
  onReset,
  speed,
  onSpeedChange,
  onZoom,
  onOpenBuilder,
  onOpenSettings,
  presets,
  currentPresetId,
  onSelectPreset,
  showGrid,
  onToggleGrid,
  showAssistant,
  onToggleAssistant,
  isCreationMode,
  onToggleCreationMode,
  showObserver,
  onToggleObserver,
  isFollowingCoM,
  onToggleFollowCoM,
  showCenterOfMass,
  onToggleShowCoM,
  showRocketPanel,
  onToggleRocketPanel
}) => {
  return (
    <div 
        className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-md border-t border-slate-700 p-2 flex items-center justify-center gap-4 shadow-2xl z-10 text-white"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
    >
      
      {/* Playback Controls */}
      <div className="flex items-center gap-2 shrink-0">
        <button 
          onClick={onTogglePlay}
          className={`p-3 rounded-full transition-colors ${isRunning ? 'bg-slate-700 hover:bg-slate-600' : 'bg-green-600 hover:bg-green-500'}`}
          title={isRunning ? "Pause" : "Play"}
        >
          {isRunning ? <Pause size={20} fill="white" /> : <Play size={20} fill="white" />}
        </button>
        
        <button 
          onClick={onReset}
          className="p-3 rounded-full hover:bg-slate-700 transition-colors text-slate-300"
          title="Reset Positions"
        >
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="h-8 w-px bg-slate-700"></div>

      {/* Preset Selector */}
      <div className="flex flex-col gap-1 w-32 shrink-0">
          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
            <List size={10} /> System Type
          </label>
          <select 
            value={currentPresetId} 
            onChange={(e) => onSelectPreset(e.target.value)}
            className="bg-slate-800 border-none text-xs text-white rounded p-1 focus:ring-1 focus:ring-blue-500 cursor-pointer outline-none"
          >
              {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
              ))}
          </select>
      </div>

      <div className="h-8 w-px bg-slate-700"></div>

      {/* Speed Control */}
      <div className="flex flex-col gap-1 w-24 shrink-0">
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>SPEED</span>
            <span>{speed.toFixed(1)}x</span>
        </div>
        <input 
          type="range" 
          min="0.01" 
          max="100.0" 
          step="0.01"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      <div className="h-8 w-px bg-slate-700"></div>

      {/* Tools */}
      <div className="flex items-center gap-2 shrink-0">
        <button 
          onClick={onToggleAssistant} 
          className={`p-2 rounded-lg transition-colors ${showAssistant ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' : 'text-slate-400 hover:bg-slate-800'}`}
          title={showAssistant ? "Hide Assistant" : "Show AI Assistant"}
        >
            <MessageSquare size={18} />
        </button>

        <button 
          onClick={onToggleGrid} 
          className={`p-2 rounded-lg transition-colors ${showGrid ? 'bg-slate-700 text-blue-300' : 'text-slate-400 hover:bg-slate-800'}`}
          title="Toggle Gravity Grid"
        >
            <Grid size={18} />
        </button>

        <button 
          onClick={onToggleObserver} 
          className={`p-2 rounded-lg transition-colors ${showObserver ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          title="Observe Gravity"
        >
            <Glasses size={18} />
        </button>

        <button 
          onClick={onToggleFollowCoM} 
          className={`p-2 rounded-lg transition-colors ${isFollowingCoM ? 'bg-rose-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          title={isFollowingCoM ? "Stop Following Center of Mass" : "Follow Center of Mass"}
        >
            <Target size={18} />
        </button>

        <button 
          onClick={onToggleShowCoM} 
          className={`p-2 rounded-lg transition-colors ${showCenterOfMass ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          title="Show Center of Mass & Threshold"
        >
            <CircleDashed size={18} />
        </button>

        <button 
          onClick={onOpenSettings} 
          className="p-2 text-slate-400 hover:bg-slate-800 rounded-lg transition-colors hover:text-white"
          title="Simulation Settings"
        >
            <Settings size={18} />
        </button>

        <div className="h-8 w-px bg-slate-700 mx-1"></div>
        
        {/* Creation Mode Toggle */}
        <button 
          onClick={onToggleCreationMode}
          className={`p-2 rounded-lg transition-colors ${isCreationMode ? 'bg-orange-600 text-white animate-pulse' : 'text-slate-300 hover:bg-slate-800'}`}
          title="Manual Build Mode (Pause to Build)"
        >
          <Hammer size={18} />
        </button>

        {/* Rocket Mode Toggle */}
        <button 
          onClick={onToggleRocketPanel}
          className={`p-2 rounded-lg transition-colors ${showRocketPanel ? 'bg-indigo-600 text-white shadow shadow-indigo-500/50' : 'text-slate-300 hover:bg-slate-800'}`}
          title="Space Rocket Systems"
        >
          <Rocket size={18} />
        </button>


        
        <div className="flex bg-slate-800 rounded-lg">
            <button 
            onClick={() => onZoom(1.2)} 
            className="p-2 hover:bg-slate-700 rounded-l-lg transition-colors text-slate-300"
            >
            <ZoomIn size={18} />
            </button>
            <div className="w-px bg-slate-700 my-1"></div>
            <button 
            onClick={() => onZoom(0.8)} 
            className="p-2 hover:bg-slate-700 rounded-r-lg transition-colors text-slate-300"
            >
            <ZoomOut size={18} />
            </button>
        </div>
      </div>

    </div>
  );
};

export default Controls;