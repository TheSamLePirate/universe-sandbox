import React, { useState, useEffect, useRef } from 'react';
import { Body, FlightComputerModule, FlightComputerModuleType, PhysicsConfig, Vector2D, FlightComputerInput, ModuleGroup } from '../types';
import { Activity, X, Plus, ChevronDown, ChevronUp, Settings, Trash2, Play, Pause, Square, CheckSquare, Globe, Rocket, Navigation, Timer, Compass, Gauge, ArrowRight, Volume2, Mic, GripVertical, FolderPlus } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';
import { calculateOrbitInfo, resolveInput, calculateTransferInfo, resolveScalarInput, calculateDistance, calculateRelativeSpeed, resolveBooleanInput } from '../services/orbitalMath';
import EasySpeech from 'easy-speech';

interface FlightComputerPanelProps {
    modules: FlightComputerModule[];
    groups: ModuleGroup[];
    bodies: Body[];
    physicsConfig: PhysicsConfig;
    onAddModule: (type: FlightComputerModuleType, inputs?: Record<string, FlightComputerInput>) => void;
    onRemoveModule: (id: string) => void;
    onUpdateModule: (id: string, updates: Partial<FlightComputerModule>) => void;
    onToggleModule: (id: string) => void;
    onAddGroup: () => void;
    onRemoveGroup: (groupId: string) => void;
    onUpdateGroup: (groupId: string, updates: Partial<ModuleGroup>) => void;
    onMoveModuleToGroup: (moduleId: string, groupId: string | null) => void;
    rendezvousPoints?: Array<{ 
        point: Vector2D; 
        name: string; 
        color: string; 
        moduleId: string;
        timeToRendezvous: number;
        distance: number;
        deltaVPrograde: number;
        deltaVRadial: number;
        totalDeltaV: number;
    }>;
}

const InputSelector: React.FC<{
    label: string;
    value: FlightComputerInput | undefined;
    onChange: (input: FlightComputerInput) => void;
    bodies: Body[];
    modules: FlightComputerModule[];
    currentModuleId: string;
    allowedTypes?: ('body' | 'module_output' | 'scalar' | 'boolean')[];
}> = ({ label, value, onChange, bodies, modules, currentModuleId, allowedTypes = ['body', 'module_output'] }) => {
    const [mode, setMode] = useState<'body' | 'module'>('body');

    // Initialize mode based on current value
    useEffect(() => {
        if (value?.type === 'module_output') {
            setMode('module');
        } else if (value?.type === 'body') {
            setMode('body');
        } else if (allowedTypes.includes('scalar') && !allowedTypes.includes('body')) {
             setMode('module'); // Force module mode if body not allowed (e.g. for scalar inputs)
        }
    }, [value, allowedTypes]);

    const availableModules = modules.filter(m => m.id !== currentModuleId);

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <label className="text-[9px] text-slate-500 uppercase">{label}</label>
                {allowedTypes.includes('body') && allowedTypes.includes('module_output') && (
                    <div className="flex bg-slate-800 rounded p-0.5">
                        <button 
                            onClick={() => setMode('body')}
                            className={`px-1.5 py-0.5 text-[8px] rounded ${mode === 'body' ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            BODY
                        </button>
                        <button 
                            onClick={() => setMode('module')}
                            className={`px-1.5 py-0.5 text-[8px] rounded ${mode === 'module' ? 'bg-slate-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            MODULE
                        </button>
                    </div>
                )}
            </div>
            
            {mode === 'body' && allowedTypes.includes('body') ? (
                <select 
                    value={value?.type === 'body' ? value.value : ''}
                    onChange={(e) => onChange({ type: 'body', value: e.target.value, label: bodies.find(b => b.id === e.target.value)?.name })}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-300 focus:border-purple-500 outline-none"
                >
                    <option value="">Select Body...</option>
                    {bodies.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                </select>
            ) : (
                <select 
                    value={value?.type === 'module_output' ? value.value : ''}
                    onChange={(e) => {
                        const [modId, key] = e.target.value.split(':');
                        const mod = modules.find(m => m.id === modId);
                        let label = `${mod?.name || 'Module'} - ${key}`;
                        if (key === 'pe_point') label = `${mod?.name || 'Orbit'} Pe`;
                        if (key === 'pa_point') label = `${mod?.name || 'Orbit'} Pa`;
                        
                        onChange({ 
                            type: 'module_output', 
                            value: e.target.value, 
                            label: label
                        });
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-300 focus:border-purple-500 outline-none"
                >
                    <option value="">Select Output...</option>
                    {availableModules.map(m => {
                        const options = [];
                        
                        // Vector/Point Outputs
                        if (!allowedTypes.includes('scalar')) {
                            if (m.type === 'orbit_info') {
                                options.push(<option key={`${m.id}:pe_point`} value={`${m.id}:pe_point`}>{m.name || 'Orbit'} - Periapsis Point</option>);
                                options.push(<option key={`${m.id}:pa_point`} value={`${m.id}:pa_point`}>{m.name || 'Orbit'} - Apoapsis Point</option>);
                            }
                        }
                        
                        // Scalar Outputs
                        if (allowedTypes.includes('scalar')) {
                            if (m.type === 'track_distance') {
                                options.push(<option key={`${m.id}:distance`} value={`${m.id}:distance`}>{m.name || 'Distance'} - Value</option>);
                            }
                            if (m.type === 'track_velocity') {
                                options.push(<option key={`${m.id}:speed`} value={`${m.id}:speed`}>{m.name || 'Velocity'} - Speed</option>);
                            }
                            if (m.type === 'orbit_info') {
                                options.push(<option key={`${m.id}:altitude`} value={`${m.id}:altitude`}>{m.name || 'Orbit'} - Altitude</option>);
                                options.push(<option key={`${m.id}:periapsis`} value={`${m.id}:periapsis`}>{m.name || 'Orbit'} - Periapsis Alt</option>);
                                options.push(<option key={`${m.id}:apoapsis`} value={`${m.id}:apoapsis`}>{m.name || 'Orbit'} - Apoapsis Alt</option>);
                                options.push(<option key={`${m.id}:period`} value={`${m.id}:period`}>{m.name || 'Orbit'} - Period</option>);
                            }
                        }
                        
                        // Boolean Outputs
                        if (allowedTypes.includes('boolean')) {
                            if (m.type === 'notify') {
                                options.push(<option key={`${m.id}:triggered`} value={`${m.id}:triggered`}>{m.name || 'Notify'} - Triggered</option>);
                            }
                            if (m.type === 'logic_gate') {
                                options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Logic'} - Result</option>);
                            }
                        }
                        
                        return options;
                    })}
                </select>
            )}
        </div>
    );
};

const FlightComputerPanel: React.FC<FlightComputerPanelProps> = ({
    modules,
    groups,
    bodies,
    physicsConfig,
    onAddModule,
    onRemoveModule,
    onUpdateModule,
    onToggleModule,
    onAddGroup,
    onRemoveGroup,
    onUpdateGroup,
    onMoveModuleToGroup,
    rendezvousPoints
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const isMobile = useIsMobile();

   const [expandedModules, setExpandedModules] = useState<string[]>([]);
    const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
    const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
    
    // Audio Context for Beep Module
    const audioContextRef = useRef<AudioContext | null>(null);
    const prevBeepInputStateRef = useRef<Map<string, boolean>>(new Map());
    const lastBeepTimeRef = useRef<Map<string, number>>(new Map());

    useEffect(() => {
        // Init Audio Context on user interaction if needed
        const initAudio = () => {
             const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
             if (AudioContextClass && !audioContextRef.current) {
                 audioContextRef.current = new AudioContextClass();
             }
             if (audioContextRef.current?.state === 'suspended') {
                 audioContextRef.current.resume();
             }
        };
        
        window.addEventListener('click', initAudio);
        
        // Init EasySpeech
        EasySpeech.init({ maxTimeout: 5000, interval: 250 }).catch(e => console.error('EasySpeech init failed', e));

        return () => window.removeEventListener('click', initAudio);
    }, []);

    const playBeep = (frequency: number = 800) => {
        if (!audioContextRef.current) return;
        const ctx = audioContextRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.value = frequency;
        
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.1);
    };

    // Beep Module Logic Loop
    useEffect(() => {
        modules.forEach(module => {
            if (module.type === 'beep' && module.isEnabled) {
                const input = resolveBooleanInput(module.inputs?.primary, bodies, modules, physicsConfig.gravitationalConstant);
                const mode = module.beepTriggerMode || 'rising';
                const pitch = module.beepPitch || 800;
                const rate = module.beepRate || 2;
                const prevState = prevBeepInputStateRef.current.get(module.id) || false;
                
                if (input !== null) {
                    let shouldBeep = false;
                    const now = Date.now();
                    
                    if (mode === 'rising' && input && !prevState) {
                        shouldBeep = true;
                    } else if (mode === 'falling' && !input && prevState) {
                        shouldBeep = true;
                    } else if (mode === 'continuous' && input) {
                        const lastTime = lastBeepTimeRef.current.get(module.id) || 0;
                        const interval = 1000 / rate;
                        if (now - lastTime > interval) {
                            shouldBeep = true;
                            lastBeepTimeRef.current.set(module.id, now);
                        }
                    }
                    
                    if (shouldBeep) {
                        if (module.beepSoundType === 'speak' && module.beepSpeakText && mode !== 'continuous') {
                            EasySpeech.speak({
                                text: module.beepSpeakText,
                                pitch: 1,
                                rate: 1,
                                volume: 1,
                                boundary: e => console.debug('boundary reached')
                            }).catch(e => console.error(e));
                        } else {
                            playBeep(pitch);
                        }
                    }
                }
                
                if (input !== null) {
                    prevBeepInputStateRef.current.set(module.id, input);
                }
            }
        });
    }, [bodies, modules, physicsConfig]);

    // Helper to get input or fallback to legacy fields
    const getInput = (module: FlightComputerModule, key: string): FlightComputerInput | undefined => {
        if (module.inputs && module.inputs[key]) {
            return module.inputs[key];
        }
        // Fallback to legacy fields
        if (key === 'primary' && module.primaryBodyId) return { type: 'body', value: module.primaryBodyId };
        if (key === 'reference' && module.referenceBodyId) return { type: 'body', value: module.referenceBodyId };
        if (key === 'target' && module.targetBodyId) return { type: 'body', value: module.targetBodyId };
        return undefined;
    };

    // Helper to update input
    const updateInput = (moduleId: string, key: string, input: FlightComputerInput) => {
        const module = modules.find(m => m.id === moduleId);
        if (!module) return;
        
        const newInputs = { ...(module.inputs || {}) };
        newInputs[key] = input;
        
        // Also update legacy fields for backward compatibility where possible
        const legacyUpdates: any = {};
        if (input.type === 'body') {
            if (key === 'primary') legacyUpdates.primaryBodyId = input.value;
            if (key === 'reference') legacyUpdates.referenceBodyId = input.value;
            if (key === 'target') legacyUpdates.targetBodyId = input.value;
        }

        onUpdateModule(moduleId, { inputs: newInputs, ...legacyUpdates });
    };

    // Helper to get display value for collapsed group
    const getGroupDisplayValue = (group: ModuleGroup): string => {
        if (!group.displayOutput) return '---';
        
        const module = modules.find(m => m.id === group.displayOutput?.moduleId);
        if (!module) return '---';
        
        const outputKey = group.displayOutput.outputKey;
        
        // Get the value based on the output key
        if (outputKey === 'distance') {
            const distance = resolveScalarInput(
                { type: 'module_output', value: `${module.id}:distance` },
                bodies,
                modules,
                physicsConfig.gravitationalConstant
            );
            return distance !== null ? `${distance.toFixed(1)} u` : '---';
        }
        if (outputKey === 'speed') {
            const speed = resolveScalarInput(
                { type: 'module_output', value: `${module.id}:speed` },
                bodies,
                modules,
                physicsConfig.gravitationalConstant
            );
            return speed !== null ? `${speed.toFixed(1)} m/s` : '---';
        }
        if (outputKey === 'altitude' || outputKey === 'periapsis' || outputKey === 'apoapsis') {
            const value = resolveScalarInput(
                { type: 'module_output', value: `${module.id}:${outputKey}` },
                bodies,
                modules,
                physicsConfig.gravitationalConstant
            );
            return value !== null ? `${value.toFixed(1)} u` : '---';
        }
        if (outputKey === 'period') {
            const value = resolveScalarInput(
                { type: 'module_output', value: `${module.id}:period` },
                bodies,
                modules,
                physicsConfig.gravitationalConstant
            );
            return value !== null ? formatTime(value) : '---';
        }
        if (outputKey === 'triggered' || outputKey === 'result') {
            const value = resolveBooleanInput(
                { type: 'module_output', value: `${module.id}:${outputKey}` },
                bodies,
                modules,
                physicsConfig.gravitationalConstant
            );
            return value !== null ? (value ? 'TRUE' : 'FALSE') : '---';
        }
        
        return '---';
    };

    // Helper function to format time
    const formatTime = (totalSeconds: number): string => {
        if (totalSeconds <= 0) return '---';
        
        const seconds = Math.floor(totalSeconds);
        const years = Math.floor(seconds / (365.25 * 24 * 3600));
        const months = Math.floor((seconds % (365.25 * 24 * 3600)) / (30.44 * 24 * 3600));
        const days = Math.floor((seconds % (30.44 * 24 * 3600)) / (24 * 3600));
        const hours = Math.floor((seconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        const parts = [];
        if (years > 0) parts.push(`${years}y`);
        if (months > 0) parts.push(months < 10 ? `0${months}mo` : `${months}mo`);
        if (days > 0) parts.push(days < 10 ? `0${days}d` : `${days}d`);
        if (hours > 0) parts.push(hours < 10 ? `0${hours}h` : `${hours}h`);
        if (minutes > 0) parts.push(minutes < 10 ? `0${minutes}m` : `${minutes}m`);
        else if (parts.length > 0) parts.push('00m');
        if (secs > 0) parts.push(secs < 10 ? `0${secs}s` : `${secs}s`);
        else if (parts.length > 0) parts.push('00s');
        
        return parts.length > 0 ? parts.join(' ') : `${totalSeconds.toFixed(1)}s`;
    };

    // --- Render Module Content ---
    const renderModuleContent = (module: FlightComputerModule) => {
        switch (module.type) {
            case 'orbit_info':
                const primaryInput = getInput(module, 'primary');
                const referenceInput = getInput(module, 'reference');
                
                const primary = resolveInput(primaryInput, bodies, modules, physicsConfig.gravitationalConstant);
                const reference = resolveInput(referenceInput, bodies, modules, physicsConfig.gravitationalConstant);
                
                // For orbit info, reference MUST be a body (need mass)
                if (!primary || !reference || !('mass' in reference)) return <div className="text-xs text-slate-500 italic">Invalid Selection</div>;
                
                const orbitData = calculateOrbitInfo(primary, reference as Body, physicsConfig.gravitationalConstant);
                if (!orbitData) return <div className="text-xs text-slate-500 italic">Calculation Failed</div>;
                
                return (
                    <div className="space-y-2 mt-2">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-slate-800/50 p-1.5 rounded">
                                <div className="text-[9px] text-slate-500 uppercase">Altitude</div>
                                <div className="text-xs text-cyan-300 font-mono">{orbitData.altitude.toFixed(1)} u</div>
                            </div>
                            <div className="bg-slate-800/50 p-1.5 rounded">
                                <div className="text-[9px] text-slate-500 uppercase">Period</div>
                                <div className="text-xs text-white font-mono">{orbitData.isBound ? formatTime(orbitData.period) : 'N/A'}</div>
                            </div>
                            {orbitData.isBound && (
                                <>
                                    <div className="bg-slate-800/50 p-1.5 rounded group relative">
                                        <div className="text-[9px] text-slate-500 uppercase flex justify-between">
                                            Apoapsis
                                            <button 
                                                onClick={() => onAddModule('rendezvous_tracker', {
                                                    primary: { type: 'body', value: bodies.find(b => b.isRocket)?.id || '' },
                                                    target: { type: 'module_output', value: `${module.id}:pa_point`, label: `${module.name || 'Orbit'} Pa` }
                                                })}
                                                className="opacity-0 group-hover:opacity-100 text-purple-400 hover:text-purple-300 transition-opacity"
                                                title="Track Rendezvous to Apoapsis"
                                            >
                                                <Navigation size={10} />
                                            </button>
                                        </div>
                                        <div className="text-xs text-orange-300 font-mono">{orbitData.apoapsis.toFixed(1)} u</div>
                                    </div>
                                    <div className="bg-slate-800/50 p-1.5 rounded group relative">
                                        <div className="text-[9px] text-slate-500 uppercase flex justify-between">
                                            Periapsis
                                            <button 
                                                onClick={() => onAddModule('rendezvous_tracker', {
                                                    primary: { type: 'body', value: bodies.find(b => b.isRocket)?.id || '' },
                                                    target: { type: 'module_output', value: `${module.id}:pe_point`, label: `${module.name || 'Orbit'} Pe` }
                                                })}
                                                className="opacity-0 group-hover:opacity-100 text-purple-400 hover:text-purple-300 transition-opacity"
                                                title="Track Rendezvous to Periapsis"
                                            >
                                                <Navigation size={10} />
                                            </button>
                                        </div>
                                        <div className="text-xs text-blue-300 font-mono">{orbitData.periapsis.toFixed(1)} u</div>
                                    </div>
                                </>
                            )}
                            {!orbitData.isBound && (
                                 <div className="col-span-2 text-[10px] text-slate-400 italic text-center">Unbound Trajectory</div>
                            )}
                        </div>
                    </div>
                );
            
            case 'transfer_window':
                const tPrimaryInput = getInput(module, 'primary');
                const tReferenceInput = getInput(module, 'reference');
                const tTargetInput = getInput(module, 'target');

                const tPrimary = resolveInput(tPrimaryInput, bodies, modules, physicsConfig.gravitationalConstant);
                const tReference = resolveInput(tReferenceInput, bodies, modules, physicsConfig.gravitationalConstant);
                const tTarget = resolveInput(tTargetInput, bodies, modules, physicsConfig.gravitationalConstant);

                if (!tPrimary || !tReference || !tTarget || !('mass' in tPrimary) || !('mass' in tReference) || !('mass' in tTarget)) {
                     return <div className="text-xs text-slate-500 italic">Select Bodies for Transfer</div>;
                }

                const transferData = calculateTransferInfo(tPrimary as Body, tReference as Body, tTarget as Body, physicsConfig.gravitationalConstant);

                return (
                    <div className="mt-2">
                         <div className="flex justify-between items-center mb-1">
                            <div className="text-[9px] text-slate-500 uppercase flex items-center gap-1"><Timer size={10} /> Phase Angle</div>
                            {transferData.ready ? (
                                <div className="text-[9px] bg-green-500 text-black px-1 rounded font-bold animate-pulse">WINDOW OPEN</div>
                            ) : (
                                <div className="text-[9px] text-slate-600">Wait...</div>
                            )}
                         </div>
                         
                         <div className="flex items-center gap-2">
                             <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
                                 <div 
                                    className={`absolute top-0 bottom-0 w-1/5 left-1/2 -translate-x-1/2 ${transferData.ready ? 'bg-green-500/20' : 'bg-slate-700'}`} 
                                 />
                                 <div 
                                    className={`absolute top-0 bottom-0 w-1 ${transferData.ready ? 'bg-green-500' : 'bg-orange-500'}`}
                                    style={{ left: `${Math.min(100, Math.max(0, 50 + (transferData.currentPhase - transferData.requiredPhase)))}%` }}
                                 />
                             </div>
                             <div className="text-[9px] font-mono w-8 text-right text-slate-400">
                                 {transferData.error.toFixed(0)}°
                             </div>
                         </div>
                    </div>
                 );

            case 'rendezvous_tracker':
                const rocketInput = getInput(module, 'primary');
                const targetInput = getInput(module, 'target');
                const rendezvousData = rendezvousPoints?.find(rdv => rdv.moduleId === module.id);
                
                if (!rocketInput || !targetInput) {
                    return <div className="text-xs text-slate-500 italic">Select Rocket & Target</div>;
                }
                
                // Format time helper - only show non-zero values
                const formatRendezvousTime = (seconds: number) => {
                    const totalSec = Math.floor(seconds);
                    const years = Math.floor(totalSec / (365.25 * 24 * 3600));
                    const remainingAfterYears = totalSec % (365.25 * 24 * 3600);
                    const months = Math.floor(remainingAfterYears / (30.44 * 24 * 3600));
                    const remainingAfterMonths = remainingAfterYears % (30.44 * 24 * 3600);
                    const days = Math.floor(remainingAfterMonths / (24 * 3600));
                    const remainingAfterDays = remainingAfterMonths % (24 * 3600);
                    const hours = Math.floor(remainingAfterDays / 3600);
                    const minutes = Math.floor((remainingAfterDays % 3600) / 60);
                    const secs = Math.floor(remainingAfterDays % 60);
                    
                    const timeParts = [];
                    if (years > 0) timeParts.push(`${years}y`);
                    if (months > 0) timeParts.push(`${months}m`);
                    if (days > 0) timeParts.push(`${days}d`);
                    if (hours > 0) timeParts.push(`${hours}h`);
                    if (minutes > 0) timeParts.push(`${minutes}m`);
                    if (secs > 0 && timeParts.length === 0) timeParts.push(`${secs}s`);
                    
                    return timeParts.length > 0 ? timeParts.join(' ') : '0s';
                };
                
                return (
                    <div className="mt-2 space-y-2">
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Tracker Name</label>
                                <input 
                                    type="text"
                                    value={module.name || 'Rendezvous'}
                                    onChange={(e) => onUpdateModule(module.id, { name: e.target.value })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200 focus:border-purple-500 outline-none"
                                    placeholder="e.g., Apollo 11"
                                />
                            </div>
                            <div className="w-20">
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Color</label>
                                <input 
                                    type="color"
                                    value={module.color}
                                    onChange={(e) => onUpdateModule(module.id, { color: e.target.value })}
                                    className="w-full h-7 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[9px] text-slate-500 uppercase block mb-1">Max Distance (units)</label>
                            <input 
                                type="number"
                                value={module.maxDistance || 10}
                                onChange={(e) => onUpdateModule(module.id, { maxDistance: parseFloat(e.target.value) })}
                                step="1"
                                min="1"
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                            />
                        </div>
                        
                        {/* Rendezvous Info Display */}
                        {rendezvousData ? (
                            <div className="bg-green-900/20 border border-green-500/30 rounded p-2 space-y-1">
                                <div className="text-[9px] text-green-400 uppercase font-bold flex items-center gap-1">
                                    <Navigation size={10} /> Rendezvous Found!
                                </div>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <div className="bg-slate-800/50 p-1.5 rounded">
                                        <div className="text-[9px] text-slate-500 uppercase">Time</div>
                                        <div className="text-[10px] text-cyan-300 font-mono">{formatRendezvousTime(rendezvousData.timeToRendezvous)}</div>
                                    </div>
                                    <div className="bg-slate-800/50 p-1.5 rounded">
                                        <div className="text-[9px] text-slate-500 uppercase">Seconds</div>
                                        <div className="text-[10px] text-white font-mono">{rendezvousData.timeToRendezvous.toFixed(1)}s</div>
                                    </div>
                                    <div className="bg-slate-800/50 p-1.5 rounded">
                                        <div className="text-[9px] text-slate-500 uppercase">Distance</div>
                                        <div className="text-[10px] text-emerald-300 font-mono">{rendezvousData.distance.toFixed(2)} u</div>
                                    </div>
                                    <div className="bg-slate-800/50 p-1.5 rounded">
                                        <div className="text-[9px] text-slate-500 uppercase">Total ΔV</div>
                                        <div className="text-[10px] text-yellow-300 font-mono">{rendezvousData.totalDeltaV.toFixed(1)} m/s</div>
                                    </div>
                                    <div className="bg-slate-800/50 p-1.5 rounded">
                                        <div className="text-[9px] text-slate-500 uppercase">ΔV Prograde</div>
                                        <div className="text-[10px] text-blue-300 font-mono">{rendezvousData.deltaVPrograde.toFixed(1)} m/s</div>
                                    </div>
                                    <div className="bg-slate-800/50 p-1.5 rounded">
                                        <div className="text-[9px] text-slate-500 uppercase">ΔV Radial</div>
                                        <div className="text-[10px] text-orange-300 font-mono">{rendezvousData.deltaVRadial.toFixed(1)} m/s</div>
                                    </div>
                                    <div className="col-span-2 bg-slate-800/50 p-1.5 rounded">
                                        <div className="text-[9px] text-slate-500 uppercase">Position</div>
                                        <div className="text-[10px] text-purple-300 font-mono text-[8px]">
                                            ({rendezvousData.point.x.toFixed(0)}, {rendezvousData.point.y.toFixed(0)})
                                        </div>
                                    </div>
                                </div>
                                <div className="text-[9px] text-slate-400 italic mt-1">✓ Marker visible on canvas</div>
                            </div>
                        ) : (
                            <div className="bg-slate-800/30 border border-slate-700/30 rounded p-2">
                                <div className="text-[9px] text-slate-400 uppercase font-bold mb-1">Tracking...</div>
                                <div className="text-[10px] text-slate-400">
                                    <div>Rocket: <span className="text-white font-mono">{rocketInput.label || 'Unknown'}</span></div>
                                    <div>Target: <span className="text-white font-mono">{targetInput.label || 'Unknown'}</span></div>
                                    <div className="text-[9px] text-orange-400 italic mt-1">No rendezvous within prediction window</div>
                                </div>
                            </div>
                        )}
                    </div>
                );

            case 'track_distance':
                const dPrimary = resolveInput(getInput(module, 'primary'), bodies, modules, physicsConfig.gravitationalConstant);
                const dTarget = resolveInput(getInput(module, 'target'), bodies, modules, physicsConfig.gravitationalConstant);
                
                if (!dPrimary || !dTarget) return <div className="text-xs text-slate-500 italic">Select Objects</div>;
                
                const distance = calculateDistance(dPrimary, dTarget);
                
                return (
                    <div className="mt-2">
                        <div className="bg-slate-800/50 p-1.5 rounded flex justify-between items-center">
                            <div className="text-[9px] text-slate-500 uppercase">Distance</div>
                            <div className="text-xs text-emerald-300 font-mono">{distance.toFixed(1)} u</div>
                        </div>
                    </div>
                );

            case 'track_velocity':
                const vPrimary = resolveInput(getInput(module, 'primary'), bodies, modules, physicsConfig.gravitationalConstant);
                const vTarget = resolveInput(getInput(module, 'target'), bodies, modules, physicsConfig.gravitationalConstant);
                
                if (!vPrimary || !vTarget) return <div className="text-xs text-slate-500 italic">Select Objects</div>;
                
                const speed = calculateRelativeSpeed(vPrimary, vTarget);
                
                return (
                    <div className="mt-2">
                        <div className="bg-slate-800/50 p-1.5 rounded flex justify-between items-center">
                            <div className="text-[9px] text-slate-500 uppercase">Rel. Speed</div>
                            <div className="text-xs text-yellow-300 font-mono">{speed.toFixed(1)} m/s</div>
                        </div>
                    </div>
                );

            case 'notify':
                const nInput = getInput(module, 'primary'); // Source
                const currentValue = resolveScalarInput(nInput, bodies, modules, physicsConfig.gravitationalConstant);
                
                const operator = module.comparisonOperator || '>';
                const threshold = module.comparisonValue || 0;
                
                let triggered = false;
                if (currentValue !== null) {
                    switch (operator) {
                        case '>': triggered = currentValue > threshold; break;
                        case '<': triggered = currentValue < threshold; break;
                        case '=': triggered = Math.abs(currentValue - threshold) < 0.1; break; // Epsilon for float equality
                        case '>=': triggered = currentValue >= threshold; break;
                        case '<=': triggered = currentValue <= threshold; break;
                    }
                }

                // Trigger visual feedback
                if (triggered && !module.notifyTriggered) {
                     // Could play sound here if we had audio context
                     // For now, visual only
                }

                return (
                    <div className="mt-2 space-y-2">
                        <div className="flex gap-2 items-center">
                            <select 
                                value={operator}
                                onChange={(e) => onUpdateModule(module.id, { comparisonOperator: e.target.value as any })}
                                className="bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-slate-300 outline-none w-12"
                            >
                                <option value=">">&gt;</option>
                                <option value="<">&lt;</option>
                                <option value="=">=</option>
                                <option value=">=">&ge;</option>
                                <option value="<=">&le;</option>
                            </select>
                            <input 
                                type="number"
                                value={threshold}
                                onChange={(e) => onUpdateModule(module.id, { comparisonValue: parseFloat(e.target.value) })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none flex-1"
                                placeholder="Value"
                            />
                        </div>
                        
                        <div className={`p-2 rounded border ${triggered ? 'bg-red-900/50 border-red-500 animate-pulse' : 'bg-slate-800/50 border-slate-700'}`}>
                            <div className="flex justify-between items-center">
                                <span className="text-[9px] text-slate-500 uppercase">Current</span>
                                <span className={`text-xs font-mono ${triggered ? 'text-red-300 font-bold' : 'text-slate-300'}`}>
                                    {currentValue !== null ? currentValue.toFixed(2) : '---'}
                                </span>
                            </div>
                            {triggered && (
                                <div className="text-[10px] text-red-400 font-bold text-center mt-1 uppercase tracking-wider">
                                    ALERT TRIGGERED
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 'logic_gate':
                const inputA = resolveBooleanInput(module.inputs?.inputA, bodies, modules, physicsConfig.gravitationalConstant);
                const inputB = resolveBooleanInput(module.inputs?.inputB, bodies, modules, physicsConfig.gravitationalConstant);
                const logicOp = module.logicOperator || 'AND';
                
                let result: boolean | null = null;
                
                if (inputA !== null) {
                    if (logicOp === 'NOT') {
                        result = !inputA;
                    } else if (inputB !== null) {
                        switch (logicOp) {
                            case 'AND': result = inputA && inputB; break;
                            case 'OR': result = inputA || inputB; break;
                            case 'NOR': result = !(inputA || inputB); break;
                            case 'NAND': result = !(inputA && inputB); break;
                            case 'XOR': result = inputA !== inputB; break;
                            case 'XNOR': result = inputA === inputB; break;
                        }
                    }
                }

                return (
                    <div className="mt-2 space-y-2">
                         <div className="flex justify-center">
                            <select 
                                value={logicOp}
                                onChange={(e) => onUpdateModule(module.id, { logicOperator: e.target.value as any })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-purple-300 font-bold outline-none text-center w-full"
                            >
                                <option value="AND">AND</option>
                                <option value="OR">OR</option>
                                <option value="NOR">NOR</option>
                                <option value="NAND">NAND</option>
                                <option value="XOR">XOR</option>
                                <option value="XNOR">XNOR</option>
                                <option value="NOT">NOT</option>
                            </select>
                         </div>
                         
                         <div className={`p-2 rounded border flex justify-between items-center ${result ? 'bg-purple-900/50 border-purple-500' : 'bg-slate-800/50 border-slate-700'}`}>
                            <span className="text-[9px] text-slate-500 uppercase">Output</span>
                            <span className={`text-xs font-mono font-bold ${result ? 'text-purple-300' : 'text-slate-500'}`}>
                                {result === null ? '---' : (result ? 'TRUE' : 'FALSE')}
                            </span>
                         </div>
                    </div>
                );

            case 'beep':
                const beepInput = resolveBooleanInput(module.inputs?.primary, bodies, modules, physicsConfig.gravitationalConstant);
                const beepMode = module.beepTriggerMode || 'rising';
                const beepPitch = module.beepPitch || 800;
                const beepRate = module.beepRate || 2;
                
                return (
                    <div className="mt-2 space-y-2">
                        <div className="flex justify-center">
                            <select 
                                value={beepMode}
                                onChange={(e) => onUpdateModule(module.id, { beepTriggerMode: e.target.value as any })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-yellow-300 font-bold outline-none text-center w-full"
                            >
                                <option value="rising">At Rising Edge</option>
                                <option value="falling">At Falling Edge</option>
                                <option value="continuous">Continuous (True)</option>
                            </select>
                        </div>

                        {/* Config: Pitch & Rate OR Speak */}
                        <div className="grid grid-cols-1 gap-2">
                            {/* Sound Type Selection (Only for Rising/Falling) */}
                            {beepMode !== 'continuous' && (
                                <div className="flex justify-center mb-1">
                                    <div className="flex bg-slate-900/50 rounded p-0.5 border border-slate-700/50">
                                        <button
                                            onClick={() => onUpdateModule(module.id, { beepSoundType: 'beep' })}
                                            className={`px-3 py-1 text-[10px] font-bold uppercase rounded transition-colors ${(!module.beepSoundType || module.beepSoundType === 'beep') ? 'bg-yellow-500/20 text-yellow-300' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Beep
                                        </button>
                                        <button
                                            onClick={() => onUpdateModule(module.id, { beepSoundType: 'speak' })}
                                            className={`px-3 py-1 text-[10px] font-bold uppercase rounded transition-colors ${module.beepSoundType === 'speak' ? 'bg-blue-500/20 text-blue-300' : 'text-slate-500 hover:text-slate-300'}`}
                                        >
                                            Speak
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Beep Config */}
                            {(!module.beepSoundType || module.beepSoundType === 'beep' || beepMode === 'continuous') && (
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-slate-900/50 rounded p-1.5 border border-slate-700/50">
                                        <div className="text-[9px] text-slate-500 uppercase mb-1">Pitch (Hz)</div>
                                        <div className="flex items-center gap-1">
                                            <input 
                                                type="range" 
                                                min="200" 
                                                max="2000" 
                                                step="50"
                                                value={beepPitch}
                                                onChange={(e) => onUpdateModule(module.id, { beepPitch: parseInt(e.target.value) })}
                                                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="text-[10px] font-mono text-slate-300 w-8 text-right">{beepPitch}</span>
                                        </div>
                                    </div>
                                    
                                    {beepMode === 'continuous' && (
                                        <div className="bg-slate-900/50 rounded p-1.5 border border-slate-700/50">
                                            <div className="text-[9px] text-slate-500 uppercase mb-1">Rate (/s)</div>
                                            <div className="flex items-center gap-1">
                                                <input 
                                                    type="range" 
                                                    min="0.5" 
                                                    max="10" 
                                                    step="0.5"
                                                    value={beepRate}
                                                    onChange={(e) => onUpdateModule(module.id, { beepRate: parseFloat(e.target.value) })}
                                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                                />
                                                <span className="text-[10px] font-mono text-slate-300 w-6 text-right">{beepRate}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Speak Config */}
                            {module.beepSoundType === 'speak' && beepMode !== 'continuous' && (
                                <div className="bg-slate-900/50 rounded p-1.5 border border-slate-700/50">
                                    <div className="text-[9px] text-slate-500 uppercase mb-1">Text to Speak</div>
                                    <input 
                                        type="text"
                                        value={module.beepSpeakText || ''}
                                        onChange={(e) => onUpdateModule(module.id, { beepSpeakText: e.target.value })}
                                        placeholder="Alert Message"
                                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-blue-500"
                                    />
                                </div>
                            )}
                        </div>
                        
                        <div className={`p-2 rounded border flex justify-between items-center ${beepInput ? 'bg-yellow-900/20 border-yellow-500/50' : 'bg-slate-800/50 border-slate-700'}`}>
                            <span className="text-[9px] text-slate-500 uppercase">Input State</span>
                            <span className={`text-xs font-mono font-bold ${beepInput ? 'text-yellow-300' : 'text-slate-500'}`}>
                                {beepInput === null ? '---' : (beepInput ? 'TRUE' : 'FALSE')}
                            </span>
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className={`fixed ${isMobile ? 'top-16 right-4' : 'top-0 right-0'} z-40 flex flex-col items-end pointer-events-none`}>
            {/* Main Toggle Button */}
            <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg shadow-xl p-2 flex items-center gap-2 text-slate-200 hover:bg-slate-800 transition-all group"
            >
                <Activity size={18} className="text-purple-400 group-hover:text-purple-300" />
                <span className="font-bold text-sm hidden group-hover:block animate-in fade-in slide-in-from-right-2 duration-200">Flight Computer</span>
                {modules.length > 0 && (
                    <span className="bg-purple-600 text-white text-[10px] px-1.5 rounded-full font-mono">{modules.length}</span>
                )}
            </button>

            {/* Expanded Panel */}
            {isExpanded && (
                <div className="pointer-events-auto mt-2 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl w-[100vw] h-[100vh] flex flex-col animate-in slide-in-from-right-4 duration-200">
                    
                    {/* Header */}
                    <div className="p-3 border-b border-slate-700/50 flex justify-between items-center bg-slate-800/30 rounded-t-lg">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Modules</div>
                        <button 
                            onClick={() => setIsAdding(!isAdding)}
                            className={`p-1 rounded transition-colors ${isAdding ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-purple-400 hover:bg-slate-800'}`}
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* Add Module Menu */}
                    {isAdding && (
                        <div className="p-2 bg-slate-800/80 border-b border-slate-700/50 grid grid-cols-2 gap-2">
                            <button 
                                onClick={() => { onAddModule('orbit_info'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-purple-600/20 hover:border-purple-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Globe size={14} className="text-blue-400" /> Orbit Info
                            </button>
                            <button 
                                onClick={() => { onAddModule('transfer_window'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-purple-600/20 hover:border-purple-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Timer size={14} className="text-green-400" /> Transfer
                            </button>
                            <button 
                                onClick={() => { onAddModule('rendezvous_tracker'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-purple-600/20 hover:border-purple-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Navigation size={14} className="text-cyan-400" /> Rendezvous
                            </button>
                            <button 
                                onClick={() => { onAddModule('track_distance'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-purple-600/20 hover:border-purple-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <ArrowRight size={14} className="text-emerald-400" /> Distance
                            </button>
                            <button 
                                onClick={() => { onAddModule('track_velocity'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-purple-600/20 hover:border-purple-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Gauge size={14} className="text-yellow-400" /> Velocity
                            </button>
                            <button 
                                onClick={() => { onAddModule('notify'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-purple-600/20 hover:border-purple-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Activity size={14} className="text-red-400" /> Notify
                            </button>
                            <button 
                                onClick={() => { onAddModule('logic_gate'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-purple-600/20 hover:border-purple-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Activity size={14} className="text-purple-400" /> Logic Gate
                            </button>
                            <button 
                                onClick={() => { onAddModule('beep'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-yellow-600/20 hover:border-yellow-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Volume2 size={14} className="text-yellow-400" /> Beep
                            </button>
                        </div>
                    )}

                    {/* Modules List */}
                    <div className="overflow-y-auto custom-scrollbar p-2 space-y-2 flex-1">
                        {modules.length === 0 && !isAdding && (
                            <div className="text-center py-8 text-slate-500 text-xs italic">
                                No active modules.<br/>Click + to add calculations.
                            </div>
                        )}

                        {(() => {
                            // Organize modules by groups
                            const ungroupedModules = modules.filter(m => !m.groupId);
                            const groupedModules = groups.map(group => ({
                                group,
                                modules: modules.filter(m => m.groupId === group.id)
                            }));

                            // Render function for a single module
                            const renderModule = (module: FlightComputerModule) => (
                                <div 
                                    key={module.id} 
                                    className={`bg-slate-800/30 border rounded-lg p-3 transition-all hover:border-slate-600 cursor-move w-1/4 h-1/4 ${
                                        draggedModuleId === module.id ? 'opacity-50' : ''
                                    }`}
                                    style={{ borderColor: module.color + '50' }}
                                    draggable
                                    onDragStart={() => setDraggedModuleId(module.id)}
                                    onDragEnd={() => setDraggedModuleId(null)}
                                >
                                    {/* Module Header */}
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex items-center gap-2">
                                            <GripVertical size={12} className="text-slate-600" />
                                            <div 
                                                className="w-2 h-2 rounded-full"
                                                style={{ backgroundColor: module.color }}
                                            />
                                            <input 
                                                type="text"
                                                value={module.name || ''}
                                                placeholder={module.type.replace('_', ' ').toUpperCase()}
                                                onChange={(e) => onUpdateModule(module.id, { name: e.target.value })}
                                                className="bg-transparent text-xs font-bold text-slate-200 uppercase border border-transparent hover:border-slate-600 focus:border-purple-500 rounded px-1 -ml-1 outline-none w-24 transition-all placeholder:text-slate-500"
                                                onClick={(e) => e.stopPropagation()}
                                                draggable={false}
                                            />
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => onToggleModule(module.id)}
                                                className={`p-1 rounded hover:bg-slate-700 ${module.isEnabled ? 'text-green-400' : 'text-slate-600'}`}
                                                draggable={false}
                                            >
                                                {module.isEnabled ? <CheckSquare size={14} /> : <Square size={14} />}
                                            </button>
                                            <button 
                                                onClick={() => onRemoveModule(module.id)}
                                                className="p-1 rounded hover:bg-red-900/30 text-slate-600 hover:text-red-400"
                                                draggable={false}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Body Selectors */}
                                    <div className="grid grid-cols-2 gap-2 mb-2" draggable={false}>
                                        {/* Orbit Info */}
                                        {module.type === 'orbit_info' && (
                                            <>
                                                <div className="space-y-1">
                                                    <InputSelector label="Subject" value={getInput(module, 'primary')} onChange={(input) => updateInput(module.id, 'primary', input)} bodies={bodies} modules={modules} currentModuleId={module.id} />
                                                </div>
                                                <div className="space-y-1">
                                                    <InputSelector label="Reference" value={getInput(module, 'reference')} onChange={(input) => updateInput(module.id, 'reference', input)} bodies={bodies} modules={modules} currentModuleId={module.id} />
                                                </div>
                                            </>
                                        )}
                                        {/* Transfer */}
                                        {module.type === 'transfer_window' && (
                                            <>
                                                <div className="space-y-1"><InputSelector label="Subject" value={getInput(module, 'primary')} onChange={(input) => updateInput(module.id, 'primary', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                                <div className="space-y-1"><InputSelector label="Reference" value={getInput(module, 'reference')} onChange={(input) => updateInput(module.id, 'reference', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                                <div className="col-span-2 space-y-1"><InputSelector label="Target" value={getInput(module, 'target')} onChange={(input) => updateInput(module.id, 'target', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                            </>
                                        )}
                                        {/* Rendezvous */}
                                        {module.type === 'rendezvous_tracker' && (
                                            <>
                                                <div className="space-y-1"><InputSelector label="Rocket" value={getInput(module, 'primary')} onChange={(input) => updateInput(module.id, 'primary', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                                <div className="space-y-1"><InputSelector label="Target" value={getInput(module, 'target')} onChange={(input) => updateInput(module.id, 'target', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                            </>
                                        )}
                                        {/* Distance/Velocity */}
                                        {(module.type === 'track_distance' || module.type === 'track_velocity') && (
                                            <>
                                                <div className="space-y-1"><InputSelector label="From" value={getInput(module, 'primary')} onChange={(input) => updateInput(module.id, 'primary', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                                <div className="space-y-1"><InputSelector label="To" value={getInput(module, 'target')} onChange={(input) => updateInput(module.id, 'target', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                            </>
                                        )}
                                        {/* Notify */}
                                        {module.type === 'notify' && (
                                            <div className="col-span-2 space-y-1"><InputSelector label="Monitored Value" value={getInput(module, 'primary')} onChange={(input) => updateInput(module.id, 'primary', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['scalar']} /></div>
                                        )}
                                        {/* Logic Gate */}
                                        {module.type === 'logic_gate' && (
                                            <>
                                                <div className="space-y-1"><InputSelector label="Input A" value={getInput(module, 'inputA')} onChange={(input) => updateInput(module.id, 'inputA', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['boolean']} /></div>
                                                {module.logicOperator !== 'NOT' && (<div className="space-y-1"><InputSelector label="Input B" value={getInput(module, 'inputB')} onChange={(input) => updateInput(module.id, 'inputB', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['boolean']} /></div>)}
                                            </>
                                        )}
                                        {/* Beep */}
                                        {module.type === 'beep' && (
                                            <div className="col-span-2 space-y-1"><InputSelector label="Trigger Input" value={getInput(module, 'primary')} onChange={(input) => updateInput(module.id, 'primary', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['boolean']} /></div>
                                        )}
                                    </div>

                                    {/* Data Display */}
                                    {module.isEnabled && (
                                        <div className="border-t border-slate-700/30 pt-2" draggable={false}>
                                            {renderModuleContent(module)}
                                        </div>
                                    )}
                                </div>
                            );

                            return (
                                <>
                                    {/* Render Groups */}
                                    {groupedModules.map(({ group, modules: groupModules }) => (
                                        <div 
                                            key={group.id}
                                            className={`border-2 rounded-lg transition-all ${dragOverGroupId === group.id ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700/50'} ${group.isCollapsed ? 'w-1/5' : 'w-full'}`}
                                            style={{ borderColor: group.isCollapsed ? group.color : undefined }}
                                            onDragOver={(e) => { e.preventDefault(); setDragOverGroupId(group.id); }}
                                            onDragLeave={() => setDragOverGroupId(null)}
                                            onDrop={() => { if (draggedModuleId) { onMoveModuleToGroup(draggedModuleId, group.id); setDraggedModuleId(null); setDragOverGroupId(null); } }}
                                        >
                                            {/* Group Header */}
                                            <div className="flex justify-between items-center p-2 bg-slate-800/50 rounded-t-lg cursor-pointer hover:bg-slate-800/70" onClick={() => onUpdateGroup(group.id, { isCollapsed: !group.isCollapsed })} style={{ backgroundColor: group.color + '20' }}>
                                                <div className="flex items-center gap-2 flex-1">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                                                    <input type="text" value={group.name} onChange={(e) => { e.stopPropagation(); onUpdateGroup(group.id, { name: e.target.value }); }} onClick={(e) => e.stopPropagation()} className="bg-transparent text-xs font-bold text-slate-200 border border-transparent hover:border-slate-600 focus:border-purple-500 rounded px-1 outline-none flex-1" />
                                                    {!group.isCollapsed && <span className="text-[10px] text-slate-500">({groupModules.length})</span>}
                                                    {group.isCollapsed && group.displayOutput && (<span className="text-[20px] text-cyan-300 font-mono ml-2">{getGroupDisplayValue(group)}</span>)}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={(e) => { e.stopPropagation(); onRemoveGroup(group.id); }} className="p-1 rounded hover:bg-red-900/30 text-slate-600 hover:text-red-400"><Trash2 size={12} /></button>
                                                    {group.isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                                </div>
                                            </div>

                                            {/* Group Content */}
                                            {!group.isCollapsed && (
                                                <div className="p-2 space-y-2">
                                                    {groupModules.length === 0 ? (
                                                        <div className="text-center py-4 text-slate-500 text-[10px] italic">Drag modules here</div>
                                                    ) : (
                                                        groupModules.map(module => renderModule(module))
                                                    )}
                                                    
                                                    {/* Display Output Selector */}
                                                    {groupModules.length > 0 && (
                                                        <div className="pt-2 border-t border-slate-700/30">
                                                            <label className="text-[9px] text-slate-500 uppercase block mb-1">Display Output (collapsed)</label>
                                                            <select value={group.displayOutput ? `${group.displayOutput.moduleId}:${group.displayOutput.outputKey}` : ''} onChange={(e) => { if (!e.target.value) { onUpdateGroup(group.id, { displayOutput: undefined }); return; } const [moduleId, outputKey] = e.target.value.split(':'); onUpdateGroup(group.id, { displayOutput: { moduleId, outputKey } }); }} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 focus:border-purple-500 outline-none">
                                                                <option value="">None</option>
                                                                {groupModules.map(m => { const options = []; if (m.type === 'track_distance') options.push(<option key={`${m.id}:distance`} value={`${m.id}:distance`}>{m.name || 'Distance'} - Value</option>); if (m.type === 'track_velocity') options.push(<option key={`${m.id}:speed`} value={`${m.id}:speed`}>{m.name || 'Velocity'} - Speed</option>); if (m.type === 'orbit_info') { options.push(<option key={`${m.id}:altitude`} value={`${m.id}:altitude`}>{m.name || 'Orbit'} - Altitude</option>); options.push(<option key={`${m.id}:periapsis`} value={`${m.id}:periapsis`}>{m.name || 'Orbit'} - Periapsis</option>); options.push(<option key={`${m.id}:apoapsis`} value={`${m.id}:apoapsis`}>{m.name || 'Orbit'} - Apoapsis</option>); options.push(<option key={`${m.id}:period`} value={`${m.id}:period`}>{m.name || 'Orbit'} - Period</option>); } if (m.type === 'notify') options.push(<option key={`${m.id}:triggered`} value={`${m.id}:triggered`}>{m.name || 'Notify'} - Triggered</option>); if (m.type === 'logic_gate') options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Logic'} - Result</option>); return options; })}
                                                            </select>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Ungrouped Modules */}
                                    {ungroupedModules.length > 0 && (
                                        <div 
                                            className={`border rounded-lg p-2 ${dragOverGroupId === null && draggedModuleId ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700/30'}`}
                                            onDragOver={(e) => { e.preventDefault(); setDragOverGroupId(null); }}
                                            onDrop={() => { if (draggedModuleId) { onMoveModuleToGroup(draggedModuleId, null); setDraggedModuleId(null); setDragOverGroupId(null); } }}
                                        >
                                            <div className="text-[10px] text-slate-500 uppercase mb-2 px-1">Ungrouped Modules</div>
                                            <div className="space-y-2">
                                                {ungroupedModules.map(module => renderModule(module))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Create Group Button */}
                                    {modules.length > 0 && (
                                        <button onClick={onAddGroup} className="w-full py-2 text-xs text-slate-400 hover:text-green-400 border border-dashed border-slate-700 hover:border-green-500/50 rounded-lg flex items-center justify-center gap-2 transition-all">
                                            <FolderPlus size={14} />
                                            Create Group
                                        </button>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlightComputerPanel;
