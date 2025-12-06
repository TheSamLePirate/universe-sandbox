import { updatePhysics } from './physicsEngine';
import { Body } from '../types';

// Define the shape of messages sent TO the worker
interface PhysicsWorkerMessage {
    bodies: Body[];
    dt: number;
    gConst: number;
    trailLength: number;
    collisions: boolean;
    jobId: number;
}

// Handler for messages from the main thread
self.onmessage = (e: MessageEvent<PhysicsWorkerMessage>) => {
    const { bodies, dt, gConst, trailLength, collisions, jobId } = e.data;

    // Run the actual physics loop
    const result = updatePhysics(bodies, dt, gConst, trailLength, collisions);

    // Send the result back to the main thread with jobId
    self.postMessage({ ...result, jobId });
};
