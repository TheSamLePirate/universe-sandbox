import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Plus, RotateCcw, Settings, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { GoogleGenAI, LiveMusicGenerationConfig, LiveMusicSession, LiveMusicServerMessage } from '@google/genai';
import { decode, decodeAudioData } from '../utils/audioUtils';

// --- Types ---

interface Prompt {
    promptId: string;
    color: string;
    text: string;
    weight: number;
}

type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

const PROMPT_TEXT_PRESETS = [
    'Loud Motor Noise', 'Reverb', 'Lo-Fi', 'Etheral',
    'Deep Cello', 'Piano', 'Hans Zimmer', 'Clean warm Electric Guitars', 'Interstellar travel'
];

const COLORS = [
    '#9900ff', '#5200ff', '#ff25f6', '#2af6de',
    '#ffdd28', '#3dffab', '#d8ff3e', '#d9b2ff',
];

function getUnusedRandomColor(usedColors: string[]): string {
    const availableColors = COLORS.filter((c) => !usedColors.includes(c));
    if (availableColors.length === 0) {
        return COLORS[Math.floor(Math.random() * COLORS.length)];
    }
    return availableColors[Math.floor(Math.random() * availableColors.length)];
}

function throttle(func: (...args: any[]) => void, delay: number) {
    let lastCall = 0;
    return (...args: any[]) => {
        const now = Date.now();
        if (now - lastCall >= delay) {
            func(...args);
            lastCall = now;
        }
    };
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function createImpulseResponse(
    ctx: AudioContext,
    duration = 2.5,
    decay = 2.5,
    dampFrequency = 6000
) {
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * duration));
    const impulse = ctx.createBuffer(2, length, rate);
    const damp = clamp(dampFrequency, 50, rate / 2);
    const dampCoefficient = Math.exp(-1 / (rate / damp));

    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
        const channelData = impulse.getChannelData(channel);
        let previous = 0;
        for (let i = 0; i < length; i++) {
            const noise = Math.random() * 2 - 1;
            previous = noise + dampCoefficient * previous;
            const envelope = Math.pow(1 - i / length, decay);
            channelData[i] = previous * envelope;
        }
    }

    return impulse;
}

// --- Sub-Components ---

const WeightSlider: React.FC<{
    value: number;
    color: string;
    onChange: (value: number) => void;
}> = ({ value, color, onChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.preventDefault();
        setIsDragging(true);
        updateValue(e.clientY);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (isDragging) {
            updateValue(e.clientY);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    };

    const updateValue = (clientY: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const relativeY = clientY - rect.top;
        const normalized = 1 - Math.max(0, Math.min(rect.height, relativeY)) / rect.height;
        onChange(normalized * 2);
    };

    return (
        <div 
            className="flex flex-col items-center h-full w-full cursor-ns-resize py-1"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <div ref={containerRef} className="relative w-2 bg-slate-800/50 rounded-full h-full">
                <div 
                    className="absolute bottom-0 left-0 w-full rounded-full shadow-[0_0_5px_rgba(0,0,0,0.5)] transition-all duration-75"
                    style={{ 
                        height: `${(value / 2) * 100}%`, 
                        backgroundColor: color,
                        opacity: value > 0.01 ? 1 : 0
                    }}
                />
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-mono select-none">
                {value.toFixed(2)}
            </div>
        </div>
    );
};

const PromptItem: React.FC<{
    prompt: Prompt;
    isFiltered: boolean;
    onUpdate: (id: string, updates: Partial<Prompt>) => void;
    onRemove: (id: string) => void;
}> = ({ prompt, isFiltered, onUpdate, onRemove }) => {
    return (
        <div className={`
            relative flex flex-col items-center w-32 h-64 bg-slate-800/80 backdrop-blur-sm rounded-lg border 
            transition-colors duration-300 shrink-0
            ${isFiltered ? 'border-red-500/50 bg-red-900/10' : 'border-slate-700 hover:border-slate-600'}
        `}>
            <button 
                onClick={() => onRemove(prompt.promptId)}
                className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-700/50 text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors z-10"
            >
                <X size={12} />
            </button>
            
            <div className="flex-1 w-full px-4 py-2">
                <WeightSlider 
                    value={prompt.weight} 
                    color={prompt.color} 
                    onChange={(w) => onUpdate(prompt.promptId, { weight: w })} 
                />
            </div>

            <div className="w-full p-2 bg-slate-900/50 rounded-b-lg border-t border-slate-700/50">
                <div 
                    contentEditable
                    suppressContentEditableWarning
                    className="w-full text-center text-xs text-slate-200 bg-transparent outline-none break-words min-h-[1.5em]"
                    onBlur={(e) => {
                        const text = e.currentTarget.textContent?.trim();
                        if (text && text !== prompt.text) {
                            onUpdate(prompt.promptId, { text });
                        } else if (!text) {
                            e.currentTarget.textContent = prompt.text;
                        }
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                        }
                    }}
                >
                    {prompt.text}
                </div>
            </div>
        </div>
    );
};

// --- Main Component ---

interface MusicPanelProps {
    apiKey: string;
    onClose: () => void;
}

const MusicPanel: React.FC<MusicPanelProps> = ({ apiKey, onClose }) => {
    // State
    const [prompts, setPrompts] = useState<Map<string, Prompt>>(() => {
        // Initial prompts logic
        const map = new Map<string, Prompt>();
        const numDefault = 4;
        const shuffled = [...PROMPT_TEXT_PRESETS].sort(() => Math.random() - 0.5);
        const usedColors: string[] = [];
        
        for(let i=0; i<numDefault; i++) {
            const color = getUnusedRandomColor(usedColors);
            usedColors.push(color);
            map.set(`prompt-${i}`, {
                promptId: `prompt-${i}`,
                text: shuffled[i],
                weight: i < 2 ? 1 : 0, // Activate first 2
                color
            });
        }
        return map;
    });

    const [config, setConfig] = useState<LiveMusicGenerationConfig>({
        temperature: 0.5,
        topK: 40,
        guidance: 6.0,
        // musicGenerationMode: 'QUALITY' as any,
        seed: 312,
        bpm: 90,
        density: undefined,
        brightness: undefined,
        scale: 'C_MAJOR_A_MINOR' as any,
        muteBass: false,
        muteDrums: false,
        onlyBassAndDrums: false,
    });

    const [autoDensity, setAutoDensity] = useState(true);
    const [autoBrightness, setAutoBrightness] = useState(true);
    const [lastDefinedDensity, setLastDefinedDensity] = useState<number | undefined>(undefined);
    const [lastDefinedBrightness, setLastDefinedBrightness] = useState<number | undefined>(undefined);

    const [playbackState, _setPlaybackState] = useState<PlaybackState>('stopped');
    const playbackStateRef = useRef<PlaybackState>('stopped');

    const setPlaybackState = (state: PlaybackState) => {
        _setPlaybackState(state);
        playbackStateRef.current = state;
    };
    const [filteredPrompts, setFilteredPrompts] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{msg: string, type: 'error' | 'info'} | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [volume, setVolume] = useState(0.8);
    const [reverbMix, setReverbMix] = useState(0.35);
    const [reverbDecay, setReverbDecay] = useState(2.5);
    const [reverbPreDelay, setReverbPreDelay] = useState(0.08);
    const [reverbDamp, setReverbDamp] = useState(6000);
    const [lowpassCutoff, setLowpassCutoff] = useState(16000);
    
    // Refs for audio engine
    const sessionRef = useRef<LiveMusicSession | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const nextStartTimeRef = useRef(0);
    const outputNodeRef = useRef<GainNode | null>(null);
    const volumeRef = useRef(0.8);
    const reverbMixRef = useRef(0.35);
    const reverbDecayRef = useRef(2.5);
    const reverbPreDelayRef = useRef(0.08);
    const reverbDampRef = useRef(6000);
    const lowpassCutoffRef = useRef(16000);
    const reverbNodeRef = useRef<ConvolverNode | null>(null);
    const reverbGainRef = useRef<GainNode | null>(null);
    const dryGainRef = useRef<GainNode | null>(null);
    const filterNodeRef = useRef<BiquadFilterNode | null>(null);
    const reverbPreDelayNodeRef = useRef<DelayNode | null>(null);
    const reverbTailFilterRef = useRef<BiquadFilterNode | null>(null);
    const reverbImpulseRef = useRef<AudioBuffer | null>(null);
    const reverbImpulseTimeoutRef = useRef<number | null>(null);
    const bufferTime = 2; // seconds

    const setupAudioGraph = (ctx: AudioContext) => {
        const impulse = createImpulseResponse(ctx, reverbDecayRef.current, reverbDecayRef.current * 1.2, reverbDampRef.current);
        reverbImpulseRef.current = impulse;

        const outputGain = ctx.createGain();
        outputGain.gain.setValueAtTime(volumeRef.current, ctx.currentTime);

        const dryGain = ctx.createGain();
        dryGain.gain.setValueAtTime(1 - reverbMixRef.current, ctx.currentTime);

        const reverbGain = ctx.createGain();
        reverbGain.gain.setValueAtTime(reverbMixRef.current, ctx.currentTime);

        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(lowpassCutoffRef.current, ctx.currentTime);
        filterNode.Q.setValueAtTime(10, ctx.currentTime);

        const reverbSend = ctx.createGain();
        reverbSend.gain.setValueAtTime(1, ctx.currentTime);

        const preDelay = ctx.createDelay(1);
        preDelay.delayTime.setValueAtTime(reverbPreDelayRef.current, ctx.currentTime);

        const reverbNode = ctx.createConvolver();
        reverbNode.buffer = impulse;

        const tailFilter = ctx.createBiquadFilter();
        tailFilter.type = 'lowpass';
        tailFilter.frequency.setValueAtTime(reverbDampRef.current, ctx.currentTime);
        tailFilter.Q.setValueAtTime(0.7, ctx.currentTime);

        filterNode.connect(dryGain);
        filterNode.connect(reverbSend);
        reverbSend.connect(preDelay);
        preDelay.connect(reverbNode);
        reverbNode.connect(tailFilter);
        tailFilter.connect(reverbGain);
        dryGain.connect(outputGain);
        reverbGain.connect(outputGain);
        outputGain.connect(ctx.destination);

        outputNodeRef.current = outputGain;
        dryGainRef.current = dryGain;
        reverbGainRef.current = reverbGain;
        filterNodeRef.current = filterNode;
        reverbNodeRef.current = reverbNode;
        reverbPreDelayNodeRef.current = preDelay;
        reverbTailFilterRef.current = tailFilter;
    };

    const rebuildReverbImpulse = (options?: { immediate?: boolean }) => {
        const ctx = audioContextRef.current;
        if (!ctx || !reverbNodeRef.current || !reverbGainRef.current) return;

        const impulse = createImpulseResponse(ctx, reverbDecayRef.current, reverbDecayRef.current * 1.2, reverbDampRef.current);
        reverbImpulseRef.current = impulse;

        const wetGain = reverbGainRef.current.gain;
        const targetGain = reverbMixRef.current;
        const applyImpulse = () => {
            if (!reverbNodeRef.current || !audioContextRef.current) return;
            const currentCtx = audioContextRef.current;
            const now = currentCtx.currentTime;
            reverbNodeRef.current.buffer = impulse;
            wetGain.cancelScheduledValues(now);
            wetGain.setValueAtTime(0, now);
            wetGain.linearRampToValueAtTime(targetGain, now + 0.1);
        };

        if (options?.immediate) {
            applyImpulse();
            return;
        }

        const now = ctx.currentTime;
        wetGain.cancelScheduledValues(now);
        wetGain.linearRampToValueAtTime(0, now + 0.05);

        window.setTimeout(() => {
            applyImpulse();
        }, 60);
    };

    const scheduleReverbImpulseRebuild = () => {
        if (reverbImpulseTimeoutRef.current !== null) {
            window.clearTimeout(reverbImpulseTimeoutRef.current);
        }
        reverbImpulseTimeoutRef.current = window.setTimeout(() => {
            reverbImpulseTimeoutRef.current = null;
            rebuildReverbImpulse();
        }, 180);
    };

    // Initialize Audio Context lazily
    const getAudioContext = () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
            setupAudioGraph(audioContextRef.current);
        } else if (!outputNodeRef.current && audioContextRef.current) {
            setupAudioGraph(audioContextRef.current);
        }
        return audioContextRef.current;
    };

    // Connection Logic
    const connectToSession = async () => {
        if (!apiKey) {
            setToast({ msg: "API Key missing. Please set it in Settings.", type: 'error' });
            return;
        }else{
            console.log("API Key: ", apiKey);
        }

        try {
            console.log("Starting connection to Google GenAI...");
            const client = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
            const session = await client.live.music.connect({
                model: 'lyria-realtime-exp',
                callbacks: {
                    onmessage: async (e: LiveMusicServerMessage) => {
                        if (e.filteredPrompt) {
                            setFilteredPrompts(prev => new Set([...prev, e.filteredPrompt!.text]));
                            setToast({ msg: `Prompt filtered: ${e.filteredPrompt.filteredReason}`, type: 'info' });
                        }
                        
                        

                        if (e.serverContent?.audioChunks) {
                            if (playbackStateRef.current === 'paused' || playbackStateRef.current === 'stopped') return;
                            
                            try {
                                const ctx = getAudioContext();
                                if (ctx.state === 'suspended') {
                                    await ctx.resume();
                                }
                                
                                const decodedData = decode(e.serverContent.audioChunks[0].data);

                                if (decodedData.length % 2 !== 0) {
                                    console.error("Error: Audio data length is not a multiple of 2 (Int16 alignment issue). Length:", decodedData.length);
                                    // Optional: Pad with one zero byte?
                                    // const padded = new Uint8Array(decodedData.length + 1);
                                    // padded.set(decodedData);
                                    // decodedData = padded;
                                    return; 
                                }

                                const audioBuffer = await decodeAudioData(
                                    decodedData,
                                    ctx,
                                    48000,
                                    2
                                );
                                
                                const source = ctx.createBufferSource();
                                source.buffer = audioBuffer;
                                const targetNode = filterNodeRef.current ?? outputNodeRef.current;
                                source.connect(targetNode!);
                                
                                if (nextStartTimeRef.current === 0) {
                                    nextStartTimeRef.current = ctx.currentTime + bufferTime;
                                    setTimeout(() => {
                                        setPlaybackState('playing');
                                    }, bufferTime * 1000);
                                }

                                if (nextStartTimeRef.current < ctx.currentTime) {
                                    console.warn('Audio underrun', nextStartTimeRef.current, ctx.currentTime);
                                    setPlaybackState('loading');
                                    nextStartTimeRef.current = 0; // Reset buffer
                                    return;
                                }

                                source.start(nextStartTimeRef.current);
                                nextStartTimeRef.current += audioBuffer.duration;
                            } catch (error) {
                                console.error("Error processing audio chunk:", error);
                            }
                        } else {
                            console.log("Message does not contain audio chunks:", e);
                        }
                    },
                    onerror: (e: any) => {
                        console.error("Session error:", e);
                        setToast({ msg: "Connection error. Please restart.", type: 'error' });
                        stopAudio();
                    },
                    onclose: () => {
                        console.log("Session closed");
                        setPlaybackState('stopped');
                    }
                }
            });
            sessionRef.current = session;
            await updateSessionPrompts();
        } catch (err: any) {
            console.error("Connection failed:", err);
            setToast({ msg: `Connection failed: ${err.message}`, type: 'error' });
            setPlaybackState('stopped');
        }
    };

    const updateSessionPrompts = useCallback(throttle(async () => {
        if (!sessionRef.current) {
            console.log("Skipping prompt update: No active session");
            return;
        }
        
        const promptsToSend = Array.from(prompts.values())
            .filter(p => !filteredPrompts.has(p.text) && p.weight !== 0)
            .map(p => ({ text: p.text, weight: p.weight }));


        try {
            await sessionRef.current.setWeightedPrompts({ weightedPrompts: promptsToSend });
        } catch (e: any) {
            console.error("Failed to update prompts:", e);
        }
    }, 200), [prompts, filteredPrompts]);

    // Effects
    useEffect(() => {
        updateSessionPrompts();
    }, [prompts, updateSessionPrompts]);

    useEffect(() => {
        if (sessionRef.current) {
            sessionRef.current.setMusicGenerationConfig({ musicGenerationConfig: config });
        }
    }, [config]);

    useEffect(() => {
        return () => {
            if (reverbImpulseTimeoutRef.current !== null) {
                window.clearTimeout(reverbImpulseTimeoutRef.current);
            }
        };
    }, []);

    // Handlers
    const handleVolumeChange = (value: number) => {
        const clamped = clamp(value, 0, 1);
        setVolume(clamped);
        volumeRef.current = clamped;

        if (outputNodeRef.current && audioContextRef.current) {
            const ctx = audioContextRef.current;
            outputNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
            outputNodeRef.current.gain.setValueAtTime(clamped, ctx.currentTime);
        }
    };

    const handleReverbChange = (value: number) => {
        const clamped = clamp(value, 0, 1);
        setReverbMix(clamped);
        reverbMixRef.current = clamped;

        if (audioContextRef.current && dryGainRef.current && reverbGainRef.current) {
            const ctx = audioContextRef.current;
            dryGainRef.current.gain.setValueAtTime(1 - clamped, ctx.currentTime);
            reverbGainRef.current.gain.setValueAtTime(clamped, ctx.currentTime);
        }
    };

    const handleReverbDecayChange = (value: number) => {
        const clamped = clamp(value, 0.5, 10);
        setReverbDecay(clamped);
        reverbDecayRef.current = clamped;
        scheduleReverbImpulseRebuild();
    };

    const handleReverbPreDelayChange = (value: number) => {
        const clamped = clamp(value, 0, 0.5);
        setReverbPreDelay(clamped);
        reverbPreDelayRef.current = clamped;

        if (audioContextRef.current && reverbPreDelayNodeRef.current) {
            const ctx = audioContextRef.current;
            const param = reverbPreDelayNodeRef.current.delayTime;
            param.cancelScheduledValues(ctx.currentTime);
            param.linearRampToValueAtTime(clamped, ctx.currentTime + 0.08);
        }
    };

    const handleReverbDampChange = (value: number) => {
        const clamped = clamp(value, 1000, 12000);
        setReverbDamp(clamped);
        reverbDampRef.current = clamped;

        if (audioContextRef.current && reverbTailFilterRef.current) {
            const ctx = audioContextRef.current;
            const param = reverbTailFilterRef.current.frequency;
            param.cancelScheduledValues(ctx.currentTime);
            param.linearRampToValueAtTime(clamped, ctx.currentTime + 0.1);
        }
        scheduleReverbImpulseRebuild();
    };

    const handleLowpassChange = (value: number) => {
        const clamped = clamp(value, 200, 20000);
        setLowpassCutoff(clamped);
        lowpassCutoffRef.current = clamped;

        if (audioContextRef.current && filterNodeRef.current) {
            const ctx = audioContextRef.current;
            filterNodeRef.current.frequency.setValueAtTime(clamped, ctx.currentTime);
        }
    };

    const handlePlayPause = async () => {
        const ctx = getAudioContext();
        
        if (playbackState === 'playing') {
            sessionRef.current?.pause();
            setPlaybackState('paused');
            // Fade out
            const currentVolume = volumeRef.current;
            outputNodeRef.current?.gain.setValueAtTime(currentVolume, ctx.currentTime);
            outputNodeRef.current?.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
            nextStartTimeRef.current = 0;

        } else if (playbackState === 'paused' || playbackState === 'stopped') {
            if (!sessionRef.current) {
                await connectToSession();
            }
            
            if (ctx.state === 'suspended') await ctx.resume();
            
            sessionRef.current?.play();
            setPlaybackState('loading');
            
            // Fade in
            outputNodeRef.current?.gain.setValueAtTime(0, ctx.currentTime);
            outputNodeRef.current?.gain.linearRampToValueAtTime(volumeRef.current, ctx.currentTime + 0.1);
        }
    };

    const handleReset = async () => {
        if (!sessionRef.current) await connectToSession();
        
        sessionRef.current?.pause();
        sessionRef.current?.resetContext();
        sessionRef.current?.setMusicGenerationConfig({ musicGenerationConfig: {} });
        
        // Reset local config to defaults if needed, or just keep current UI state
        // For now, let's just reset the session context
        
        setTimeout(() => {
            handlePlayPause(); // Restart
        }, 100);
    };

    const stopAudio = () => {
        sessionRef.current?.stop();
        setPlaybackState('stopped');
        nextStartTimeRef.current = 0;
    };

    const addPrompt = () => {
        const id = `prompt-${Date.now()}`;
        const usedColors = Array.from(prompts.values()).map(p => p.color);
        setPrompts(prev => {
            const next = new Map(prev);
            next.set(id, {
                promptId: id,
                text: 'New Prompt',
                weight: 0,
                color: getUnusedRandomColor(usedColors)
            });
            return next;
        });
    };

    const removePrompt = (id: string) => {
        setPrompts(prev => {
            const next = new Map(prev);
            next.delete(id);
            return next;
        });
    };

    const updatePrompt = (id: string, updates: Partial<Prompt>) => {
        setPrompts(prev => {
            const next = new Map(prev);
            const p = next.get(id);
            if (p) {
                next.set(id, { ...p, ...updates });
            }
            return next;
        });
    };

    // Render Helpers
    const getBackgroundGradient = () => {
        const activePrompts = Array.from(prompts.values());
        if (activePrompts.length === 0) return 'none';

        const stops = activePrompts.map((p, i) => {
            const alpha = Math.min(Math.max(p.weight / 0.5, 0), 1) * 0.6;
            const stop = p.weight / 2;
            const x = (i % 4) / 3 * 100;
            const y = Math.floor(i / 4) / 3 * 100;
            return `radial-gradient(circle at ${x}% ${y}%, ${p.color}${Math.round(alpha * 255).toString(16).padStart(2, '0')} 0px, ${p.color}00 ${stop * 100}%)`;
        });
        
        return stops.join(', ');
    };

    const formatFrequencyLabel = (value: number) => {
        if (value >= 1000) {
            return `${(value / 1000).toFixed(1)} kHz`;
        }
        return `${Math.round(value)} Hz`;
    };

    return (
        <div className="absolute bottom-0 left-0 right-0 h-[350px] bg-slate-900/95 backdrop-blur-md border-t border-slate-700 z-40 flex flex-col transition-all duration-300">
            {/* Background Effects */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-30 transition-opacity duration-1000"
                style={{ backgroundImage: getBackgroundGradient() }}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700 bg-slate-800/50 shrink-0">
                <div className="flex items-center gap-2 text-slate-200 font-bold">
                    <Volume2 size={18} className="text-purple-400" />
                    <span>AI Music Generator</span>
                    <span className="text-xs font-normal text-slate-500 ml-2 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Experimental</span>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                    >
                        <Settings size={18} />
                    </button>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Prompts Scroll Area */}
                <div className="flex-1 overflow-x-auto custom-scrollbar p-4 flex items-end gap-4">
                    {Array.from(prompts.values()).map(p => (
                        <PromptItem 
                            key={p.promptId} 
                            prompt={p} 
                            isFiltered={filteredPrompts.has(p.text)}
                            onUpdate={updatePrompt}
                            onRemove={removePrompt}
                        />
                    ))}
                    
                    <button 
                        onClick={addPrompt}
                        className="h-64 w-16 shrink-0 border-2 border-dashed border-slate-700 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:border-slate-500 hover:bg-slate-800/50 transition-all"
                    >
                        <Plus size={24} />
                    </button>
                </div>

                {/* Settings Sidebar (Overlay) */}
                {showSettings && (
                    <div className="absolute right-0 top-0 bottom-0 w-64 bg-slate-900/95 border-l border-slate-700 p-4 overflow-y-auto z-20 shadow-xl backdrop-blur-xl">
                        <h3 className="text-sm font-bold text-slate-300 mb-4">Generation Settings</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-xs mb-1 text-slate-400">
                                    <span>Temperature</span>
                                    <span>{config.temperature?.toFixed(1)}</span>
                                </div>
                                <input 
                                    type="range" min="0" max="2" step="0.1"
                                    value={config.temperature}
                                    onChange={(e) => setConfig(prev => ({ ...prev, temperature: Number(e.target.value) }))}
                                    className="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                                />
                            </div>
                            
                            <div>
                                <div className="flex justify-between text-xs mb-1 text-slate-400">
                                    <span>Guidance</span>
                                    <span>{config.guidance?.toFixed(1)}</span>
                                </div>
                                <input 
                                    type="range" min="0" max="10" step="0.5"
                                    value={config.guidance}
                                    onChange={(e) => setConfig(prev => ({ ...prev, guidance: Number(e.target.value) }))}
                                    className="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                                />
                            </div>

                            <div>
                                <div className="flex justify-between text-xs mb-1 text-slate-400">
                                    <span>Top K</span>
                                    <span>{config.topK}</span>
                                </div>
                                <input 
                                    type="range" min="1" max="100" step="1"
                                    value={config.topK}
                                    onChange={(e) => setConfig(prev => ({ ...prev, topK: Number(e.target.value) }))}
                                    className="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                                />
                            </div>

                            <div className="pt-2 border-t border-slate-700 space-y-4">
                                {/* Seed */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1 text-slate-400">
                                        <span>Seed</span>
                                    </div>
                                    <input 
                                        type="number"
                                        placeholder="Auto"
                                        value={config.seed ?? ''}
                                        onChange={(e) => setConfig(prev => ({ ...prev, seed: e.target.value ? Number(e.target.value) : undefined }))}
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                    />
                                </div>

                                {/* BPM */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1 text-slate-400">
                                        <span>BPM (60-180)</span>
                                    </div>
                                    <input 
                                        type="number"
                                        min="60" max="180"
                                        placeholder="Auto"
                                        value={config.bpm ?? ''}
                                        onChange={(e) => setConfig(prev => ({ ...prev, bpm: e.target.value ? Number(e.target.value) : undefined }))}
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                    />
                                </div>

                                {/* Density */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1 text-slate-400">
                                        <span>Density</span>
                                        <div className="flex items-center gap-2">
                                            <label className="flex items-center gap-1 cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={autoDensity}
                                                    onChange={(e) => {
                                                        const isAuto = e.target.checked;
                                                        setAutoDensity(isAuto);
                                                        setConfig(prev => ({ ...prev, density: isAuto ? undefined : lastDefinedDensity ?? 0.5 }));
                                                    }}
                                                    className="rounded border-slate-600 bg-slate-800 text-purple-500"
                                                />
                                                <span>Auto</span>
                                            </label>
                                            {!autoDensity && <span>{(config.density ?? 0.5).toFixed(2)}</span>}
                                        </div>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.05"
                                        disabled={autoDensity}
                                        value={config.density ?? 0.5}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setLastDefinedDensity(val);
                                            setConfig(prev => ({ ...prev, density: val }));
                                        }}
                                        className={`w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none ${autoDensity ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    />
                                </div>

                                {/* Brightness */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1 text-slate-400">
                                        <span>Brightness</span>
                                        <div className="flex items-center gap-2">
                                            <label className="flex items-center gap-1 cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={autoBrightness}
                                                    onChange={(e) => {
                                                        const isAuto = e.target.checked;
                                                        setAutoBrightness(isAuto);
                                                        setConfig(prev => ({ ...prev, brightness: isAuto ? undefined : lastDefinedBrightness ?? 0.5 }));
                                                    }}
                                                    className="rounded border-slate-600 bg-slate-800 text-purple-500"
                                                />
                                                <span>Auto</span>
                                            </label>
                                            {!autoBrightness && <span>{(config.brightness ?? 0.5).toFixed(2)}</span>}
                                        </div>
                                    </div>
                                    <input 
                                        type="range" min="0" max="1" step="0.05"
                                        disabled={autoBrightness}
                                        value={config.brightness ?? 0.5}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            setLastDefinedBrightness(val);
                                            setConfig(prev => ({ ...prev, brightness: val }));
                                        }}
                                        className={`w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none ${autoBrightness ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    />
                                </div>

                                {/* Scale */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1 text-slate-400">
                                        <span>Scale</span>
                                    </div>
                                    <select
                                        value={config.scale ?? ''}
                                        onChange={(e) => setConfig(prev => ({ ...prev, scale: (e.target.value || undefined) as any }))}
                                        className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:border-purple-500 outline-none"
                                    >
                                        <option value="">Auto</option>
                                        <option value="C_MAJOR_A_MINOR">C Major / A Minor</option>
                                        <option value="D_FLAT_MAJOR_B_FLAT_MINOR">C# Major / A# Minor</option>
                                        <option value="D_MAJOR_B_MINOR">D Major / B Minor</option>
                                        <option value="E_FLAT_MAJOR_C_MINOR">D# Major / C Minor</option>
                                        <option value="E_MAJOR_D_FLAT_MINOR">E Major / C# Minor</option>
                                        <option value="F_MAJOR_D_MINOR">F Major / D Minor</option>
                                        <option value="G_FLAT_MAJOR_E_FLAT_MINOR">F# Major / D# Minor</option>
                                        <option value="G_MAJOR_E_MINOR">G Major / E Minor</option>
                                        <option value="A_FLAT_MAJOR_F_MINOR">G# Major / F Minor</option>
                                        <option value="A_MAJOR_G_FLAT_MINOR">A Major / F# Minor</option>
                                        <option value="B_FLAT_MAJOR_G_MINOR">A# Major / G Minor</option>
                                        <option value="B_MAJOR_A_FLAT_MINOR">B Major / G# Minor</option>
                                    </select>
                                </div>

                                {/* Toggles */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                        <input 
                                            type="checkbox"
                                            checked={!!config.muteBass}
                                            onChange={(e) => setConfig(prev => ({ ...prev, muteBass: e.target.checked }))}
                                            className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                                        />
                                        Mute Bass
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                        <input 
                                            type="checkbox"
                                            checked={!!config.muteDrums}
                                            onChange={(e) => setConfig(prev => ({ ...prev, muteDrums: e.target.checked }))}
                                            className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                                        />
                                        Mute Drums
                                    </label>
                                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                                        <input 
                                            type="checkbox"
                                            checked={!!config.onlyBassAndDrums}
                                            onChange={(e) => setConfig(prev => ({ ...prev, onlyBassAndDrums: e.target.checked }))}
                                            className="rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500"
                                        />
                                        Only Bass & Drums
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Controls Footer */}
            <div className="p-4 bg-slate-800/30 border-t border-slate-700 flex flex-wrap justify-center items-center gap-6 shrink-0">
                <button 
                    onClick={handleReset}
                    className="p-3 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all border border-slate-600"
                    title="Reset Context"
                >
                    <RotateCcw size={20} />
                </button>

                <div className="flex items-center gap-2 text-slate-300 min-w-[200px]">
                    {volume <= 0.01 ? (
                        <VolumeX size={18} className="text-slate-500" />
                    ) : (
                        <Volume2 size={18} className="text-purple-300" />
                    )}
                    <input 
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={volume}
                        onChange={(e) => handleVolumeChange(Number(e.target.value))}
                        className="w-36 accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                    />
                    <span className="text-xs w-10 text-right">{Math.round(volume * 100)}%</span>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-300 max-w-[760px]">
                    <div className="flex flex-col gap-1 w-40">
                        <div className="flex justify-between">
                            <span>Reverb Mix</span>
                            <span>{Math.round(reverbMix * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={reverbMix}
                            onChange={(e) => handleReverbChange(Number(e.target.value))}
                            className="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                        />
                    </div>

                    <div className="flex flex-col gap-1 w-40">
                        <div className="flex justify-between">
                            <span>Decay</span>
                            <span>{reverbDecay.toFixed(1)}s</span>
                        </div>
                        <input
                            type="range"
                            min="0.5"
                            max="10"
                            step="0.1"
                            value={reverbDecay}
                            onChange={(e) => handleReverbDecayChange(Number(e.target.value))}
                            className="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                        />
                    </div>

                    <div className="flex flex-col gap-1 w-40">
                        <div className="flex justify-between">
                            <span>Pre-delay</span>
                            <span>{Math.round(reverbPreDelay * 1000)}ms</span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="0.5"
                            step="0.01"
                            value={reverbPreDelay}
                            onChange={(e) => handleReverbPreDelayChange(Number(e.target.value))}
                            className="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                        />
                    </div>

                    <div className="flex flex-col gap-1 w-48">
                        <div className="flex justify-between">
                            <span>Tail Damping</span>
                            <span>{formatFrequencyLabel(reverbDamp)}</span>
                        </div>
                        <input
                            type="range"
                            min="1000"
                            max="12000"
                            step="100"
                            value={reverbDamp}
                            onChange={(e) => handleReverbDampChange(Number(e.target.value))}
                            className="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                        />
                    </div>

                    <div className="flex flex-col gap-1 w-48">
                        <div className="flex justify-between">
                            <span>Low-pass</span>
                            <span>{formatFrequencyLabel(lowpassCutoff)}</span>
                        </div>
                        <input
                            type="range"
                            min="200"
                            max="20000"
                            step="100"
                            value={lowpassCutoff}
                            onChange={(e) => handleLowpassChange(Number(e.target.value))}
                            className="w-full accent-purple-500 bg-slate-700 h-1 rounded-lg appearance-none"
                        />
                    </div>
                </div>

                <button 
                    onClick={handlePlayPause}
                    className={`
                        p-4 rounded-full transition-all shadow-lg flex items-center justify-center
                        ${playbackState === 'playing' 
                            ? 'bg-slate-700 text-white hover:bg-slate-600 border border-slate-500' 
                            : 'bg-purple-600 text-white hover:bg-purple-500 hover:scale-105 border border-purple-400'
                        }
                    `}
                >
                    {playbackState === 'playing' ? <Pause size={24} fill="currentColor" /> : 
                     playbackState === 'loading' ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> :
                     <Play size={24} fill="currentColor" className="ml-1" />}
                </button>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`
                    absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 z-50
                    ${toast.type === 'error' ? 'bg-red-900/90 text-red-100 border border-red-700' : 'bg-slate-800/90 text-slate-200 border border-slate-600'}
                `}>
                    {toast.type === 'error' && <AlertTriangle size={16} />}
                    {toast.msg}
                    <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100"><X size={14} /></button>
                </div>
            )}
        </div>
    );
};

export default MusicPanel;
