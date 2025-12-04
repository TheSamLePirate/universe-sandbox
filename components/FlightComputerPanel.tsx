import React, { useState } from 'react';
import { Body, FlightComputerModule, FlightComputerModuleType, PhysicsConfig, FlightComputerInput, ModuleGroup, RendezvousSolution } from '../types';
import { ChevronDown, ChevronUp, Plus, FolderPlus, Upload, GripVertical, X, Trash2, CheckSquare, Download, Settings } from 'lucide-react';
import useIsMobile from '../hooks/useIsMobile';
import { useFlightComputerLogic } from '../hooks/useFlightComputerLogic';
import ModuleContent from './flight_computer/ModuleContent';
import InputSelector from './flight_computer/InputSelector';
import { getInput, getUpdateForInput, MODULE_ICONS, isModuleActive } from './flight_computer/utils';

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

const MODULE_TYPES: { value: FlightComputerModuleType; label: string; category: string }[] = [
    { value: 'orbit_info', label: 'Orbit Info', category: 'Info' },
    { value: 'transfer_window', label: 'Transfer Window', category: 'Info' },
    { value: 'rendezvous_tracker', label: 'Rendezvous Tracker', category: 'Info' },
    { value: 'track_distance', label: 'Track Distance', category: 'Info' },
    { value: 'track_velocity', label: 'Track Velocity', category: 'Info' },
    { value: 'body_info', label: 'Body Info', category: 'Info' },
    { value: 'body_by', label: 'Body By', category: 'Info' },
    { value: 'marker', label: 'Marker', category: 'Visual' },
    { value: 'logic_gate', label: 'Logic Gate', category: 'Logic' },
    { value: 'maths', label: 'Math Operation', category: 'Logic' },
    { value: 'button', label: 'Button', category: 'Logic' },
    { value: 'selector', label: 'Selector', category: 'Logic' },
    { value: 'notify', label: 'Notify', category: 'Actions' },
    { value: 'beep', label: 'Beep', category: 'Actions' },
    { value: 'thrust_burst', label: 'Thrust Burst', category: 'Actions' },
    { value: 'maneuver_executor', label: 'Maneuver Executor', category: 'Actions' },
    { value: 'follow', label: 'Follow', category: 'Actions' },
    { value: 'custom_script', label: 'Custom Script', category: 'Advanced' },
];

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

    // Use the custom hook for logic
    const { rendezvousSolutionMap, followModuleTriggerStateRef } = useFlightComputerLogic(
        modules,
        bodies,
        physicsConfig,
        rendezvousPoints,
        onUpdateModule,
        onAddModule,
        onRemoveModule,
        onToggleModule,
        onSetFollowingBody
    );

    // Helper to get display value for collapsed group
    const getGroupDisplayValue = (group: ModuleGroup): string => {
        if (!group.displayOutput) return '—';
        const { moduleId, outputKey } = group.displayOutput;
        const module = modules.find(m => m.id === moduleId);
        if (!module) return '—';

        // Import resolveInput and other resolve functions from orbitalMath
        const { resolveInput, resolveScalarInput, resolveBooleanInput, resolveStringInput } = require('../services/orbitalMath');

        // Simplified display logic - you can expand this based on outputKey
        const value = resolveScalarInput(
            { type: 'module_output', value: `${moduleId}:${outputKey}` },
            bodies,
            modules,
            physicsConfig.gravitationalConstant,
            rendezvousSolutionMap
        );

        if (typeof value === 'number') return value.toFixed(2);
        return String(value ?? '—');
    };

    // Render function for a single module
    const renderModule = (module: FlightComputerModule) => {
        const isExpanded = expandedModules.includes(module.id);
        const Icon = MODULE_ICONS[module.type] || Settings;
        const moduleActiveState = isModuleActive(module, bodies, modules, physicsConfig, rendezvousSolutionMap);
        const isFollowing = module.type === 'follow' && followModuleTriggerStateRef?.current?.get(module.id);

        const updateInput = (moduleId: string, key: string, input: FlightComputerInput | undefined) => {
            onUpdateModule(moduleId, getUpdateForInput(module, key, input));
        };

        return (
            <div
                key={module.id}
                draggable
                onDragStart={() => setDraggedModuleId(module.id)}
                onDragEnd={() => setDraggedModuleId(null)}
                className={`bg-slate-800/40 backdrop-blur-sm rounded border transition-all ${
                    module.isEnabled ? 'border-slate-700/50' : 'border-slate-800/30 opacity-50'
                } ${draggedModuleId === module.id ? 'opacity-40' : ''}`}
            >
                <div className="p-2">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                        <GripVertical size={12} className="text-slate-600 cursor-move" />
                        <div className="flex-1 flex items-center gap-2">
                            {React.createElement(Icon as React.ElementType, { size: 14, style: { color: module.color } })}
                            <input
                                type="text"
                                value={module.name || MODULE_TYPES.find(t => t.value === module.type)?.label || module.type}
                                onChange={(e) => onUpdateModule(module.id, { name: e.target.value })}
                                className="flex-1 bg-transparent border-none text-xs text-slate-200 outline-none"
                                placeholder="Module name..."
                            />
                        </div>
                        <input
                            type="color"
                            value={module.color}
                            onChange={(e) => onUpdateModule(module.id, { color: e.target.value })}
                            className="w-6 h-6 rounded cursor-pointer"
                        />
                        <button
                            onClick={() => onToggleModule(module.id)}
                            className={`p-1 rounded ${module.isEnabled ? 'text-green-400 bg-green-900/20' : 'text-slate-500 bg-slate-800'}`}
                        >
                            <CheckSquare size={14} />
                        </button>
                        <button
                            onClick={() => setExpandedModules(expanded => 
                                isExpanded ? expanded.filter(id => id !== module.id) : [...expanded, module.id]
                            )}
                            className="p-1 hover:bg-slate-700/50 rounded text-slate-400"
                        >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        <button
                            onClick={() => onRemoveModule(module.id)}
                            className="p-1 hover:bg-red-900/30 rounded text-red-400"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Activation Input (for all modules) */}
                    {isExpanded && (
                        <div className="mb-2 pb-2 border-b border-slate-700/30">
                            <InputSelector
                                label="Activate (Boolean)"
                                value={getInput(module, 'activate')}
                                onChange={(input) => updateInput(module.id, 'activate', input)}
                                bodies={bodies}
                                modules={modules}
                                currentModuleId={module.id}
                                allowedTypes={['boolean', 'module_output']}
                            />
                            {getInput(module, 'activate') && (
                                <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="text-slate-500">Status:</span>
                                    <span className={`font-mono ${moduleActiveState ? 'text-green-400' : 'text-red-400'}`}>
                                        {moduleActiveState ? 'ACTIVE' : 'INACTIVE'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Primary Inputs (target, primary, reference) */}
                    {isExpanded && ['orbit_info', 'transfer_window', 'rendezvous_tracker', 'track_distance', 'track_velocity', 'marker', 'maneuver_executor'].includes(module.type) && (
                        <div className="space-y-2 mb-2 pb-2 border-b border-slate-700/30">
                            {['orbit_info', 'marker', 'maneuver_executor'].includes(module.type) && (
                                <InputSelector
                                    label={module.type === 'marker' ? 'Marker Target' : 'Primary Body/Ship'}
                                    value={getInput(module, 'primary')}
                                    onChange={(input) => updateInput(module.id, 'primary', input)}
                                    bodies={bodies}
                                    modules={modules}
                                    currentModuleId={module.id}
                                    allowedTypes={['body', 'module_output']}
                                />
                            )}
                            {['orbit_info', 'transfer_window', 'rendezvous_tracker', 'track_distance', 'track_velocity'].includes(module.type) && module.type !== 'marker' && (
                                <>
                                    <InputSelector
                                        label="Primary Body/Ship"
                                        value={getInput(module, 'primary')}
                                        onChange={(input) => updateInput(module.id, 'primary', input)}
                                        bodies={bodies}
                                        modules={modules}
                                        currentModuleId={module.id}
                                        allowedTypes={['body', 'module_output']}
                                    />
                                    {['orbit_info', 'transfer_window'].includes(module.type) && (
                                        <InputSelector
                                            label="Reference Body"
                                            value={getInput(module, 'reference')}
                                            onChange={(input) => updateInput(module.id, 'reference', input)}
                                            bodies={bodies}
                                            modules={modules}
                                            currentModuleId={module.id}
                                            allowedTypes={['body', 'module_output']}
                                        />
                                    )}
                                    {['transfer_window', 'rendezvous_tracker', 'track_distance', 'track_velocity'].includes(module.type) && (
                                        <InputSelector
                                            label="Target"
                                            value={getInput(module, 'target')}
                                            onChange={(input) => updateInput(module.id, 'target', input)}
                                            bodies={bodies}
                                            modules={modules}
                                            currentModuleId={module.id}
                                            allowedTypes={['body', 'module_output']}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Module-specific content */}
                    {isExpanded && (
                        <ModuleContent
                            module={module}
                            bodies={bodies}
                            modules={modules}
                            physicsConfig={physicsConfig}
                            rendezvousSolutionMap={rendezvousSolutionMap}
                            onUpdateModule={onUpdateModule}
                            onAddModule={onAddModule}
                            isFollowing={isFollowing}
                        />
                    )}
                </div>
            </div>
        );
    };

    // Render group recursively
    const renderGroup = (group: ModuleGroup, depth: number = 0): React.ReactElement => {
        const childGroups = groups.filter(g => g.parentGroupId === group.id);
        const groupModules = modules.filter(m => m.groupId === group.id);

        return (
            <div
                key={group.id}
                className="bg-slate-900/40 rounded border border-slate-700/30 mb-2"
                style={{ marginLeft: depth * 12 }}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverGroupId(group.id);
                }}
                onDragLeave={() => setDragOverGroupId(null)}
                onDrop={(e) => {
                    e.preventDefault();
                    if (draggedModuleId) {
                        onMoveModuleToGroup(draggedModuleId, group.id);
                    } else if (draggedGroupId && draggedGroupId !== group.id) {
                        onMoveGroupToGroup(draggedGroupId, group.id);
                    }
                    setDragOverGroupId(null);
                }}
            >
                <div className="p-2">
                    {/* Group Header */}
                    <div className="flex items-center gap-2 mb-2">
                        <div
                            draggable
                            onDragStart={() => setDraggedGroupId(group.id)}
                            onDragEnd={() => setDraggedGroupId(null)}
                            className="cursor-move"
                        >
                            <GripVertical size={12} className="text-slate-600" />
                        </div>
                        <input
                            type="text"
                            value={group.name}
                            onChange={(e) => onUpdateGroup(group.id, { name: e.target.value })}
                            className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                        />
                        <input
                            type="color"
                            value={group.color}
                            onChange={(e) => onUpdateGroup(group.id, { color: e.target.value })}
                            className="w-6 h-6 rounded cursor-pointer"
                        />
                        {group.isCollapsed && (
                            <div className="text-xs text-slate-400 font-mono">
                                {getGroupDisplayValue(group)}
                            </div>
                        )}
                        <button
                            onClick={() => onUpdateGroup(group.id, { isCollapsed: !group.isCollapsed })}
                            className="p-1 hover:bg-slate-700/50 rounded text-slate-400"
                        >
                            {group.isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </button>
                        <button
                            onClick={() => onExportGroup(group.id)}
                            className="p-1 hover:bg-slate-700/50 rounded text-slate-400"
                        >
                            <Download size={14} />
                        </button>
                        <button
                            onClick={() => onRemoveGroup(group.id)}
                            className="p-1 hover:bg-red-900/30 rounded text-red-400"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>

                    {/* Group Content */}
                    {!group.isCollapsed && (
                        <div className="space-y-2">
                            {groupModules.map(renderModule)}
                            {childGroups.map(childGroup => renderGroup(childGroup, depth + 1))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Top-level groups and ungrouped modules
    const topLevelGroups = groups.filter(g => !g.parentGroupId);
    const ungroupedModules = modules.filter(m => !m.groupId);

    return (
        <div className={`${isMobile ? 'w-full' : 'w-full'} bg-slate-900/10 backdrop-blur-xs border-r border-slate-800 flex flex-col fixed top-0 right-0 z-50`}>
            {/* Header */}
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-200">Flight Computer</h2>
                <div className="flex gap-1">
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400"
                    >
                        <Plus size={16} />
                    </button>
                    <button
                        onClick={onAddGroup}
                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400"
                    >
                        <FolderPlus size={16} />
                    </button>
                    <button
                        onClick={onImportGroup}
                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400"
                    >
                        <Upload size={16} />
                    </button>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400"
                    >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                </div>
            </div>

            {/* Module Type Selector */}
            {isExpanded && isAdding && (
                <div className="p-3 border-b border-slate-800 bg-slate-800/50">
                    <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Add Module</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {['Info', 'Visual', 'Logic', 'Actions', 'Advanced'].map(category => (
                            <div key={category}>
                                <div className="text-[10px] text-slate-500 uppercase mb-1">{category}</div>
                                <div className="space-y-1">
                                    {MODULE_TYPES.filter(t => t.category === category).map(moduleType => {
                                        const Icon = MODULE_ICONS[moduleType.value] || Settings;
                                        return (
                                            <button
                                                key={moduleType.value}
                                                onClick={() => {
                                                    onAddModule(moduleType.value);
                                                    setIsAdding(false);
                                                }}
                                                className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-300 hover:bg-slate-700/50 flex items-center gap-2"
                                            >
                                                {React.createElement(Icon as React.ElementType, { size: 12 })}
                                                {moduleType.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Modules and Groups */}
            {isExpanded && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {topLevelGroups.map(group => renderGroup(group, 0))}
                    {ungroupedModules.map(renderModule)}
                    
                    {modules.length === 0 && (
                        <div className="text-center text-slate-500 text-xs py-8">
                            No modules yet. Click + to add one.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FlightComputerPanel;
