/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { GameLevel, PlayerState, GameMetrics } from '../types';
import { Download, Activity } from 'lucide-react';

interface HeatmapViewProps {
  level: GameLevel;
  player: PlayerState;
  metrics: GameMetrics;
  onClose: () => void;
}

export const HeatmapView: React.FC<HeatmapViewProps> = ({
  level,
  player,
  metrics,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.fillStyle = '#050c06';
    ctx.fillRect(0, 0, W, H);

    // Grid size
    const gridSize = level.width;
    const padding = 40;
    const cellSize = (W - padding * 2) / gridSize;

    // 1. Calculate visit counts per cell from player history
    const visitCounts = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
    let maxVisits = 1;

    player.history.forEach((pos) => {
      // Round to nearest integer cell index
      const x = Math.min(gridSize - 1, Math.max(0, Math.floor(pos.x)));
      const y = Math.min(gridSize - 1, Math.max(0, Math.floor(pos.y)));
      visitCounts[y][x]++;
      if (visitCounts[y][x] > maxVisits) {
        maxVisits = visitCounts[y][x];
      }
    });

    // 2. Draw Grid and Intensity Heatmap
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const cx = padding + x * cellSize;
        const cy = padding + y * cellSize;

        // Draw tile background based on intensity
        const visits = visitCounts[y][x];
        if (visits > 0) {
          const ratio = visits / maxVisits;
          // Build biopunk gradient colors: dark teal -> glowing cyan -> pure white
          if (ratio < 0.3) {
            ctx.fillStyle = `rgba(0, 120, 80, ${0.15 + ratio * 0.5})`;
          } else if (ratio < 0.7) {
            ctx.fillStyle = `rgba(0, 230, 120, ${0.3 + ratio * 0.5})`;
          } else {
            ctx.fillStyle = `rgba(170, 255, 220, ${0.6 + ratio * 0.4})`;
          }
          ctx.fillRect(cx, cy, cellSize, cellSize);
        } else {
          // Empty cell background
          ctx.fillStyle = (x + y) % 2 === 0 ? '#081309' : '#040b05';
          ctx.fillRect(cx, cy, cellSize, cellSize);
        }

        // Draw delicate grid lines
        ctx.strokeStyle = 'rgba(40, 180, 80, 0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx, cy, cellSize, cellSize);
      }
    }

    // 3. Draw initial map objects to give context
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const cellType = level.grid[y][x];
        const cx = padding + x * cellSize + cellSize / 2;
        const cy = padding + y * cellSize + cellSize / 2;

        if (cellType === 3) { // Cancer cell
          ctx.fillStyle = 'rgba(255, 60, 60, 0.6)';
          ctx.beginPath();
          ctx.arc(cx, cy, cellSize * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ff3333';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (cellType === 1 || cellType === 2) { // Green Synapse Node
          ctx.fillStyle = 'rgba(0, 255, 136, 0.4)';
          ctx.beginPath();
          ctx.arc(cx, cy, cellSize * 0.25, 0, Math.PI * 2);
          ctx.fill();
        } else if (cellType === 4) { // RNA
          ctx.fillStyle = 'rgba(255, 224, 102, 0.5)';
          ctx.beginPath();
          ctx.arc(cx, cy, cellSize * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 4. Draw continuous line trail representing player's route
    if (player.history.length > 1) {
      ctx.beginPath();
      player.history.forEach((pos, idx) => {
        const hx = padding + pos.x * cellSize;
        const hy = padding + pos.y * cellSize;
        if (idx === 0) {
          ctx.moveTo(hx, hy);
        } else {
          // Handle toroidal line-wrap visual splits cleanly
          const prev = player.history[idx - 1];
          const dist = Math.hypot(pos.x - prev.x, pos.y - prev.y);
          if (dist > 2) {
            ctx.stroke(); // Terminate path
            ctx.beginPath(); // Start new sub-path to prevent giant diagonal split lines
            ctx.moveTo(hx, hy);
          } else {
            ctx.lineTo(hx, hy);
          }
        }
      });
      ctx.strokeStyle = '#aaffcc';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00ff88';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset
    }

    // 5. Render decorative clinical overlay metadata
    ctx.fillStyle = 'rgba(0, 204, 102, 0.8)';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('DIAGNOSTICO DE FLUXO NEURAL', 15, 22);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px monospace';
    ctx.fillText(`SEED: ${level.seed.toUpperCase()}`, 15, H - 15);
    ctx.fillText(`TEMPO: ${metrics.timeElapsed.toFixed(1)}s`, 120, H - 15);
    ctx.fillText(`SCORE: ${metrics.score}`, 210, H - 15);
    ctx.fillText(`EFICACIA: ${metrics.perfect ? 'PERFEITA (100%)' : 'RESTAURADA'}`, 310, H - 15);

  }, [level, player, metrics]);

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `circuito_vivo_heatmap_${level.seed}.png`;
    link.href = url;
    link.click();
  };

  return (
    <div className="flex flex-col items-center bg-[#071308] border border-[#00cc66]/30 rounded-xl p-4 w-full max-w-md mx-auto">
      <div className="flex items-center gap-2 mb-3 text-[#00cc66]">
        <Activity className="w-5 h-5 animate-pulse" />
        <h3 className="font-mono font-bold tracking-wide text-sm">REPLAY NEURAL (MAPA DE CALOR)</h3>
      </div>

      <div className="relative border border-[#00cc66]/15 rounded-lg overflow-hidden bg-black p-1">
        <canvas
          ref={canvasRef}
          width={450}
          height={450}
          className="w-full max-w-xs sm:max-w-sm aspect-square block rounded"
        />
      </div>

      <button
        onClick={handleExport}
        className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#00cc66]/20 hover:bg-[#00cc66]/35 active:bg-[#00cc66]/50 border border-[#00cc66]/40 text-[#aaffcc] font-mono text-xs font-bold rounded-lg transition-colors cursor-pointer"
      >
        <Download className="w-4 h-4" />
        EXPORTAR PNG DIAGNÓSTICO
      </button>

      <p className="mt-2 text-[10px] font-mono text-[#00cc66]/60 text-center uppercase tracking-wider">
        Mostra a densidade das vias de sinal percorrido sobre o bioma
      </p>
    </div>
  );
};
