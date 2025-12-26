import React from 'react';
import { Body, FlightComputerModule, FlightComputerInput, PhysicsConfig, RendezvousSolution, FlightComputerModuleType } from '../../../types';
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

const LineDrawerModule: React.FC<ModuleProps> = ({ module, bodies, modules, onUpdateModule }) => {
    const updateInput = (moduleId: string, key: string, input: FlightComputerInput | undefined) => {
        onUpdateModule(moduleId, getUpdateForInput(module, key, input));
    };

    const pointAInput = getInput(module, 'point_a');
    const pointBInput = getInput(module, 'point_b');
    const colorInput = getInput(module, 'color');
    const thicknessInput = getInput(module, 'thickness');

    // Defaults
    const lineColor = module.lineColor || '#00ff00';
    const lineThickness = module.lineThickness || 1;

    return (
        <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <label className="text-[9px] text-slate-500 uppercase">Point A (Start)</label>
                    <InputSelector
                        label=""
                        value={pointAInput}
                        onChange={(input) => updateInput(module.id, 'point_a', input)}
                        bodies={bodies}
                        modules={modules}
                        currentModuleId={module.id}
                        allowedTypes={['body', 'vector', 'module_output']}
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] text-slate-500 uppercase">Point B (End)</label>
                    <InputSelector
                        label=""
                        value={pointBInput}
                        onChange={(input) => updateInput(module.id, 'point_b', input)}
                        bodies={bodies}
                        modules={modules}
                        currentModuleId={module.id}
                        allowedTypes={['body', 'vector', 'module_output']}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                    <label className="text-[9px] text-slate-500 uppercase">Color</label>
                    {colorInput ? (
                        <div className="flex gap-1">
                            <InputSelector
                                label=""
                                value={colorInput}
                                onChange={(input) => updateInput(module.id, 'color', input)}
                                bodies={bodies}
                                modules={modules}
                                currentModuleId={module.id}
                                allowedTypes={['string', 'module_output']}
                            />
                            <button onClick={() => updateInput(module.id, 'color', undefined)} className="px-2 bg-red-600/20 border border-red-500/50 rounded text-xs text-red-400 hover:bg-red-600/30">✕</button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={lineColor}
                                onChange={(e) => onUpdateModule(module.id, { lineColor: e.target.value })}
                                className="w-10 h-8 rounded border border-slate-700/50 bg-slate-900/50"
                            />
                            <button onClick={() => updateInput(module.id, 'color', { type: 'module_output', value: '' })} className="px-2 bg-purple-600/20 border border-purple-500/50 rounded text-xs text-purple-400 hover:bg-purple-600/30">🔗</button>
                        </div>
                    )}
                </div>
                <div className="space-y-1">
                    <label className="text-[9px] text-slate-500 uppercase">Thickness</label>
                    {thicknessInput ? (
                        <div className="flex gap-1">
                            <InputSelector
                                label=""
                                value={thicknessInput}
                                onChange={(input) => updateInput(module.id, 'thickness', input)}
                                bodies={bodies}
                                modules={modules}
                                currentModuleId={module.id}
                                allowedTypes={['number', 'module_output']}
                            />
                            <button onClick={() => updateInput(module.id, 'thickness', undefined)} className="px-2 bg-red-600/20 border border-red-500/50 rounded text-xs text-red-400 hover:bg-red-600/30">✕</button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={lineThickness}
                                min={0.5}
                                max={20}
                                step={0.5}
                                onChange={(e) => onUpdateModule(module.id, { lineThickness: parseFloat(e.target.value) })}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                            />
                            <button onClick={() => updateInput(module.id, 'thickness', { type: 'module_output', value: '' })} className="px-2 bg-purple-600/20 border border-purple-500/50 rounded text-xs text-purple-400 hover:bg-purple-600/30">🔗</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="text-[9px] text-slate-500 italic">
                Draws a line between two points (bodies, vectors, or coordinates). Useful for visualizing distances, directions, or alignment.
            </div>
        </div>
    );
};

export default LineDrawerModule;
