import React from 'react';
import { FlightComputerModule } from '../../../types';

interface ModuleProps {
    module: FlightComputerModule;
}

const SystemMonitorModule: React.FC<ModuleProps> = ({ module }) => {
    const stats = module.systemMonitorStats;

    if (!stats) return <div className="text-xs text-slate-500 italic p-1">Collecting stats...</div>;

    const totalTime = stats.globalTotalMs;
    const isHeavy = totalTime > 16; // Warning if taking more than 1 frame (at 60fps)

    return (
        <div className="mt-2 flex flex-col gap-1 w-full min-w-[200px]">
            <div className="bg-slate-800/80 p-2 rounded flex justify-between items-center border border-slate-700">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Logic Time</div>
                <div className={`text-xs font-mono font-bold ${isHeavy ? 'text-red-400' : 'text-emerald-400'}`}>
                    {totalTime.toFixed(2)} ms
                </div>
            </div>

            <div className="flex flex-col gap-0.5 mt-1 max-h-[200px] overflow-y-auto no-scrollbar">
                {stats.modules.map(m => {
                    const percent = totalTime > 0 ? (m.averageMs / totalTime) * 100 : 0;
                    return (
                        <div key={m.id} className="flex flex-col bg-slate-900/40 rounded p-1 hover:bg-slate-800/60 transition-colors">
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-300 truncate max-w-[140px]" title={m.name || m.type}>
                                    {m.name || m.type}
                                </span>
                                <span className={`font-mono ${m.averageMs > 0.5 ? 'text-amber-300' : 'text-slate-500'}`}>
                                    {m.averageMs.toFixed(2)} ms
                                </span>
                            </div>
                            {/* Mini bar chart */}
                            <div className="w-full h-0.5 bg-slate-800 mt-0.5 rounded-full overflow-hidden">
                                <div
                                    className={`h-full ${m.averageMs > 1 ? 'bg-amber-500' : 'bg-slate-500'}`}
                                    style={{ width: `${Math.min(100, percent)}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="text-[9px] text-slate-600 px-1 pt-1 italic text-center w-full">
                Includes input resolution cost
            </div>
        </div>
    );
};

export default SystemMonitorModule;
