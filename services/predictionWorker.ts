
import { calculateForces } from './physicsEngine';
import { Body, Vector2D } from '../types';

// Define the message types for type safety
export type PredictionWorkerRequest = {
  bodies: Body[];
  steps: number;
  timeStep: number;
  gravitationalConstant: number;
  predictionBodyIds: string[];
};

export type PredictionWorkerResponse = {
  paths: { id: string, color: string, points: Vector2D[] }[];
};

self.onmessage = (e: MessageEvent<PredictionWorkerRequest>) => {
  const { bodies, steps, timeStep, gravitationalConstant, predictionBodyIds } = e.data;

  // We reproduce the logic from predictSystemTrajectories here
  // to avoid complex imports or just use the logic directly.
  // Since we have calculateForces imported, we can rewrite the loop here 
  // to ensure it runs completely isolated.

  let simBodies = bodies.map(b => ({ ...b }));
    
  const paths = (predictionBodyIds && predictionBodyIds.length > 0 
      ? simBodies.filter(b => predictionBodyIds.includes(b.id)) 
      : simBodies
  ).map(b => ({
      id: b.id,
      color: b.color,
      points: [] as Vector2D[]
  }));

  // Limit points to prevent memory issues - max 10000 points per path
  // (Same logic as original function)
  const MAX_POINTS = 10000;
  const stride = Math.max(1, Math.ceil(steps / MAX_POINTS));

  for(let k=0; k<steps; k++) {
      const forces = calculateForces(simBodies, gravitationalConstant);

      simBodies = simBodies.map((b, i) => {
          const ax = forces[i].x / b.mass;
          const ay = forces[i].y / b.mass;
          const newVx = b.velocity.x + ax * timeStep;
          const newVy = b.velocity.y + ay * timeStep;
          const newX = b.position.x + newVx * timeStep;
          const newY = b.position.y + newVy * timeStep;
          
          return {
              ...b,
              velocity: { x: newVx, y: newVy },
              position: { x: newX, y: newY }
          };
      });

      // Only record points at stride intervals to limit memory
      if (k % stride === 0) {
          paths.forEach(path => {
              const body = simBodies.find(sb => sb.id === path.id);
              if (body && path.points.length < MAX_POINTS) {
                  path.points.push({ x: body.position.x, y: body.position.y });
              }
          });
      }
  }

  self.postMessage({ paths });
};
