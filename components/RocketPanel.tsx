

import React, { useState, useRef } from 'react';
import { Rocket, Play, Plus, Trash2, Crosshair, X, RotateCcw, RotateCw, ArrowUp, Zap, Ban, Eye, Globe, Compass, CircleDot, RefreshCw, ArrowDownToLine, TrendingUp, Clock, Disc, Square, Save, Download, Upload, CheckCircle2, Sliders, Settings, Radio } from 'lucide-react';
import { Body, Maneuver, SASMode, PhysicsConfig, Vector2D, RocketSpawnConfig } from '../types';

interface RocketPanelProps {
    onClose: () => void;
    onSpawnToggle: () => void;
    isSpawning: boolean;
    spawnConfig: RocketSpawnConfig;
    onUpdateSpawnConfig: (config: RocketSpawnConfig) => void;
    selectedRocket: Body | null;
    onUpdateRocket: (id: string, updates: Partial<Body>) => void;
    isFollowing: boolean;
    onToggleFollow: () => void;

    bodies: Body[];
    physicsConfig: PhysicsConfig;
    targetBodyId: string;
    onTargetChange: (id: string) => void;
    speed: number;
    onSpeedChange: (val: number) => void;
    onUpdatePhysicsConfig: (config: Partial<PhysicsConfig>) => void;
    getSimulationTime: () => number;
    parentBodyId?: string;
    onParentChange?: (id: string) => void;
}

const ROCKET_COLORS = ['#f97316', '#22d3ee', '#ffffff', '#ef4444', '#94a3b8', '#a855f7', '#eab308'];

const RocketPanel: React.FC<RocketPanelProps> = ({ 
    onClose, 
    onSpawnToggle, 
    isSpawning,
    spawnConfig,
    onUpdateSpawnConfig,
    selectedRocket, 
    onUpdateRocket,
    isFollowing,
    onToggleFollow,

    bodies,
    physicsConfig,
    targetBodyId,
    onTargetChange,
    speed,
    onSpeedChange,
    onUpdatePhysicsConfig,
    getSimulationTime,
    parentBodyId,
    onParentChange
}) => {
    const [activeTab, setActiveTab] = useState<'flight' | 'mission' | 'config'>('flight');

    // Burst Config
    const [thrustPower, setThrustPower] = useState(0.01);
    const [burstDuration, setBurstDuration] = useState(2.0);
    const [burstAngle, setBurstAngle] = useState(0); 
    const [notification, setNotification] = useState<string | null>(null);

    // Manual Control
    const [manualThrusting, setManualThrusting] = useState(false);
    const [manualThrustPower, setManualThrustPower] = useState(0.02);

    // Recorder
    const [isRecording, setIsRecording] = useState(false);
    const [recordedManeuvers, setRecordedManeuvers] = useState<Maneuver[]>([]);
    const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
    const burnStartTimeRef = useRef<number | null>(null);
    const lastActionTimeRef = useRef<number | null>(null);
    
    const showNotification = (msg: string) => {
        setNotification(msg);
        setTimeout(() => setNotification(null), 3000);
    };

    // --- MANEUVER LOGIC ---
    const handleParentChange = (newParentId: string) => {
        if (onParentChange) onParentChange(newParentId);
        if (selectedRocket) {
            onUpdateRocket(selectedRocket.id, { orbitReferenceId: newParentId });
        }
    };

    const handleAddBurst = () => {
        if (!selectedRocket) return;
        const newManeuver: Maneuver = {
            id: `m_${Date.now()}`,
            type: 'burn',
            thrust: thrustPower,
            duration: burstDuration,
            angleOffset: (burstAngle * Math.PI) / 180,
            progress: 0,
            status: 'pending'
        };
        const updatedManeuvers = selectedRocket.maneuvers ? [...selectedRocket.maneuvers, newManeuver] : [newManeuver];
        onUpdateRocket(selectedRocket.id, { maneuvers: updatedManeuvers });
        showNotification("Maneuver added to plan");
    };

    const handleRemoveManeuver = (mId: string) => {
        if (!selectedRocket || !selectedRocket.maneuvers) return;
        const updated = selectedRocket.maneuvers.filter(m => m.id !== mId);
        onUpdateRocket(selectedRocket.id, { maneuvers: updated });
    };

    const handleLaunchPending = () => {
         if (!selectedRocket || !selectedRocket.maneuvers) return;
         const updated = selectedRocket.maneuvers.map(m => {
             if (m.status === 'pending') return { ...m, status: 'active' as const };
             return m;
         });
         onUpdateRocket(selectedRocket.id, { maneuvers: updated });
         showNotification("Executing Plan...");
    };

    const recordGapAndAction = (
        type: 'burn' | 'rotate' | 'sas' | 'auto_circularize' | 'auto_land' | 'auto_transfer', 
        param: number | string | undefined, 
        thrust: number = 0, 
        duration: number = 0, 
        angleOffset: number = 0,
        targetId?: string,
        parentId?: string
    ) => {
        if (!isRecording) return;
        const now = getSimulationTime();
        
        if (lastActionTimeRef.current !== null) {
            const coastSimDuration = now - lastActionTimeRef.current;
            if (coastSimDuration > 0.0001) {
                setRecordedManeuvers(prev => [...prev, {
                    id: `rec_coast_${Date.now()}`,
                    type: 'wait',
                    thrust: 0,
                    duration: coastSimDuration,
                    angleOffset: 0,
                    progress: 0,
                    status: 'pending'
                }]);
            }
        }
        setRecordedManeuvers(prev => [...prev, {
            id: `rec_act_${Date.now()}_${Math.random()}`,
            type: type,
            param: param,
            thrust: thrust,
            duration: duration,
            angleOffset: angleOffset,
            targetBodyId: targetId,
            parentBodyId: parentId,
            progress: 0,
            status: 'pending'
        }]);
        lastActionTimeRef.current = now;
    };

    const handleRotate = (deltaDeg: number) => {
        if (!selectedRocket) return;
        onUpdateRocket(selectedRocket.id, { 
            angle: (selectedRocket.angle || 0) + (deltaDeg * Math.PI / 180),
            sasMode: 'off'
        });
        recordGapAndAction('rotate', deltaDeg);
    };

    const handleManualThrustStart = () => {
        if (!selectedRocket) return;
        setManualThrusting(true);
        const angle = selectedRocket.angle || 0;
        onUpdateRocket(selectedRocket.id, { 
            thrust: { x: Math.cos(angle) * manualThrustPower, y: Math.sin(angle) * manualThrustPower } 
        });

        if (isRecording) {
            const now = getSimulationTime();
            burnStartTimeRef.current = now;
            if (lastActionTimeRef.current !== null) {
                const coastSimDuration = now - lastActionTimeRef.current;
                if (coastSimDuration > 0.0001) {
                    setRecordedManeuvers(prev => [...prev, {
                        id: `rec_coast_${Date.now()}`,
                        type: 'wait',
                        thrust: 0,
                        duration: coastSimDuration,
                        angleOffset: 0,
                        progress: 0,
                        status: 'pending'
                    }]);
                }
            }
        }
    };

    const handleManualThrustEnd = () => {
        if (!selectedRocket) return;
        setManualThrusting(false);
        onUpdateRocket(selectedRocket.id, { thrust: { x: 0, y: 0 } });

        if (isRecording && burnStartTimeRef.current !== null) {
            const now = getSimulationTime();
            const burnSimDuration = now - burnStartTimeRef.current;
            if (burnSimDuration > 0.0001) {
                setRecordedManeuvers(prev => [...prev, {
                    id: `rec_burn_${Date.now()}`,
                    type: 'burn',
                    thrust: manualThrustPower,
                    duration: burnSimDuration,
                    angleOffset: 0,
                    progress: 0,
                    status: 'pending'
                }]);
            }
            lastActionTimeRef.current = now;
            burnStartTimeRef.current = null;
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            setIsRecording(false);
            lastActionTimeRef.current = null;
            burnStartTimeRef.current = null;
        } else {
            const now = getSimulationTime();
            setIsRecording(true);
            setRecordedManeuvers([]);
            setRecordingStartTime(now);
            lastActionTimeRef.current = now;
        }
    };

    const loadRecordedToFlightPlan = () => {
        if (!selectedRocket || recordedManeuvers.length === 0) return;
        const now = getSimulationTime();
        let planToLoad = [...recordedManeuvers];
        if (recordingStartTime !== null && now < recordingStartTime) {
             const waitTime = recordingStartTime - now;
             planToLoad = [{
                id: `sync_wait_${Date.now()}`,
                type: 'wait',
                thrust: 0,
                duration: waitTime,
                angleOffset: 0,
                progress: 0,
                status: 'pending'
            }, ...planToLoad];
            showNotification(`Synced: Waiting ${waitTime.toFixed(1)}s`);
        } 
        const existing = selectedRocket.maneuvers || [];
        const newPlan = planToLoad.map(m => ({...m, id: `plan_${Math.random()}`, status: 'pending' as const}));
        onUpdateRocket(selectedRocket.id, { maneuvers: [...existing, ...newPlan] });
        showNotification("Recording Loaded to Flight Plan");
    };

    const handleExportFlightPlan = () => {
        if (recordedManeuvers.length === 0) return;
        const exportData = { startTime: recordingStartTime, maneuvers: recordedManeuvers };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `flight-plan-${new Date().getTime()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification("Flight plan exported");
    };

    const handleImportFlightPlan = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                const maneuvers = Array.isArray(json) ? json : json.maneuvers;
                if (maneuvers) {
                    setRecordedManeuvers(maneuvers.map((m: any) => ({
                        ...m,
                        id: `imported_${Date.now()}_${Math.random()}`,
                        status: 'pending'
                    })));
                    setRecordingStartTime(json.startTime || null);
                    showNotification("Flight plan imported");
                }
            } catch (err) { console.error(err); showNotification("Import failed"); }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const setSAS = (mode: SASMode) => {
        if (!selectedRocket) return;
        onUpdateRocket(selectedRocket.id, { sasMode: mode });
        recordGapAndAction('sas', mode);
    };

    const triggerAutoManeuver = (type: any, targetId: string, parentId?: string) => {
        if (!selectedRocket) return;
        const newManeuver: Maneuver = {
            id: `m_auto_${Date.now()}`,
            type: type,
            targetBodyId: targetId,
            parentBodyId: parentId,
            thrust: 0, duration: 0, angleOffset: 0, progress: 0, status: 'active'
        };
        const existing = selectedRocket.maneuvers?.filter(m => !m.id.startsWith('m_auto_')) || [];
        onUpdateRocket(selectedRocket.id, { maneuvers: [...existing, newManeuver] });
        recordGapAndAction(type, undefined, 0, 0, 0, targetId, parentId);
    };

    return (
        <div 
            className="fixed top-20 right-4 w-96 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-30 flex flex-col overflow-hidden max-h-[85vh]"
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onMouseMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-indigo-900/30">
                <div className="flex items-center gap-2 text-white font-bold">
                    <Rocket size={20} className="text-orange-400" />
                    Rocket Control Center
                </div>
                <div className="flex gap-2">
                     <button onClick={onSpawnToggle} className={`p-1.5 rounded transition-colors ${isSpawning ? 'bg-orange-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`} title="Spawn Mode">
                        <Crosshair size={18} />
                     </button>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">
                        <X size={18} />
                    </button>
                </div>
                {notification && (
                    <div className="absolute top-16 left-4 right-4 bg-green-600 text-white p-2 rounded text-xs font-bold text-center animate-bounce shadow-lg z-50">
                        {notification}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                
                {isSpawning ? (
                    <div className="space-y-4">
                        <div className="bg-orange-900/20 border border-orange-500/30 p-3 rounded text-xs text-orange-200">
                            Click on a planet to launch from surface (inherits velocity) or click in empty space to spawn at rest.
                        </div>
                        
                        <div>
                             <label className="block text-xs text-slate-400 uppercase mb-1">Rocket Name</label>
                             <input 
                                type="text" 
                                value={spawnConfig.name}
                                onChange={(e) => onUpdateSpawnConfig({...spawnConfig, name: e.target.value})}
                                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-2 text-sm text-white focus:border-orange-500 outline-none placeholder-slate-500"
                                maxLength={20}
                             />
                        </div>
                        <div>
                            <label className="block text-xs text-slate-400 uppercase mb-2">Hull Color</label>
                            <div className="flex gap-2 flex-wrap">
                                {ROCKET_COLORS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => onUpdateSpawnConfig({...spawnConfig, color: c})}
                                        style={{ backgroundColor: c }}
                                        className={`w-8 h-8 rounded-full transition-transform ${spawnConfig.color === c ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                ) : !selectedRocket ? (
                    <div className="text-center text-slate-500 text-sm py-10 italic">
                        Select a rocket to begin control.
                    </div>
                ) : (
                    <>
                        {/* GLOBAL CONTEXT */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                             {onParentChange && (
                                <select 
                                    value={parentBodyId || ''} 
                                    onChange={(e) => handleParentChange(e.target.value)}
                                    className="bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 outline-none focus:border-indigo-500"
                                >
                                    <option value="">Ref: Auto</option>
                                    {bodies.filter(b => b.id !== selectedRocket.id).map(b => (
                                        <option key={b.id} value={b.id}>Ref: {b.name}</option>
                                    ))}
                                </select>
                             )}
                             <select 
                                value={targetBodyId} 
                                onChange={(e) => {
                                    const newTargetId = e.target.value;
                                    onTargetChange(newTargetId);
                                    if (newTargetId && newTargetId === parentBodyId) {
                                        // Reset parent to Auto if target matches parent
                                        if (onParentChange) onParentChange('');
                                    }
                                }}
                                className="bg-slate-800 text-xs text-white p-2 rounded border border-slate-700 outline-none focus:border-indigo-500"
                            >
                                <option value="">Target: None</option>
                                {bodies.filter(b => b.id !== selectedRocket.id && b.id !== parentBodyId).map(b => (
                                    <option key={b.id} value={b.id}>Target: {b.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        {/* TABS */}
                        <div className="flex bg-slate-800 p-1 rounded-lg mb-4">
                            <button 
                                onClick={() => setActiveTab('flight')}
                                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 ${activeTab === 'flight' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Zap size={14} /> FLIGHT
                            </button>
                            <button 
                                onClick={() => setActiveTab('mission')}
                                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 ${activeTab === 'mission' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Radio size={14} /> MISSION
                            </button>
                            <button 
                                onClick={() => setActiveTab('config')}
                                className={`flex-1 py-2 text-xs font-bold rounded flex items-center justify-center gap-2 ${activeTab === 'config' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Settings size={14} /> SYSTEM
                            </button>
                        </div>

                        {/* --- FLIGHT TAB --- */}
                        {activeTab === 'flight' && (
                            <div className="space-y-6">
                                {/* SAS */}
                                <div>
                                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-2 flex justify-between items-center">
                                        SAS Autopilot
                                        {selectedRocket.sasMode && selectedRocket.sasMode !== 'off' && <span className="text-green-400 animate-pulse text-[10px]">ACTIVE</span>}
                                    </div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <button onClick={() => setSAS('off')} className={`p-2 rounded text-[10px] font-bold ${(!selectedRocket.sasMode || selectedRocket.sasMode === 'off') ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400'}`}>OFF</button>
                                        <button onClick={() => setSAS('prograde')} title="Prograde" className={`p-2 rounded flex justify-center ${selectedRocket.sasMode === 'prograde' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-emerald-500'}`}><CircleDot size={18} /></button>
                                        <button onClick={() => setSAS('retrograde')} title="Retrograde" className={`p-2 rounded flex justify-center ${selectedRocket.sasMode === 'retrograde' ? 'bg-red-600 text-white' : 'bg-slate-800 text-red-500'}`}><X size={18} /></button>
                                        <button onClick={() => setSAS('radial_out')} title="Radial Out" className={`p-2 rounded flex justify-center ${selectedRocket.sasMode === 'radial_out' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-blue-500'}`}><ArrowUp size={18} /></button>
                                    </div>
                                </div>

                                {/* MANUAL PAD */}
                                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                     <div className="flex justify-between text-xs mb-2">
                                        <span className="text-slate-400">Manual Override</span>
                                        <span className="text-orange-400 font-mono">{manualThrustPower.toFixed(3)}N</span>
                                    </div>
                                    <input 
                                        type="range" min="0.001" max="0.01" step="0.001"
                                        value={manualThrustPower}
                                        onChange={(e) => setManualThrustPower(Number(e.target.value))}
                                        className="w-full accent-orange-600 bg-slate-700 h-1 rounded-lg mb-4"
                                    />
                                    
                                    <div className="flex justify-center gap-4 items-center">
                                        <button onClick={() => handleRotate(-15)} className="w-12 h-12 rounded-full bg-slate-700 hover:bg-indigo-600 flex items-center justify-center text-white active:scale-95 transition-all"><RotateCcw size={20} /></button>
                                        
                                        <button 
                                            onMouseDown={handleManualThrustStart}
                                            onMouseUp={handleManualThrustEnd}
                                            onMouseLeave={() => { if(manualThrusting) handleManualThrustEnd() }}
                                            onTouchStart={(e) => { e.preventDefault(); handleManualThrustStart(); }}
                                            onTouchEnd={(e) => { e.preventDefault(); handleManualThrustEnd(); }}
                                            onTouchCancel={(e) => { e.preventDefault(); handleManualThrustEnd(); }}
                                            className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${manualThrusting ? 'bg-orange-500 scale-95 shadow-inner' : 'bg-orange-600 hover:bg-orange-500 shadow-xl'}`}
                                        >
                                            <ArrowUp size={32} className="text-white" />
                                            <span className="text-[10px] font-bold text-white/80">IGNITE</span>
                                        </button>

                                        <button onClick={() => handleRotate(15)} className="w-12 h-12 rounded-full bg-slate-700 hover:bg-indigo-600 flex items-center justify-center text-white active:scale-95 transition-all"><RotateCw size={20} /></button>
                                    </div>
                                </div>

                                {/* AUTO MANEUVERS */}
                                <div>
                                     <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Auto Maneuvers</div>
                                     <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => triggerAutoManeuver('auto_circularize', parentBodyId!)}
                                            disabled={!parentBodyId}
                                            className="p-3 bg-slate-800 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors flex items-center gap-2 border border-slate-700"
                                        >
                                            <RefreshCw size={16} /> CIRCULARIZE
                                        </button>
                                        <button 
                                            onClick={() => triggerAutoManeuver('auto_land', targetBodyId || parentBodyId!)}
                                            disabled={!targetBodyId && !parentBodyId}
                                            className="p-3 bg-slate-800 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors flex items-center gap-2 border border-slate-700"
                                        >
                                            <ArrowDownToLine size={16} /> LAND / STOP
                                        </button>
                                        <button 
                                            onClick={() => triggerAutoManeuver('auto_transfer', targetBodyId, parentBodyId!)}
                                            disabled={!targetBodyId || !parentBodyId}
                                            className="col-span-2 p-3 bg-slate-800 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold text-white transition-colors flex items-center justify-center gap-2 border border-slate-700"
                                        >
                                            <TrendingUp size={16} /> TRANSFER INJECTION
                                        </button>
                                     </div>
                                </div>
                            </div>
                        )}

                        {/* --- MISSION TAB --- */}
                        {activeTab === 'mission' && (
                            <div className="space-y-6">
                                {/* Recorder */}
                                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                                    <div className="flex justify-between items-center mb-4">
                                         <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2"><Disc size={14} /> Flight Recorder</h4>
                                         {isRecording && <div className="text-[10px] text-red-500 font-bold animate-pulse flex items-center gap-1"><CircleDot size={8} fill="currentColor" /> REC</div>}
                                    </div>
                                    
                                    <div className="flex gap-2 mb-2">
                                        <button 
                                            onClick={toggleRecording}
                                            className={`flex-1 py-2 rounded text-xs font-bold flex items-center justify-center gap-2 ${isRecording ? 'bg-slate-700 text-white' : 'bg-red-900/30 text-red-400 border border-red-900/50 hover:bg-red-900/50'}`}
                                        >
                                            {isRecording ? <Square size={12} fill="currentColor" /> : <Disc size={12} />}
                                            {isRecording ? 'STOP' : 'START REC'}
                                        </button>
                                        <button 
                                            onClick={handleLaunchPending}
                                            disabled={!selectedRocket.maneuvers?.some(m=>m.status==='pending')}
                                            className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center justify-center gap-2"
                                        >
                                            <Play size={12} fill="currentColor" /> EXECUTE PLAN
                                        </button>
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <button onClick={handleExportFlightPlan} disabled={recordedManeuvers.length===0} className="flex-1 py-1.5 bg-slate-800 text-slate-300 text-[10px] rounded border border-slate-700 hover:bg-slate-700 flex justify-center gap-1"><Download size={10} /> EXPORT</button>
                                        <label className="flex-1 py-1.5 bg-slate-800 text-slate-300 text-[10px] rounded border border-slate-700 hover:bg-slate-700 flex justify-center gap-1 cursor-pointer">
                                            <Upload size={10} /> IMPORT <input type="file" accept=".json" onChange={handleImportFlightPlan} className="hidden" />
                                        </label>
                                    </div>
                                </div>

                                {/* Plan Editor (Add Burst) */}
                                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-2">Add Manual Burn</div>
                                    <div className="grid grid-cols-3 gap-2 mb-2">
                                        <input type="number" value={thrustPower} onChange={e=>setThrustPower(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white" placeholder="N" />
                                        <input type="number" value={burstDuration} onChange={e=>setBurstDuration(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white" placeholder="Sec" />
                                        <input type="number" value={burstAngle} onChange={e=>setBurstAngle(Number(e.target.value))} className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white" placeholder="Deg" />
                                    </div>
                                    <button onClick={handleAddBurst} className="w-full py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded flex items-center justify-center gap-1"><Plus size={12} /> Add to Queue</button>
                                </div>

                                {/* List */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase">
                                        <span>Sequence Queue</span>
                                        {recordedManeuvers.length > 0 && <button onClick={loadRecordedToFlightPlan} className="text-indigo-400 hover:text-white flex gap-1 items-center"><Save size={10} /> Load Rec</button>}
                                    </div>
                                    <div className="bg-slate-900/50 rounded-lg p-2 max-h-[200px] overflow-y-auto space-y-1 border border-slate-800">
                                        {(!selectedRocket.maneuvers || selectedRocket.maneuvers.length === 0) && <div className="text-[10px] text-slate-600 text-center italic py-2">Queue Empty</div>}
                                        {selectedRocket.maneuvers?.map((m, i) => (
                                            <div key={m.id} className={`text-[10px] flex items-center gap-2 p-1.5 rounded border ${m.status==='active'?'bg-green-900/20 border-green-500/30':m.status==='completed'?'bg-slate-800/50 border-transparent opacity-50':'bg-slate-800 border-slate-700'}`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${m.status==='active'?'bg-green-500 animate-pulse':m.status==='completed'?'bg-slate-600':'bg-orange-500'}`} />
                                                <div className="flex-1 text-slate-300">
                                                    {m.type === 'wait' ? 'Wait' : m.type.startsWith('auto_') ? m.type.replace('auto_','Auto-').toUpperCase() : m.type.toUpperCase()} 
                                                    <span className="text-slate-500 ml-2 font-mono">
                                                        {m.type==='wait'||m.type==='burn' ? m.duration.toFixed(2)+'s' : ''}
                                                        {m.type==='rotate' ? m.param+'°' : ''}
                                                    </span>
                                                </div>
                                                {m.status==='pending' && <button onClick={()=>handleRemoveManeuver(m.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={10} /></button>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- CONFIG TAB --- */}
                        {activeTab === 'config' && (
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2"><Clock size={12} /> Time Dilation</h4>
                                    <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
                                        {[0.1, 1, 10, 100].map(val => (
                                            <button key={val} onClick={() => onSpeedChange(val)} className={`flex-1 py-1 rounded text-[10px] font-bold ${Math.abs(speed - val) < 0.01 ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`}>{val}x</button>
                                        ))}
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-xs mb-1 text-slate-400"><span>Physics Step</span><span className="text-indigo-300 font-mono">{physicsConfig.timeStep.toFixed(3)}</span></div>
                                        <input type="range" min="0.001" max="1.0" step="0.001" value={physicsConfig.timeStep} onChange={(e) => onUpdatePhysicsConfig({ timeStep: Number(e.target.value) })} className="w-full accent-indigo-500 bg-slate-700 h-1 rounded-lg" />
                                    </div>
                                </div>



                                <div className="pt-4 border-t border-slate-700">
                                    <button onClick={onToggleFollow} className={`w-full py-2 rounded text-xs font-bold transition-colors flex items-center justify-center gap-2 ${isFollowing ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                                        {isFollowing ? <Ban size={14} /> : <Crosshair size={14} />} {isFollowing ? "Unlock Camera" : "Follow Rocket"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default RocketPanel;