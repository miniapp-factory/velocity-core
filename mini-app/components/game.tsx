"use client";

import { useEffect, useRef, useState } from "react";

const TRACK_WIDTH_RATIO = 0.6;
const PLAYER_SIZE = 15;
const PLAYER_SMOOTHING = 0.25;
const OBSTACLE_HEIGHT = 20;
const FRAME_RATE = 60;
const SCORE_INTERVAL = 10; // frames per score point

type Difficulty = "EASY" | "MEDIUM" | "HARD";

const DIFFICULTY_SETTINGS: Record<Difficulty, {
  initialSpeed: number;
  scoreMultiplier: number;
  spawnInterval: number;
  minGapRatio: number;
  maxGapRatio: number;
  maxComplexity: number;
}> = {
  EASY: {
    initialSpeed: 0.35,
    scoreMultiplier: 0.00008,
    spawnInterval: 160,
    minGapRatio: 0.45,
    maxGapRatio: 0.70,
    maxComplexity: 1,
  },
  MEDIUM: {
    initialSpeed: 0.60,
    scoreMultiplier: 0.00012,
    spawnInterval: 130,
    minGapRatio: 0.35,
    maxGapRatio: 0.60,
    maxComplexity: 4,
  },
  HARD: {
    initialSpeed: 1.00,
    scoreMultiplier: 0.00020,
    spawnInterval: 90,
    minGapRatio: 0.25,
    maxGapRatio: 0.45,
    maxComplexity: 5,
  },
};

type Obstacle = {
  id: number;
  type: number;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  rotation?: number; // for spinning core
  amplitude?: number; // for moving gap
  omega?: number; // frequency for moving gap
};

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const stored = localStorage.getItem("velocity_high");
    return stored ? parseInt(stored, 10) : 0;
  });
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [gameOver, setGameOver] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [shake, setShake] = useState(false);

  const player = useRef({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    size: PLAYER_SIZE,
  });

  const obstacles = useRef<Obstacle[]>([]);
  const frameCount = useRef(0);
  const lastSpawn = useRef(0);
  const speed = useRef(DIFFICULTY_SETTINGS[difficulty].initialSpeed);

  // Setup canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      // Center player horizontally in track
      const trackXStart = (canvas.width - canvas.width * TRACK_WIDTH_RATIO) / 2;
      player.current.x = canvas.width / 2;
      player.current.y = canvas.height - 100;
      player.current.targetX = player.current.x;
      player.current.targetY = player.current.y;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Input handling
  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = "touches" in e ? e.touches[0].clientX : e.clientX;
      const y = "touches" in e ? e.touches[0].clientY : e.clientY;
      const canvasX = x - rect.left;
      const canvasY = y - rect.top;
      player.current.targetX = canvasX;
      player.current.targetY = canvasY;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("touchmove", handleMove);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("touchmove", handleMove);
    };
  }, []);

  // Game loop
  useEffect(() => {
    if (gameOver) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const interval = setInterval(() => {
      frameCount.current += 1;
      // Update speed
      const base = DIFFICULTY_SETTINGS[difficulty].initialSpeed;
      const multiplier = DIFFICULTY_SETTINGS[difficulty].scoreMultiplier;
      speed.current = base + frameCount.current * multiplier;

      // Move player
      const p = player.current;
      p.x += (p.targetX - p.x) * PLAYER_SMOOTHING;
      p.y += (p.targetY - p.y) * PLAYER_SMOOTHING;

      // Clamp horizontally within track
      const trackXStart = (canvas.width - canvas.width * TRACK_WIDTH_RATIO) / 2;
      const trackXEnd = trackXStart + canvas.width * TRACK_WIDTH_RATIO;
      const half = p.size / 2;
      if (p.x - half < trackXStart) p.x = trackXStart + half;
      if (p.x + half > trackXEnd) p.x = trackXEnd - half;

      // Spawn obstacles
      if (frameCount.current - lastSpawn.current > DIFFICULTY_SETTINGS[difficulty].spawnInterval) {
        spawnObstacle(canvas.width, canvas.height);
        lastSpawn.current = frameCount.current;
      }

      // Update obstacles
      obstacles.current = obstacles.current.filter(o => o.y < canvas.height + o.height);
      obstacles.current.forEach(o => {
        o.y += speed.current * (o.type === 5 ? 2.5 : 1);
        if (o.type === 3 && o.amplitude && o.omega) {
          o.x = trackXStart + (canvas.width * TRACK_WIDTH_RATIO - o.width) / 2 +
            o.amplitude * Math.sin(o.omega * frameCount.current);
        }
        if (o.type === 4 && o.rotation !== undefined) {
          o.rotation += 0.07;
        }
      });

      // Collision detection
      const collided = obstacles.current.some(o => checkCollision(p, o, trackXStart, trackXEnd));
      if (collided) {
        setGameOver(true);
        setOverlayVisible(true);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        const newHigh = Math.max(highScore, score);
        setHighScore(newHigh);
        localStorage.setItem("velocity_high", newHigh.toString());
        return;
      }

      // Scoring
      if (frameCount.current % SCORE_INTERVAL === 0) {
        setScore(prev => prev + 1);
      }

      // Render
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Background
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Track border
      ctx.strokeStyle = "#00ffaa";
      ctx.lineWidth = 3;
      ctx.strokeRect(trackXStart, 0, canvas.width * TRACK_WIDTH_RATIO, canvas.height);
      // Draw obstacles
      obstacles.current.forEach(o => drawObstacle(ctx, o, trackXStart));
      // Draw player
      ctx.fillStyle = "#00ffaa";
      ctx.fillRect(p.x - half, p.y - half, p.size, p.size);
    }, 1000 / FRAME_RATE);

    return () => clearInterval(interval);
  }, [gameOver, difficulty, highScore, score]);

  const spawnObstacle = (canvasW: number, canvasH: number) => {
    const trackXStart = (canvasW - canvasW * TRACK_WIDTH_RATIO) / 2;
    const trackWidth = canvasW * TRACK_WIDTH_RATIO;
    const maxComplex = DIFFICULTY_SETTINGS[difficulty].maxComplexity;
    const type = Math.floor(Math.random() * maxComplex) + 1;
    const gapRatio = Math.random() * (DIFFICULTY_SETTINGS[difficulty].maxGapRatio - DIFFICULTY_SETTINGS[difficulty].minGapRatio) +
      DIFFICULTY_SETTINGS[difficulty].minGapRatio;
    const gapWidth = trackWidth * gapRatio;
    const obstacle: Obstacle = {
      id: Date.now() + Math.random(),
      type,
      x: trackXStart,
      y: -OBSTACLE_HEIGHT,
      width: trackWidth,
      height: OBSTACLE_HEIGHT,
      speed: speed.current,
    };
    if (type === 3) {
      obstacle.amplitude = trackWidth * 0.2;
      obstacle.omega = 0.02 + Math.random() * 0.03;
    }
    if (type === 4) {
      obstacle.rotation = 0;
    }
    obstacles.current.push(obstacle);
  };

  const checkCollision = (p: typeof player.current, o: Obstacle, trackXStart: number, trackXEnd: number) => {
    const half = p.size / 2;
    const px1 = p.x - half;
    const px2 = p.x + half;
    const py1 = p.y - half;
    const py2 = p.y + half;

    // Simple AABB with obstacle
    if (py2 < o.y || py1 > o.y + o.height) return false;
    if (px2 < o.x || px1 > o.x + o.width) return false;

    // For types with gaps, check if player is inside gap
    if (o.type === 1) {
      const gapStart = o.x + (o.width - (o.width * DIFFICULTY_SETTINGS[difficulty].maxGapRatio)) / 2;
      const gapEnd = gapStart + (o.width * DIFFICULTY_SETTINGS[difficulty].maxGapRatio);
      if (px1 >= gapStart && px2 <= gapEnd) return false;
    }
    if (o.type === 2) {
      const gapSize = o.width * 0.1;
      const gapStart = o.x + (o.width - gapSize) / 2;
      const gapEnd = gapStart + gapSize;
      if (px1 >= gapStart && px2 <= gapEnd) return false;
    }
    if (o.type === 3) {
      const gapSize = o.width * DIFFICULTY_SETTINGS[difficulty].maxGapRatio;
      const gapStart = o.x + (o.width - gapSize) / 2;
      const gapEnd = gapStart + gapSize;
      if (px1 >= gapStart && px2 <= gapEnd) return false;
    }
    if (o.type === 5) {
      // Hyper dash wall has no gap
      return true;
    }
    if (o.type === 4) {
      // Spinning core collision
      const centerX = o.x + o.width / 2;
      const centerY = o.y + o.height / 2;
      const radius = o.width / 2;
      const barThickness = o.width / 5;
      // Rotate player position into obstacle frame
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      const angle = -o.rotation;
      const rx = dx * Math.cos(angle) - dy * Math.sin(angle);
      const ry = dx * Math.sin(angle) + dy * Math.cos(angle);
      // Horizontal bar
      if (Math.abs(ry) < barThickness / 2 && Math.abs(rx) < radius) return true;
      // Vertical bar
      if (Math.abs(rx) < barThickness / 2 && Math.abs(ry) < radius) return true;
    }
    return true;
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, o: Obstacle, trackXStart: number) => {
    ctx.fillStyle = "#ff9900";
    if (o.type === 5) ctx.fillStyle = "#ff9900";
    else ctx.fillStyle = "#ff00ff";
    ctx.fillRect(o.x, o.y, o.width, o.height);
    if (o.type === 4 && o.rotation !== undefined) {
      ctx.save();
      ctx.translate(o.x + o.width / 2, o.y + o.height / 2);
      ctx.rotate(o.rotation);
      ctx.fillStyle = "#00ffaa";
      ctx.fillRect(-o.width / 2, -o.height / 4, o.width, o.height / 2);
      ctx.fillRect(-o.width / 4, -o.height / 2, o.width / 2, o.height);
      ctx.restore();
    }
  };

  const restart = () => {
    setGameOver(false);
    setOverlayVisible(false);
    setScore(0);
    frameCount.current = 0;
    lastSpawn.current = 0;
    obstacles.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      const trackXStart = (canvas.width - canvas.width * TRACK_WIDTH_RATIO) / 2;
      player.current.x = canvas.width / 2;
      player.current.y = canvas.height - 100;
      player.current.targetX = player.current.x;
      player.current.targetY = player.current.y;
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full h-full ${shake ? "animate-shake" : ""}`}>
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute top-4 left-4 text-white">
        <div>Score: {score}</div>
        <div>High: {highScore}</div>
        <div>
          Mode:
          <select
            value={difficulty}
            onChange={e => setDifficulty(e.target.value as Difficulty)}
            className="ml-2 bg-black text-white"
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </div>
      </div>
      {overlayVisible && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black bg-opacity-70 text-white">
          <h2 className="text-4xl mb-4">Game Over</h2>
          <p className="mb-4">Final Score: {score}</p>
          <button
            onClick={restart}
            className="px-6 py-2 bg-green-500 rounded hover:bg-green-600"
          >
            Restart
          </button>
        </div>
      )}
    </div>
  );
}
