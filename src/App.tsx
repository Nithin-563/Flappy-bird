import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Constants & Types ---
const GRAVITY = 0.25;
const FLAP_STRENGTH = -5;
const PIPE_SPEED = 2.5;
const PIPE_SPAWN_RATE = 100; // frames
const PIPE_WIDTH = 60;
const PIPE_GAP = 160;
const BIRD_RADIUS = 15;
const GROUND_HEIGHT = 80;
const TRAIL_LENGTH = 12;

type GameState = 'LAUNCH' | 'START' | 'PLAYING' | 'GAMEOVER';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface Pipe {
  x: number;
  topHeight: number;
  passed: boolean;
}

// --- Audio Engine ---
class SoundEngine {
  ctx: AudioContext | null = null;

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playFlap() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playScore() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playCollision() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}

const soundEngine = new SoundEngine();

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('LAUNCH');
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(() => {
    const saved = localStorage.getItem('neon-flap-best-score');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [launchProgress, setLaunchProgress] = useState(0);

  // Game State Refs
  const birdRef = useRef({
    y: 0,
    velocity: 0,
    rotation: 0,
    trail: [] as { x: number; y: number }[],
  });
  const pipesRef = useRef<Pipe[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const frameCountRef = useRef(0);
  const groundOffsetRef = useRef(0);

  // --- Initialization ---
  const initGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    birdRef.current = {
      y: canvas.height / 2,
      velocity: 0,
      rotation: 0,
      trail: Array(TRAIL_LENGTH).fill({ x: 100, y: canvas.height / 2 }),
    };
    pipesRef.current = [];
    particlesRef.current = [];
    frameCountRef.current = 0;
    setScore(0);
  }, []);

  useEffect(() => {
    if (gameState === 'LAUNCH') {
      const interval = setInterval(() => {
        setLaunchProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            setGameState('START');
            return 100;
          }
          return prev + 2;
        });
      }, 30);
      return () => clearInterval(interval);
    }
  }, [gameState]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // --- Input Handling ---
  const handleAction = useCallback(() => {
    soundEngine.init();
    if (gameState === 'LAUNCH') return;
    
    if (gameState === 'START') {
      setGameState('PLAYING');
      birdRef.current.velocity = FLAP_STRENGTH;
      soundEngine.playFlap();
      createParticles(100, birdRef.current.y, '#00f2ff');
    } else if (gameState === 'PLAYING') {
      birdRef.current.velocity = FLAP_STRENGTH;
      soundEngine.playFlap();
      createParticles(100, birdRef.current.y, '#00f2ff');
    } else if (gameState === 'GAMEOVER') {
      setGameState('START');
      initGame();
    }
  }, [gameState, initGame]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleAction();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleAction]);

  // --- Particle System ---
  const createParticles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 15; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 1.0,
        color,
      });
    }
  };

  // --- Game Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const update = () => {
      if (gameState === 'PLAYING') {
        frameCountRef.current++;

        // Update Bird
        birdRef.current.velocity += GRAVITY;
        birdRef.current.y += birdRef.current.velocity;
        birdRef.current.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, birdRef.current.velocity * 0.1));

        // Update Trail
        birdRef.current.trail.unshift({ x: 100, y: birdRef.current.y });
        if (birdRef.current.trail.length > TRAIL_LENGTH) {
          birdRef.current.trail.pop();
        }

        // Ground Collision
        if (birdRef.current.y + BIRD_RADIUS > canvas.height - GROUND_HEIGHT) {
          gameOver();
        }
        // Ceiling Collision
        if (birdRef.current.y - BIRD_RADIUS < 0) {
          birdRef.current.y = BIRD_RADIUS;
          birdRef.current.velocity = 0;
        }

        // Update Pipes
        if (frameCountRef.current % PIPE_SPAWN_RATE === 0) {
          const minPipeHeight = 50;
          const maxPipeHeight = canvas.height - GROUND_HEIGHT - PIPE_GAP - minPipeHeight;
          const topHeight = Math.floor(Math.random() * (maxPipeHeight - minPipeHeight + 1)) + minPipeHeight;
          pipesRef.current.push({ x: canvas.width, topHeight, passed: false });
        }

        pipesRef.current.forEach((pipe) => {
          pipe.x -= PIPE_SPEED;

          // Collision Detection
          const birdX = 100;
          if (
            birdX + BIRD_RADIUS > pipe.x &&
            birdX - BIRD_RADIUS < pipe.x + PIPE_WIDTH &&
            (birdRef.current.y - BIRD_RADIUS < pipe.topHeight || birdRef.current.y + BIRD_RADIUS > pipe.topHeight + PIPE_GAP)
          ) {
            gameOver();
          }

          // Scoring
          if (!pipe.passed && pipe.x + PIPE_WIDTH < birdX) {
            pipe.passed = true;
            setScore(s => s + 1);
            soundEngine.playScore();
          }
        });

        // Remove off-screen pipes
        pipesRef.current = pipesRef.current.filter(p => p.x + PIPE_WIDTH > 0);

        // Ground Animation
        groundOffsetRef.current = (groundOffsetRef.current + PIPE_SPEED) % 40;
      }

      // Update Particles
      particlesRef.current.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
      });
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);

      draw();
      animationFrameId = requestAnimationFrame(update);
    };

    const gameOver = () => {
      setGameState('GAMEOVER');
      soundEngine.playCollision();
      createParticles(100, birdRef.current.y, '#ff00ff');
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // --- Background (Synthwave Sky) ---
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#0d0221');
      gradient.addColorStop(0.6, '#240b36');
      gradient.addColorStop(1, '#c31432');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // --- Grid Lines ---
      ctx.strokeStyle = 'rgba(0, 242, 255, 0.15)';
      ctx.lineWidth = 1;
      const gridSpacing = 40;
      const perspectiveOffset = 100;
      
      for (let x = -perspectiveOffset; x < canvas.width + perspectiveOffset; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2 + (x - canvas.width / 2) * 0.2, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // --- Draw Pipes ---
      pipesRef.current.forEach(pipe => {
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f2ff';
        ctx.fillStyle = '#00f2ff';
        ctx.fillRect(pipe.x, 0, PIPE_WIDTH, pipe.topHeight);
        ctx.fillRect(pipe.x, pipe.topHeight + PIPE_GAP, PIPE_WIDTH, canvas.height - GROUND_HEIGHT - (pipe.topHeight + PIPE_GAP));
        ctx.fillStyle = '#fff';
        ctx.fillRect(pipe.x - 5, pipe.topHeight - 10, PIPE_WIDTH + 10, 10);
        ctx.fillRect(pipe.x - 5, pipe.topHeight + PIPE_GAP, PIPE_WIDTH + 10, 10);
        ctx.shadowBlur = 0;
      });

      // --- Draw Ground ---
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff00ff';
      ctx.beginPath();
      ctx.moveTo(0, canvas.height - GROUND_HEIGHT);
      ctx.lineTo(canvas.width, canvas.height - GROUND_HEIGHT);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 0, 255, 0.3)';
      ctx.lineWidth = 1;
      for (let x = -groundOffsetRef.current; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - GROUND_HEIGHT);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // --- Draw Trail ---
      if (gameState === 'PLAYING') {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = '#00f2ff';
        ctx.lineWidth = BIRD_RADIUS * 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00f2ff';
        
        birdRef.current.trail.forEach((pos, i) => {
          const alpha = 1 - (i / TRAIL_LENGTH);
          ctx.globalAlpha = alpha * 0.5;
          if (i === 0) ctx.moveTo(pos.x, pos.y);
          else ctx.lineTo(pos.x - i * 2, pos.y); // Trail offsets slightly back
        });
        ctx.stroke();
        ctx.restore();
      }

      // --- Draw Bird ---
      const birdX = 100;
      ctx.save();
      ctx.translate(birdX, birdRef.current.y);
      ctx.rotate(birdRef.current.rotation);
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff00ff';
      ctx.fillStyle = '#ff00ff';
      ctx.beginPath();
      ctx.moveTo(BIRD_RADIUS, 0);
      ctx.lineTo(-BIRD_RADIUS, -BIRD_RADIUS);
      ctx.lineTo(-BIRD_RADIUS, BIRD_RADIUS);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(5, -2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // --- Draw Particles ---
      particlesRef.current.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
    };

    update();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);

  // Update Best Score
  useEffect(() => {
    if (score > bestScore) {
      setBestScore(score);
      localStorage.setItem('neon-flap-best-score', score.toString());
    }
  }, [score, bestScore]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initGame();
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [initGame]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black font-mono select-none touch-none" onClick={handleAction}>
      <canvas
        ref={canvasRef}
        className="block w-full h-full"
      />

      {/* Live Score */}
      {gameState === 'PLAYING' && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 text-6xl font-bold text-white drop-shadow-[0_0_10px_rgba(0,242,255,0.8)]">
          {score}
        </div>
      )}

      {/* Launch Screen */}
      {gameState === 'LAUNCH' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0d0221]">
          <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden mb-4 border border-white/20">
            <div 
              className="h-full bg-gradient-to-r from-[#00f2ff] to-[#ff00ff] transition-all duration-100 ease-linear"
              style={{ width: `${launchProgress}%` }}
            />
          </div>
          <p className="text-[#00f2ff] text-xs uppercase tracking-[0.5em] animate-pulse">
            Initializing System... {launchProgress}%
          </p>
        </div>
      )}

      {/* Start Screen */}
      {gameState === 'START' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm px-6 text-center">
          <h1 className="text-5xl sm:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-b from-[#00f2ff] to-[#ff00ff] italic tracking-tighter mb-4 animate-pulse">
            NEON FLAP
          </h1>
          <p className="text-cyan-400 text-lg sm:text-xl tracking-widest uppercase mb-8 max-w-xs sm:max-w-none">
            Press Space or Tap to Start
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-8 text-white/60 text-xs sm:text-sm uppercase tracking-widest">
            <span>Avoid the Pipes</span>
            <span className="hidden sm:inline">•</span>
            <span>Don't Hit the Ground</span>
          </div>
        </div>
      )}

      {/* Game Over Screen */}
      {gameState === 'GAMEOVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md px-6 text-center">
          <h2 className="text-4xl sm:text-6xl font-black text-red-500 mb-4 tracking-tighter italic">
            SYSTEM FAILURE
          </h2>
          <div className="bg-white/5 border border-white/10 p-6 sm:p-8 rounded-2xl flex flex-col items-center gap-4 mb-8 w-full max-w-[320px] sm:max-w-[400px]">
            <div className="flex flex-col items-center">
              <span className="text-white/40 text-[10px] sm:text-xs uppercase tracking-[0.3em]">Current Score</span>
              <span className="text-4xl sm:text-5xl font-bold text-cyan-400">{score}</span>
            </div>
            <div className="w-full h-px bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-white/40 text-[10px] sm:text-xs uppercase tracking-[0.3em]">All-Time Best</span>
              <span className="text-2xl sm:text-3xl font-bold text-pink-500">{bestScore}</span>
            </div>
          </div>
          <p className="text-white/60 text-base sm:text-lg animate-bounce tracking-widest uppercase">
            Tap to Reboot
          </p>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;800&display=swap');
        body {
          font-family: 'JetBrains Mono', monospace;
          margin: 0;
          padding: 0;
        }
      `}</style>
    </div>
  );
}
