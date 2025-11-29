import { useEffect, useRef } from 'react';
import { Body } from '../types';

export const useRocketSound = (bodies: Body[]) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const filterNodeRef = useRef<BiquadFilterNode | null>(null);
    const isInitializedRef = useRef(false);

    // Initialize Audio Context
    useEffect(() => {
        const initAudio = () => {
            if (isInitializedRef.current) {
                // Ensure it's running if already initialized
                if (audioContextRef.current?.state === 'suspended') {
                    audioContextRef.current.resume().then(() => {
                        console.log('AudioContext resumed successfully');
                    });
                }
                return;
            }
            
            const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
            if (!AudioContextClass) return;

            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;

            // Create White Noise Buffer
            const bufferSize = ctx.sampleRate * 2; // 2 seconds buffer
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            // Create Nodes
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            noise.loop = true;
            noiseNodeRef.current = noise;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 300; // 300Hz rumble
            filter.Q.value = 1;
            filterNodeRef.current = filter;

            const gain = ctx.createGain();
            gain.gain.value = 0; // Start silent
            gainNodeRef.current = gain;

            // Connect
            noise.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            noise.start();
            isInitializedRef.current = true;
            console.log('Audio System Initialized via User Interaction');
        };

        // REMOVED immediate initAudio() call to avoid browser warnings
        // initAudio(); 

        // Initialize on first interaction
        const handleInteraction = () => {
            initAudio();
            // Once initialized and running, we can remove listeners
            if (audioContextRef.current?.state === 'running') {
                window.removeEventListener('click', handleInteraction);
                window.removeEventListener('keydown', handleInteraction);
                window.removeEventListener('touchstart', handleInteraction);
            }
        };

        window.addEventListener('click', handleInteraction);
        window.addEventListener('keydown', handleInteraction);
        window.addEventListener('touchstart', handleInteraction);

        return () => {
            window.removeEventListener('click', handleInteraction);
            window.removeEventListener('keydown', handleInteraction);
            window.removeEventListener('touchstart', handleInteraction);
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    // Update sound based on thrust
    useEffect(() => {
        if (!gainNodeRef.current || !audioContextRef.current) return;

        // Check if ANY rocket is thrusting
        const rocket = bodies.find(b => b.isRocket);
        const isThrusting = rocket && rocket.thrust && (Math.abs(rocket.thrust.x) > 0.0001 || Math.abs(rocket.thrust.y) > 0.0001);
        
        if (isThrusting) {
             // console.log('Thrust detected:', rocket.thrust); // Uncomment for debugging
        }

        const targetGain = isThrusting ? 0.4 : 0; 
        const currentTime = audioContextRef.current.currentTime;
        
        // Smooth transition
        gainNodeRef.current.gain.setTargetAtTime(targetGain, currentTime, 0.1);
        
    }, [bodies]);
};
