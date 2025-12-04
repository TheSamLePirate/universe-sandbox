import React from 'react';
import { Body, FlightComputerModule, FlightComputerInput, PhysicsConfig, RendezvousSolution, FlightComputerModuleType } from '../../../types';

interface ModuleProps {
    module: FlightComputerModule;
    bodies: Body[];
    modules: FlightComputerModule[];
    physicsConfig: PhysicsConfig;
    rendezvousSolutionMap: Record<string, RendezvousSolution>;
    onUpdateModule: (id: string, updates: Partial<FlightComputerModule>) => void;
    onAddModule: (type: FlightComputerModuleType, inputs?: Record<string, FlightComputerInput>) => void;
    isFollowing?: boolean;
}

const FollowModule: React.FC<ModuleProps> = ({ isFollowing }) => {
    return (
        <div className="mt-2 text-xs text-slate-400">
            Status: <span className={isFollowing ? "text-green-400 font-bold" : "text-slate-500"}>{isFollowing ? "ACTIVE" : "IDLE"}</span>
        </div>
    );
};

export default FollowModule;
