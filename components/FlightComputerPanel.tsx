import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Body, FlightComputerModule, FlightComputerModuleType, PhysicsConfig, Vector2D, FlightComputerInput, ModuleGroup, RendezvousSolution, Maneuver, MarkerShape } from '../types';
import { Activity, X, Plus, ChevronDown, ChevronUp, Settings, Trash2, Play, Pause, Square, CheckSquare, Globe, Rocket, Navigation, Timer, Compass, Gauge, ArrowRight, Volume2, Mic, GripVertical, FolderPlus, Download, Upload, Video, Calculator, MapPin } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';
import { calculateOrbitInfo, resolveInput, calculateTransferInfo, resolveScalarInput, calculateDistance, calculateRelativeSpeed, resolveBooleanInput, resolveStringInput } from '../services/orbitalMath';
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
    onMoveGroupToGroup: (groupId: string, parentGroupId: string | null) => void;
    onExportGroup: (groupId: string) => void;
    onImportGroup: () => void;
    rendezvousPoints?: RendezvousSolution[];
    onSetFollowingBody?: (bodyId: string | null) => void;
}

const MANEUVER_TYPE_OPTIONS: { value: Maneuver['type']; label: string }[] = [
    { value: 'burn', label: 'Burn (Thrust)' },
    { value: 'wait', label: 'Wait / Coast' },
    { value: 'rotate', label: 'Rotate' },
    { value: 'sas', label: 'SAS Mode' },
    { value: 'auto_circularize', label: 'Auto Circularize' },
    { value: 'auto_transfer', label: 'Auto Transfer' },
    { value: 'auto_intercept', label: 'Auto Intercept' },
    { value: 'auto_land', label: 'Auto Land' },
    { value: 'manual_node', label: 'Manual Node' },
    { value: 'wait_for_transfer', label: 'Wait For Transfer' },
    { value: 'wait_for_altitude', label: 'Wait For Altitude' },
    { value: 'burn_until_altitude', label: 'Burn Until Altitude' },
    { value: 'change_simulation_speed', label: 'Change Sim Speed' }
];

const MARKER_SHAPE_OPTIONS: { value: MarkerShape; label: string }[] = [
    { value: 'ring', label: 'Ring' },
    { value: 'diamond', label: 'Diamond' },
    { value: 'square', label: 'Square' },
    { value: 'triangle', label: 'Triangle' },
    { value: 'pin', label: 'Pin' }
];

const InputSelector: React.FC<{
    label: string;
    value: FlightComputerInput | undefined;
    onChange: (input: FlightComputerInput) => void;
    bodies: Body[];
    modules: FlightComputerModule[];
    currentModuleId: string;
    allowedTypes?: ('body' | 'module_output' | 'scalar' | 'boolean' | 'string' | 'vector')[];
}> = ({ label, value, onChange, bodies, modules, currentModuleId, allowedTypes = ['body', 'module_output'] }) => {
    const [mode, setMode] = useState<'body' | 'module'>('body');
    const bodyAllowed = allowedTypes.includes('body');
    const moduleOutputsAllowed = allowedTypes.includes('module_output');
    const scalarAllowed = allowedTypes.includes('scalar');
    const booleanAllowed = allowedTypes.includes('boolean');
    const stringAllowed = allowedTypes.includes('string');
    const vectorAllowed = allowedTypes.includes('vector');
    const moduleSelectorEnabled = moduleOutputsAllowed || scalarAllowed || booleanAllowed || stringAllowed || vectorAllowed;

    // Initialize / sync mode based on current value, but keep user choice when empty
    useEffect(() => {
        if (value?.type === 'module_output' && moduleSelectorEnabled) {
            setMode('module');
            return;
        }
        if (value?.type === 'body' && bodyAllowed) {
            setMode('body');
            return;
        }
        if (!value) {
            if (!bodyAllowed && moduleSelectorEnabled) {
                setMode('module');
            } else if (bodyAllowed && !moduleSelectorEnabled) {
                setMode('body');
            }
        }
    }, [value?.type, bodyAllowed, moduleSelectorEnabled]);

    const availableModules = modules.filter(m => m.id !== currentModuleId);

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center">
                <label className="text-[9px] text-slate-500 uppercase">{label}</label>
                {bodyAllowed && moduleSelectorEnabled && (
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
            
            {mode === 'body' && bodyAllowed ? (
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
            ) : moduleSelectorEnabled ? (
                <select 
                    value={value?.type === 'module_output' ? value.value : ''}
                    onChange={(e) => {
                        const [modId, key] = e.target.value.split(':');
                        const mod = modules.find(m => m.id === modId);
                        let label = `${mod?.name || 'Module'} - ${key}`;
                        if (key === 'pe_point') label = `${mod?.name || 'Orbit'} Pe`;
                        if (key === 'pa_point') label = `${mod?.name || 'Orbit'} Pa`;
                        if (mod?.type === 'rendezvous_tracker') {
                            if (key === 'position') label = `${mod?.name || 'Rendezvous'} Position`;
                            if (key === 'time') label = `${mod?.name || 'Rendezvous'} Time`;
                            if (key === 'distance') label = `${mod?.name || 'Rendezvous'} Distance`;
                            if (key === 'delta_v_total') label = `${mod?.name || 'Rendezvous'} ΔV Total`;
                            if (key === 'delta_v_prograde') label = `${mod?.name || 'Rendezvous'} ΔV Prograde`;
                            if (key === 'delta_v_radial') label = `${mod?.name || 'Rendezvous'} ΔV Radial`;
                        }
                        
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
                        if (!scalarAllowed || vectorAllowed) {
                            if (m.type === 'orbit_info') {
                                options.push(<option key={`${m.id}:pe_point`} value={`${m.id}:pe_point`}>{m.name || 'Orbit'} - Periapsis Point</option>);
                                options.push(<option key={`${m.id}:pa_point`} value={`${m.id}:pa_point`}>{m.name || 'Orbit'} - Apoapsis Point</option>);
                                options.push(<option key={`${m.id}:primary_body`} value={`${m.id}:primary_body`}>{m.name || 'Orbit'} - Subject Body</option>);
                                options.push(<option key={`${m.id}:reference_body`} value={`${m.id}:reference_body`}>{m.name || 'Orbit'} - Reference Body</option>);
                            }
                            if (m.type === 'transfer_window') {
                                options.push(<option key={`${m.id}:primary_body`} value={`${m.id}:primary_body`}>{m.name || 'Transfer'} - Subject Body</option>);
                                options.push(<option key={`${m.id}:reference_body`} value={`${m.id}:reference_body`}>{m.name || 'Transfer'} - Reference Body</option>);
                                options.push(<option key={`${m.id}:target_body`} value={`${m.id}:target_body`}>{m.name || 'Transfer'} - Target Body</option>);
                                options.push(<option key={`${m.id}:insertion_point`} value={`${m.id}:insertion_point`}>{m.name || 'Transfer'} - Insertion Point</option>);
                                options.push(<option key={`${m.id}:intercept_point`} value={`${m.id}:intercept_point`}>{m.name || 'Transfer'} - Intercept Target</option>);
                                options.push(<option key={`${m.id}:intercept_point_transfer`} value={`${m.id}:intercept_point_transfer`}>{m.name || 'Transfer'} - Transfer Apoapsis</option>);
                            }
                            if (m.type === 'marker') {
                                options.push(<option key={`${m.id}:position`} value={`${m.id}:position`}>{m.name || 'Marker'} - Position</option>);
                            }
                            if (m.type === 'rendezvous_tracker') {
                                options.push(<option key={`${m.id}:position`} value={`${m.id}:position`}>{m.name || 'Rendezvous'} - Position</option>);
                                options.push(<option key={`${m.id}:primary_body`} value={`${m.id}:primary_body`}>{m.name || 'Rendezvous'} - Rocket Body</option>);
                                options.push(<option key={`${m.id}:target_body`} value={`${m.id}:target_body`}>{m.name || 'Rendezvous'} - Target Body</option>);
                            }
                            if (m.type === 'track_distance' || m.type === 'track_velocity') {
                                const labelBase = m.name || (m.type === 'track_distance' ? 'Distance' : 'Velocity');
                                options.push(<option key={`${m.id}:primary_body`} value={`${m.id}:primary_body`}>{labelBase} - From Body</option>);
                                options.push(<option key={`${m.id}:target_body`} value={`${m.id}:target_body`}>{labelBase} - To Body</option>);
                            }
                            if (m.type === 'selector') {
                                options.push(<option key={`${m.id}:body`} value={`${m.id}:body`}>{m.name || 'Selector'} - Body</option>);
                            }
                            // Add Body By Module
                            if (m.type === 'body_by') {
                                options.push(<option key={`${m.id}:body`} value={`${m.id}:body`}>{m.name || 'Body By'} - Body</option>);
                            }
                            if (m.type === 'custom_script') {
                                if (m.customScriptOutputType === 'vector') {
                                    options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Script'} - Result (Vector)</option>);
                                }
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
                            if (m.type === 'transfer_window') {
                                options.push(<option key={`${m.id}:error`} value={`${m.id}:error`}>{m.name || 'Transfer'} - Phase Error (°)</option>);
                                options.push(<option key={`${m.id}:wait_time`} value={`${m.id}:wait_time`}>{m.name || 'Transfer'} - Wait Time (s)</option>);
                                options.push(<option key={`${m.id}:transfer_time`} value={`${m.id}:transfer_time`}>{m.name || 'Transfer'} - Transfer Time (s)</option>);
                                options.push(<option key={`${m.id}:arrival_time`} value={`${m.id}:arrival_time`}>{m.name || 'Transfer'} - Arrival Time (s)</option>);
                                options.push(<option key={`${m.id}:current_phase`} value={`${m.id}:current_phase`}>{m.name || 'Transfer'} - Current Phase (rad)</option>);
                                options.push(<option key={`${m.id}:required_phase`} value={`${m.id}:required_phase`}>{m.name || 'Transfer'} - Required Phase (rad)</option>);
                                options.push(<option key={`${m.id}:error_angle`} value={`${m.id}:error_angle`}>{m.name || 'Transfer'} - Error Angle (rad)</option>);
                                options.push(<option key={`${m.id}:insertion_angle`} value={`${m.id}:insertion_angle`}>{m.name || 'Transfer'} - Insertion Angle (rad)</option>);
                                options.push(<option key={`${m.id}:intercept_angle_target`} value={`${m.id}:intercept_angle_target`}>{m.name || 'Transfer'} - Target Angle (rad)</option>);
                                options.push(<option key={`${m.id}:intercept_angle_transfer`} value={`${m.id}:intercept_angle_transfer`}>{m.name || 'Transfer'} - Transfer Angle (rad)</option>);
                            }
                            if (m.type === 'rendezvous_tracker') {
                                options.push(<option key={`${m.id}:time`} value={`${m.id}:time`}>{m.name || 'Rendezvous'} - Time</option>);
                                options.push(<option key={`${m.id}:distance`} value={`${m.id}:distance`}>{m.name || 'Rendezvous'} - Distance</option>);
                                options.push(<option key={`${m.id}:delta_v_total`} value={`${m.id}:delta_v_total`}>{m.name || 'Rendezvous'} - ΔV Total</option>);
                                options.push(<option key={`${m.id}:delta_v_prograde`} value={`${m.id}:delta_v_prograde`}>{m.name || 'Rendezvous'} - ΔV Prograde</option>);
                                options.push(<option key={`${m.id}:delta_v_radial`} value={`${m.id}:delta_v_radial`}>{m.name || 'Rendezvous'} - ΔV Radial</option>);
                            }
                            if (m.type === 'maneuver_executor') {
                                options.push(<option key={`${m.id}:progress`} value={`${m.id}:progress`}>{m.name || 'Executor'} - Progress</option>);
                            }
                            if (m.type === 'maths') {
                                options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Maths'} - Result</option>);
                            }
                            if (m.type === 'body_info') {
                                options.push(<option key={`${m.id}:mass`} value={`${m.id}:mass`}>{m.name || 'Body Info'} - Mass</option>);
                                options.push(<option key={`${m.id}:radius`} value={`${m.id}:radius`}>{m.name || 'Body Info'} - Radius</option>);
                                options.push(<option key={`${m.id}:pos_x`} value={`${m.id}:pos_x`}>{m.name || 'Body Info'} - Pos X</option>);
                                options.push(<option key={`${m.id}:pos_y`} value={`${m.id}:pos_y`}>{m.name || 'Body Info'} - Pos Y</option>);
                                options.push(<option key={`${m.id}:vel_x`} value={`${m.id}:vel_x`}>{m.name || 'Body Info'} - Vel X</option>);
                                options.push(<option key={`${m.id}:vel_y`} value={`${m.id}:vel_y`}>{m.name || 'Body Info'} - Vel Y</option>);
                                options.push(<option key={`${m.id}:angle`} value={`${m.id}:angle`}>{m.name || 'Body Info'} - Angle</option>);
                                options.push(<option key={`${m.id}:thrust_x`} value={`${m.id}:thrust_x`}>{m.name || 'Body Info'} - Thrust X</option>);
                                options.push(<option key={`${m.id}:thrust_y`} value={`${m.id}:thrust_y`}>{m.name || 'Body Info'} - Thrust Y</option>);
                                options.push(<option key={`${m.id}:fuel`} value={`${m.id}:fuel`}>{m.name || 'Body Info'} - Fuel</option>);
                                options.push(<option key={`${m.id}:max_fuel`} value={`${m.id}:max_fuel`}>{m.name || 'Body Info'} - Max Fuel</option>);
                                options.push(<option key={`${m.id}:dry_mass`} value={`${m.id}:dry_mass`}>{m.name || 'Body Info'} - Dry Mass</option>);
                            }
                            if (m.type === 'custom_script') {
                                if (!m.customScriptOutputType || m.customScriptOutputType === 'scalar') {
                                    options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Script'} - Result (Number)</option>);
                                }
                            }
                        }
                        
                        // Boolean Outputs
                        if (allowedTypes.includes('boolean')) {
                            if (m.type === 'transfer_window') {
                                options.push(<option key={`${m.id}:ready`} value={`${m.id}:ready`}>{m.name || 'Transfer'} - Ready</option>);
                            }
                            if (m.type === 'marker') {
                                options.push(<option key={`${m.id}:visible`} value={`${m.id}:visible`}>{m.name || 'Marker'} - Visible</option>);
                                options.push(<option key={`${m.id}:pulse`} value={`${m.id}:pulse`}>{m.name || 'Marker'} - Pulse</option>);
                            }
                            if (m.type === 'notify') {
                                options.push(<option key={`${m.id}:triggered`} value={`${m.id}:triggered`}>{m.name || 'Notify'} - Triggered</option>);
                            }
                            if (m.type === 'logic_gate') {
                                options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Logic'} - Result</option>);
                            }
                            if (m.type === 'thrust_burst') {
                                options.push(<option key={`${m.id}:done`} value={`${m.id}:done`}>{m.name || 'Burst'} - Done</option>);
                            }
                            if (m.type === 'button') {
                                options.push(<option key={`${m.id}:state`} value={`${m.id}:state`}>{m.name || 'Button'} - State</option>);
                            }
                            if (m.type === 'custom_script') {
                                if (m.customScriptOutputType === 'boolean') {
                                    options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Script'} - Result (Boolean)</option>);
                                }
                                options.push(<option key={`${m.id}:state`} value={`${m.id}:state`}>{m.name || 'Script'} - State (Ready)</option>);
                            }
                        }
                        
                        // String Outputs
                        if (allowedTypes.includes('string')) {
                            if (m.type === 'body_info') {
                                options.push(<option key={`${m.id}:name`} value={`${m.id}:name`}>{m.name || 'Body Info'} - Name</option>);
                                options.push(<option key={`${m.id}:id`} value={`${m.id}:id`}>{m.name || 'Body Info'} - ID</option>);
                                options.push(<option key={`${m.id}:mass`} value={`${m.id}:mass`}>{m.name || 'Body Info'} - Mass</option>);
                                options.push(<option key={`${m.id}:radius`} value={`${m.id}:radius`}>{m.name || 'Body Info'} - Radius</option>);
                                options.push(<option key={`${m.id}:pos_x`} value={`${m.id}:pos_x`}>{m.name || 'Body Info'} - Pos X</option>);
                                options.push(<option key={`${m.id}:pos_y`} value={`${m.id}:pos_y`}>{m.name || 'Body Info'} - Pos Y</option>);
                                options.push(<option key={`${m.id}:vel_x`} value={`${m.id}:vel_x`}>{m.name || 'Body Info'} - Vel X</option>);
                                options.push(<option key={`${m.id}:vel_y`} value={`${m.id}:vel_y`}>{m.name || 'Body Info'} - Vel Y</option>);
                                options.push(<option key={`${m.id}:angle`} value={`${m.id}:angle`}>{m.name || 'Body Info'} - Angle</option>);
                                options.push(<option key={`${m.id}:fuel`} value={`${m.id}:fuel`}>{m.name || 'Body Info'} - Fuel</option>);
                                options.push(<option key={`${m.id}:max_fuel`} value={`${m.id}:max_fuel`}>{m.name || 'Body Info'} - Max Fuel</option>);
                                options.push(<option key={`${m.id}:dry_mass`} value={`${m.id}:dry_mass`}>{m.name || 'Body Info'} - Dry Mass</option>);
                                options.push(<option key={`${m.id}:landed_on`} value={`${m.id}:landed_on`}>{m.name || 'Body Info'} - Landed On</option>);
                                options.push(<option key={`${m.id}:sas_mode`} value={`${m.id}:sas_mode`}>{m.name || 'Body Info'} - SAS Mode</option>);
                            }
                            if (m.type === 'marker') {
                                options.push(<option key={`${m.id}:title`} value={`${m.id}:title`}>{m.name || 'Marker'} - Title</option>);
                                options.push(<option key={`${m.id}:description`} value={`${m.id}:description`}>{m.name || 'Marker'} - Description</option>);
                                options.push(<option key={`${m.id}:color`} value={`${m.id}:color`}>{m.name || 'Marker'} - Color</option>);
                            }
                            if (m.type === 'custom_script') {
                                if (m.customScriptOutputType === 'string') {
                                    options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Script'} - Result (String)</option>);
                                }
                            }
                        }
                        
                        return options;
                    })}
                </select>
            ) : null}
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
    onMoveGroupToGroup,
    onExportGroup,
    onImportGroup,
    rendezvousPoints,
    onSetFollowingBody
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const isMobile = useIsMobile();

   const [expandedModules, setExpandedModules] = useState<string[]>([]);
    const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
    const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
    const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
    
    const rendezvousSolutionMap = useMemo<Record<string, RendezvousSolution>>(() => {
        const map: Record<string, RendezvousSolution> = {};
        rendezvousPoints?.forEach(point => {
            map[point.moduleId] = point;
        });
        return map;
    }, [rendezvousPoints]);

    const resolveVectorInputValue = (input?: FlightComputerInput) =>
        resolveInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);

    const resolveScalarValue = (input?: FlightComputerInput) =>
        resolveScalarInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);

    const resolveBooleanValue = (input?: FlightComputerInput) =>
        resolveBooleanInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
    
    // Audio Context for Beep Module
    const audioContextRef = useRef<AudioContext | null>(null);
    const prevBeepInputStateRef = useRef<Map<string, boolean>>(new Map());
    const lastBeepTimeRef = useRef<Map<string, number>>(new Map());
    const thrustBurstTriggerStateRef = useRef<Map<string, boolean>>(new Map());
    const followModuleTriggerStateRef = useRef<Map<string, boolean>>(new Map());
    const buttonResetTriggerStateRef = useRef<Map<string, boolean>>(new Map());
    const scriptLogsRef = useRef<Map<string, string[]>>(new Map());
    const asyncScriptRunningRef = useRef<Map<string, boolean>>(new Map());

    // --- Follow Module & Button Reset Logic & Custom Script ---
    useEffect(() => {
        const activeIds = new Set(modules.map(m => m.id));
        
        // Cleanup
        Array.from(followModuleTriggerStateRef.current.keys()).forEach(id => {
            if (!activeIds.has(id)) followModuleTriggerStateRef.current.delete(id);
        });
        Array.from(buttonResetTriggerStateRef.current.keys()).forEach(id => {
            if (!activeIds.has(id)) buttonResetTriggerStateRef.current.delete(id);
        });
        Array.from(asyncScriptRunningRef.current.keys()).forEach(id => {
            if (!activeIds.has(id)) asyncScriptRunningRef.current.delete(id);
        });
        // Note: Script logs are kept in ref to avoid re-renders, but we might want to clean up if module removed

        modules.forEach(module => {
            // Follow Module
            if (module.type === 'follow' && module.isEnabled && onSetFollowingBody) {
                const triggerValue = resolveBooleanInput(module.inputs?.trigger, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                const shouldFollow = triggerValue ?? false;
                const wasFollowing = followModuleTriggerStateRef.current.get(module.id) || false;

                if (shouldFollow && !wasFollowing) {
                    const targetInput = module.inputs?.target;
                    if (targetInput) {
                        const targetBody = resolveInput(targetInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                        if (targetBody && 'id' in targetBody) {
                            onSetFollowingBody(targetBody.id);
                        }
                    }
                } else if (!shouldFollow && wasFollowing) {
                    onSetFollowingBody(null);
                }
                followModuleTriggerStateRef.current.set(module.id, shouldFollow);
            }

            // Button Module Reset
            if (module.type === 'button') {
                const resetValue = resolveBooleanInput(module.inputs?.reset, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                const shouldReset = resetValue ?? false;
                const wasReset = buttonResetTriggerStateRef.current.get(module.id) || false;

                if (shouldReset && !wasReset) {
                    // Rising edge: Reset button to false
                    if (module.buttonState !== false) {
                        onUpdateModule(module.id, { buttonState: false });
                    }
                }
                buttonResetTriggerStateRef.current.set(module.id, shouldReset);
            }

            // Custom Script Execution
            if (module.type === 'custom_script' && module.isEnabled && module.customScriptCode) {
                // Resolve Activate Input (Trigger)
                const triggerInput = module.inputs?.trigger;
                // Default to false if not connected
                const shouldRun = resolveBooleanInput(triggerInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap) ?? false;
                const mode = module.customScriptMode || 'sync';

                if (shouldRun) {
                    // Check async running state
                    if (mode === 'async') {
                        if (asyncScriptRunningRef.current.get(module.id)) return; // Already running
                    }

                    // Resolve all inputs
                    const inputs = [];
                    const count = module.customScriptInputsCount ?? 2;
                    for (let i = 0; i < count; i++) {
                        const key = `input_${i}`;
                        const inputDef = module.inputs?.[key];
                        
                        let val: any = null;
                        
                        // Try resolving as scalar first (most common for math)
                        const scalarVal = resolveScalarInput(inputDef, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                        if (scalarVal !== null) {
                            val = scalarVal;
                        } else {
                            // Try boolean
                            const boolVal = resolveBooleanInput(inputDef, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                            if (boolVal !== null) {
                                val = boolVal;
                            } else {
                                // Try string
                                const stringVal = resolveStringInput(inputDef, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                                if (stringVal !== null) {
                                    val = stringVal;
                                } else {
                                    // Try object/vector
                                    const objVal = resolveInput(inputDef, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                                    if (objVal !== null) {
                                        val = objVal;
                                    }
                                }
                            }
                        }
                        inputs.push(val);
                    }

                    // Prepare Game Context
                    const game = {
                        bodies,
                        modules,
                        physicsConfig,
                        rendezvousPoints,
                        actions: {
                            updateModule: onUpdateModule,
                            addModule: onAddModule,
                            removeModule: onRemoveModule,
                            toggleModule: onToggleModule,
                            setFollowingBody: onSetFollowingBody
                        },
                        helpers: {
                            resolveInput: (input: FlightComputerInput) => resolveInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap),
                            resolveScalar: (input: FlightComputerInput) => resolveScalarInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap),
                            resolveBoolean: (input: FlightComputerInput) => resolveBooleanInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap),
                            resolveString: (input: FlightComputerInput) => resolveStringInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap)
                        }
                    };

                    // Prepare Console Mock
                    const logs: string[] = [];
                    const mockConsole = {
                        log: (...args: any[]) => {
                            logs.push(args.map(a => String(a)).join(' '));
                        },
                        warn: (...args: any[]) => {
                            logs.push('WARN: ' + args.map(a => String(a)).join(' '));
                        },
                        error: (...args: any[]) => {
                            logs.push('ERROR: ' + args.map(a => String(a)).join(' '));
                        }
                    };

                    if (mode === 'async') {
                        // ASYNC EXECUTION
                        asyncScriptRunningRef.current.set(module.id, true);
                        if (module.customScriptAsyncState !== false) {
                            onUpdateModule(module.id, { customScriptAsyncState: false });
                        }

                        // We can't define AsyncFunction directly in TS/ES5 safely without polyfills or tricks, 
                        // but new Function with 'async' works if environment supports it (modern browsers do).
                        // Alternative: (async () => {}).constructor
                        const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

                        (async () => {
                            try {

                                //check if customScriptCode is valid async function by checking if it contains 'async' keyword
                                if (!module.customScriptCode.includes('async')) {
                                    mockConsole.error('Custom script must be an async function');
                                    onUpdateModule(module.id, { 
                                        customScriptLastResult: 0,
                                        customScriptLogs: logs.slice(-5),
                                        customScriptAsyncState: false
                                    });
                                    throw new Error('Custom script must be an async function');
                                }


                                const func = new AsyncFunction('input', 'console', 'game', `
                                    try {
                                        ${module.customScriptCode}
                                    } catch (e) {
                                        console.error(e.message);
                                        throw e;
                                    }
                                `);
                                
                                const result = await func(inputs, mockConsole, game);
                                
                                // On completion
                                scriptLogsRef.current.set(module.id, logs);
                                onUpdateModule(module.id, { 
                                    customScriptLastResult: result,
                                    customScriptLogs: logs.slice(-5),
                                    customScriptAsyncState: true
                                });
                            } catch (e: any) {
                                const errorLog = `Async Error: ${e.message}`;
                                logs.push(errorLog);
                                scriptLogsRef.current.set(module.id, logs);
                                onUpdateModule(module.id, { 
                                    customScriptLogs: logs.slice(-5),
                                    customScriptAsyncState: true
                                });
                            } finally {
                                asyncScriptRunningRef.current.set(module.id, false);
                            }
                        })();

                    } else {
                        // SYNC EXECUTION
                        try {
                            // Execute Code
                            // Wrap in a function to return result
                            const func = new Function('input', 'console', 'game', `
                                try {
                                    ${module.customScriptCode}
                                } catch (e) {
                                    console.error(e.message);
                                    return null;
                                }
                            `);
                            
                            const result = func(inputs, mockConsole, game);

                            // Only update if changed to avoid render loop
                            const prevResult = module.customScriptLastResult;
                            const resultChanged = JSON.stringify(result) !== JSON.stringify(prevResult);
                            const prevLogs = scriptLogsRef.current.get(module.id) || [];
                            const logsChanged = JSON.stringify(logs) !== JSON.stringify(prevLogs);
                            
                            if (resultChanged || logsChanged) {
                                scriptLogsRef.current.set(module.id, logs);
                                onUpdateModule(module.id, { 
                                    customScriptLastResult: result,
                                    customScriptLogs: logs.slice(-5), // Keep last 5 logs for UI
                                    customScriptAsyncState: true // Always true for sync
                                });
                            }
                        } catch (e: any) {
                            const errorLog = `Exec Error: ${e.message}`;
                            const prevLogs = scriptLogsRef.current.get(module.id) || [];
                            if (!prevLogs.includes(errorLog)) {
                                scriptLogsRef.current.set(module.id, [errorLog]);
                                onUpdateModule(module.id, { customScriptLogs: [errorLog], customScriptAsyncState: true });
                            }
                        }
                    }
                } else {
                    // If not running and async was running, reset? No, state is persistent.
                    // But if sync, we might want to clear output? Nah, keep last result.
                }
            }
        });
    }, [modules, bodies, physicsConfig, onSetFollowingBody, rendezvousSolutionMap, onUpdateModule]);

    // --- Thrust Burst Logic ---
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
                const input = resolveBooleanValue(module.inputs?.primary);
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
    }, [bodies, modules, physicsConfig, rendezvousSolutionMap]);


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
            const distance = resolveScalarValue({ type: 'module_output', value: `${module.id}:distance` });
            return distance !== null ? `${distance.toFixed(1)} u` : '---';
        }
        if (outputKey === 'speed') {
            const speed = resolveScalarValue({ type: 'module_output', value: `${module.id}:speed` });
            return speed !== null ? `${speed.toFixed(1)} m/s` : '---';
        }
        if (outputKey === 'altitude' || outputKey === 'periapsis' || outputKey === 'apoapsis') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:${outputKey}` });
            return value !== null ? `${value.toFixed(1)} u` : '---';
        }
        if (outputKey === 'period') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:period` });
            return value !== null ? formatTime(value) : '---';
        }
        if (outputKey === 'time') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:time` });
            return value !== null ? formatTime(value) : '---';
        }
        if (outputKey === 'error') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:error` });
            return value !== null ? `${value.toFixed(1)}°` : '---';
        }
        if (outputKey === 'wait_time') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:wait_time` });
            return value !== null ? `${value.toFixed(1)} s` : '---';
        }
        if (outputKey === 'transfer_time') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:transfer_time` });
            return value !== null ? `${value.toFixed(1)} s` : '---';
        }
        if (outputKey === 'arrival_time') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:arrival_time` });
            return value !== null ? `${value.toFixed(1)} s` : '---';
        }
        if ([
            'current_phase',
            'required_phase',
            'error_angle',
            'insertion_angle',
            'intercept_angle_target',
            'intercept_angle_transfer'
        ].includes(outputKey)) {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:${outputKey}` });
            return value !== null ? `${(value * 180 / Math.PI).toFixed(1)}°` : '---';
        }
        if (outputKey === 'delta_v_total' || outputKey === 'delta_v_prograde' || outputKey === 'delta_v_radial') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:${outputKey}` });
            return value !== null ? `${value.toFixed(1)} m/s` : '---';
        }
        if (outputKey === 'progress') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:progress` });
            return value !== null ? `${(value * 100).toFixed(0)}%` : '---';
        }
        if (outputKey === 'result' && module.type === 'maths') {
            const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:result` });
            return value !== null ? `${value.toFixed(2)}` : '---';
        }
        if (outputKey === 'result' && module.type === 'custom_script') {
            const outputType = module.customScriptOutputType || 'scalar';
            if (outputType === 'scalar') {
                const value = resolveScalarValue({ type: 'module_output', value: `${module.id}:result` });
                return value !== null ? `${value.toFixed(2)}` : '---';
            }
            if (outputType === 'boolean') {
                const value = resolveBooleanValue({ type: 'module_output', value: `${module.id}:result` });
                return value !== null ? (value ? 'TRUE' : 'FALSE') : '---';
            }
            if (outputType === 'string') {
                const value = resolveStringInput({ type: 'module_output', value: `${module.id}:result` }, bodies, modules, physicsConfig.gravitationalConstant, rendezvousPoints ? Object.fromEntries(rendezvousPoints.map(r => [r.moduleId, r])) : undefined);
                return value || '---';
            }
            if (outputType === 'vector') {
                 const value = resolveVectorInputValue({ type: 'module_output', value: `${module.id}:result` });
                 if (!value) return '---';
                 if ('name' in value) return value.name;
                 return `(${value.x.toFixed(1)}, ${value.y.toFixed(1)})`;
            }
        }
        // String outputs from body_info
        if (module.type === 'body_info') {
            const value = resolveStringInput({ type: 'module_output', value: `${module.id}:${outputKey}` }, bodies, modules, physicsConfig.gravitationalConstant, rendezvousPoints ? Object.fromEntries(rendezvousPoints.map(r => [r.moduleId, r])) : undefined);
            return value || '---';
        }
        if (outputKey === 'triggered' || outputKey === 'result' || outputKey === 'done' || outputKey === 'state' || outputKey === 'ready') {
            const value = resolveBooleanValue({ type: 'module_output', value: `${module.id}:${outputKey}` });
            return value !== null ? (value ? 'TRUE' : 'FALSE') : '---';
        }
        if (['insertion_point', 'intercept_point', 'intercept_point_transfer'].includes(outputKey)) {
            const point = resolveVectorInputValue({ type: 'module_output', value: `${module.id}:${outputKey}` });
            if (!point) return '---';
            if ('name' in point) return point.name;
            return `(${point.x.toFixed(1)}, ${point.y.toFixed(1)})`;
        }
        if (outputKey === 'body') {
            const body = resolveVectorInputValue({ type: 'module_output', value: `${module.id}:body` });
            return body && 'name' in body ? body.name : '---';
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
                
                const primary = resolveVectorInputValue(primaryInput);
                const reference = resolveVectorInputValue(referenceInput);
                
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

                const tPrimary = resolveVectorInputValue(tPrimaryInput);
                const tReference = resolveVectorInputValue(tReferenceInput);
                const tTarget = resolveVectorInputValue(tTargetInput);

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
                                    style={{ left: `${Math.min(100, Math.max(0, 50 + (transferData.error)))}%` }}
                                 />
                             </div>
                             <div className="text-[9px] font-mono w-8 text-right text-slate-400">
                                 {transferData.error.toFixed(0)}°
                             </div>
                             <div className="text-[9px] font-mono w-8 text-right text-slate-400">
                                 {transferData.waitTime.toFixed(0)}s
                             </div>
                             <div className="text-[9px] font-mono w-8 text-right text-slate-400">
                                 {transferData.transferTime.toFixed(0)}s
                             </div>
                             <div className="text-[9px] font-mono w-8 text-right text-slate-400">
                                 {transferData.arrivalTime.toFixed(0)}s
                             </div>
                         </div>
                    </div>
                 );

            case 'marker':
                const markerTitleInput = getInput(module, 'marker_title');
                const markerDescriptionInput = getInput(module, 'marker_description');
                const markerColorInput = getInput(module, 'marker_color');
                const markerVisibleInput = getInput(module, 'marker_visible');
                const markerPulseInput = getInput(module, 'marker_pulse');

                const markerTitle = module.markerTitle ?? module.name ?? 'Marker';
                const markerDescription = module.markerDescription ?? '';
                const markerColorValue = module.markerColor || module.color || '#a855f7';

                return (
                    <div className="space-y-3 mt-2">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 uppercase">Title</label>
                                {markerTitleInput ? (
                                    <div className="flex gap-1">
                                        <InputSelector 
                                            label=""
                                            value={markerTitleInput}
                                            onChange={(input) => updateInput(module.id, 'marker_title', input)}
                                            bodies={bodies}
                                            modules={modules}
                                            currentModuleId={module.id}
                                            allowedTypes={['string', 'module_output']}
                                        />
                                        <button onClick={() => updateInput(module.id, 'marker_title', undefined)} className="px-2 bg-red-600/20 border border-red-500/50 rounded text-xs text-red-400 hover:bg-red-600/30">✕</button>
                                    </div>
                                ) : (
                                    <div className="flex gap-1">
                                        <input
                                            type="text"
                                            value={markerTitle}
                                            onChange={(e) => onUpdateModule(module.id, { markerTitle: e.target.value })}
                                            className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                        />
                                        <button onClick={() => updateInput(module.id, 'marker_title', { type: 'module_output', value: '' })} className="px-2 bg-purple-600/20 border border-purple-500/50 rounded text-xs text-purple-400 hover:bg-purple-600/30">🔗</button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 uppercase">Shape</label>
                                <select
                                    value={module.markerShape || 'ring'}
                                    onChange={(e) => onUpdateModule(module.id, { markerShape: e.target.value as MarkerShape })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                >
                                    {MARKER_SHAPE_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] text-slate-500 uppercase">Description</label>
                            {markerDescriptionInput ? (
                                <div className="flex gap-1">
                                    <InputSelector 
                                        label=""
                                        value={markerDescriptionInput}
                                        onChange={(input) => updateInput(module.id, 'marker_description', input)}
                                        bodies={bodies}
                                        modules={modules}
                                        currentModuleId={module.id}
                                        allowedTypes={['string', 'module_output']}
                                    />
                                    <button onClick={() => updateInput(module.id, 'marker_description', undefined)} className="px-2 bg-red-600/20 border border-red-500/50 rounded text-xs text-red-400 hover:bg-red-600/30">✕</button>
                                </div>
                            ) : (
                                <div className="flex gap-1">
                                    <textarea
                                        value={markerDescription}
                                        onChange={(e) => onUpdateModule(module.id, { markerDescription: e.target.value })}
                                        rows={2}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none resize-y"
                                    />
                                    <button onClick={() => updateInput(module.id, 'marker_description', { type: 'module_output', value: '' })} className="px-2 bg-purple-600/20 border border-purple-500/50 rounded text-xs text-purple-400 hover:bg-purple-600/30">🔗</button>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 uppercase">Marker Color</label>
                                {markerColorInput ? (
                                    <div className="flex gap-1">
                                        <InputSelector 
                                            label=""
                                            value={markerColorInput}
                                            onChange={(input) => updateInput(module.id, 'marker_color', input)}
                                            bodies={bodies}
                                        modules={modules}
                                            currentModuleId={module.id}
                                            allowedTypes={['string', 'module_output']}
                                        />
                                        <button onClick={() => updateInput(module.id, 'marker_color', undefined)} className="px-2 bg-red-600/20 border border-red-500/50 rounded text-xs text-red-400 hover:bg-red-600/30">✕</button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={markerColorValue}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                onUpdateModule(module.id, { markerColor: value, color: value });
                                            }}
                                            className="w-10 h-8 rounded border border-slate-700/50 bg-slate-900/50"
                                        />
                                        <button onClick={() => updateInput(module.id, 'marker_color', { type: 'module_output', value: '' })} className="px-2 bg-purple-600/20 border border-purple-500/50 rounded text-xs text-purple-400 hover:bg-purple-600/30">🔗</button>
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] text-slate-500 uppercase">Pulse Control</label>
                                <div className="flex items-center justify-between text-[10px]">
                                    <span className="text-slate-400">Pulse</span>
                                    <button
                                        onClick={() => onUpdateModule(module.id, { markerPulse: !(module.markerPulse ?? false) })}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${module.markerPulse ? 'bg-purple-600/30 text-purple-200' : 'bg-slate-800 text-slate-400'}`}
                                    >
                                        {module.markerPulse ? 'ON' : 'OFF'}
                                    </button>
                                </div>
                                <InputSelector 
                                    label=""
                                    value={markerPulseInput}
                                    onChange={(input) => updateInput(module.id, 'marker_pulse', input)}
                                    bodies={bodies}
                                    modules={modules}
                                    currentModuleId={module.id}
                                    allowedTypes={['boolean']}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] text-slate-500 uppercase">Visibility</label>
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="text-slate-400">Active</span>
                                <button
                                    onClick={() => onUpdateModule(module.id, { markerVisible: !(module.markerVisible ?? true) })}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${(module.markerVisible ?? true) ? 'bg-green-600/30 text-green-200' : 'bg-slate-800 text-slate-400'}`}
                                >
                                    {(module.markerVisible ?? true) ? 'ON' : 'OFF'}
                                </button>
                            </div>
                            <InputSelector 
                                label=""
                                value={markerVisibleInput}
                                onChange={(input) => updateInput(module.id, 'marker_visible', input)}
                                bodies={bodies}
                                modules={modules}
                                currentModuleId={module.id}
                                allowedTypes={['boolean']}
                            />
                        </div>

                        <div className="text-[9px] text-slate-500 italic">
                            Send any body, ship, or vector into the marker input to visualize custom points. Titles, descriptions, colors, visibility, and pulsing can all be automated via module outputs.
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
                const dPrimary = resolveVectorInputValue(getInput(module, 'primary'));
                const dTarget = resolveVectorInputValue(getInput(module, 'target'));
                
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
                const vPrimary = resolveVectorInputValue(getInput(module, 'primary'));
                const vTarget = resolveVectorInputValue(getInput(module, 'target'));
                
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
                const currentValue = resolveScalarValue(nInput);
                
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
                const inputA = resolveBooleanValue(module.inputs?.inputA);
                const inputB = resolveBooleanValue(module.inputs?.inputB);
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
                const beepInput = resolveBooleanValue(module.inputs?.primary);
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

            case 'thrust_burst':
                const burstMode = module.thrustBurstMode || 'impulse';
                const burstPrograde = module.thrustBurstDeltaVPrograde ?? 0;
                const burstRadial = module.thrustBurstDeltaVRadial ?? 0;
                const burstDuration = module.thrustBurstDuration ?? 1;
                const burstReady = module.thrustBurstCompleted ?? true;
                const progradeSource = getInput(module, 'deltaVPrograde');
                const radialSource = getInput(module, 'deltaVRadial');
                const durationSource = getInput(module, 'duration');

                return (
                    <div className="mt-2 space-y-3">
                        <div className="flex gap-2">
                            <button
                                onClick={() => onUpdateModule(module.id, { thrustBurstMode: 'impulse' })}
                                className={`flex-1 px-3 py-1 text-[10px] font-bold uppercase rounded border ${burstMode === 'impulse' ? 'bg-purple-600/40 border-purple-500 text-purple-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                            >
                                Impulse (ΔV)
                            </button>
                            <button
                                onClick={() => onUpdateModule(module.id, { thrustBurstMode: 'force' })}
                                className={`flex-1 px-3 py-1 text-[10px] font-bold uppercase rounded border ${burstMode === 'force' ? 'bg-orange-600/30 border-orange-400 text-orange-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}
                            >
                                Force Burst
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="bg-slate-900/40 rounded p-2 border border-slate-800">
                                <div className="text-[9px] text-slate-500 uppercase flex justify-between items-center">
                                    <span>ΔV Prograde</span>
                                    {progradeSource && <span className="text-[8px] text-purple-300">SRC</span>}
                                </div>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={burstPrograde}
                                    disabled={!!progradeSource}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        onUpdateModule(module.id, { thrustBurstDeltaVPrograde: isNaN(value) ? 0 : value });
                                    }}
                                    className={`w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none ${progradeSource ? 'opacity-60 cursor-not-allowed' : ''}`}
                                />
                                <div className="text-[9px] text-slate-500 mt-1">m/s</div>
                            </div>
                            <div className="bg-slate-900/40 rounded p-2 border border-slate-800">
                                <div className="text-[9px] text-slate-500 uppercase flex justify-between items-center">
                                    <span>ΔV Radial</span>
                                    {radialSource && <span className="text-[8px] text-purple-300">SRC</span>}
                                </div>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={burstRadial}
                                    disabled={!!radialSource}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        onUpdateModule(module.id, { thrustBurstDeltaVRadial: isNaN(value) ? 0 : value });
                                    }}
                                    className={`w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none ${radialSource ? 'opacity-60 cursor-not-allowed' : ''}`}
                                />
                                <div className="text-[9px] text-slate-500 mt-1">m/s</div>
                            </div>
                            <div className="bg-slate-900/40 rounded p-2 border border-slate-800">
                                <div className="text-[9px] text-slate-500 uppercase flex justify-between items-center">
                                    <span>Duration</span>
                                    {durationSource && <span className="text-[8px] text-purple-300">SRC</span>}
                                </div>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={burstDuration}
                                    disabled={!!durationSource}
                                    onChange={(e) => {
                                        const value = parseFloat(e.target.value);
                                        onUpdateModule(module.id, { thrustBurstDuration: isNaN(value) ? 0 : value });
                                    }}
                                    className={`w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none ${durationSource ? 'opacity-60 cursor-not-allowed' : ''}`}
                                />
                                <div className="text-[9px] text-slate-500 mt-1">seconds</div>
                            </div>
                        </div>

                        <div className={`p-2 rounded border flex flex-col gap-1 ${burstReady ? 'bg-emerald-900/20 border-emerald-500/40' : 'bg-amber-900/20 border-amber-500/40'}`}>
                            <div className="flex justify-between items-center text-[10px] uppercase">
                                <span className="text-slate-400">Status</span>
                                <span className={`font-bold ${burstReady ? 'text-emerald-300' : 'text-amber-300'}`}>
                                    {burstReady ? 'READY' : 'BURSTING'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-[10px] uppercase">
                                <span className="text-slate-400">Done Output</span>
                                <span className={`font-mono ${burstReady ? 'text-green-200' : 'text-amber-200'}`}>
                                    {burstReady ? 'TRUE' : 'FALSE'}
                                </span>
                            </div>
                        </div>
                        <div className="text-[9px] text-slate-500 italic">
                            Burst begins when the trigger input rises to TRUE. Force mode applies sustained thrust over the set duration; impulse mode applies ΔV immediately.
                        </div>
                    </div>
                );

            case 'maneuver_executor':
                const execType = module.maneuverExecutorType || 'burn';
                const execStatus = module.maneuverExecutorStatus || 'idle';
                const execProgress = module.maneuverExecutorProgress ?? 0;
                const executorRocket = resolveVectorInputValue(getInput(module, 'primary'));
                const requiresTarget = ['auto_circularize', 'auto_transfer', 'auto_intercept', 'auto_land', 'wait_for_transfer'].includes(execType);
                const requiresParent = ['auto_transfer', 'wait_for_transfer', 'auto_intercept', 'wait_for_altitude', 'burn_until_altitude', 'sas'].includes(execType);
                const targetSelected = module.maneuverExecutorTargetBodyId || module.targetBodyId;
                const parentSelected = module.maneuverExecutorParentBodyId || module.referenceBodyId;
                const canExecute = !!executorRocket && (!requiresTarget || targetSelected) && (!requiresParent || parentSelected);
                const progressPercent = Math.max(0, Math.min(100, Math.round(execProgress * 100))); 

                const queueExecutor = () => {
                    onUpdateModule(module.id, {
                        maneuverExecutorRequestId: Date.now(),
                        maneuverExecutorStatus: 'queued',
                        maneuverExecutorProgress: 0
                    });
                };

                const cancelExecutor = () => {
                    onUpdateModule(module.id, {
                        maneuverExecutorActiveManeuverId: undefined,
                        maneuverExecutorStatus: 'idle',
                        maneuverExecutorProgress: 0,
                        maneuverExecutorRequestId: undefined
                    });
                };

                const handleFieldChange = (patch: Partial<FlightComputerModule>) => onUpdateModule(module.id, patch);

                return (
                    <div className="mt-2 space-y-3">
                        <div>
                            <label className="text-[9px] text-slate-500 uppercase block mb-1">Maneuver Type</label>
                            <select
                                value={execType}
                                onChange={(e) => handleFieldChange({ maneuverExecutorType: e.target.value as Maneuver['type'] })}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                            >
                                {MANEUVER_TYPE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>

                        {['burn', 'burn_until_altitude'].includes(execType) && (
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Thrust</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        value={module.maneuverExecutorThrust ?? 0}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorThrust: parseFloat(e.target.value) })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Duration (s)</label>
                                    <input
                                        type="number"
                                        step="0.1"
                                        value={module.maneuverExecutorDuration ?? 0}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorDuration: parseFloat(e.target.value) })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Angle (deg)</label>
                                    <input
                                        type="number"
                                        step="1"
                                        value={module.maneuverExecutorAngleDeg ?? 0}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorAngleDeg: parseFloat(e.target.value) })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    />
                                </div>
                            </div>
                        )}

                        {execType === 'wait' && (
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Duration (s)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={module.maneuverExecutorDuration ?? 0}
                                    onChange={(e) => handleFieldChange({ maneuverExecutorDuration: parseFloat(e.target.value) })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                />
                            </div>
                        )}

                        {execType === 'rotate' && (
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Rotation (deg)</label>
                                <input
                                    type="number"
                                    value={Number(module.maneuverExecutorParam ?? 0)}
                                    onChange={(e) => handleFieldChange({ maneuverExecutorParam: parseFloat(e.target.value) })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                />
                            </div>
                        )}

                        {execType === 'sas' && (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Mode</label>
                                    <select
                                        value={(module.maneuverExecutorParam as string) || 'prograde'}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorParam: e.target.value })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    >
                                        <option value="off">Off</option>
                                        <option value="prograde">Prograde</option>
                                        <option value="retrograde">Retrograde</option>
                                        <option value="radial_out">Radial Out</option>
                                        <option value="radial_in">Radial In</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Reference Body</label>
                                    <select
                                        value={module.maneuverExecutorParentBodyId || ''}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorParentBodyId: e.target.value || undefined })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    >
                                        <option value="">Auto</option>
                                        {bodies.filter(b => !b.isRocket).map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {['auto_circularize', 'auto_transfer', 'auto_intercept', 'auto_land', 'wait_for_transfer'].includes(execType) && (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Target Body</label>
                                    <select
                                        value={module.maneuverExecutorTargetBodyId || ''}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorTargetBodyId: e.target.value || undefined })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    >
                                        <option value="">Select...</option>
                                        {bodies.filter(b => !b.isRocket).map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Parent Body</label>
                                    <select
                                        value={module.maneuverExecutorParentBodyId || ''}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorParentBodyId: e.target.value || undefined })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    >
                                        <option value="">Auto</option>
                                        {bodies.filter(b => !b.isRocket).map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {execType === 'auto_intercept' && (
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Time of Flight (s)</label>
                                <input
                                    type="number"
                                    step="1"
                                    value={Number(module.maneuverExecutorParam ?? 30)}
                                    onChange={(e) => handleFieldChange({ maneuverExecutorParam: parseFloat(e.target.value) })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                />
                            </div>
                        )}

                        {execType === 'wait_for_transfer' && (
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Phase Error (deg)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={Number(module.maneuverExecutorParam ?? 1)}
                                    onChange={(e) => handleFieldChange({ maneuverExecutorParam: parseFloat(e.target.value) })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                />
                            </div>
                        )}

                        {execType === 'wait_for_altitude' && (
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[9px] text-slate-500 uppercase block mb-1">Altitude</label>
                                        <input
                                            type="number"
                                            value={Number(module.maneuverExecutorParam ?? 0)}
                                            onChange={(e) => handleFieldChange({ maneuverExecutorParam: parseFloat(e.target.value) })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-500 uppercase block mb-1">Direction</label>
                                        <select
                                            value={module.maneuverExecutorAltitudeDirection || 'ascending'}
                                            onChange={(e) => handleFieldChange({ maneuverExecutorAltitudeDirection: e.target.value as 'ascending' | 'descending' })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                        >
                                            <option value="ascending">Ascending</option>
                                            <option value="descending">Descending</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Reference Body</label>
                                    <select
                                        value={module.maneuverExecutorParentBodyId || ''}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorParentBodyId: e.target.value || undefined })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    >
                                        <option value="">Auto</option>
                                        {bodies.filter(b => !b.isRocket).map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {execType === 'burn_until_altitude' && (
                            <div className="space-y-2">
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Target Altitude</label>
                                    <input
                                        type="number"
                                        value={Number(module.maneuverExecutorParam ?? 0)}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorParam: parseFloat(e.target.value) })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Reference Body</label>
                                    <select
                                        value={module.maneuverExecutorParentBodyId || ''}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorParentBodyId: e.target.value || undefined })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    >
                                        <option value="">Auto</option>
                                        {bodies.filter(b => !b.isRocket).map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {execType === 'manual_node' && (
                            <div className="space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[9px] text-slate-500 uppercase block mb-1">Time (s)</label>
                                        <input
                                            type="number"
                                            value={module.maneuverExecutorDuration ?? 0}
                                            onChange={(e) => handleFieldChange({ maneuverExecutorDuration: parseFloat(e.target.value) })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-500 uppercase block mb-1">ΔV Prograde</label>
                                        <input
                                            type="number"
                                            value={module.maneuverExecutorDeltaVPrograde ?? 0}
                                            onChange={(e) => handleFieldChange({ maneuverExecutorDeltaVPrograde: parseFloat(e.target.value) })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] text-slate-500 uppercase block mb-1">ΔV Radial</label>
                                        <input
                                            type="number"
                                            value={module.maneuverExecutorDeltaVRadial ?? 0}
                                            onChange={(e) => handleFieldChange({ maneuverExecutorDeltaVRadial: parseFloat(e.target.value) })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Reference Body</label>
                                    <select
                                        value={module.maneuverExecutorParentBodyId || ''}
                                        onChange={(e) => handleFieldChange({ maneuverExecutorParentBodyId: e.target.value || undefined })}
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                    >
                                        <option value="">Auto</option>
                                        {bodies.filter(b => !b.isRocket).map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {execType === 'change_simulation_speed' && (
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Speed Multiplier</label>
                                <select
                                    value={String(module.maneuverExecutorParam ?? 1)}
                                    onChange={(e) => handleFieldChange({ maneuverExecutorParam: Number(e.target.value) })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                    {[0.1, 1, 10, 100, 1000].map(val => (
                                        <option key={val} value={val}>{val}x</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={queueExecutor}
                                disabled={!canExecute || !module.isEnabled}
                                className={`w-full py-2 text-xs font-bold rounded flex items-center justify-center gap-1 ${canExecute && module.isEnabled ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                            >
                                <Play size={12} /> Execute
                            </button>
                            <button
                                onClick={cancelExecutor}
                                disabled={!module.maneuverExecutorActiveManeuverId}
                                className={`w-full py-2 text-xs font-bold rounded flex items-center justify-center gap-1 ${module.maneuverExecutorActiveManeuverId ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                            >
                                <Square size={12} /> Cancel
                            </button>
                        </div>

                        <div className="bg-slate-900/40 rounded p-2 border border-slate-800 space-y-1">
                            <div className="flex justify-between text-[10px] uppercase">
                                <span className="text-slate-400">Status</span>
                                <span className="text-slate-200 font-bold">{execStatus.toUpperCase()}</span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`${execStatus === 'running' ? 'bg-green-500' : 'bg-slate-500'} h-full transition-all`}
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            <div className="text-[10px] text-slate-400 text-right">{progressPercent}%</div>
                        </div>
                        <div className="text-[9px] text-slate-500 italic">
                            Configure the maneuver parameters and execute to push it onto the rocket's mission queue. Progress mirrors the main mission planner.
                        </div>
                    </div>
                );

            case 'button':
                const buttonState = module.buttonState ?? false;
                
                return (
                    <div className="mt-2">
                        <div className="flex gap-2 mb-2">
                            <button
                                onClick={() => onUpdateModule(module.id, { buttonState: true })}
                                className={`flex-1 py-2 text-xs font-bold rounded border transition-all ${buttonState ? 'bg-green-600 border-green-400 text-white shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'}`}
                            >
                                TRUE
                            </button>
                            <button
                                onClick={() => onUpdateModule(module.id, { buttonState: false })}
                                className={`flex-1 py-2 text-xs font-bold rounded border transition-all ${!buttonState ? 'bg-red-600 border-red-400 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-800 border-slate-700 text-slate-500 hover:bg-slate-700'}`}
                            >
                                FALSE
                            </button>
                        </div>
                        <div className="space-y-1">
                            <InputSelector 
                                label="Reset (Set False)" 
                                value={getInput(module, 'reset')} 
                                onChange={(input) => updateInput(module.id, 'reset', input)} 
                                bodies={bodies} 
                                modules={modules} 
                                currentModuleId={module.id} 
                                allowedTypes={['boolean']} 
                            />
                        </div>
                    </div>
                );

            case 'selector':
                return (
                    <div className="mt-2">
                        <select
                            value={module.selectorBodyId || ''}
                            onChange={(e) => onUpdateModule(module.id, { selectorBodyId: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                        >
                            <option value="">Select Body...</option>
                            {bodies.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                );

            case 'follow':
                const isFollowing = followModuleTriggerStateRef.current.get(module.id);
                return (
                    <div className="mt-2 text-xs text-slate-400">
                        Status: <span className={isFollowing ? "text-green-400 font-bold" : "text-slate-500"}>{isFollowing ? "ACTIVE" : "IDLE"}</span>
                    </div>
                );


            case 'maths':
                const mathResult = resolveScalarInput({ type: 'module_output', value: `${module.id}:result` }, bodies, modules, physicsConfig.gravitationalConstant, rendezvousPoints ? Object.fromEntries(rendezvousPoints.map(r => [r.moduleId, r])) : undefined);
                const displayResult = typeof mathResult === 'number' ? mathResult : 0;
                const mathInputA = getInput(module, 'valueA');
                const mathInputB = getInput(module, 'valueB');
                return (
                    <div className="mt-2 space-y-2">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">Value A</label>
                            {mathInputA ? (
                                <div className="flex gap-1">
                                    <InputSelector label="" value={mathInputA} onChange={(input) => updateInput(module.id, 'valueA', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['scalar', 'module_output']} />
                                    <button onClick={() => updateInput(module.id, 'valueA', undefined)} className="px-2 bg-red-600/20 border border-red-500/50 rounded text-xs text-red-400 hover:bg-red-600/30">✕</button>
                                </div>
                            ) : (
                                <div className="flex gap-1">
                                    <input
                                        type="number"
                                        value={module.mathValueA ?? 0}
                                        onChange={(e) => onUpdateModule(module.id, { mathValueA: parseFloat(e.target.value) || 0 })}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                    />
                                    <button onClick={() => updateInput(module.id, 'valueA', { type: 'module_output', value: '' })} className="px-2 bg-purple-600/20 border border-purple-500/50 rounded text-xs text-purple-400 hover:bg-purple-600/30">🔗</button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                value={module.mathOperator || 'add'}
                                onChange={(e) => onUpdateModule(module.id, { mathOperator: e.target.value as any })}
                                className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                            >
                                <option value="add">Add (+)</option>
                                <option value="subtract">Subtract (-)</option>
                                <option value="multiply">Multiply (*)</option>
                                <option value="divide">Divide (/)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">Value B</label>
                            {mathInputB ? (
                                <div className="flex gap-1">
                                    <InputSelector label="" value={mathInputB} onChange={(input) => updateInput(module.id, 'valueB', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['scalar', 'module_output']} />
                                    <button onClick={() => updateInput(module.id, 'valueB', undefined)} className="px-2 bg-red-600/20 border border-red-500/50 rounded text-xs text-red-400 hover:bg-red-600/30">✕</button>
                                </div>
                            ) : (
                                <div className="flex gap-1">
                                    <input
                                        type="number"
                                        value={module.mathValueB ?? 0}
                                        onChange={(e) => onUpdateModule(module.id, { mathValueB: parseFloat(e.target.value) || 0 })}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                    />
                                    <button onClick={() => updateInput(module.id, 'valueB', { type: 'module_output', value: '' })} className="px-2 bg-purple-600/20 border border-purple-500/50 rounded text-xs text-purple-400 hover:bg-purple-600/30">🔗</button>
                                </div>
                            )}
                        </div>
                        <div className="pt-1 border-t border-slate-700/50 flex justify-between items-center">
                            <span className="text-xs text-slate-400">Result:</span>
                            <span className="text-sm font-mono font-bold text-purple-400">{displayResult.toFixed(2)}</span>
                        </div>
                    </div>
                );

            case 'body_info':
                const bodyInfoInput = getInput(module, 'target');
                const targetBody = bodyInfoInput ? resolveInput(bodyInfoInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousPoints ? Object.fromEntries(rendezvousPoints.map(r => [r.moduleId, r])) : undefined) : null;
                const bodyData = targetBody && 'mass' in targetBody ? targetBody as Body : null;
                
                return (
                    <div className="mt-2 space-y-2">
                        <div className="space-y-1">
                            <InputSelector label="Target Body/Ship" value={bodyInfoInput} onChange={(input) => updateInput(module.id, 'target', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['body', 'module_output']} />
                        </div>
                        
                        {bodyData ? (
                            <div className="pt-2 border-t border-slate-700/50 space-y-1 text-xs">
                                <div className="grid grid-cols-2 gap-1">
                                    <span className="text-slate-400">Name:</span>
                                    <span className="text-slate-200 font-mono">{bodyData.name}</span>
                                    
                                    <span className="text-slate-400">Mass:</span>
                                    <span className="text-slate-200 font-mono">{bodyData.mass.toFixed(2)}</span>
                                    
                                    <span className="text-slate-400">Radius:</span>
                                    <span className="text-slate-200 font-mono">{bodyData.radius.toFixed(2)}</span>
                                    
                                    <span className="text-slate-400">Pos X:</span>
                                    <span className="text-slate-200 font-mono">{bodyData.position.x.toFixed(2)}</span>
                                    
                                    <span className="text-slate-400">Pos Y:</span>
                                    <span className="text-slate-200 font-mono">{bodyData.position.y.toFixed(2)}</span>
                                    
                                    <span className="text-slate-400">Vel X:</span>
                                    <span className="text-slate-200 font-mono">{bodyData.velocity.x.toFixed(2)}</span>
                                    
                                    <span className="text-slate-400">Vel Y:</span>
                                    <span className="text-slate-200 font-mono">{bodyData.velocity.y.toFixed(2)}</span>
                                    
                                    {bodyData.isRocket && (
                                        <>
                                            {bodyData.angle !== undefined && (
                                                <>
                                                    <span className="text-slate-400">Angle:</span>
                                                    <span className="text-slate-200 font-mono">{(bodyData.angle * 180 / Math.PI).toFixed(1)}°</span>
                                                </>
                                            )}
                                            
                                            {bodyData.thrust && (
                                                <>
                                                    <span className="text-slate-400">Thrust X:</span>
                                                    <span className="text-slate-200 font-mono">{bodyData.thrust.x.toFixed(3)}</span>
                                                    
                                                    <span className="text-slate-400">Thrust Y:</span>
                                                    <span className="text-slate-200 font-mono">{bodyData.thrust.y.toFixed(3)}</span>
                                                </>
                                            )}
                                            
                                            {bodyData.fuel !== undefined && (
                                                <>
                                                    <span className="text-slate-400">Fuel:</span>
                                                    <span className="text-slate-200 font-mono">{bodyData.fuel.toFixed(1)} / {bodyData.maxFuel?.toFixed(1) || 'N/A'}</span>
                                                </>
                                            )}
                                            
                                            {bodyData.dryMass !== undefined && (
                                                <>
                                                    <span className="text-slate-400">Dry Mass:</span>
                                                    <span className="text-slate-200 font-mono">{bodyData.dryMass.toFixed(2)}</span>
                                                </>
                                            )}
                                            
                                            {bodyData.landedOnBodyId && (
                                                <>
                                                    <span className="text-slate-400">Landed On:</span>
                                                    <span className="text-slate-200 font-mono">{bodies.find(b => b.id === bodyData.landedOnBodyId)?.name || 'Unknown'}</span>
                                                </>
                                            )}
                                            
                                            {bodyData.sasMode && (
                                                <>
                                                    <span className="text-slate-400">SAS Mode:</span>
                                                    <span className="text-slate-200 font-mono">{bodyData.sasMode}</span>
                                                </>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="text-xs text-slate-500 italic">No body selected</div>
                        )}
                    </div>
                );

            case 'body_by':
                const bodyByMode = module.bodyByMode || 'id';
                const bodyByInput = getInput(module, 'value');
                const bodyByDirectValue = module.bodyByValue || '';
                
                // Resolve the value either from input or direct entry
                let searchValue = '';
                if (bodyByInput) {
                    const resolvedValue = resolveStringInput(bodyByInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                    searchValue = resolvedValue || '';
                } else {
                    searchValue = bodyByDirectValue;
                }
                
                const foundBody = bodyByMode === 'id' 
                    ? bodies.find(b => b.id === searchValue)
                    : bodies.find(b => b.name.toLowerCase() === searchValue.toLowerCase());
                
                return (
                    <div className="mt-2 space-y-2">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">Mode</label>
                            <select
                                value={bodyByMode}
                                onChange={(e) => onUpdateModule(module.id, { bodyByMode: e.target.value as 'id' | 'name' })}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                            >
                                <option value="id">By ID</option>
                                <option value="name">By Name</option>
                            </select>
                        </div>
                        
                        <div className="space-y-1">
                            <label className="text-xs text-slate-400">
                                {bodyByMode === 'id' ? 'Body ID' : 'Body Name'}
                            </label>
                            {bodyByInput ? (
                                <div className="flex gap-1">
                                    <InputSelector label="" value={bodyByInput} onChange={(input) => updateInput(module.id, 'value', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['string', 'module_output']} />
                                    <button onClick={() => updateInput(module.id, 'value', undefined)} className="px-2 bg-red-600/20 border border-red-500/50 rounded text-xs text-red-400 hover:bg-red-600/30">✕</button>
                                </div>
                            ) : (
                                <div className="flex gap-1">
                                    <input
                                        type="text"
                                        value={bodyByDirectValue}
                                        onChange={(e) => onUpdateModule(module.id, { bodyByValue: e.target.value })}
                                        placeholder={bodyByMode === 'id' ? 'Enter body ID...' : 'Enter body name...'}
                                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                    />
                                    <button onClick={() => updateInput(module.id, 'value', { type: 'module_output', value: '' })} className="px-2 bg-purple-600/20 border border-purple-500/50 rounded text-xs text-purple-400 hover:bg-purple-600/30">🔗</button>
                                </div>
                            )}
                        </div>
                        
                        {foundBody ? (
                            <div className="pt-2 border-t border-slate-700/50 text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="text-green-400">✓</span>
                                    <span className="text-slate-200">Found: <span className="font-bold">{foundBody.name}</span></span>
                                </div>
                            </div>
                        ) : searchValue ? (
                            <div className="pt-2 border-t border-slate-700/50 text-xs">
                                <div className="flex items-center gap-2">
                                    <span className="text-red-400">✗</span>
                                    <span className="text-slate-400">No body found</span>
                                </div>
                            </div>
                        ) : null}
                    </div>
                );

            case 'custom_script':
                const inputsCount = module.customScriptInputsCount ?? 2;
                const outputType = module.customScriptOutputType ?? 'scalar';
                const scriptMode = module.customScriptMode || 'sync';
                const scriptResult = module.customScriptLastResult;
                const isReady = module.customScriptAsyncState ?? true;

                return (
                    <div className="mt-2 space-y-3">
                        {/* Configuration */}
                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Inputs</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={inputsCount}
                                    onChange={(e) => onUpdateModule(module.id, { customScriptInputsCount: parseInt(e.target.value) || 1 })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                />
                            </div>
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Type</label>
                                <select
                                    value={outputType}
                                    onChange={(e) => onUpdateModule(module.id, { customScriptOutputType: e.target.value as any })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                    <option value="scalar">Scalar</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="string">String</option>
                                    <option value="vector">Vector</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] text-slate-500 uppercase block mb-1">Mode</label>
                                <select
                                    value={scriptMode}
                                    onChange={(e) => onUpdateModule(module.id, { customScriptMode: e.target.value as any })}
                                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                                >
                                    <option value="sync">Sync (Realtime)</option>
                                    <option value="async">Async (Promise)</option>
                                </select>
                            </div>
                        </div>

                        {/* Inputs List */}
                        <div className="space-y-1 bg-slate-900/30 p-2 rounded border border-slate-800">
                            <label className="text-[9px] text-slate-500 uppercase block mb-1">Inputs</label>
                            
                            {/* Trigger Input */}
                            <div className="mb-2 pb-2 border-b border-slate-800">
                                <InputSelector 
                                    label="Run Trigger (True to Run)" 
                                    value={module.inputs?.trigger} 
                                    onChange={(input) => updateInput(module.id, 'trigger', input)} 
                                    bodies={bodies} 
                                    modules={modules} 
                                    currentModuleId={module.id} 
                                    allowedTypes={['boolean', 'module_output']}
                                />
                            </div>

                            {/* Dynamic Data Inputs */}
                            {Array.from({ length: inputsCount }).map((_, i) => (
                                <div key={i}>
                                    <InputSelector 
                                        label={`input[${i}]`} 
                                        value={module.inputs?.[`input_${i}`]} 
                                        onChange={(input) => updateInput(module.id, `input_${i}`, input)} 
                                        bodies={bodies} 
                                        modules={modules} 
                                        currentModuleId={module.id}
                                        allowedTypes={['body', 'module_output', 'scalar', 'boolean', 'string', 'vector']}
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Code Editor */}
                        <div>
                            <label className="text-[9px] text-slate-500 uppercase block mb-1">
                                Script ({scriptMode === 'async' ? 'Async Function Body' : 'Function Body'})
                            </label>
                            <textarea
                                value={module.customScriptCode || ''}
                                onChange={(e) => onUpdateModule(module.id, { customScriptCode: e.target.value })}
                                placeholder={scriptMode === 'async' ? "// const data = await fetch(...);\n// return data.value;" : "// return input[1] * 2;"}
                                className="w-full h-24 bg-slate-950 border border-slate-700 rounded p-2 text-xs font-mono text-green-400 outline-none resize-y"
                                spellCheck={false}
                            />
                        </div>

                        {/* Console & Result */}
                        <div className="bg-slate-950 rounded p-2 border border-slate-800 font-mono text-[10px]">
                            <div className="flex justify-between items-center mb-1 border-b border-slate-800 pb-1">
                                <span className="text-slate-500 uppercase">Console</span>
                                <div className="flex items-center gap-2">
                                    {scriptMode === 'async' && (
                                        <span className={`text-[9px] uppercase font-bold ${isReady ? 'text-green-500' : 'text-yellow-500 animate-pulse'}`}>
                                            {isReady ? 'READY' : 'RUNNING...'}
                                        </span>
                                    )}
                                    <span className="text-slate-500 uppercase">Result</span>
                                </div>
                            </div>
                            <div className="flex gap-2 h-16">
                                {/* Log Area */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar text-slate-400 whitespace-pre-wrap">
                                    {module.customScriptLogs?.length ? (
                                        module.customScriptLogs.map((log, i) => (
                                            <div key={i} className={log.startsWith('ERROR') ? 'text-red-400' : log.startsWith('WARN') ? 'text-orange-400' : ''}>{log}</div>
                                        ))
                                    ) : (
                                        <span className="italic opacity-50">No logs...</span>
                                    )}
                                </div>
                                {/* Result Area */}
                                <div className="w-24 border-l border-slate-800 pl-2 flex items-center justify-end text-right">
                                    <span className="text-purple-300 font-bold">
                                        {scriptResult !== undefined ? (
                                            typeof scriptResult === 'object' ? JSON.stringify(scriptResult).slice(0, 20) + '...' : String(scriptResult)
                                        ) : '---'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                );

            default:
                return null;

        }
    };

    return (
        <div className={`fixed ${isMobile ? 'top-16 right-4' : 'top-0 right-0'} z-[40] flex flex-col items-end pointer-events-none `}>
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
                <div className="fixed top-8 bottom-16 pointer-events-auto mt-2 bg-slate-900/10 backdrop-blur-[2px] border border-slate-700 rounded-lg shadow-2xl w-[100vw]  flex flex-col animate-in slide-in-from-right-4 duration-200 bottom-16 ">
                    
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
                                <Calculator size={14} className="text-purple-400" /> Logic Gate
                            </button>
                            <button 
                                onClick={() => { onAddModule('marker'); setIsAdding(false); }} 
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-purple-600/20 hover:border-purple-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <MapPin size={14} className="text-pink-400" /> Marker
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
                            <button 
                                onClick={() => { onAddModule('thrust_burst'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-orange-600/20 hover:border-orange-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Rocket size={14} className="text-orange-400" /> Thrust Burst
                            </button>
                            <button 
                                onClick={() => { onAddModule('maneuver_executor'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-green-600/20 hover:border-green-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Play size={14} className="text-green-400" /> Maneuver Exec
                            </button>
                            <button 
                                onClick={() => { onAddModule('custom_script'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-pink-600/20 hover:border-pink-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Activity size={14} className="text-pink-400" /> Custom Script
                            </button>
                            <button 
                                onClick={() => { onAddModule('button'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-slate-600/20 hover:border-slate-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Square size={14} className="text-white" /> Button
                            </button>
                            <button 
                                onClick={() => { onAddModule('selector'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-slate-600/20 hover:border-slate-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Globe size={14} className="text-white" /> Selector
                            </button>
                            <button 
                                onClick={() => { onAddModule('follow'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-slate-600/20 hover:border-slate-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Video size={14} className="text-white" /> Follow
                            </button>
                            <button 
                                onClick={() => { onAddModule('maths'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-slate-600/20 hover:border-slate-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Calculator size={14} className="text-white" /> Maths
                            </button>
                            <button 
                                onClick={() => { onAddModule('body_info'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-slate-600/20 hover:border-slate-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Activity size={14} className="text-white" /> Body Info
                            </button>
                            <button 
                                onClick={() => { onAddModule('body_by'); setIsAdding(false); }}
                                className="flex items-center gap-2 p-2 rounded bg-slate-700/50 hover:bg-slate-600/20 hover:border-slate-500/50 border border-transparent transition-all text-xs text-slate-200"
                            >
                                <Globe size={14} className="text-white" /> Body By
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
                                    className={`bg-slate-800/30 border rounded-lg p-3 transition-all hover:border-slate-600 cursor-move ${
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
                                                type="color"
                                                value={module.color || '#a855f7'}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    const nextColor = e.target.value;
                                                    const updates: Partial<FlightComputerModule> = { color: nextColor };
                                                    if (module.type === 'marker' && !(module.inputs?.marker_color)) {
                                                        updates.markerColor = nextColor;
                                                    }
                                                    onUpdateModule(module.id, updates);
                                                }}
                                                className="w-5 h-5 rounded border border-slate-700/50 bg-slate-900/50 cursor-pointer"
                                                onClick={(e) => e.stopPropagation()}
                                                draggable={false}
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
                                        {module.type === 'marker' && (
                                            <div className="col-span-2 space-y-1">
                                                <InputSelector 
                                                    label="Marker Target"
                                                    value={getInput(module, 'position')}
                                                    onChange={(input) => updateInput(module.id, 'position', input)}
                                                    bodies={bodies}
                                                    modules={modules}
                                                    currentModuleId={module.id}
                                                    allowedTypes={['body', 'module_output', 'vector']}
                                                />
                                            </div>
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
                                        {/* Thrust Burst */}
                                        {module.type === 'thrust_burst' && (
                                            <>
                                                <div className="space-y-1"><InputSelector label="Rocket" value={getInput(module, 'primary')} onChange={(input) => updateInput(module.id, 'primary', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                                <div className="space-y-1"><InputSelector label="Reference" value={getInput(module, 'reference')} onChange={(input) => updateInput(module.id, 'reference', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                                <div className="space-y-1"><InputSelector label="Start Trigger" value={getInput(module, 'trigger')} onChange={(input) => updateInput(module.id, 'trigger', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['boolean']} /></div>
                                                <div className="space-y-1"><InputSelector label="ΔV Prograde Source" value={getInput(module, 'deltaVPrograde')} onChange={(input) => updateInput(module.id, 'deltaVPrograde', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['scalar']} /></div>
                                                <div className="space-y-1"><InputSelector label="ΔV Radial Source" value={getInput(module, 'deltaVRadial')} onChange={(input) => updateInput(module.id, 'deltaVRadial', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['scalar']} /></div>
                                                <div className="space-y-1"><InputSelector label="Duration Source" value={getInput(module, 'duration')} onChange={(input) => updateInput(module.id, 'duration', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['scalar']} /></div>
                                            </>
                                        )}
                                        {/* Maneuver Executor */}
                                        {module.type === 'maneuver_executor' && (
                                            <>
                                                <div className="space-y-1"><InputSelector label="Rocket" value={getInput(module, 'primary')} onChange={(input) => updateInput(module.id, 'primary', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                                <div className="space-y-1"><InputSelector label="Queue Trigger" value={getInput(module, 'queueTrigger')} onChange={(input) => updateInput(module.id, 'queueTrigger', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['boolean']} /></div>
                                                <div className="space-y-1"><InputSelector label="Execute Trigger" value={getInput(module, 'executeTrigger')} onChange={(input) => updateInput(module.id, 'executeTrigger', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['boolean']} /></div>
                                            </>
                                        )}
                                        {/* Follow */}
                                        {module.type === 'follow' && (
                                            <>
                                                <div className="space-y-1"><InputSelector label="Target Body" value={getInput(module, 'target')} onChange={(input) => updateInput(module.id, 'target', input)} bodies={bodies} modules={modules} currentModuleId={module.id} /></div>
                                                <div className="space-y-1"><InputSelector label="Activate" value={getInput(module, 'trigger')} onChange={(input) => updateInput(module.id, 'trigger', input)} bodies={bodies} modules={modules} currentModuleId={module.id} allowedTypes={['boolean']} /></div>
                                            </>
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
                                    {/* Render Groups Recursively */}
                                    {(() => {
                                        // Only render top-level groups (no parent)
                                        const topLevelGroups = groups.filter(g => !g.parentGroupId);
                                        
                                        // Recursive function to render a group and its children
                                        const renderGroup = (group: ModuleGroup, depth: number = 0) => {
                                            // Max depth limit
                                            if (depth >= 6) return null;
                                            
                                            const childGroups = groups.filter(g => g.parentGroupId === group.id);
                                            const groupModules = modules.filter(m => m.groupId === group.id);
                                            
                                            return (
                                                <div 
                                                    key={group.id}
                                                    className={`border-2 rounded-lg transition-all ${dragOverGroupId === group.id ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700/50'} ${group.isCollapsed ? 'w-full' : 'w-full col-span-full'} mb-2`}
                                                    style={{ 
                                                        borderColor: group.isCollapsed ? group.color : undefined,
                                                        marginLeft: depth > 0 ? `${depth * 16}px` : undefined
                                                    }}
                                                    draggable={depth < 5} // Can't drag groups at max depth
                                                    onDragStart={(e) => {
                                                        if (depth < 5) {
                                                            e.stopPropagation();
                                                            setDraggedGroupId(group.id);
                                                        }
                                                    }}
                                                    onDragEnd={(e) => {
                                                        e.stopPropagation();
                                                        setDraggedGroupId(null);
                                                    }}
                                                    onDragOver={(e) => { 
                                                        e.preventDefault(); 
                                                        e.stopPropagation();
                                                        setDragOverGroupId(group.id); 
                                                    }}
                                                    onDragLeave={(e) => {
                                                        e.stopPropagation();
                                                        if (e.currentTarget === e.target) {
                                                            setDragOverGroupId(null);
                                                        }
                                                    }}
                                                    onDrop={(e) => { 
                                                        e.stopPropagation();
                                                        if (draggedModuleId) { 
                                                            onMoveModuleToGroup(draggedModuleId, group.id); 
                                                            setDraggedModuleId(null); 
                                                        } else if (draggedGroupId && draggedGroupId !== group.id && depth < 5) {
                                                            onMoveGroupToGroup(draggedGroupId, group.id);
                                                            setDraggedGroupId(null);
                                                        }
                                                        setDragOverGroupId(null);
                                                    }}
                                                >
                                                    {/* Group Header */}
                                                    <div 
                                                        className="flex justify-between items-center p-2 bg-slate-800/50 rounded-t-lg cursor-pointer hover:bg-slate-800/70" 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onUpdateGroup(group.id, { isCollapsed: !group.isCollapsed });
                                                        }} 
                                                        style={{ backgroundColor: group.color + '20' }}
                                                    >
                                                        <div className="flex items-center gap-0 flex-1">
                                                            {depth < 5 && <GripVertical size={12} className="text-slate-600" />}
                                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color }} />
                                                            {group.isCollapsed ? <span className="text-xs font-bold text-slate-200">{group.name}</span> :   <input 
                                                                type="text" 
                                                                value={group.name} 
                                                                onChange={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    onUpdateGroup(group.id, { name: e.target.value }); 
                                                                }} 
                                                                onClick={(e) => e.stopPropagation()} 
                                                                className="bg-transparent text-xs font-bold text-slate-200 border border-transparent hover:border-slate-600 focus:border-purple-500 rounded px-1 outline-none" 
                                                            />
                                                            }
                                                            {!group.isCollapsed && <span className="text-[10px] text-slate-500">({groupModules.length}m + {childGroups.length}g)</span>}
                                                            {group.isCollapsed && group.displayOutput && (<span className="text-[12px] text-cyan-300 font-mono ml-2">{getGroupDisplayValue(group)}</span>)}
                                                         </div>
                                                        <div className="flex items-center gap-1">
                                                            <button 
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    onExportGroup(group.id); 
                                                                }} 
                                                                className="p-1 rounded hover:bg-green-900/30 text-slate-600 hover:text-green-400"
                                                                title="Export group"
                                                            >
                                                                <Download size={12} />
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { 
                                                                    e.stopPropagation(); 
                                                                    onRemoveGroup(group.id); 
                                                                }} 
                                                                className="p-1 rounded hover:bg-red-900/30 text-slate-600 hover:text-red-400"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                            {group.isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                                                        </div>
                                                    </div>

                                                    {/* Group Content */}
                                                    {!group.isCollapsed && (
                                                        <div className="p-2">
                                                            {/* Child Groups */}
                                                            {childGroups.length > 0 && (
                                                                <div className="space-y-2 mb-2">
                                                                    {childGroups.map(childGroup => renderGroup(childGroup, depth + 1))}
                                                                </div>
                                                            )}
                                                            
                                                            {/* Modules */}
                                                            {groupModules.length === 0 && childGroups.length === 0 ? (
                                                                <div className="text-center py-4 text-slate-500 text-[10px] italic">Drag modules or groups here</div>
                                                            ) : groupModules.length > 0 ? (
                                                                <div className="grid grid-cols-4 gap-2">
                                                                    {groupModules.map(module => renderModule(module))}
                                                                </div>
                                                            ) : null}
                                                            
                                                            {/* Display Output Selector */}
                                                            {groupModules.length > 0 && (
                                                                <div className="pt-2 border-t border-slate-700/30 mt-2">
                                                                    <label className="text-[9px] text-slate-500 uppercase block mb-1">Display Output (collapsed)</label>
                                                                    <select 
                                                                        value={group.displayOutput ? `${group.displayOutput.moduleId}:${group.displayOutput.outputKey}` : ''} 
                                                                        onChange={(e) => { 
                                                                            if (!e.target.value) { 
                                                                                onUpdateGroup(group.id, { displayOutput: undefined }); 
                                                                                return; 
                                                                            } 
                                                                            const [moduleId, outputKey] = e.target.value.split(':'); 
                                                                            onUpdateGroup(group.id, { displayOutput: { moduleId, outputKey } }); 
                                                                        }} 
                                                                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 focus:border-purple-500 outline-none"
                                                                    >
                                                                        <option value="">None</option>
                                                                        {groupModules.map(m => { 
                                                                            const options = []; 
                                                                            if (m.type === 'track_distance') options.push(<option key={`${m.id}:distance`} value={`${m.id}:distance`}>{m.name || 'Distance'} - Value</option>); 
                                                                            if (m.type === 'track_velocity') options.push(<option key={`${m.id}:speed`} value={`${m.id}:speed`}>{m.name || 'Velocity'} - Speed</option>); 
                                                                            if (m.type === 'orbit_info') { 
                                                                                options.push(<option key={`${m.id}:altitude`} value={`${m.id}:altitude`}>{m.name || 'Orbit'} - Altitude</option>); 
                                                                                options.push(<option key={`${m.id}:periapsis`} value={`${m.id}:periapsis`}>{m.name || 'Orbit'} - Periapsis</option>); 
                                                                                options.push(<option key={`${m.id}:apoapsis`} value={`${m.id}:apoapsis`}>{m.name || 'Orbit'} - Apoapsis</option>); 
                                                                                options.push(<option key={`${m.id}:period`} value={`${m.id}:period`}>{m.name || 'Orbit'} - Period</option>); 
                                                                            } 
                                                                            if (m.type === 'transfer_window') {
                                                                                options.push(<option key={`${m.id}:error`} value={`${m.id}:error`}>{m.name || 'Transfer'} - Phase Error</option>);
                                                                                options.push(<option key={`${m.id}:wait_time`} value={`${m.id}:wait_time`}>{m.name || 'Transfer'} - Wait Time</option>);
                                                                                options.push(<option key={`${m.id}:transfer_time`} value={`${m.id}:transfer_time`}>{m.name || 'Transfer'} - Transfer Time</option>);
                                                                                options.push(<option key={`${m.id}:arrival_time`} value={`${m.id}:arrival_time`}>{m.name || 'Transfer'} - Arrival Time</option>);
                                                                                options.push(<option key={`${m.id}:current_phase`} value={`${m.id}:current_phase`}>{m.name || 'Transfer'} - Current Phase</option>);
                                                                                options.push(<option key={`${m.id}:required_phase`} value={`${m.id}:required_phase`}>{m.name || 'Transfer'} - Required Phase</option>);
                                                                                options.push(<option key={`${m.id}:error_angle`} value={`${m.id}:error_angle`}>{m.name || 'Transfer'} - Error Angle</option>);
                                                                                options.push(<option key={`${m.id}:insertion_angle`} value={`${m.id}:insertion_angle`}>{m.name || 'Transfer'} - Insertion Angle</option>);
                                                                                options.push(<option key={`${m.id}:intercept_angle_target`} value={`${m.id}:intercept_angle_target`}>{m.name || 'Transfer'} - Target Angle</option>);
                                                                                options.push(<option key={`${m.id}:intercept_angle_transfer`} value={`${m.id}:intercept_angle_transfer`}>{m.name || 'Transfer'} - Transfer Angle</option>);
                                                                                options.push(<option key={`${m.id}:ready`} value={`${m.id}:ready`}>{m.name || 'Transfer'} - Ready</option>);
                                                                                options.push(<option key={`${m.id}:insertion_point`} value={`${m.id}:insertion_point`}>{m.name || 'Transfer'} - Insertion Point</option>);
                                                                                options.push(<option key={`${m.id}:intercept_point`} value={`${m.id}:intercept_point`}>{m.name || 'Transfer'} - Intercept Point</option>);
                                                                                options.push(<option key={`${m.id}:intercept_point_transfer`} value={`${m.id}:intercept_point_transfer`}>{m.name || 'Transfer'} - Transfer Point</option>);
                                                                            }
                                                                            if (m.type === 'rendezvous_tracker') {
                                                                                options.push(<option key={`${m.id}:time`} value={`${m.id}:time`}>{m.name || 'Rendezvous'} - Time</option>);
                                                                                options.push(<option key={`${m.id}:distance`} value={`${m.id}:distance`}>{m.name || 'Rendezvous'} - Distance</option>);
                                                                                options.push(<option key={`${m.id}:delta_v_total`} value={`${m.id}:delta_v_total`}>{m.name || 'Rendezvous'} - ΔV Total</option>);
                                                                                options.push(<option key={`${m.id}:delta_v_prograde`} value={`${m.id}:delta_v_prograde`}>{m.name || 'Rendezvous'} - ΔV Prograde</option>);
                                                                                options.push(<option key={`${m.id}:delta_v_radial`} value={`${m.id}:delta_v_radial`}>{m.name || 'Rendezvous'} - ΔV Radial</option>);
                                                                            }
                                                                            if (m.type === 'notify') options.push(<option key={`${m.id}:triggered`} value={`${m.id}:triggered`}>{m.name || 'Notify'} - Triggered</option>); 
                                                                            if (m.type === 'logic_gate') options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Logic'} - Result</option>); 
                                                                            if (m.type === 'thrust_burst') options.push(<option key={`${m.id}:done`} value={`${m.id}:done`}>{m.name || 'Burst'} - Done</option>); 
                                                                            if (m.type === 'maneuver_executor') options.push(<option key={`${m.id}:progress`} value={`${m.id}:progress`}>{m.name || 'Executor'} - Progress</option>);
                                                                            if (m.type === 'button') options.push(<option key={`${m.id}:state`} value={`${m.id}:state`}>{m.name || 'Button'} - State</option>);
                                                                            if (m.type === 'maths') options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Maths'} - Result</option>);
                                                                            if (m.type === 'body_info') {
                                                                                options.push(<option key={`${m.id}:name`} value={`${m.id}:name`}>{m.name || 'Body Info'} - Name</option>);
                                                                                options.push(<option key={`${m.id}:id`} value={`${m.id}:id`}>{m.name || 'Body Info'} - ID</option>);
                                                                                options.push(<option key={`${m.id}:mass`} value={`${m.id}:mass`}>{m.name || 'Body Info'} - Mass</option>);
                                                                                options.push(<option key={`${m.id}:fuel`} value={`${m.id}:fuel`}>{m.name || 'Body Info'} - Fuel</option>);
                                                                                options.push(<option key={`${m.id}:landed_on`} value={`${m.id}:landed_on`}>{m.name || 'Body Info'} - Landed On</option>);
                                                                            }
                                                                            if (m.type === 'custom_script') {
                                                                                const outputType = m.customScriptOutputType || 'scalar';
                                                                                if (outputType === 'scalar') {
                                                                                    options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Script'} - Result (Number)</option>);
                                                                                } else if (outputType === 'boolean') {
                                                                                    options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Script'} - Result (Boolean)</option>);
                                                                                } else if (outputType === 'string') {
                                                                                    options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Script'} - Result (String)</option>);
                                                                                } else if (outputType === 'vector') {
                                                                                    options.push(<option key={`${m.id}:result`} value={`${m.id}:result`}>{m.name || 'Script'} - Result (Vector)</option>);
                                                                                }
                                                                            }
                                                                            return options; 
                                                                        })}
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        };
                                        
                                        //return topLevelGroups.map(group => renderGroup(group, 0));

                                        return (
                                            <div className="grid grid-cols-6 gap-0 m-0 p-0">   
                                                {topLevelGroups.map(group => renderGroup(group, 0))}
                                            </div>
                                        );
                                    })()}

                                    {/* Ungrouped Modules */}
                                    {ungroupedModules.length > 0 && (
                                        <div 
                                            className={`border rounded-lg p-2 ${dragOverGroupId === null && draggedModuleId ? 'border-purple-500 bg-purple-500/10' : 'border-slate-700/30'}`}
                                            onDragOver={(e) => { e.preventDefault(); setDragOverGroupId(null); }}
                                            onDrop={() => { if (draggedModuleId) { onMoveModuleToGroup(draggedModuleId, null); setDraggedModuleId(null); setDragOverGroupId(null); } }}
                                        >
                                            <div className="text-[10px] text-slate-500 uppercase mb-2 px-1">Ungrouped Modules</div>
                                            <div className="grid grid-cols-4 gap-2">
                                                {ungroupedModules.map(module => renderModule(module))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Create Group Button */}
                                    {modules.length > 0 && (
                                        <div className="mt-2 flex gap-2 fixed bottom-0 ">
                                            <button 
                                                onClick={onAddGroup} 
                                                className="w-full p-2 bg-green-600 hover:bg-green-500 text-white text-xs rounded flex items-center justify-center gap-2"
                                            >
                                                <FolderPlus size={14} />
                                                Create Group
                                            </button>
                                            <button 
                                                onClick={onImportGroup} 
                                                className="p-2 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded flex items-center gap-2"
                                                title="Import group from file"
                                            >
                                                <Upload size={14} />
                                            </button>
                                        </div>
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
