import React from 'react';
import { Body, FlightComputerModule, FlightComputerInput, PhysicsConfig, RendezvousSolution, FlightComputerModuleType } from '../../types';
import OrbitInfoModule from './modules/OrbitInfoModule';
import TransferWindowModule from './modules/TransferWindowModule';
import MarkerModule from './modules/MarkerModule';
import RendezvousTrackerModule from './modules/RendezvousTrackerModule';
import TrackDistanceModule from './modules/TrackDistanceModule';
import TrackVelocityModule from './modules/TrackVelocityModule';
import NotifyModule from './modules/NotifyModule';
import LogicGateModule from './modules/LogicGateModule';
import BeepModule from './modules/BeepModule';
import ThrustBurstModule from './modules/ThrustBurstModule';
import ManeuverExecutorModule from './modules/ManeuverExecutorModule';
import ButtonModule from './modules/ButtonModule';
import SelectorModule from './modules/SelectorModule';
import FollowModule from './modules/FollowModule';
import MathsModule from './modules/MathsModule';
import BodyInfoModule from './modules/BodyInfoModule';
import BodyByModule from './modules/BodyByModule';
import CustomScriptModule from './modules/CustomScriptModule';
import KeyboardModule from './modules/KeyboardModule';
import SliderModule from './modules/SliderModule';
import MusicControllerModule from './modules/MusicControllerModule';

interface ModuleContentProps {
    module: FlightComputerModule;
    bodies: Body[];
    modules: FlightComputerModule[];
    physicsConfig: PhysicsConfig;
    rendezvousSolutionMap: Record<string, RendezvousSolution>;
    onUpdateModule: (id: string, updates: Partial<FlightComputerModule>) => void;
    onAddModule: (type: FlightComputerModuleType, inputs?: Record<string, FlightComputerInput>) => void;
    isFollowing?: boolean;
}

const ModuleContent: React.FC<ModuleContentProps> = (props) => {
    const { module } = props;

    switch (module.type) {
        case 'orbit_info': return <OrbitInfoModule {...props} />;
        case 'transfer_window': return <TransferWindowModule {...props} />;
        case 'marker': return <MarkerModule {...props} />;
        case 'rendezvous_tracker': return <RendezvousTrackerModule {...props} />;
        case 'track_distance': return <TrackDistanceModule {...props} />;
        case 'track_velocity': return <TrackVelocityModule {...props} />;
        case 'notify': return <NotifyModule {...props} />;
        case 'logic_gate': return <LogicGateModule {...props} />;
        case 'beep': return <BeepModule {...props} />;
        case 'thrust_burst': return <ThrustBurstModule {...props} />;
        case 'maneuver_executor': return <ManeuverExecutorModule {...props} />;
        case 'button': return <ButtonModule {...props} />;
        case 'selector': return <SelectorModule {...props} />;
        case 'follow': return <FollowModule {...props} />;
        case 'maths': return <MathsModule {...props} />;
        case 'body_info': return <BodyInfoModule {...props} />;
        case 'body_by': return <BodyByModule {...props} />;
        case 'custom_script': return <CustomScriptModule {...props} />;
        case 'keyboard': return <KeyboardModule {...props} />;
        case 'slider': return <SliderModule {...props} />;
        case 'music_controller': return <MusicControllerModule {...props} />;
        default: return <div className="text-xs text-red-500">Unknown Module Type</div>;
    }
};

export default ModuleContent;
