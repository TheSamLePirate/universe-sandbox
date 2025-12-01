import React, { useState, useEffect } from 'react';
import { Body, FlightComputerModule, FlightComputerModuleType, PhysicsConfig, Vector2D } from '../types';
import { Activity, X, Plus, ChevronDown, ChevronUp, Settings, Trash2, Play, Pause, Square, CheckSquare, Globe, Rocket, Navigation, Timer, Compass, Gauge } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';

interface FlightComputerPanelProps {
    modules: FlightComputerModule[];
    bodies: Body[];
    physicsConfig: PhysicsConfig;
    onAddModule: (type: FlightComputerModuleType) => void;
    onRemoveModule: (id: string) => void;
    onUpdateModule: (id: string, updates: Partial<FlightComputerModule>) => void;
    onToggleModule: (id: string) => void;
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

const FlightComputerPanel: React.FC<FlightComputerPanelProps> = ({
    modules,
    bodies,
    physicsConfig,
    onAddModule,
    onRemoveModule,
    onUpdateModule,
    onToggleModule,
    rendezvousPoints
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const isMobile = useIsMobile();

    // --- Calculation Helpers ---
    const calculateOrbitInfo = (primaryId: string, referenceId: string) => {
        const primary = bodies.find(b => b.id === primaryId);
        const reference = bodies.find(b => b.id === referenceId);
        
        if (!primary || !reference) return null;

        const dx = primary.position.x - reference.position.x;
        const dy = primary.position.y - reference.position.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const dvx = primary.velocity.x - reference.velocity.x;
        const dvy = primary.velocity.y - reference.velocity.y;
        const vSq = dvx*dvx + dvy*dvy;
        
        const mu = physicsConfig.gravitationalConstant * reference.mass;
        const E = (vSq / 2) - (mu / dist);
        const altitude = dist - reference.radius;

        let periapsis = -1;
        let apoapsis = -1;
        let period = 0;

        if (E < 0) {
            const a = -mu / (2 * E);
            const h = (dx * dvy) - (dy * dvx);
            const eccentricity = Math.sqrt(1 + (2 * E * h * h) / (mu * mu));
            periapsis = (a * (1 - eccentricity)) - reference.radius;
            apoapsis = (a * (1 + eccentricity)) - reference.radius;
            period = 2 * Math.PI * Math.sqrt(Math.pow(a, 3) / mu);
        }

        return { altitude, periapsis, apoapsis, period, isBound: E < 0 };
    };

    const calculateTransferInfo = (primaryId: string, referenceId: string, targetId?: string) => {
        if (!targetId) return null;
        const primary = bodies.find(b => b.id === primaryId);
        const reference = bodies.find(b => b.id === referenceId);
        const target = bodies.find(b => b.id === targetId);

        if (!primary || !reference || !target) return null;

        // Phase Angle Calculation
        const primaryAngle = Math.atan2(primary.position.y - reference.position.y, primary.position.x - reference.position.x);
        const targetAngle = Math.atan2(target.position.y - reference.position.y, target.position.x - reference.position.x);
        
        let currentPhase = (targetAngle - primaryAngle) * 180 / Math.PI;
        while (currentPhase > 180) currentPhase -= 360;
        while (currentPhase < -180) currentPhase += 360;

        const r1 = Math.sqrt(Math.pow(primary.position.x - reference.position.x, 2) + Math.pow(primary.position.y - reference.position.y, 2));
        const r2 = Math.sqrt(Math.pow(target.position.x - reference.position.x, 2) + Math.pow(target.position.y - reference.position.y, 2));
        const period_target = 2 * Math.PI * Math.sqrt(Math.pow(r2, 3) / (physicsConfig.gravitationalConstant * reference.mass));
        const a_transfer = (r1 + r2) / 2;
        const period_transfer = 2 * Math.PI * Math.sqrt(Math.pow(a_transfer, 3) / (physicsConfig.gravitationalConstant * reference.mass));
        
        const travelTime = period_transfer / 2;
        const targetMotion = (360 / period_target) * travelTime;
        const requiredPhase = 180 - targetMotion;
        
        let normalizedRequired = requiredPhase;
        while (normalizedRequired > 180) normalizedRequired -= 360;
        while (normalizedRequired < -180) normalizedRequired += 360;

        const error = Math.abs(currentPhase - normalizedRequired);
        
        return { currentPhase, requiredPhase: normalizedRequired, error, ready: error < 5 };
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
                const orbitData = calculateOrbitInfo(module.primaryBodyId, module.referenceBodyId);
                if (!orbitData) return <div className="text-xs text-slate-500 italic">Invalid Body Selection</div>;
                
                return (
                    <div className="grid grid-cols-2 gap-2 mt-2">
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
                                <div className="bg-slate-800/50 p-1.5 rounded">
                                    <div className="text-[9px] text-slate-500 uppercase">Apoapsis</div>
                                    <div className="text-xs text-orange-300 font-mono">{orbitData.apoapsis.toFixed(1)} u</div>
                                </div>
                                <div className="bg-slate-800/50 p-1.5 rounded">
                                    <div className="text-[9px] text-slate-500 uppercase">Periapsis</div>
                                    <div className="text-xs text-blue-300 font-mono">{orbitData.periapsis.toFixed(1)} u</div>
                                </div>
                            </>
                        )}
                        {!orbitData.isBound && (
                             <div className="col-span-2 text-[10px] text-slate-400 italic text-center">Unbound Trajectory</div>
                        )}
                    </div>
                );
            
            case 'transfer_window':
                const transferData = calculateTransferInfo(module.primaryBodyId, module.referenceBodyId, module.targetBodyId);
                if (!transferData) return <div className="text-xs text-slate-500 italic">Select Target Body</div>;

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
                // Find rendezvous data for this module
                const rocketBody = bodies.find(b => b.id === module.primaryBodyId);
                const targetBody = bodies.find(b => b.id === module.targetBodyId);
                const rendezvousData = rendezvousPoints?.find(rdv => rdv.moduleId === module.id);
                
                if (!rocketBody || !targetBody) {
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
                                    <div>Rocket: <span className="text-white font-mono">{rocketBody.name}</span></div>
                                    <div>Target: <span className="text-white font-mono">{targetBody.name}</span></div>
                                    <div className="text-[9px] text-orange-400 italic mt-1">No rendezvous within prediction window</div>
                                </div>
                            </div>
                        )}
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
                <div className="pointer-events-auto mt-2 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-lg shadow-2xl w-80 max-h-[80vh] flex flex-col animate-in slide-in-from-right-4 duration-200">
                    
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
                        </div>
                    )}

                    {/* Modules List */}
                    <div className="overflow-y-auto custom-scrollbar p-2 space-y-2 flex-1">
                        {modules.length === 0 && !isAdding && (
                            <div className="text-center py-8 text-slate-500 text-xs italic">
                                No active modules.<br/>Click + to add calculations.
                            </div>
                        )}

                        {modules.map(module => (
                            <div key={module.id} className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3 transition-all hover:border-slate-600">
                                {/* Module Header */}
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center gap-2">
                                        <div 
                                            className="w-2 h-2 rounded-full"
                                            style={{ backgroundColor: module.color }}
                                        />
                                        <span className="text-xs font-bold text-slate-200 uppercase">
                                            {module.type.replace('_', ' ')}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button 
                                            onClick={() => onToggleModule(module.id)}
                                            className={`p-1 rounded hover:bg-slate-700 ${module.isEnabled ? 'text-green-400' : 'text-slate-600'}`}
                                        >
                                            {module.isEnabled ? <CheckSquare size={14} /> : <Square size={14} />}
                                        </button>
                                        <button 
                                            onClick={() => onRemoveModule(module.id)}
                                            className="p-1 rounded hover:bg-red-900/30 text-slate-600 hover:text-red-400"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Body Selectors */}
                                <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-slate-500 uppercase block">Subject</label>
                                        <select 
                                            value={module.primaryBodyId}
                                            onChange={(e) => onUpdateModule(module.id, { primaryBodyId: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-300 focus:border-purple-500 outline-none"
                                        >
                                            {bodies.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] text-slate-500 uppercase block">Reference</label>
                                        <select 
                                            value={module.referenceBodyId}
                                            onChange={(e) => onUpdateModule(module.id, { referenceBodyId: e.target.value })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-300 focus:border-purple-500 outline-none"
                                        >
                                            {bodies.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {(module.type === 'transfer_window' || module.type === 'rendezvous_tracker') && (
                                        <div className="col-span-2 space-y-1">
                                            <label className="text-[9px] text-slate-500 uppercase block">Target</label>
                                            <select 
                                                value={module.targetBodyId || ''}
                                                onChange={(e) => onUpdateModule(module.id, { targetBodyId: e.target.value })}
                                                className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-300 focus:border-purple-500 outline-none"
                                            >
                                                <option value="">Select Target...</option>
                                                {bodies.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Data Display */}
                                {module.isEnabled && (
                                    <div className="border-t border-slate-700/30 pt-2">
                                        {renderModuleContent(module)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlightComputerPanel;
