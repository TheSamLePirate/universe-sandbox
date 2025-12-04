import React from 'react';
import { Body, FlightComputerModule, FlightComputerInput, PhysicsConfig, RendezvousSolution, FlightComputerModuleType } from '../../../types';
import { resolveBooleanInput } from '../../../services/orbitalMath';
import { getInput, getUpdateForInput } from '../utils';
import InputSelector from '../InputSelector';

interface ModuleProps {
    module: FlightComputerModule;
    bodies: Body[];
    modules: FlightComputerModule[];
    physicsConfig: PhysicsConfig;
    rendezvousSolutionMap: Record<string, RendezvousSolution>;
    onUpdateModule: (id: string, updates: Partial<FlightComputerModule>) => void;
    onAddModule: (type: FlightComputerModuleType, inputs?: Record<string, FlightComputerInput>) => void;
}

const NotifyModule: React.FC<ModuleProps> = ({ module, bodies, modules, physicsConfig, rendezvousSolutionMap, onUpdateModule }) => {
    const updateInput = (moduleId: string, key: string, input: FlightComputerInput | undefined) => {
        onUpdateModule(moduleId, getUpdateForInput(module, key, input));
    };

    const notifyInput = getInput(module, 'primary');
    const notifyTriggered = resolveBooleanInput(notifyInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
    
    return (
        <div className="mt-2 space-y-2">
            <div className="space-y-1">
                <label className="text-[9px] text-slate-500 uppercase">Message</label>
                <input
                    type="text"
                    value={module.notifyMessage || ''}
                    onChange={(e) => onUpdateModule(module.id, { notifyMessage: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                    placeholder="Alert message..."
                />
            </div>
            
            <div className={`p-2 rounded border flex items-center justify-between ${notifyTriggered ? 'bg-red-900/20 border-red-500/40' : 'bg-slate-800/30 border-slate-700/30'}`}>
                <span className="text-[10px] text-slate-400 uppercase">Status</span>
                <span className={`text-xs font-bold ${notifyTriggered ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>
                    {notifyTriggered ? 'TRIGGERED' : 'IDLE'}
                </span>
            </div>
        </div>
    );
};

export default NotifyModule;
