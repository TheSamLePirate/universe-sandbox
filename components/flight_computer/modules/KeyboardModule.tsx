import React, { useEffect } from 'react';
import { Body, FlightComputerModule, FlightComputerInput, PhysicsConfig, RendezvousSolution, FlightComputerModuleType } from '../../../types';
import { getUpdateForInput } from '../utils';

interface ModuleProps {
    module: FlightComputerModule;
    bodies: Body[];
    modules: FlightComputerModule[];
    physicsConfig: PhysicsConfig;
    rendezvousSolutionMap: Record<string, RendezvousSolution>;
    onUpdateModule: (id: string, updates: Partial<FlightComputerModule>) => void;
    onAddModule: (type: FlightComputerModuleType, inputs?: Record<string, FlightComputerInput>) => void;
}

const KeyboardModule: React.FC<ModuleProps> = ({ module, onUpdateModule }) => {

    const isAutodetect = module.keyboardAutodetect ?? false;
    const currentKey = module.keyboardKey ?? '';
    const isPressed = module.keyboardState ?? false;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isAutodetect) {
                e.preventDefault();
                onUpdateModule(module.id, {
                    keyboardKey: e.code,
                    keyboardAutodetect: false
                });
            } else if (currentKey && e.code === currentKey) {
                if (!isPressed) {
                    onUpdateModule(module.id, { keyboardState: true });
                }
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (currentKey && e.code === currentKey) {
                onUpdateModule(module.id, { keyboardState: false });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [module.id, isAutodetect, currentKey, isPressed, onUpdateModule]);

    return (
        <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between bg-slate-900/50 p-2 rounded border border-slate-700/30">
                <span className="text-xs text-slate-400">Assigned Key:</span>
                <span className="font-mono text-sm text-slate-200 font-bold">
                    {currentKey || 'None'}
                </span>
            </div>

            <div className="flex gap-2">
                <button
                    onClick={() => onUpdateModule(module.id, { keyboardAutodetect: !isAutodetect })}
                    className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${isAutodetect
                            ? 'bg-yellow-600 text-white animate-pulse'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                >
                    {isAutodetect ? 'Press any key...' : 'Set Key'}
                </button>
            </div>

            <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Output State:</span>
                <span className={`font-mono font-bold ${isPressed ? 'text-green-400' : 'text-slate-600'}`}>
                    {isPressed ? 'TRUE' : 'FALSE'}
                </span>
            </div>
        </div>
    );
};

export default KeyboardModule;
