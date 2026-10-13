/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Trophy, 
  HelpCircle, 
  Pause, 
  ArrowLeft, 
  ArrowRight, 
  Activity, 
  Check, 
  Plus, 
  Share2, 
  CornerDownRight, 
  FileText, 
  Sliders, 
  Sparkles 
} from 'lucide-react';
import { Direction, CellType, PlayerState, GameLevel, GameMetrics, GameStage, LeaderboardEntry } from './types';
import { generateLevel, generateRandomSeed, seedToNumber } from './core/ProceduralGen';
import { BiopunkAudioEngine } from './audio/AudioEngine';
import { BiopunkRenderer } from './rendering/Renderer';
import { HeatmapView } from './components/HeatmapView';
import { generateToken, validateToken, getLocalLeaderboard, saveLeaderboardEntry } from './core/TokenSystem';

// Global single instance of audio engine
const audio = new BiopunkAudioEngine();

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BiopunkRenderer | null>(null);

  // Game UI & level states
  const [stage, setStage] = useState<GameStage>(GameStage.MENU);
  const [phase, setPhase] = useState<number>(1);
  const [seed, setSeed] = useState<string>('a3f9b2');
  const [levelData, setLevelData] = useState<GameLevel | null>(null);
  
  // Game metrics & scoring
  const [metrics, setMetrics] = useState<GameMetrics>({
    nodesCollected: 0,
    rnaCollected: 0,
    timeElapsed: 0,
    score: 0,
    perfect: false
  });

  // Player state
  const [player, setPlayer] = useState<PlayerState>({
    gridX: 0,
    gridY: 0,
    targetX: 0,
    targetY: 0,
    moveProgress: 0,
    direction: Direction.NORTH,
    targetDirection: Direction.NORTH,
    turnProgress: 1.0,
    isJumping: false,
    jumpType: 'NONE',
    jumpProgress: 0,
    jumpHeight: 0,
    history: []
  });

  // Sound settings
  const [isMuted, setIsMuted] = useState<boolean>(true);
  
  // Custom seed input helper
  const [customSeedInput, setCustomSeedInput] = useState<string>('');
  const [tokenInput, setTokenInput] = useState<string>('');
  const [tokenFeedback, setTokenFeedback] = useState<string>('');
  
  // Leaderboard and stats
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [streakCount, setStreakCount] = useState<number>(0);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);

  // Glitch and Easter Egg state
  const [isRetroFlash, setIsRetroFlash] = useState<boolean>(false);
  const [glitchFactor, setGlitchFactor] = useState<boolean>(false);

  // References for active mutable variables in loop
  const stateRef = useRef({
    stage: GameStage.MENU,
    player: { ...player },
    level: null as GameLevel | null,
    metrics: { ...metrics },
    pendingTurn: null as 'LEFT' | 'RIGHT' | null,
    lastTime: 0,
    streak: 0,
    isRetroFlash: false,
    glitchTimeCounter: 0,
    nextGlitchTrigger: 15.0 // Trigger retro flash every 15 seconds of streak
  });

  // Sync state reference
  useEffect(() => {
    stateRef.current.stage = stage;
    stateRef.current.player = player;
    stateRef.current.level = levelData;
    stateRef.current.metrics = metrics;
    stateRef.current.streak = streakCount;
    stateRef.current.isRetroFlash = isRetroFlash;
  }, [stage, player, levelData, metrics, streakCount, isRetroFlash]);

  // Load leaderboard and streak on mount
  useEffect(() => {
    setLeaderboard(getLocalLeaderboard());
    const savedStreak = localStorage.getItem('circuito_vivo_streak');
    if (savedStreak) {
      setStreakCount(parseInt(savedStreak, 10));
    }
    setSeed(generateRandomSeed());
  }, []);

  // Initialize canvas renderer
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = new BiopunkRenderer(canvasRef.current);
    }
  }, [canvasRef]);

  // Resize canvas dynamically using ResizeObserver to fit its parent container precisely
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use clientWidth/clientHeight or contentRect width/height
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          canvas.width = Math.floor(width);
          canvas.height = Math.floor(height);
        }
      }
    });

    const parent = canvas.parentElement;
    if (parent) {
      resizeObserver.observe(parent);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [stage]);

  // Audio Context lock unlock on user interactions
  const ensureAudioInit = () => {
    audio.init();
    audio.setMute(isMuted);
  };

  const handleMuteToggle = () => {
    ensureAudioInit();
    const muted = audio.toggleMute();
    setIsMuted(muted);
  };

  // Keyboard controls listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const s = stateRef.current.stage;
      if (s !== GameStage.PLAYING) return;

      const p = stateRef.current.player;

      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (stateRef.current.pendingTurn === null) {
          stateRef.current.pendingTurn = 'LEFT';
          p.targetDirection = (p.direction + 3) % 4; // Turn Left (90 deg CCW)
        }
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (stateRef.current.pendingTurn === null) {
          stateRef.current.pendingTurn = 'RIGHT';
          p.targetDirection = (p.direction + 1) % 4; // Turn Right (90 deg CW)
        }
      } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        // Trigger single or double jump
        if (!p.isJumping) {
          p.isJumping = true;
          p.jumpType = 'SINGLE';
          p.jumpProgress = 0;
          p.jumpHeight = 0;
          audio.playJump();
        } else if (p.jumpType === 'SINGLE' && p.jumpProgress < 0.5) {
          p.jumpType = 'DOUBLE';
          audio.playJump();
        }
      } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setStage(GameStage.PAUSED);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Start a new run
  const startRun = async (selectedSeed: string, selectedPhase: number) => {
    ensureAudioInit();
    setShowHeatmap(false);
    setCustomSeedInput('');

    // Load Level parameters
    const data = await generateLevel(selectedSeed, selectedPhase);
    setLevelData(data);

    // Initial player state placed at the center of the grid, facing NORTH
    const sX = Math.floor(data.width / 2);
    const sY = Math.floor(data.height / 2);
    
    const initialPlayer: PlayerState = {
      gridX: sX,
      gridY: sY,
      targetX: sX,
      targetY: sY - 1, // Start moving NORTH
      moveProgress: 0,
      direction: Direction.NORTH,
      targetDirection: Direction.NORTH,
      turnProgress: 1.0,
      isJumping: false,
      jumpType: 'NONE',
      jumpProgress: 0,
      jumpHeight: 0,
      history: [{ x: sX, y: sY, isJump: false, timestamp: Date.now() }]
    };

    setPlayer(initialPlayer);
    
    const initialMetrics: GameMetrics = {
      nodesCollected: 0,
      rnaCollected: 0,
      timeElapsed: 0,
      score: 0,
      perfect: false
    };

    setMetrics(initialMetrics);
    audio.updateBPM(0, data.totalNodes);

    stateRef.current.pendingTurn = null;
    stateRef.current.lastTime = performance.now();
    stateRef.current.glitchTimeCounter = 0;

    setStage(GameStage.PLAYING);
  };

  // Loop execution
  useEffect(() => {
    let animFrameId: number;

    const gameLoop = (timestamp: number) => {
      const currentStage = stateRef.current.stage;
      if (currentStage !== GameStage.PLAYING) {
        // Just render background idle in menu or pauses
        if (rendererRef.current && levelData) {
          rendererRef.current.render(levelData, player, timestamp / 1000, currentStage, glitchFactor);
        }
        animFrameId = requestAnimationFrame(gameLoop);
        return;
      }

      const dt = Math.min(0.1, (timestamp - stateRef.current.lastTime) / 1000); // delta time capped to 100ms
      stateRef.current.lastTime = timestamp;

      // Unpack references
      const p = stateRef.current.player;
      const lvl = stateRef.current.level!;
      const m = stateRef.current.metrics;
      const str = stateRef.current.streak;

      // Update timer
      m.timeElapsed += dt;

      // --- 1. Easter Egg: Glitch/Retro Flash Timer ---
      if (str >= 7) {
        setGlitchFactor(true);
        stateRef.current.glitchTimeCounter += dt;
        if (stateRef.current.glitchTimeCounter >= stateRef.current.nextGlitchTrigger) {
          stateRef.current.glitchTimeCounter = 0;
          setIsRetroFlash(true);
          stateRef.current.isRetroFlash = true;
          setTimeout(() => {
            setIsRetroFlash(false);
            stateRef.current.isRetroFlash = false;
          }, 1200); // 1.2s retro flash
        }
      } else {
        setGlitchFactor(false);
      }

      // --- 2. Update Jump Physics ---
      if (p.isJumping) {
        // Single jump completes in 0.55s, Double completes in 1.1s
        const duration = p.jumpType === 'SINGLE' ? 0.55 : 1.1;
        p.jumpProgress += dt / duration;

        if (p.jumpProgress >= 1.0) {
          p.isJumping = false;
          p.jumpType = 'NONE';
          p.jumpProgress = 0;
          p.jumpHeight = 0;
        } else {
          // Parabolic height offset
          p.jumpHeight = Math.sin(p.jumpProgress * Math.PI) * 0.75;
        }
      }

      // --- 3. Update Camera Turn Progress ---
      if (p.direction !== p.targetDirection) {
        p.turnProgress += dt * 4.5; // Takes ~220ms to swing camera
        if (p.turnProgress >= 1.0) {
          p.direction = p.targetDirection;
          p.turnProgress = 1.0;
        }
      }

      // --- 4. Auto-Forward Move Interpolation ---
      // Speed multiplier based on phase (Level 1-20)
      const baseSpeed = 1.6 + Math.min(3, phase * 0.09); // Dynamic cells per second
      p.moveProgress += dt * baseSpeed;

      // Track continuous fine position on the grid
      let fineX = p.gridX;
      let fineY = p.gridY;
      let tX = p.targetX;
      let tY = p.targetY;
      
      // Fix wrapping jump during interpolation
      if (tX - fineX > 1) fineX += lvl.width;
      else if (tX - fineX < -1) fineX -= lvl.width;
      if (tY - fineY > 1) fineY += lvl.height;
      else if (tY - fineY < -1) fineY -= lvl.height;

      const playerFineX = (fineX + (tX - fineX) * p.moveProgress + lvl.width) % lvl.width;
      const playerFineY = (fineY + (tY - fineY) * p.moveProgress + lvl.height) % lvl.height;

      // Log movement history for trail and Heatmap view
      p.history.push({
        x: playerFineX,
        y: playerFineY,
        isJump: p.isJumping,
        timestamp: Date.now()
      });

      // Keep trail capped at last 120 coordinate records
      if (p.history.length > 120) {
        p.history.shift();
      }

      if (p.moveProgress >= 1.0) {
        p.moveProgress = 0;
        p.gridX = p.targetX;
        p.gridY = p.targetY;

        // Apply buffered turn command at the exact cell center
        if (stateRef.current.pendingTurn !== null) {
          p.direction = p.targetDirection;
          stateRef.current.pendingTurn = null;
        }

        // Determine next cell ahead to target
        let dx = 0;
        let dy = 0;
        if (p.direction === Direction.NORTH) dy = -1;
        else if (p.direction === Direction.EAST) dx = 1;
        else if (p.direction === Direction.SOUTH) dy = 1;
        else if (p.direction === Direction.WEST) dx = -1;

        p.targetX = (p.gridX + dx + lvl.width) % lvl.width;
        p.targetY = (p.gridY + dy + lvl.height) % lvl.height;

        // --- 5. Collision Checks on Landed Cell ---
        const cell = lvl.grid[p.gridY][p.gridX];

        if (cell === CellType.CANCER && !p.isJumping) {
          // Crash / Failure!
          audio.playFail();
          setStreakCount(0);
          localStorage.setItem('circuito_vivo_streak', '0');
          setStage(GameStage.RESULT);
        } else if (cell === CellType.NODE) {
          // Green synapse node collected
          audio.playCollect();
          lvl.grid[p.gridY][p.gridX] = CellType.INACTIVE_NODE;
          m.nodesCollected++;
          m.score += 100;

          // Update audio bpm
          audio.updateBPM(m.nodesCollected, lvl.totalNodes);

          // Check for Sonic-style rectangular perimeter closed-loop conversions!
          const conversionTriggered = checkRectangleConversion(lvl.grid, p.gridX, p.gridY, lvl.width);
          if (conversionTriggered) {
            audio.playCollect(); // Double sparks sound!
            m.score += 500; // Loop completion bonus!
          }

          // Recount remaining green nodes on grid
          let remainingNodes = 0;
          let remainingRNA = 0;
          for (let y = 0; y < lvl.height; y++) {
            for (let x = 0; x < lvl.width; x++) {
              if (lvl.grid[y][x] === CellType.NODE) remainingNodes++;
              if (lvl.grid[y][x] === CellType.RNA) remainingRNA++;
            }
          }

          if (remainingNodes === 0) {
            // Victory completed!
            audio.playWin();
            
            // Perfect bonus if collected all pre-existing RNA too
            const gatheredAllRNA = m.rnaCollected >= lvl.totalRNA;
            m.perfect = gatheredAllRNA;
            
            if (gatheredAllRNA) {
              m.score += 5000;
              const newStreak = streakCount + 1;
              setStreakCount(newStreak);
              localStorage.setItem('circuito_vivo_streak', newStreak.toString());
            } else {
              setStreakCount(0);
              localStorage.setItem('circuito_vivo_streak', '0');
            }

            // Compute speed and time bonuses
            const timeBonus = Math.max(0, 10000 - Math.floor(m.timeElapsed) * 120);
            m.score += timeBonus;

            // Generate token and record in leaderboard local file
            const tk = generateToken(lvl.seed, m.score, m.perfect);
            const entry: LeaderboardEntry = {
              seed: lvl.seed,
              score: m.score,
              nodes: m.nodesCollected,
              rna: m.rnaCollected,
              time: m.timeElapsed,
              perfect: m.perfect,
              token: tk,
              date: new Date().toLocaleDateString()
            };
            saveLeaderboardEntry(entry);
            setLeaderboard(getLocalLeaderboard());

            setStage(GameStage.RESULT);
          }
        } else if (cell === CellType.RNA) {
          // Golden RNA particle collected
          audio.playCollect();
          lvl.grid[p.gridY][p.gridX] = CellType.EMPTY;
          m.rnaCollected++;
          m.score += 200;
        }
      }

      // Trigger the canvas rendering pipeline
      if (rendererRef.current && lvl) {
        rendererRef.current.render(lvl, p, timestamp / 1000, currentStage, stateRef.current.isRetroFlash);
      }

      setPlayer({ ...p });
      setMetrics({ ...m });

      animFrameId = requestAnimationFrame(gameLoop);
    };

    animFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animFrameId);
  }, [levelData, phase, glitchFactor]);

  // Closed loop detection and cell conversion
  const checkRectangleConversion = (grid: CellType[][], lastX: number, lastY: number, size: number): boolean => {
    const W = size;
    const H = size;
    const wrap = (v: number) => (v % W + W) % W;
    let convertedAny = false;

    // Scan for rectangles from size 3x3 to 8x8 containing lastX, lastY on its border
    for (let h = 3; h <= 8; h++) {
      for (let w = 3; w <= 8; w++) {
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            const onPerim = dx === 0 || dx === w - 1 || dy === 0 || dy === h - 1;
            if (!onPerim) continue;

            const x1 = wrap(lastX - dx);
            const y1 = wrap(lastY - dy);

            // Verify perimeter consists entirely of INACTIVE_NODE
            let perimValid = true;
            for (let py = 0; py < h; py++) {
              for (let px = 0; px < w; px++) {
                const isB = px === 0 || px === w - 1 || py === 0 || py === h - 1;
                if (isB) {
                  const gx = wrap(x1 + px);
                  const gy = wrap(y1 + py);
                  if (grid[gy][gx] !== CellType.INACTIVE_NODE) {
                    perimValid = false;
                    break;
                  }
                }
              }
              if (!perimValid) break;
            }

            if (!perimValid) continue;

            // Verify there is interior structure to convert (avoid blank loops)
            let hasConvertibles = false;
            for (let py = 0; py < h; py++) {
              for (let px = 0; px < w; px++) {
                const gx = wrap(x1 + px);
                const gy = wrap(y1 + py);
                const c = grid[gy][gx];
                if (c === CellType.NODE || c === CellType.CANCER || c === CellType.INACTIVE_NODE) {
                  hasConvertibles = true;
                }
              }
            }

            if (hasConvertibles) {
              // Convert entire bounds to RNA rings!
              for (let py = 0; py < h; py++) {
                for (let px = 0; px < w; px++) {
                  const gx = wrap(x1 + px);
                  const gy = wrap(y1 + py);
                  grid[gy][gx] = CellType.RNA;
                }
              }
              convertedAny = true;
            }
          }
        }
      }
    }
    return convertedAny;
  };

  // Keyboard/Button direction input triggers
  const triggerTurn = (direction: 'LEFT' | 'RIGHT') => {
    const p = stateRef.current.player;
    if (stateRef.current.pendingTurn !== null) return;

    if (direction === 'LEFT') {
      stateRef.current.pendingTurn = 'LEFT';
      p.targetDirection = (p.direction + 3) % 4;
    } else {
      stateRef.current.pendingTurn = 'RIGHT';
      p.targetDirection = (p.direction + 1) % 4;
    }
  };

  const triggerJumpButton = () => {
    const p = stateRef.current.player;
    if (!p.isJumping) {
      p.isJumping = true;
      p.jumpType = 'SINGLE';
      p.jumpProgress = 0;
      p.jumpHeight = 0;
      audio.playJump();
    } else if (p.jumpType === 'SINGLE' && p.jumpProgress < 0.5) {
      p.jumpType = 'DOUBLE';
      audio.playJump();
    }
  };

  // Validate custom shared tokens
  const handleTokenSubmit = () => {
    if (!tokenInput.trim()) return;
    const validated = validateToken(tokenInput);
    if (validated) {
      const entry: LeaderboardEntry = {
        seed: validated.seed,
        score: validated.score,
        nodes: 0,
        rna: 0,
        time: 0,
        perfect: validated.perfect,
        token: tokenInput.trim(),
        date: new Date().toLocaleDateString() + ' (Shared)'
      };
      saveLeaderboardEntry(entry);
      setLeaderboard(getLocalLeaderboard());
      setTokenFeedback('TOKEN BIOLOGICO VALIDADO COM SUCESSO!');
      setTokenInput('');
      setTimeout(() => setTokenFeedback(''), 4000);
    } else {
      setTokenFeedback('ERRO: FORMATO OU CHECKSUM INCORRETO.');
      setTimeout(() => setTokenFeedback(''), 4000);
    }
  };

  const handlePlayLevel = (levelPhase: number) => {
    const newSeed = generateRandomSeed();
    setSeed(newSeed);
    setPhase(levelPhase);
    startRun(newSeed, levelPhase);
  };

  const handlePlayCustomSeed = () => {
    if (!customSeedInput.trim()) return;
    const cleanSeed = customSeedInput.trim().toLowerCase().slice(0, 6);
    setSeed(cleanSeed);
    startRun(cleanSeed, phase);
  };

  return (
    <div className={`relative min-h-screen bg-[#040804] text-[#ccffdd] flex flex-col items-center justify-between overflow-x-hidden ${stage === GameStage.PLAYING ? 'p-0 md:p-4' : 'p-3 sm:p-5'} select-none`}>
      
      {/* 1. TOP BAR HUD (Diagnostic panel design) */}
      <header className={`w-full max-w-5xl items-center justify-between border-b border-[#00cc66]/30 pb-3 mb-4 font-mono ${stage === GameStage.PLAYING ? 'hidden md:flex' : 'flex'}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border border-[#00cc66] flex items-center justify-center bg-[#071a0b]/80 relative overflow-hidden">
            <Activity className="w-4 h-4 text-[#00ff88] animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-[#00ff88]">CIRCUITO VIVO</h1>
            <p className="text-[10px] text-[#00cc66]/60 uppercase tracking-wider">Neural Bio-Synth Arcade</p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Mute Button */}
          <button 
            onClick={handleMuteToggle}
            className="w-9 h-9 border border-[#00cc66]/30 hover:border-[#00cc66] hover:bg-[#00cc66]/10 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
            title="Toggle Synthesizer Beat"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-[#ff4444]" /> : <Volume2 className="w-4 h-4 text-[#00ff88]" />}
          </button>

          {/* Help Button */}
          <button 
            onClick={() => setShowHowToPlay(true)}
            className="w-9 h-9 border border-[#00cc66]/30 hover:border-[#00cc66] hover:bg-[#00cc66]/10 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-[#aaffcc]" />
          </button>

          {/* Streak Indicator */}
          {streakCount > 0 && (
            <div className="px-3 py-1 bg-gradient-to-r from-[#996600]/20 to-[#ffb300]/20 border border-[#ffa300]/40 rounded-lg flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#ffa300] animate-spin" />
              <span className="text-[11px] font-bold text-[#ffd700] tracking-wider uppercase">STREAK: {streakCount}</span>
            </div>
          )}
        </div>
      </header>

      {/* 2. EASTER EGG RETRO OVERLAY FLASH */}
      <AnimatePresence>
        {isRetroFlash && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[#000033] z-50 flex flex-col items-center justify-center border-8 border-yellow-400 p-6"
          >
            <div className="text-center font-mono space-y-4">
              <p className="text-yellow-400 text-3xl font-extrabold tracking-widest animate-bounce">
                // MEMÓRIA ANTIGA DETECTADA //
              </p>
              <div className="w-64 h-32 border-4 border-dashed border-cyan-400 mx-auto flex items-center justify-center">
                <span className="text-cyan-400 text-6xl font-bold font-serif select-none animate-pulse">8-BIT</span>
              </div>
              <p className="text-[#aaffcc] text-xs uppercase tracking-widest">
                Sincronizando fita magnética... carregando bônus...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. CORE VIEWS & SCREENS */}
      <main className="flex-1 w-full max-w-5xl flex flex-col items-center justify-center relative">
        
        {/* --- STAGE A: GAMEPLAY ACTIVE CANVAS --- */}
        <div className={`overflow-hidden relative bg-black shadow-[0_0_35px_rgba(0,204,102,0.15)] ${
          stage === GameStage.PLAYING 
            ? 'fixed inset-0 z-50 w-full h-[100dvh] md:relative md:inset-auto md:w-full md:h-[68vh] md:min-h-[480px] md:max-h-[760px] md:rounded-2xl md:border md:border-[#00cc66]/30' 
            : 'hidden'
        }`}>
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
          />

          {/* Inline Active HUD Overlay */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between font-mono bg-[#050e06]/90 border border-[#00cc66]/25 rounded-lg py-2 px-3.5 select-none pointer-events-none">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex flex-col">
                <span className="text-[9px] text-[#00cc66]/50">SINAPSES ATIVADAS</span>
                <span className="font-bold text-[#00ff88] text-sm">
                  {metrics.nodesCollected} <span className="text-[10px] font-normal text-[#00cc66]/60">/ {levelData?.totalNodes}</span>
                </span>
              </div>
              <div className="w-px h-6 bg-[#00cc66]/20" />
              <div className="flex flex-col">
                <span className="text-[9px] text-[#00cc66]/50">FRAGMENTOS RNA</span>
                <span className="font-bold text-[#ffd700] text-sm">
                  {metrics.rnaCollected} <span className="text-[10px] font-normal text-[#00cc66]/60">/ {levelData?.totalRNA}</span>
                </span>
              </div>
            </div>

            <div className="text-right flex items-center gap-4 text-xs">
              <div className="flex flex-col">
                <span className="text-[9px] text-[#00cc66]/50">CRONÔMETRO NEURAL</span>
                <span className="font-bold text-white text-sm">{metrics.timeElapsed.toFixed(1)}s</span>
              </div>
              <div className="w-px h-6 bg-[#00cc66]/20" />
              <div className="flex flex-col">
                <span className="text-[9px] text-[#00cc66]/50">SCORE</span>
                <span className="font-bold text-[#aaffcc] text-sm">{metrics.score}</span>
              </div>
            </div>
          </div>

          {/* Interactive Mobile Touch Controls Overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
            {/* Steering (Turn Dirs) */}
            <div className="flex items-center gap-3">
              <button
                onTouchStart={() => triggerTurn('LEFT')}
                onClick={() => triggerTurn('LEFT')}
                className="w-14 h-14 rounded-full border border-[#00cc66]/50 bg-[#051107]/90 active:bg-[#00cc66]/20 text-[#00ff88] flex items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <button
                onTouchStart={() => triggerTurn('RIGHT')}
                onClick={() => triggerTurn('RIGHT')}
                className="w-14 h-14 rounded-full border border-[#00cc66]/50 bg-[#051107]/90 active:bg-[#00cc66]/20 text-[#00ff88] flex items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
              >
                <ArrowRight className="w-6 h-6" />
              </button>
            </div>

            {/* Jump Button & Pause */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setStage(GameStage.PAUSED)}
                className="w-11 h-11 rounded-lg border border-[#00cc66]/40 bg-[#051107]/90 active:bg-[#00cc66]/20 text-[#aaffcc] flex items-center justify-center transition-all cursor-pointer"
              >
                <Pause className="w-4 h-4" />
              </button>
              
              <button
                onTouchStart={triggerJumpButton}
                onClick={triggerJumpButton}
                className="px-6 h-14 rounded-full border border-[#ffa300]/60 bg-[#140f04]/95 active:bg-[#ffa300]/30 text-[#ffa300] font-mono text-xs font-bold tracking-widest flex items-center justify-center active:scale-95 transition-all shadow-md cursor-pointer"
              >
                IMPULSO SALTO
              </button>
            </div>
          </div>
        </div>

        {/* --- STAGE B: MAIN MENU & DASHBOARD --- */}
        {stage === GameStage.MENU && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="w-full grid grid-cols-1 md:grid-cols-12 gap-5"
          >
            {/* Play Panel */}
            <div className="md:col-span-7 bg-[#071208]/90 border border-[#00cc66]/30 rounded-xl p-5 space-y-5 shadow-[0_0_20px_rgba(0,204,102,0.05)]">
              <div>
                <h2 className="text-[#00ff88] font-mono text-base font-bold flex items-center gap-1.5 uppercase tracking-wide">
                  <Play className="w-4 h-4 text-[#00ff88]" />
                  Conexão Neural do Organismo
                </h2>
                <p className="text-[11px] font-mono text-[#00cc66]/60 mt-1 uppercase">Selecione uma fase funcional para iniciar a corrida</p>
              </div>

              {/* Levels list (Phases 1 - 20) */}
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((levelPhase) => {
                  let difficultyText = 'LENTA';
                  let diffColor = 'text-[#00ff88] border-[#00ff88]/20 hover:bg-[#00ff88]/10';
                  if (levelPhase > 3 && levelPhase <= 8) {
                    difficultyText = 'MÉDIA';
                    diffColor = 'text-[#aaffcc] border-[#aaffcc]/20 hover:bg-[#aaffcc]/10';
                  } else if (levelPhase > 8 && levelPhase <= 15) {
                    difficultyText = 'RÁPIDA';
                    diffColor = 'text-[#ffa300] border-[#ffa300]/20 hover:bg-[#ffa300]/10';
                  } else if (levelPhase > 15) {
                    difficultyText = 'MÁXIMA';
                    diffColor = 'text-[#ff4444] border-[#ff4444]/20 hover:bg-[#ff4444]/10';
                  }

                  return (
                    <button
                      key={levelPhase}
                      onClick={() => handlePlayLevel(levelPhase)}
                      className={`flex flex-col items-center justify-center py-2.5 px-1 border rounded-lg transition-all cursor-pointer font-mono ${diffColor}`}
                    >
                      <span className="text-[13px] font-bold">F{levelPhase}</span>
                      <span className="text-[7px] tracking-wide mt-1 uppercase font-normal">{difficultyText}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Seed Input */}
              <div className="border-t border-[#00cc66]/15 pt-4 space-y-3 font-mono">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-[#00cc66]/70 uppercase font-bold">Injetar Seed Customizado (6 dígitos)</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. a3f9b2"
                      value={customSeedInput}
                      onChange={(e) => setCustomSeedInput(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                      className="flex-1 py-2 px-3 bg-[#030904] border border-[#00cc66]/30 rounded-lg text-xs font-mono text-[#00ff88] focus:outline-none focus:border-[#00ff88] tracking-widest placeholder-[#00cc66]/30"
                    />
                    <button
                      onClick={handlePlayCustomSeed}
                      disabled={!customSeedInput.trim()}
                      className="py-2 px-4 bg-[#00cc66]/20 hover:bg-[#00cc66]/35 disabled:opacity-40 border border-[#00cc66]/40 text-xs font-bold text-[#00ff88] rounded-lg transition-colors cursor-pointer"
                    >
                      INICIAR SEED
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right sidebar: Leaderboard & Shared Tokens */}
            <div className="md:col-span-5 flex flex-col gap-5">
              
              {/* Leaderboard panel */}
              <div className="bg-[#071208]/90 border border-[#00cc66]/30 rounded-xl p-4 flex-1 space-y-3 shadow-[0_0_20px_rgba(0,204,102,0.05)]">
                <h3 className="text-[#00ff88] font-mono text-sm font-bold flex items-center gap-1.5 uppercase">
                  <Trophy className="w-4 h-4 text-[#ffd700]" />
                  Ranking Local Neural
                </h3>
                
                <div className="font-mono text-[11px] max-h-[170px] overflow-y-auto space-y-1.5 pr-1 custom-scroll">
                  {leaderboard.length === 0 ? (
                    <div className="py-8 text-center text-[#00cc66]/45 uppercase text-[10px] tracking-widest">
                      Nenhum registro sináptico ainda
                    </div>
                  ) : (
                    leaderboard.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={`p-2 border rounded flex items-center justify-between ${item.perfect ? 'border-[#ffa300]/30 bg-[#ffd700]/5' : 'border-[#00cc66]/15 bg-[#030904]'}`}
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-[#00ff88] text-xs">#{idx + 1} {item.score} <span className="text-[9px] font-normal text-[#00cc66]/60">pts</span></span>
                          <span className="text-[8px] text-[#00cc66]/50 uppercase mt-0.5">Seed: {item.seed} | {item.date}</span>
                        </div>
                        {item.perfect ? (
                          <div className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-[#ffa300] animate-spin" />
                            <span className="text-[8px] font-bold text-[#ffd700] uppercase">PERFEITA</span>
                          </div>
                        ) : (
                          <span className="text-[8px] text-[#00cc66]/60 uppercase">COMPLETA</span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Paste Share Token Panel */}
              <div className="bg-[#071208]/90 border border-[#00cc66]/30 rounded-xl p-4 space-y-3 font-mono shadow-[0_0_20px_rgba(0,204,102,0.05)]">
                <h3 className="text-[#00ff88] text-xs font-bold uppercase flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#00ff88]" />
                  Validar Token Compartilhado
                </h3>
                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    placeholder="e.g. CV-a3f9b2-00420-3F9A"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="py-2 px-3 bg-[#030904] border border-[#00cc66]/30 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[#00ff88] placeholder-[#00cc66]/30"
                  />
                  <button
                    onClick={handleTokenSubmit}
                    className="py-2 px-3 bg-[#00cc66]/20 hover:bg-[#00cc66]/35 text-xs font-bold text-[#aaffcc] rounded-lg transition-colors cursor-pointer border border-[#00cc66]/40"
                  >
                    INJETAR TOKEN NO RANKING
                  </button>
                  {tokenFeedback && (
                    <p className={`text-[9px] font-bold uppercase tracking-wider text-center mt-1 ${tokenFeedback.startsWith('ERRO') ? 'text-red-400' : 'text-[#00ff88]'}`}>
                      {tokenFeedback}
                    </p>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {/* --- STAGE C: PAUSED DIALOG OVERLAY --- */}
        {stage === GameStage.PAUSED && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-sm bg-[#051006] border border-[#00cc66]/40 rounded-xl p-6 text-center font-mono space-y-6 shadow-[0_0_30px_rgba(0,204,102,0.15)]"
          >
            <div className="space-y-1">
              <h2 className="text-[#00ff88] text-xl font-bold tracking-widest">SINAL SUSPENSO</h2>
              <p className="text-[10px] text-[#00cc66]/60 uppercase tracking-widest">// IMPULSO PAUSADO</p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  stateRef.current.lastTime = performance.now();
                  setStage(GameStage.PLAYING);
                }}
                className="py-3 px-4 bg-[#00cc66]/20 hover:bg-[#00cc66]/35 active:bg-[#00cc66]/50 text-[#aaffcc] border border-[#00cc66]/40 font-bold text-xs rounded-lg transition-colors cursor-pointer uppercase tracking-widest"
              >
                RETOMAR CORRIDA
              </button>
              <button
                onClick={() => startRun(seed, phase)}
                className="py-3 px-4 bg-transparent hover:bg-[#00cc66]/10 text-[#00cc66] font-bold text-xs rounded-lg transition-colors cursor-pointer border border-[#00cc66]/20 uppercase tracking-widest"
              >
                RECOMEÇAR NEURAL
              </button>
              <button
                onClick={() => setStage(GameStage.MENU)}
                className="py-3 px-4 bg-transparent hover:bg-red-950/20 text-[#ff4444] font-bold text-xs rounded-lg transition-colors cursor-pointer border border-red-500/10 uppercase tracking-widest"
              >
                SAIR DO ORGANISMO
              </button>
            </div>
          </motion.div>
        )}

        {/* --- STAGE D: RESULT & PERFORMANCE EVALUATION SCREEN --- */}
        {stage === GameStage.RESULT && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            {/* Left Result Card */}
            <div className="bg-[#071208]/95 border border-[#00cc66]/30 rounded-xl p-5 flex flex-col justify-between font-mono space-y-5 shadow-[0_0_20px_rgba(0,204,102,0.05)]">
              
              <div className="space-y-1">
                {metrics.nodesCollected === levelData?.totalNodes ? (
                  <>
                    <h2 className="text-[#00ff88] text-lg font-bold tracking-widest flex items-center gap-1.5">
                      <Check className="w-5 h-5 text-[#00ff88]" />
                      SISTEMA RESTAURADO
                    </h2>
                    <p className="text-[10px] text-[#00cc66]/60 uppercase tracking-widest">// CONEXÃO ESTABELECIDA COM SUCESSO</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-[#ff4444] text-lg font-bold tracking-widest flex items-center gap-1.5">
                      <RotateCcw className="w-5 h-5 text-[#ff4444]" />
                      CONTAMINAÇÃO DETECTADA
                    </h2>
                    <p className="text-[10px] text-red-400/50 uppercase tracking-widest">// REFAÇA O CIRCUITO SINÁPTICO</p>
                  </>
                )}
              </div>

              {/* Stats panel */}
              <div className="border-y border-[#00cc66]/15 py-3.5 space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#00cc66]/60 uppercase">NÓS ATIVADOS</span>
                  <span className="font-bold text-[#00ff88]">{metrics.nodesCollected} / {levelData?.totalNodes}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#00cc66]/60 uppercase">RNA REUNIDO</span>
                  <span className="font-bold text-[#ffd700]">{metrics.rnaCollected} / {levelData?.totalRNA}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#00cc66]/60 uppercase">TEMPO TOTAL</span>
                  <span className="font-bold text-white">{metrics.timeElapsed.toFixed(1)}s</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#00cc66]/60 uppercase">SEED DO ORGANISMO</span>
                  <span className="font-bold text-[#aaffcc] tracking-widest uppercase">{levelData?.seed}</span>
                </div>
                <div className="flex justify-between items-center text-sm font-bold border-t border-[#00cc66]/10 pt-2 text-[#00ff88]">
                  <span>PONTUAÇÃO GLOBAL</span>
                  <span>{metrics.score} <span className="text-[10px] font-normal text-[#00cc66]/60">pts</span></span>
                </div>
              </div>

              {/* Share Token generation block */}
              {metrics.nodesCollected === levelData?.totalNodes && (
                <div className="p-3 border border-[#ffd700]/30 bg-[#ffd700]/5 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#ffd700] uppercase">
                    <span>TOKEN BIOLÓGICO DO REPLAY</span>
                    <Share2 className="w-3.5 h-3.5 text-[#ffd700]" />
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generateToken(levelData?.seed || '', metrics.score, metrics.perfect)}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 text-[10px] py-1.5 px-2 bg-black border border-[#ffd700]/40 rounded text-[#ffd700] font-mono tracking-wider focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        const tok = generateToken(levelData?.seed || '', metrics.score, metrics.perfect);
                        navigator.clipboard.writeText(tok);
                      }}
                      className="py-1.5 px-3 bg-[#ffd700]/20 text-[#ffd700] hover:bg-[#ffd700]/30 rounded text-[9px] font-bold transition-all cursor-pointer border border-[#ffd700]/30"
                    >
                      COPIAR
                    </button>
                  </div>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex flex-col gap-2 pt-2">
                {metrics.nodesCollected === levelData?.totalNodes ? (
                  <button
                    onClick={() => {
                      const nextLvl = Math.min(20, phase + 1);
                      setPhase(nextLvl);
                      startRun(generateRandomSeed(), nextLvl);
                    }}
                    className="py-2.5 px-4 bg-[#00cc66]/20 hover:bg-[#00cc66]/35 active:bg-[#00cc66]/50 text-[#aaffcc] border border-[#00cc66]/40 font-bold text-xs rounded-lg transition-colors cursor-pointer uppercase tracking-widest"
                  >
                    PRÓXIMA FASE NEURAL (F{Math.min(20, phase + 1)})
                  </button>
                ) : (
                  <button
                    onClick={() => startRun(seed, phase)}
                    className="py-2.5 px-4 bg-[#00cc66]/20 hover:bg-[#00cc66]/35 active:bg-[#00cc66]/50 text-[#aaffcc] border border-[#00cc66]/40 font-bold text-xs rounded-lg transition-colors cursor-pointer uppercase tracking-widest"
                  >
                    TENTAR NOVAMENTE
                  </button>
                )}
                
                <button
                  onClick={() => setShowHeatmap(!showHeatmap)}
                  className="py-2.5 px-4 bg-transparent hover:bg-[#00cc66]/10 text-[#00cc66] border border-[#00cc66]/20 font-bold text-xs rounded-lg transition-colors cursor-pointer uppercase tracking-widest flex items-center justify-center gap-1.5"
                >
                  <Activity className="w-4 h-4" />
                  {showHeatmap ? 'ESCONDER MAPA CALOR' : 'VER DIAGNÓSTICO CALOR'}
                </button>

                <button
                  onClick={() => setStage(GameStage.MENU)}
                  className="py-2 px-4 bg-transparent hover:bg-white/5 text-[#00cc66]/60 font-bold text-xs rounded-lg transition-all border border-transparent hover:border-[#00cc66]/10 cursor-pointer uppercase tracking-widest"
                >
                  VOLTAR AO MENU PRINCIPAL
                </button>
              </div>

            </div>

            {/* Right Diagnostic Heatmap panel (Visible if toggled) */}
            <div className="flex items-center justify-center">
              {showHeatmap && levelData && (
                <HeatmapView
                  level={levelData}
                  player={player}
                  metrics={metrics}
                  onClose={() => setShowHeatmap(false)}
                />
              )}
              {!showHeatmap && (
                <div className="hidden md:flex flex-col items-center justify-center border border-dashed border-[#00cc66]/15 rounded-xl p-8 w-full h-full bg-[#050c05]/30">
                  <Activity className="w-12 h-12 text-[#00cc66]/25 animate-pulse mb-3" />
                  <p className="font-mono text-center text-xs text-[#00cc66]/55 uppercase tracking-wider max-w-xs">
                    Ative o "Diagnóstico Calor" para mapear os caminhos eletroquímicos de sinapse percorridos durante esta sessão
                  </p>
                </div>
              )}
            </div>

          </motion.div>
        )}

      </main>

      {/* 4. FOOTER & CREDITS */}
      <footer className={`w-full max-w-5xl border-t border-[#00cc66]/15 pt-3 mt-4 text-center font-mono text-[9px] text-[#00cc66]/40 uppercase tracking-widest flex-col sm:flex-row items-center justify-between gap-2.5 ${stage === GameStage.PLAYING ? 'hidden md:flex' : 'flex'}`}>
        <span>Circuito Vivo v0.1 · Inspirado em Blue Sphere</span>
        <span>Offline-First Bio-Synth Network · leohconstantino@gmail.com</span>
      </footer>

      {/* 5. DIAGNOSTIC GUIDE / HOW TO PLAY MODAL */}
      <AnimatePresence>
        {showHowToPlay && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono text-xs"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-[#050e06] border border-[#00cc66]/50 rounded-xl max-w-lg p-5 space-y-4 shadow-[0_0_30px_rgba(0,204,102,0.2)] text-[#aaffcc]"
            >
              <div className="flex items-center justify-between border-b border-[#00cc66]/20 pb-2">
                <h3 className="font-bold text-sm text-[#00ff88] uppercase tracking-wider">GUIA DE TRANSMISSÃO NEURAL</h3>
                <button 
                  onClick={() => setShowHowToPlay(false)}
                  className="w-6 h-6 border border-[#00cc66]/40 text-[#00ff88] hover:bg-[#00cc66]/15 flex items-center justify-center rounded cursor-pointer"
                >
                  X
                </button>
              </div>

              <div className="space-y-3 pr-1 max-h-[300px] overflow-y-auto custom-scroll leading-relaxed text-[11px]">
                <p>
                  Você é um <strong className="text-[#00ff88] font-bold">sinal neural elétrico</strong> correndo automaticamente pela matriz viva de um organismo sintético toroidal.
                </p>

                <div className="space-y-1 pt-1">
                  <span className="font-bold text-[#00ff88] uppercase tracking-wide block">OBJETIVOS PRINCIPAIS:</span>
                  <div className="flex items-start gap-1.5">
                    <CornerDownRight className="w-3.5 h-3.5 mt-0.5 text-[#00ff88] shrink-0" />
                    <span>Ative todos os <strong className="text-[#00ff88]">Nós Sinápticos (Esferas Verdes)</strong> correndo sobre eles.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <CornerDownRight className="w-3.5 h-3.5 mt-0.5 text-[#ffa300] shrink-0" />
                    <span>Colete todos os <strong className="text-[#ffd700]">Fragmentos de RNA (Dourados)</strong> flutuantes para um resultado perfeito.</span>
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <span className="font-bold text-[#ff4444] uppercase tracking-wide block">AMEAÇAS BIOLÓGICAS:</span>
                  <div className="flex items-start gap-1.5">
                    <CornerDownRight className="w-3.5 h-3.5 mt-0.5 text-red-500 shrink-0" />
                    <span>Evite <strong className="text-[#ff4444]">Células Cancerígenas (Esferas Vermelhas Asimétricas)</strong> e nós já coletados desativados. Tocá-los sem pular causará um colapso!</span>
                  </div>
                </div>

                <div className="space-y-1 pt-1">
                  <span className="font-bold text-[#00ff88] uppercase tracking-wide block">CONTROLES ARCADES:</span>
                  <div className="grid grid-cols-2 gap-3 p-2 bg-[#020702] border border-[#00cc66]/20 rounded">
                    <div>
                      <span className="font-bold text-white uppercase block">Teclado:</span>
                      <span>← / A: Girar Esquerda</span><br />
                      <span>→ / D: Girar Direita</span><br />
                      <span>Espaço: Pular</span><br />
                      <span>Espaço Duplo: Salto Longo</span>
                    </div>
                    <div>
                      <span className="font-bold text-white uppercase block">Mobile/Mouse:</span>
                      <span>Use as setas e botões gigantes na tela de forma tátil.</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1 pt-1 border-t border-[#00cc66]/20 pt-2 text-[10px] text-[#00cc66]/70 uppercase">
                  <p className="font-bold text-[#ffd700]">💡 SEGREDO DE CONVERSÃO SINÁPTICA:</p>
                  <p>
                    Se você formar um <strong className="text-[#ffd700]">retângulo fechado</strong> coletando todos os nós da borda, o interior e a borda serão imediatamente purificados e convertidos em abundantes <strong className="text-[#ffd700]">Fragmentos RNA Dourados</strong>!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowHowToPlay(false)}
                className="w-full py-2 bg-[#00cc66]/20 hover:bg-[#00cc66]/35 text-xs text-[#aaffcc] border border-[#00cc66]/40 rounded-lg transition-colors font-bold cursor-pointer uppercase tracking-wider"
              >
                ENTENDIDO, VOLTAR
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
