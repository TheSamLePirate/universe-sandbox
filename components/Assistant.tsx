

import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, AssistantActions, Body, VisualConfig, PhysicsConfig } from '../types';
import { createChatSession, generateSpeech } from '../services/geminiService';
import { Sparkles, Send, User, Bot, Wrench, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Chat, GenerateContentResponse } from "@google/genai";

interface AssistantProps {
  selectedBodyName: string | null;
  actions: AssistantActions;
  bodies: Body[]; // For context awareness
}

const Assistant: React.FC<AssistantProps> = ({ selectedBodyName, actions, bodies }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: "I am Cosmos. I can control the simulation. Ask me to create planets, change speed, toggle effects, or explain gravity!" }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  // Speech Recognition
  const recognitionRef = useRef<any>(null);
  const retryCount = useRef(0);
  
  // Keep chat session persistent
  const chatSession = useRef<Chat | null>(null);

  // Initialize Chat
  useEffect(() => {
    if (!chatSession.current) {
        chatSession.current = createChatSession(messages);
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // --- AUDIO VISUALIZATION ---
  const visualizeAudio = () => {
      const canvas = canvasRef.current;
      const analyser = analyserRef.current;
      if (!canvas || !analyser) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
          if (!isSpeaking) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              return;
          }
          animationFrameRef.current = requestAnimationFrame(draw);
          analyser.getByteFrequencyData(dataArray);

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barWidth = (canvas.width / bufferLength) * 2.5;
          let barHeight;
          let x = 0;

          for (let i = 0; i < bufferLength; i++) {
              barHeight = dataArray[i] / 2;
              ctx.fillStyle = `rgb(${barHeight + 100}, 50, 255)`;
              ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
              x += barWidth + 1;
          }
      };
      draw();
  };

  useEffect(() => {
      if (!isSpeaking) {
          if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
          const ctx = canvasRef.current?.getContext('2d');
          ctx?.clearRect(0, 0, 100, 30);
      } else {
          visualizeAudio();
      }
  }, [isSpeaking]);

  const playAudio = async (base64Audio: string) => {
    if (isMuted) return;
    try {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') await ctx.resume();

        // Decode Base64
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Convert raw PCM to AudioBuffer
        // Gemini returns PCM 24kHz mono (usually)
        const dataInt16 = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(dataInt16.length);
        for(let i=0; i<dataInt16.length; i++) {
            float32Data[i] = dataInt16[i] / 32768.0;
        }

        const audioBuffer = ctx.createBuffer(1, float32Data.length, 24000);
        audioBuffer.copyToChannel(float32Data, 0);

        // Setup Nodes
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;

        source.connect(analyser);
        analyser.connect(ctx.destination);
        
        audioSourceRef.current = source;
        setIsSpeaking(true);
        source.start(0);
        
        source.onended = () => {
            setIsSpeaking(false);
        };

    } catch (e) {
        console.error("Audio playback error", e);
        setIsSpeaking(false);
    }
  };

  // --- SPEECH RECOGNITION ---
  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert("Browser does not support speech recognition.");
        return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
        setIsListening(true);
        retryCount.current = 0; 
    };

    recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        handleSend(transcript);
    };

    recognitionRef.current.onerror = (event: any) => {
        console.error("Speech Error:", event.error);
        if (event.error === 'network' && retryCount.current < 3) {
             retryCount.current += 1;
             console.log(`Retrying speech recognition (${retryCount.current}/3)...`);
             setTimeout(() => {
                 try { recognitionRef.current.start(); } catch(e){}
             }, 500);
             return;
        }
        setIsListening(false);
    };

    recognitionRef.current.onend = () => {
        setIsListening(false);
    };

    try {
        recognitionRef.current.start();
    } catch (e) {
        console.error("Failed to start recognition", e);
    }
  };

  // --- SEND MESSAGE ---
  const handleSend = async (manualText?: string) => {
    const textToSend = manualText || input;
    if (!textToSend.trim() || isTyping || !chatSession.current) return;

    const userMsg: ChatMessage = { role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);
    
    // Stop speaking if user interrupts
    if (isSpeaking && audioSourceRef.current) {
        try { audioSourceRef.current.stop(); } catch(e){}
        setIsSpeaking(false);
    }

    try {
        // 1. Send User Message
        const bodyNames = bodies.map(b => b.name).join(', ');
        // provide also bodies ids
        const bodyIds = bodies.map(b => b.id).join(', ');
        const bodiesDescription = bodies.map(b => `Name: ${b.name}, ID: ${b.id}`).join(', ');
        const contextMsg = `${textToSend} \n[System Context: Current bodies are: ${bodiesDescription}. Selected: ${selectedBodyName || 'None'}]`;
        
        let response: GenerateContentResponse = await chatSession.current.sendMessage({ message: contextMsg });

        // 2. Handle Function Calls
        while (response.functionCalls && response.functionCalls.length > 0) {
            
            const functionResponses = [];

            for (const call of response.functionCalls) {
                const { name, args } = call;
                let result = "Action failed.";
                
                console.log(`[Assistant] Executing tool: ${name}`, args);
                
                try {
                    switch (name) {
                        case 'spawn_body':
                            result = actions.spawnBody(
                                args.name as string,
                                Number(args.mass),
                                Number(args.distance),
                                Number(args.velocity),
                                args.color as string
                            );
                            break;
                        case 'delete_body':
                            result = actions.deleteBody(args.bodyName as string);
                            break;
                        case 'make_star':
                            result = actions.makeStar(args.bodyName as string);
                            break;
                        case 'control_simulation':
                            result = actions.setSimulationState(
                                args.isRunning as boolean | undefined,
                                Number(args.speed)
                            );
                            break;
                        case 'change_preset':
                            result = actions.changePreset(args.presetId as string);
                            break;
                        case 'select_body':
                            result = actions.selectBody(args.bodyName as string);
                            break;
                        case 'follow_body':
                            result = actions.followBody(args.bodyName as string);
                            break;
                        case 'follow_center_of_mass':
                            result = actions.followCenterOfMass();
                            break;
                        case 'configure_visuals':
                            result = actions.configureVisuals(args as unknown as Partial<VisualConfig>);
                            break;
                        case 'configure_physics':
                            result = actions.configurePhysics(args as unknown as Partial<PhysicsConfig>);
                            break;
                        case 'set_camera':
                            result = actions.setCamera(
                                args.zoom as number | undefined, 
                                args.reset as boolean | undefined
                            );
                            break;
                        case 'spawn_rocket':
                            result = actions.spawnRocket(args.parentBodyName as string | undefined);
                            break;
                        case 'control_rocket':
                            result = actions.controlRocket(
                                args.rocketName as string,
                                args.action as 'rotate' | 'thrust' | 'stop',
                                args.value as number | undefined
                            );
                            break;
                        case 'program_advanced_flight_plan':
                             result = actions.programAdvancedFlightPlan(
                                 args.rocketName as string,
                                 args.maneuvers as any[]
                             );
                             break;
                        case 'execute_maneuver_plan':
                            result = actions.executeManeuverPlan(args.rocketName as string);
                            break;
                        case 'get_rocket_telemetry':
                            result = actions.getRocketTelemetry(args.rocketName as string, args.targetBodyName as string | undefined);
                            break;
                        default:
                            result = `Unknown tool: ${name}`;
                    }
                } catch (e) {
                    result = `Error executing ${name}: ${e}`;
                }

                functionResponses.push({
                    name: name,
                    response: { result: result },
                    id: call.id 
                });
            }

            response = await chatSession.current.sendMessage({
                message: functionResponses.map(fr => ({
                    functionResponse: fr
                }))
            });
        }

        // 3. Final Text Response
        const text = response.text || "Command executed.";
        setMessages(prev => [...prev, { role: 'model', text }]);

        // 4. Generate Speech (TTS)
        if (!isMuted) {
            const audioData = await generateSpeech(text);
            if (audioData) {
                playAudio(audioData);
            }
        }

    } catch (error) {
        console.error("Assistant Error:", error);
        setMessages(prev => [...prev, { role: 'model', text: "I lost connection to the main computer. Please try again." }]);
    } finally {
        setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSend();
      }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
        recognitionRef.current.stop();
        setIsListening(false);
    }
  };

  return (
    <div 
        className="absolute top-4 left-4 w-80 h-[60vh] flex flex-col bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl z-20 transition-all duration-300"
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onMouseMove={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
    >
      
      <div className="p-4 border-b border-slate-700 flex items-center gap-2 bg-slate-800/50 rounded-t-xl">
        <Sparkles className="text-purple-400" size={18} />
        <h2 className="text-white font-bold">Cosmic Assistant</h2>
        <div className="ml-auto flex gap-2 items-center">
            {isSpeaking && (
                <canvas ref={canvasRef} width="60" height="20" className="opacity-80" />
            )}
            <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`p-1 rounded hover:bg-slate-700 ${isMuted ? 'text-red-400' : 'text-slate-400'}`}
                title={isMuted ? "Unmute Voice" : "Mute Voice"}
            >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <div title="Tools Enabled" className="flex items-center justify-center">
                <div className="bg-slate-700 p-1 rounded-md">
                    <Wrench size={14} className="text-slate-500" />
                </div>
            </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'}`}>
                {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
            </div>
            <div className={`p-3 rounded-lg text-sm max-w-[85%] leading-relaxed ${
                msg.role === 'user' ? 'bg-blue-600/20 text-blue-100' : 'bg-slate-700/50 text-slate-200'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
            <div className="flex gap-3">
                 <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0">
                    <Bot size={14} />
                </div>
                <div className="bg-slate-700/50 p-3 rounded-lg text-sm text-slate-400 italic animate-pulse flex items-center gap-2">
                    <Sparkles size={12} /> Thinking...
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-slate-700 bg-slate-800/30 rounded-b-xl">
        <div className="relative flex gap-2">
            <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Cosmos..."
                disabled={isTyping}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg pl-3 pr-2 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all disabled:opacity-50"
            />
             <button 
                onClick={isListening ? stopListening : startListening}
                className={`p-3 rounded-lg transition-colors flex items-center justify-center ${
                    isListening ? 'bg-red-500 animate-pulse' : 'bg-slate-700 hover:bg-slate-600'
                }`}
                title="Voice Control"
            >
                {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button 
                onClick={() => handleSend()}
                disabled={isTyping || !input.trim()}
                className="p-3 bg-purple-600 rounded-lg text-white hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
                <Send size={16} />
            </button>
        </div>
      </div>
    </div>
  );
};

export default Assistant;