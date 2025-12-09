import { useEffect, useRef, useMemo } from 'react';
import { Body, FlightComputerModule, FlightComputerInput, PhysicsConfig, RendezvousSolution, FlightComputerModuleType } from '../types';
import { resolveInput, resolveScalarInput, resolveBooleanInput, resolveStringInput } from '../services/orbitalMath';
import EasySpeech from 'easy-speech';
import { useMusic } from '../contexts/MusicContext';
import { formatTime } from '../components/flight_computer/utils';
import { NewBodyData } from '@/components/BuilderPanel';

export const useFlightComputerLogic = (
    modules: FlightComputerModule[],
    bodies: Body[],
    physicsConfig: PhysicsConfig,
    rendezvousPoints: RendezvousSolution[] | undefined,
    onUpdateModule: (id: string, updates: Partial<FlightComputerModule>) => void,
    onAddModule: (type: FlightComputerModuleType, inputs?: Record<string, FlightComputerInput>) => void,
    onRemoveModule: (id: string) => void,
    onToggleModule: (id: string) => void,
    fps: number,
    simulationTime: number,
    scale: number,
    onSetFollowingBody?: (bodyId: string | null) => void,
    updateRocket?: (id: string, updates: Partial<Body>) => void,
    handlePresetChange?: (preset: string) => void,
    setSpeed?: (speed: number) => void,
    setIsRunning?: (isRunning: boolean) => void,
    isRunning?: boolean,
    speed?: number,
    onReset?: () => void,
    onTimeReverse?: () => void,
    onZoom?: (factor: number) => void,
    nbColumns?: number,
    nbRows?: number,
    gap?: number,
    setNbColumns?: (nbColumns: number) => void,
    setNbRows?: (nbRows: number) => void,
    setGap?: (gap: number) => void,
    handleUpdateCandidate?: (candidate: Partial<Body>) => void,
    handleSpawnManual?: () => void,
    setCreationCandidate?: (candidate: Body | null) => void,
    createAndSpawnBody?: (name: string, mass: number, radius: number, color: string, position: { x: number, y: number }, velocity: { x: number, y: number }, description: string) => void,
) => {
    const rendezvousSolutionMap = useMemo<Record<string, RendezvousSolution>>(() => {
        const map: Record<string, RendezvousSolution> = {};
        rendezvousPoints?.forEach(point => {
            map[point.moduleId] = point;
        });
        return map;
    }, [rendezvousPoints]);

    // Helper to check if a module is effectively active
    const isModuleActive = (module: FlightComputerModule) => {
        if (!module.isEnabled) return false;
        const activateInput = module.inputs?.activate;
        if (!activateInput) return true; // Default to true if no input connected
        
        // Resolve input
        const activeSignal = resolveBooleanInput(activateInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
        
        // If input is connected but resolves to null (e.g. invalid target), default to false for safety? 
        // Or default to true? Let's default to false if signal is missing but input is defined.
        return activeSignal ?? true; 
    };

    // Audio Context for Beep Module
    const audioContextRef = useRef<AudioContext | null>(null);
    const prevBeepInputStateRef = useRef<Map<string, boolean>>(new Map());
    const lastBeepTimeRef = useRef<Map<string, number>>(new Map());
    const followModuleTriggerStateRef = useRef<Map<string, boolean>>(new Map());
    const buttonResetTriggerStateRef = useRef<Map<string, boolean>>(new Map());
    const scriptLogsRef = useRef<Map<string, string[]>>(new Map());
    const asyncScriptRunningRef = useRef<Map<string, boolean>>(new Map());
    const manualTriggerStateRef = useRef<Map<string, number>>(new Map());

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
        Array.from(manualTriggerStateRef.current.keys()).forEach(id => {
            if (!activeIds.has(id)) manualTriggerStateRef.current.delete(id);
        });
        // Note: Script logs are kept in ref to avoid re-renders, but we might want to clean up if module removed

        modules.forEach(module => {
            // Follow Module
            if (module.type === 'follow' && onSetFollowingBody) {
                const shouldFollow = isModuleActive(module);
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
            if (module.type === 'custom_script' && isModuleActive(module) && module.customScriptCode) {
                // Resolve Activate Input (Trigger)
                const triggerInput = module.inputs?.trigger;
                // Default to false if not connected
                let shouldRun = resolveBooleanInput(triggerInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap) ?? false;
                
                // Check Manual Trigger
                const lastManualTrigger = module.customScriptManualTrigger || 0;
                const prevManualTrigger = manualTriggerStateRef.current.get(module.id) || 0;
                
                if (lastManualTrigger > prevManualTrigger) {
                    shouldRun = true;
                    manualTriggerStateRef.current.set(module.id, lastManualTrigger);
                }

                // Check Continuous Run
                if (module.customScriptContinuousRun) {
                    shouldRun = true;
                }

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
                            setFollowingBody: onSetFollowingBody,
                            updateRocket: updateRocket,
                            handlePresetChange: handlePresetChange,
                            setSpeed: setSpeed,
                            setIsRunning: setIsRunning,
                            onReset: onReset,
                            onTimeReverse: onTimeReverse,
                            onZoom: onZoom,
                            setNbColumns: setNbColumns,
                            setNbRows: setNbRows,
                            setGap: setGap,
                            handleUpdateCandidate: handleUpdateCandidate,
                            handleSpawnManual: handleSpawnManual,
                            setCreationCandidate: setCreationCandidate,
                            createAndSpawnBody: createAndSpawnBody,
                        },
                        helpers: {
                            resolveInput: (input: FlightComputerInput) => resolveInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap),
                            resolveScalar: (input: FlightComputerInput) => resolveScalarInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap),
                            resolveBoolean: (input: FlightComputerInput) => resolveBooleanInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap),
                            resolveString: (input: FlightComputerInput) => resolveStringInput(input, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap),
                            formatTime: (totalSeconds: number) => formatTime(totalSeconds)
                        },
                        fps,
                        simulationTime,
                        scale,
                        isRunning,
                        speed,
                        nbColumns,
                        nbRows,
                        gap,
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
                }
            }
        });
    }, [modules, bodies, physicsConfig, onSetFollowingBody, rendezvousSolutionMap, onUpdateModule]);

    // --- Thrust Burst Logic & Audio Init ---
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
            if (module.type === 'beep' && isModuleActive(module)) {
                const input = resolveBooleanInput(module.inputs?.trigger, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
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
                        if (module.beepSoundType === 'speak' && mode !== 'continuous') {
                            const dynamicText = resolveStringInput(module.inputs?.text, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                            const textToSpeak = dynamicText || module.beepSpeakText;
                            
                            if (textToSpeak) {
                                EasySpeech.speak({
                                    text: textToSpeak,
                                    pitch: 1,
                                    rate: 1,
                                    volume: 1,
                                    boundary: e => console.debug('boundary reached')
                                }).catch(e => console.error(e));
                            }
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

    // --- Music Controller Logic ---
    const { 
        play: musicPlay, 
        pause: musicPause, 
        setVolume: setMusicVolume, 
        updatePrompt: updateMusicPrompt, 
        prompts: musicPrompts,
        playbackState: musicPlaybackState, 
        volume: musicVolumeValue,
        reverbMix,
        lowpassCutoff,
        setReverbMix,
        setLowpassCutoff
    } = useMusic();
    
    useEffect(() => {
        modules.forEach(module => {
            if (module.type === 'music_controller' && isModuleActive(module)) {
                // Inputs
                const playInput = module.inputs?.play;
                const pauseInput = module.inputs?.pause;
                const volumeInput = module.inputs?.volume;
                const reverbInput = module.inputs?.reverb_mix;
                const lowpassInput = module.inputs?.lowpass_cutoff;
                
                // Shuffle Inputs (2x prompt + weight)
                const playVal = resolveBooleanInput(playInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                const pauseVal = resolveBooleanInput(pauseInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                const volumeVal = resolveScalarInput(volumeInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                const reverbVal = resolveScalarInput(reverbInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                const lowpassVal = resolveScalarInput(lowpassInput, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);

                // Playback Control
                if (playVal && musicPlaybackState !== 'playing' && musicPlaybackState !== 'loading') {
                    musicPlay();
                } else if (pauseVal && musicPlaybackState === 'playing') {
                    musicPause();
                }

                // Volume Control (Debounced check)
                if (volumeVal !== null) {
                    if (Math.abs(volumeVal - musicVolumeValue) > 0.01) {
                        setMusicVolume(volumeVal);
                    }
                }

                // Reverb Control
                const m = module as any;
                const manualReverb = m.musicReverbMix ?? 0.35;
                const finalReverb = reverbVal !== null ? reverbVal : manualReverb;
                if (Math.abs(finalReverb - reverbMix) > 0.01) {
                    setReverbMix(finalReverb);
                }

                // Lowpass Control
                const manualLowpass = m.musicLowpassCutoff ?? 16000;
                const finalLowpass = lowpassVal !== null ? lowpassVal : manualLowpass;
                if (Math.abs(finalLowpass - lowpassCutoff) > 10) {
                    setLowpassCutoff(finalLowpass);
                }

                // Update Prompts
                const updateMPrompt = (pid: string, textIn?: FlightComputerInput, weightIn?: FlightComputerInput, fallbackText?: string, fallbackWeight?: number) => {
                     const textVal = resolveStringInput(textIn, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                     const weightVal = resolveScalarInput(weightIn, bodies, modules, physicsConfig.gravitationalConstant, rendezvousSolutionMap);
                     
                     // Prioritize dynamic input, fallback to manual
                     const finalText = textVal || fallbackText;
                     const finalWeight = weightVal !== null ? weightVal : fallbackWeight;

                     if (musicPrompts.has(pid)) {
                         const p = musicPrompts.get(pid)!;
                         const updates: Partial<typeof p> = {};
                         
                         if (finalText && finalText !== p.text) updates.text = finalText;
                         
                         if (finalWeight !== undefined && finalWeight !== null && typeof finalWeight === 'number') {
                             if (Math.abs(finalWeight - p.weight) > 0.01) {
                                 updates.weight = finalWeight;
                             }
                         }
                         
                         if (Object.keys(updates).length > 0) {
                             updateMusicPrompt(pid, updates);
                         }
                     }
                };

                // Handle 4 channels
                [0, 1, 2, 3].forEach(i => {
                    const tInput = module.inputs?.[`prompt_text_${i}`];
                    const wInput = module.inputs?.[`prompt_weight_${i}`];
                    // Use type assertion or access via index if TS complains about dynamic access on type
                    const m = module as any;
                    const manualText = m[`musicPromptText${i}`];
                    const manualWeight = m[`musicPromptWeight${i}`];
                    
                    updateMPrompt(`prompt-${i}`, tInput, wInput, manualText, manualWeight);
                });

                // Update Module Outputs (State Feedback)
                const isPlaying = musicPlaybackState === 'playing';
                const currentVol = musicVolumeValue;
                
                const stateChanged = module.musicPlaying !== isPlaying;
                const volChanged = module.musicVolume === undefined || Math.abs(module.musicVolume - currentVol) > 0.001;

                if (stateChanged || volChanged) {
                    onUpdateModule(module.id, {
                        musicPlaying: isPlaying,
                        musicVolume: currentVol
                    });
                }
            }
        });
    }, [modules, bodies, physicsConfig, rendezvousSolutionMap, musicPlaybackState, musicVolumeValue, musicPrompts, musicPlay, musicPause, setMusicVolume, updateMusicPrompt, onUpdateModule]);

    return {
        rendezvousSolutionMap,
        isModuleActive,
        followModuleTriggerStateRef
    };
};
