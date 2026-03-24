import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- Constants ---
const GRID_SIZE = 20;
const GAME_SPEED = 100; // ms per tick (faster, more frantic)

const TRACKS = [
  { id: 1, title: 'CORRUPTED_SECTOR_01', artist: 'UNKNOWN_ENTITY', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { id: 2, title: 'MEMORY_LEAK_DETECTED', artist: 'SYSTEM_DAEMON', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 3, title: 'BUFFER_OVERFLOW', artist: 'NULL_POINTER', url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
];

type Point = { x: number, y: number };

export default function App() {
  // --- Game State ---
  const [snake, setSnake] = useState<Point[]>([{ x: 10, y: 10 }]);
  const [food, setFood] = useState<Point>({ x: 15, y: 10 });
  const [direction, setDirection] = useState<Point>({ x: 1, y: 0 });
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isGameRunning, setIsGameRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Mutable refs for the game loop to avoid stale closures
  const directionRef = useRef(direction);
  const lastProcessedDirectionRef = useRef(direction);
  const snakeRef = useRef(snake);

  // --- Music State & Refs ---
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const isAudioInitialized = useRef(false);
  const animationRef = useRef<number>(0);

  // --- Game Logic ---
  const spawnFood = useCallback((currentSnake: Point[]) => {
    let newFood: Point;
    while (true) {
      newFood = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE)
      };
      const onSnake = currentSnake.some(segment => segment.x === newFood.x && segment.y === newFood.y);
      if (!onSnake) break;
    }
    setFood(newFood);
  }, []);

  const handleGameOver = useCallback(() => {
    setGameOver(true);
    setIsGameRunning(false);
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score, highScore]);

  const resetGame = () => {
    const initialSnake = [{ x: 10, y: 10 }];
    setSnake(initialSnake);
    snakeRef.current = initialSnake;
    setDirection({ x: 1, y: 0 });
    directionRef.current = { x: 1, y: 0 };
    lastProcessedDirectionRef.current = { x: 1, y: 0 };
    setScore(0);
    setGameOver(false);
    setIsPaused(false);
    spawnFood(initialSnake);
    setIsGameRunning(true);
    
    if (!isPlaying && audioRef.current) {
      initAudio();
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      audioRef.current.play().catch(e => console.error("Audio play failed", e));
      setIsPlaying(true);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === ' ' && (!isGameRunning || gameOver)) {
        resetGame();
        return;
      }

      if ((e.key === 'p' || e.key === 'P') && isGameRunning && !gameOver) {
        setIsPaused(prev => !prev);
        return;
      }

      if (isPaused) return;

      const currentDir = lastProcessedDirectionRef.current;
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          if (currentDir.y === 0) directionRef.current = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          if (currentDir.y === 0) directionRef.current = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (currentDir.x === 0) directionRef.current = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          if (currentDir.x === 0) directionRef.current = { x: 1, y: 0 };
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGameRunning, gameOver, isPlaying, isPaused]);

  // Main game loop
  useEffect(() => {
    if (!isGameRunning || gameOver || isPaused) return;

    const moveSnake = () => {
      const currentSnake = [...snakeRef.current];
      const head = { ...currentSnake[0] };
      const dir = directionRef.current;

      head.x += dir.x;
      head.y += dir.y;
      lastProcessedDirectionRef.current = dir;

      // Wall collision
      if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
        handleGameOver();
        return;
      }

      // Self collision
      if (currentSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
        handleGameOver();
        return;
      }

      currentSnake.unshift(head);

      // Food collision
      if (head.x === food.x && head.y === food.y) {
        setScore(s => s + 1);
        spawnFood(currentSnake);
      } else {
        currentSnake.pop();
      }

      setSnake(currentSnake);
      snakeRef.current = currentSnake;
    };

    const intervalId = setInterval(moveSnake, GAME_SPEED);
    return () => clearInterval(intervalId);
  }, [isGameRunning, gameOver, isPaused, food, handleGameOver, spawnFood]);

  // --- Music Logic ---
  const initAudio = () => {
    if (isAudioInitialized.current || !audioRef.current) return;

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; 

      const source = audioCtx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      isAudioInitialized.current = true;

      drawVisualizer();
    } catch (e) {
      console.error("Web Audio API initialization failed", e);
    }
  };

  const drawVisualizer = () => {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const numBars = 16;
    const previousValues = new Array(numBars).fill(0);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = canvas.width / numBars;
      let x = 0;

      let hasRealData = false;
      for (let i = 0; i < numBars; i++) {
        if (dataArray[i] > 0) {
          hasRealData = true;
          break;
        }
      }

      const isAudioPlaying = audioRef.current && !audioRef.current.paused;

      for (let i = 0; i < numBars; i++) {
        let value = dataArray[i];

        if (!hasRealData && isAudioPlaying) {
          const time = Date.now() / 100;
          const wave = Math.sin(time + i * 0.8) * 80 + 80;
          const noise = Math.random() * 80;
          value = wave + noise;
        }

        if (!isAudioPlaying) {
           value = Math.max(0, previousValues[i] - 20);
        }

        previousValues[i] = value;

        const percent = value / 255;
        const barHeight = Math.max(2, percent * canvas.height);

        const isCyan = i % 2 === 0;
        
        // Raw, blocky colors instead of gradients
        ctx.fillStyle = isCyan ? '#00FFFF' : '#FF00FF';
        
        // Add some random glitching to the bars
        const glitchOffset = Math.random() > 0.95 ? (Math.random() * 10 - 5) : 0;

        ctx.fillRect(x + 1 + glitchOffset, canvas.height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    draw();
  };

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  const togglePlay = () => {
    if (audioRef.current) {
      initAudio();
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }

      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.error("Audio play failed", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const nextTrack = () => setCurrentTrack((prev) => (prev + 1) % TRACKS.length);
  const prevTrack = () => setCurrentTrack((prev) => (prev - 1 + TRACKS.length) % TRACKS.length);
  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    if (isPlaying && audioRef.current) {
      audioRef.current.play().catch(e => console.error("Audio play failed", e));
    }
  }, [currentTrack]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 bg-[#050505] text-cyan-400 font-mono relative overflow-hidden">
      <div className="static-noise"></div>
      
      <audio
        ref={audioRef}
        src={TRACKS[currentTrack].url}
        crossOrigin="anonymous"
        onEnded={nextTrack}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Header */}
      <header className="mb-8 text-center relative z-10 screen-tear">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tighter uppercase glitch" data-text="ENTITY_0xSNAKE">
          ENTITY_0xSNAKE
        </h1>
        <p className="text-fuchsia-500 mt-2 tracking-[0.3em] text-sm font-bold bg-fuchsia-500/10 inline-block px-2 border border-fuchsia-500">
          PROTOCOL: GLITCH_ART // STATUS: UNSTABLE
        </p>
      </header>

      <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-start w-full max-w-5xl justify-center z-10">
        
        {/* Game Container */}
        <div className="flex flex-col items-center">
          {/* Score Board */}
          <div className="flex justify-between w-full max-w-[400px] mb-4 px-2 border-b-2 border-cyan-500/30 pb-2">
            <div className="flex flex-col">
              <span className="text-xs text-cyan-500 uppercase tracking-widest">DATA_FRAGMENTS</span>
              <span className="text-4xl font-bold text-cyan-400">{score}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-fuchsia-500 uppercase tracking-widest">MAX_CORRUPTION</span>
              <span className="text-4xl font-bold text-fuchsia-500">{highScore}</span>
            </div>
          </div>

          {/* Game Board */}
          <div className="relative w-full max-w-[400px] aspect-square bg-black border-4 border-cyan-400 overflow-hidden shadow-[8px_8px_0px_#ff00ff]">
            
            <div className="crt-scanline"></div>

            {/* Grid Lines (Harsh) */}
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
                 style={{
                   backgroundImage: 'linear-gradient(#00ffff 1px, transparent 1px), linear-gradient(90deg, #00ffff 1px, transparent 1px)',
                   backgroundSize: `${100 / GRID_SIZE}% ${100 / GRID_SIZE}%`
                 }}>
            </div>

            {/* Snake */}
            {snake.map((segment, index) => {
              const isHead = index === 0;
              return (
                <div
                  key={`${segment.x}-${segment.y}-${index}`}
                  className={`absolute ${isHead ? 'z-10' : ''}`}
                  style={{
                    left: `${(segment.x / GRID_SIZE) * 100}%`,
                    top: `${(segment.y / GRID_SIZE) * 100}%`,
                    width: `${100 / GRID_SIZE}%`,
                    height: `${100 / GRID_SIZE}%`,
                  }}
                >
                  <div className={`w-full h-full ${isHead ? 'bg-cyan-400' : 'bg-cyan-400/70'} border border-black`}></div>
                </div>
              );
            })}

            {/* Food */}
            <div
              className="absolute flex items-center justify-center animate-[pulse_0.2s_infinite]"
              style={{
                left: `${(food.x / GRID_SIZE) * 100}%`,
                top: `${(food.y / GRID_SIZE) * 100}%`,
                width: `${100 / GRID_SIZE}%`,
                height: `${100 / GRID_SIZE}%`,
              }}
            >
              <div className="w-full h-full bg-fuchsia-500 border border-black"></div>
            </div>

            {/* Overlays */}
            {isPaused && !gameOver && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
                <h2 className="text-4xl text-cyan-400 font-bold tracking-widest uppercase glitch" data-text="THREAD_SUSPENDED">
                  THREAD_SUSPENDED
                </h2>
              </div>
            )}

            {!isGameRunning && !gameOver && (
              <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
                <button 
                  onClick={resetGame}
                  className="px-6 py-3 border-2 border-cyan-400 text-cyan-400 bg-black hover:bg-cyan-400 hover:text-black transition-none uppercase tracking-widest font-bold text-xl shadow-[4px_4px_0px_#ff00ff] hover:shadow-[0px_0px_0px_#ff00ff] hover:translate-x-[4px] hover:translate-y-[4px]"
                >
                  INITIALIZE_SEQUENCE
                </button>
              </div>
            )}

            {gameOver && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-20 screen-tear">
                <h2 className="text-4xl text-fuchsia-500 font-bold mb-2 glitch" data-text="FATAL_EXCEPTION">FATAL_EXCEPTION</h2>
                <p className="text-cyan-400 mb-6 tracking-widest">FRAGMENTS_LOST: {score}</p>
                <button 
                  onClick={resetGame}
                  className="px-6 py-3 border-2 border-fuchsia-500 text-fuchsia-500 bg-black hover:bg-fuchsia-500 hover:text-black transition-none uppercase tracking-widest font-bold text-xl shadow-[4px_4px_0px_#00ffff] hover:shadow-[0px_0px_0px_#00ffff] hover:translate-x-[4px] hover:translate-y-[4px]"
                >
                  EXECUTE_REBOOT.SH
                </button>
              </div>
            )}
          </div>
          
          <div className="mt-4 text-sm text-cyan-500/70 tracking-widest uppercase text-center border border-cyan-500/30 p-2 bg-cyan-500/5">
            INPUT: [W,A,S,D] OR [ARROWS] <br/> INTERRUPT: [P]
          </div>
        </div>

        {/* Music Player */}
        <div className="w-full max-w-[400px] lg:max-w-[320px] bg-black border-4 border-fuchsia-500 p-6 shadow-[8px_8px_0px_#00ffff] flex flex-col relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-fuchsia-500/30 animate-[pulse_0.5s_infinite]"></div>
          
          <div className="flex items-center gap-3 mb-6 border-b-2 border-fuchsia-500 pb-4">
            <div className="w-10 h-10 bg-fuchsia-500 flex items-center justify-center text-black font-bold text-xl">
              {'>_'}
            </div>
            <div>
              <h3 className="text-fuchsia-500 font-bold tracking-widest text-lg uppercase">AUDIO_STREAM.DAT</h3>
              <p className="text-cyan-400 text-xs uppercase">NOISE_GENERATOR_ACTIVE</p>
            </div>
          </div>

          {/* Track Info */}
          <div className="mb-8 text-center border border-cyan-400 p-2 bg-cyan-400/10">
            <div className="relative overflow-hidden h-8 mb-1">
              <div className={`whitespace-nowrap text-lg text-cyan-400 font-bold ${isPlaying ? 'glitch' : ''}`} data-text={TRACKS[currentTrack].title}>
                {TRACKS[currentTrack].title}
              </div>
            </div>
            <div className="text-sm text-fuchsia-500 uppercase tracking-widest">
              AUTHOR: {TRACKS[currentTrack].artist}
            </div>
          </div>

          {/* Visualizer (Real Web Audio API) */}
          <div className="flex items-end justify-center h-16 mb-8 w-full border-b-2 border-cyan-400/50 pb-1">
            <canvas 
              ref={canvasRef} 
              width={300} 
              height={64} 
              className="w-full h-full"
            />
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between px-2">
            <button 
              onClick={toggleMute}
              className="text-cyan-400 hover:text-fuchsia-500 transition-none font-bold text-xl"
            >
              {isMuted ? '[MUTED]' : '[VOL_UP]'}
            </button>

            <div className="flex items-center gap-4">
              <button 
                onClick={prevTrack}
                className="text-fuchsia-500 hover:text-cyan-400 transition-none font-bold text-xl"
              >
                {'<<'}
              </button>
              
              <button 
                onClick={togglePlay}
                className="w-16 h-12 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 hover:bg-cyan-400 hover:text-black transition-none font-bold text-xl"
              >
                {isPlaying ? '||' : '>'}
              </button>

              <button 
                onClick={nextTrack}
                className="text-fuchsia-500 hover:text-cyan-400 transition-none font-bold text-xl"
              >
                {'>>'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
