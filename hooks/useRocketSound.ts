import { useEffect, useRef } from 'react';
import { Body } from '../types';

export const useRocketSound = (bodies: Body[]) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const filterNodeRef = useRef<BiquadFilterNode | null>(null);
    const isInitializedRef = useRef(false);
    
    // Track previous states for beep detection
    const prevManeuversRef = useRef<Map<string, string>>(new Map()); // rocketId -> active maneuver type
    const prevSASModeRef = useRef<Map<string, string>>(new Map()); // rocketId -> SAS mode
    const lowAltitudeBeepingRef = useRef<Map<string, boolean>>(new Map()); // rocketId -> is beeping
    const lastBeepTimeRef = useRef<number>(0);
    const prevRocketIdsRef = useRef<Set<string>>(new Set()); // Track which rockets existed last frame
    const prevLandedStatusRef = useRef<Map<string, boolean>>(new Map()); // rocketId -> was landed

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

    // Beep sound generator
    const playBeep = (count: number = 1) => {
        if (!audioContextRef.current) return;
        
        const ctx = audioContextRef.current;
        const now = ctx.currentTime;
        
        for (let i = 0; i < count; i++) {
            const osc = ctx.createOscillator();
            const beepGain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = 800; // 800Hz beep
            
            const startTime = now + (i * 0.2); // 200ms between beeps
            const endTime = startTime + 0.1; // 100ms beep duration
            
            beepGain.gain.setValueAtTime(0, startTime);
            beepGain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
            beepGain.gain.linearRampToValueAtTime(0, endTime);
            
            osc.connect(beepGain);
            beepGain.connect(ctx.destination);
            
            osc.start(startTime);
            osc.stop(endTime);
        }
    };

    // Landing sound - soft descending tone
    const playLandingSound = () => {
        if (!audioContextRef.current) return;
        
        const ctx = audioContextRef.current;
        const now = ctx.currentTime;
        
        const osc = ctx.createOscillator();
        const landingGain = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now); // Start at 600Hz
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.3); // Drop to 300Hz
        
        landingGain.gain.setValueAtTime(0, now);
        landingGain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        landingGain.gain.linearRampToValueAtTime(0, now + 0.3);
        
        osc.connect(landingGain);
        landingGain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.3);
    };

    // Crash sound - harsh noise burst
    const playCrashSound = () => {
        if (!audioContextRef.current) return;
        
        const ctx = audioContextRef.current;
        const now = ctx.currentTime;
        
        // Create noise buffer for crash
        const bufferSize = ctx.sampleRate * 0.5; // 0.5 second crash
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3)); // Decaying noise
        }
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const crashFilter = ctx.createBiquadFilter();
        crashFilter.type = 'lowpass';
        crashFilter.frequency.value = 1200;
        crashFilter.Q.value = 0.5;
        
        const crashGain = ctx.createGain();
        crashGain.gain.setValueAtTime(0.5, now);
        crashGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        
        noise.connect(crashFilter);
        crashFilter.connect(crashGain);
        crashGain.connect(ctx.destination);
        
        noise.start(now);
        noise.stop(now + 0.5);
    };

    // Update sound based on thrust and detect events
    useEffect(() => {
        if (!gainNodeRef.current || !audioContextRef.current) return;

        // Check if ANY rocket is thrusting
        const rockets = bodies.filter(b => b.isRocket);
        const isThrusting = rockets.some(rocket => 
            rocket.thrust && (Math.abs(rocket.thrust.x) > 0.0001 || Math.abs(rocket.thrust.y) > 0.0001)
        );

        const targetGain = isThrusting ? 0.4 : 0; 
        const currentTime = audioContextRef.current.currentTime;
        
        // Smooth transition
        gainNodeRef.current.gain.setTargetAtTime(targetGain, currentTime, 0.1);

        // Track current rocket IDs
        const currentRocketIds = new Set(rockets.map(r => r.id));
        
        // 1. Detect rocket crashes (rocket that existed before but is now gone)
        prevRocketIdsRef.current.forEach(prevId => {
            if (!currentRocketIds.has(prevId)) {
                // Rocket was destroyed!
                playCrashSound();
            }
        });
        
        // Update previous rocket IDs
        prevRocketIdsRef.current = currentRocketIds;
        
        // Check each rocket for events
        rockets.forEach(rocket => {
            const rocketId = rocket.id;
            
            // 2. Detect landings (transitioned from flying to landed)
            const wasLanded = prevLandedStatusRef.current.get(rocketId);
            const isLanded = !!rocket.landedOnBodyId;
            
            if (!wasLanded && isLanded) {
                // Just landed!
                playLandingSound();
            }
            prevLandedStatusRef.current.set(rocketId, isLanded);
            
            // 3. Check for new maneuvers starting
            const activeManeuver = rocket.maneuvers?.find(m => m.status === 'active');
            const prevManeuverType = prevManeuversRef.current.get(rocketId);
            const currentManeuverType = activeManeuver?.type;
            
            if (currentManeuverType && currentManeuverType !== prevManeuverType) {
                // New maneuver started!
                if (currentManeuverType === 'auto_circularize') {
                    playBeep(1);
                } else if (currentManeuverType === 'auto_land') {
                    playBeep(2);
                } else if (currentManeuverType === 'auto_transfer') {
                    playBeep(3);
                }
            }
            prevManeuversRef.current.set(rocketId, currentManeuverType || '');
            
            // 4. Check for SAS mode changes
            const prevSASMode = prevSASModeRef.current.get(rocketId);
            const currentSASMode = rocket.sasMode || 'off';
            
            if (currentSASMode !== prevSASMode && prevSASMode !== undefined) {
                // SAS mode changed!
                playBeep(1);
            }
            prevSASModeRef.current.set(rocketId, currentSASMode);
            
            // 5. Check for low altitude warning (altitude < 5 and descending)
            if (!rocket.landedOnBodyId) {
                // Find parent body
                const parent = bodies.find(b => b.id === rocket.orbitReferenceId);
                if (parent) {
                    const dx = rocket.position.x - parent.position.x;
                    const dy = rocket.position.y - parent.position.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const altitude = distance - parent.radius;
                    
                    // Calculate radial velocity (component toward/away from parent)
                    const relVx = rocket.velocity.x - parent.velocity.x;
                    const relVy = rocket.velocity.y - parent.velocity.y;
                    const radialVelocity = (dx * relVx + dy * relVy) / distance;
                    const isDescending = radialVelocity < 0;
                    
                    const shouldBeep = altitude < 5 && isDescending;
                    const wasBeeping = lowAltitudeBeepingRef.current.get(rocketId);
                    
                    if (shouldBeep && !wasBeeping) {
                        // Start beeping
                        playBeep(1);
                        lowAltitudeBeepingRef.current.set(rocketId, true);
                    } else if (shouldBeep && wasBeeping) {
                        // Continue beeping every 0.5 seconds
                        const now = audioContextRef.current!.currentTime;
                        if (now - lastBeepTimeRef.current > 0.5) {
                            playBeep(1);
                            lastBeepTimeRef.current = now;
                        }
                    } else if (!shouldBeep && wasBeeping) {
                        // Stop beeping
                        lowAltitudeBeepingRef.current.set(rocketId, false);
                    }
                }
            } else {
                // Landed, clear beeping flag
                lowAltitudeBeepingRef.current.set(rocketId, false);
            }
        });
        
    }, [bodies]);
};
