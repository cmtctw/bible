import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { LiveStatus } from "../types";
import { SYSTEM_INSTRUCTION } from "../constants";

// Helper for audio decoding
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper for audio encoding
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Float32Array to PCM 16-bit
function createBlob(data: Float32Array): { data: string, mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Scale float (-1.0 to 1.0) to int16 (-32768 to 32767)
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Decode raw PCM into AudioBuffer
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

class LiveService {
  public onStatusChange: ((status: LiveStatus) => void) | null = null;
  public onAudioLevel: ((level: number) => void) | null = null;
  
  private status: LiveStatus = 'disconnected';
  private ai: GoogleGenAI;
  private currentSession: any = null;
  private sessionPromise: Promise<any> | null = null;
  
  // Audio
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputNode: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  
  // Playback scheduling
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private setStatus(status: LiveStatus) {
    this.status = status;
    if (this.onStatusChange) {
      this.onStatusChange(status);
    }
  }

  async connect() {
    if (this.status === 'connected' || this.status === 'connecting') return;
    
    // Check API Key existence (though initialization handles it, we can fail fast)
    if (!process.env.API_KEY) {
        console.error("Missing API Key");
        this.setStatus('error');
        return;
    }

    try {
      this.setStatus('connecting');

      // 1. Setup Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.inputAudioContext = new AudioContextClass({ sampleRate: 16000 });
      this.outputAudioContext = new AudioContextClass({ sampleRate: 24000 });
      
      this.outputNode = this.outputAudioContext.createGain();
      this.outputNode.connect(this.outputAudioContext.destination);

      // 2. Setup Mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.sourceNode = this.inputAudioContext.createMediaStreamSource(stream);
      
      this.inputNode = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
      this.inputNode.onaudioprocess = (e) => {
        // Calculate volume
        const inputData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        if (this.onAudioLevel) {
            this.onAudioLevel(Math.min(1, rms * 5)); // Amplify a bit for visualizer
        }

        // Send to model
        if (this.sessionPromise) {
            const pcmBlob = createBlob(inputData);
            this.sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
            }).catch(err => {
                // Session initialization failed or pending
            });
        }
      };

      // Connect graph: source -> processor -> mute -> destination
      // We need to connect processor to destination to keep it alive in some browsers, but mute it.
      const muteNode = this.inputAudioContext.createGain();
      muteNode.gain.value = 0;
      
      this.sourceNode.connect(this.inputNode);
      this.inputNode.connect(muteNode);
      muteNode.connect(this.inputAudioContext.destination);

      // 3. Connect to Gemini Live
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
        },
        callbacks: {
          onopen: () => {
            console.log("Connected to Gemini Live");
            this.setStatus('connected');
          },
          onmessage: async (message: LiveServerMessage) => {
             await this.handleMessage(message);
          },
          onerror: (e) => {
            console.error("Gemini Live Error", e);
            this.setStatus('error');
            this.disconnect();
          },
          onclose: (e) => {
            console.log("Gemini Live Closed");
            this.setStatus('disconnected');
            this.disconnect();
          }
        }
      });

      this.currentSession = await this.sessionPromise;

    } catch (e) {
      console.error("Connection failed", e);
      this.setStatus('error');
      this.disconnect();
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    const serverContent = message.serverContent;
    
    // Audio Output
    if (serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
        const base64Audio = serverContent.modelTurn.parts[0].inlineData.data;
        if (this.outputAudioContext && this.outputNode) {
            // Sync time
            this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
            
            const audioBytes = decode(base64Audio);
            const audioBuffer = await decodeAudioData(audioBytes, this.outputAudioContext, 24000, 1);
            
            const source = this.outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputNode);
            
            source.addEventListener('ended', () => {
                this.sources.delete(source);
            });
            
            source.start(this.nextStartTime);
            this.nextStartTime += audioBuffer.duration;
            this.sources.add(source);
        }
    }

    // Interruption
    if (serverContent?.interrupted) {
        this.stopPlayback();
    }
    
    // Turn Complete (can be used for visualizer state or transcription logic later)
    if (serverContent?.turnComplete) {
        // ...
    }
  }

  private stopPlayback() {
    this.sources.forEach(s => {
        try { s.stop(); } catch(e) {}
    });
    this.sources.clear();
    this.nextStartTime = 0;
  }

  async disconnect() {
    this.setStatus('disconnected');
    
    // Close Session
    if (this.currentSession) {
        try { 
             // @ts-ignore
            this.currentSession.close(); 
        } catch(e) {}
        this.currentSession = null;
        this.sessionPromise = null;
    }

    // Stop Audio
    if (this.sourceNode) {
        this.sourceNode.disconnect();
        // Stop stream tracks
        if (this.sourceNode.mediaStream) {
            this.sourceNode.mediaStream.getTracks().forEach(t => t.stop());
        }
        this.sourceNode = null;
    }
    
    if (this.inputNode) {
        this.inputNode.disconnect();
        this.inputNode = null;
    }
    
    if (this.inputAudioContext) {
        try { await this.inputAudioContext.close(); } catch(e) {}
        this.inputAudioContext = null;
    }

    if (this.outputAudioContext) {
        this.stopPlayback();
        try { await this.outputAudioContext.close(); } catch(e) {}
        this.outputAudioContext = null;
        this.outputNode = null;
    }

    if (this.onAudioLevel) this.onAudioLevel(0);
  }
}

export const liveService = new LiveService();