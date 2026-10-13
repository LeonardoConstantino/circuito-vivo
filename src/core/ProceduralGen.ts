/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CellType, GameLevel } from '../types';

// Convert a 6-character alphanumeric seed to a 32-bit integer
export function seedToNumber(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

// Seeded PRNG (Mulberry32)
export function createPRNG(seedNum: number): () => number {
  let a = seedNum;
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRandomSeed(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate level parameters based on phase (1-20+)
export function getParamsForPhase(phase: number) {
  let size = 16;
  let targetNodes = 20;
  let cancerCells = 4;
  let speedMultiplier = 1.0;

  if (phase <= 3) {
    size = 12;
    targetNodes = 8 + (phase - 1) * 2; // 8, 10, 12
    cancerCells = 0;
    speedMultiplier = 0.85;
  } else if (phase <= 8) {
    size = 16;
    targetNodes = 16 + (phase - 4) * 2; // 16, 18, 20, 22, 24
    cancerCells = 3 + (phase - 4); // 3, 4, 5, 6, 7
    speedMultiplier = 1.0;
  } else if (phase <= 15) {
    size = 20;
    targetNodes = 28 + (phase - 9) * 2; // 28, 30, ... 40
    cancerCells = 8 + (phase - 9); // 8, 9, ... 14
    speedMultiplier = 1.2;
  } else {
    size = 24;
    targetNodes = 44 + Math.min(16, (phase - 16) * 2); // 44 - 60
    cancerCells = 15 + Math.min(15, phase - 16); // 15 - 30
    speedMultiplier = 1.45;
  }

  return { size, targetNodes, cancerCells, speedMultiplier };
}

export function generateLevel(seed: string, phase?: number): Promise<GameLevel> {
  return new Promise((resolve) => {
    const seedNum = seedToNumber(seed);
    const rand = createPRNG(seedNum);

    // If a phase is not explicitly provided, we derive parameters from the seed hash
    let size = 16;
    let targetNodes = 20;
    let cancerCells = 4;

    if (phase !== undefined) {
      const params = getParamsForPhase(phase);
      size = params.size;
      targetNodes = params.targetNodes;
      cancerCells = params.cancerCells;
    } else {
      // Derive parameters from the seed
      const sizeIndex = seedNum % 4;
      if (sizeIndex === 0) {
        size = 12;
        targetNodes = 8 + (seedNum % 5);
        cancerCells = 0;
      } else if (sizeIndex === 1) {
        size = 16;
        targetNodes = 16 + (seedNum % 9);
        cancerCells = 3 + (seedNum % 4);
      } else if (sizeIndex === 2) {
        size = 20;
        targetNodes = 28 + (seedNum % 13);
        cancerCells = 8 + (seedNum % 5);
      } else {
        size = 24;
        targetNodes = 44 + (seedNum % 17);
        cancerCells = 15 + (seedNum % 11);
      }
    }

    // Initialize the grid with empty space
    const grid: CellType[][] = Array.from({ length: size }, () =>
      Array(size).fill(CellType.EMPTY)
    );

    const startX = Math.floor(size / 2);
    const startY = Math.floor(size / 2);

    // Keep player starting runway clear of obstacles
    const isSpawnZone = (x: number, y: number) => {
      // Clear a 3x3 area around spawn
      const dx = Math.abs(x - startX);
      const dy = Math.abs(y - startY);
      return dx <= 1 && dy <= 1;
    };

    const wrap = (val: number, max: number) => {
      return (val % max + max) % max;
    };

    // Helper to safely place an item
    const tryPlace = (x: number, y: number, type: CellType): boolean => {
      const wx = wrap(x, size);
      const wy = wrap(y, size);
      if (isSpawnZone(wx, wy)) return false;
      if (grid[wy][wx] !== CellType.EMPTY) return false;
      grid[wy][wx] = type;
      return true;
    };

    // 1. Generate Synaptic Nodes in biopunk network clusters/patterns
    let placedNodes = 0;
    let attempts = 0;
    while (placedNodes < targetNodes && attempts < 200) {
      attempts++;
      const cx = Math.floor(rand() * size);
      const cy = Math.floor(rand() * size);

      if (isSpawnZone(cx, cy)) continue;

      // Decide on a pattern type
      const patternType = rand();
      if (patternType < 0.25) {
        // Place a single node
        if (tryPlace(cx, cy, CellType.NODE)) {
          placedNodes++;
        }
      } else if (patternType < 0.55) {
        // Place a linear synapse nerve (horizontal or vertical)
        const isHorizontal = rand() > 0.5;
        const length = 3 + Math.floor(rand() * 3); // 3 to 5 nodes
        let nodesInPattern = 0;
        for (let i = 0; i < length; i++) {
          const nx = cx + (isHorizontal ? i : 0);
          const ny = cy + (isHorizontal ? 0 : i);
          if (tryPlace(nx, ny, CellType.NODE)) {
            nodesInPattern++;
          }
        }
        placedNodes += nodesInPattern;
      } else if (patternType < 0.85) {
        // Place an outline square structure (perfect for triggering the ring-conversion)
        const squareSize = 3 + Math.floor(rand() * 2) * 2; // 3x3 or 5x5
        let nodesInPattern = 0;
        const offset = Math.floor(squareSize / 2);
        
        for (let dy = -offset; dy <= offset; dy++) {
          for (let dx = -offset; dx <= offset; dx++) {
            // Only draw the border of the square
            const isBorder = Math.abs(dx) === offset || Math.abs(dy) === offset;
            if (isBorder) {
              if (tryPlace(cx + dx, cy + dy, CellType.NODE)) {
                nodesInPattern++;
              }
            }
          }
        }
        placedNodes += nodesInPattern;
      } else {
        // Place a synaptic cross structure
        let nodesInPattern = 0;
        if (tryPlace(cx, cy, CellType.NODE)) nodesInPattern++;
        if (tryPlace(cx - 1, cy, CellType.NODE)) nodesInPattern++;
        if (tryPlace(cx + 1, cy, CellType.NODE)) nodesInPattern++;
        if (tryPlace(cx, cy - 1, CellType.NODE)) nodesInPattern++;
        if (tryPlace(cx, cy + 1, CellType.NODE)) nodesInPattern++;
        placedNodes += nodesInPattern;
      }
    }

    // 2. Place Cancer Cells (blocking hazards)
    let placedCancer = 0;
    attempts = 0;
    while (placedCancer < cancerCells && attempts < 150) {
      attempts++;
      const cx = Math.floor(rand() * size);
      const cy = Math.floor(rand() * size);

      if (isSpawnZone(cx, cy)) continue;

      // Cancer cells are either single or in pairs
      if (rand() > 0.4) {
        if (tryPlace(cx, cy, CellType.CANCER)) {
          placedCancer++;
        }
      } else {
        const ox = rand() > 0.5 ? 1 : 0;
        const oy = ox === 0 ? 1 : 0;
        if (tryPlace(cx, cy, CellType.CANCER)) placedCancer++;
        if (tryPlace(cx + ox, cy + oy, CellType.CANCER)) placedCancer++;
      }
    }

    // 3. Place RNA Golden Fragments (secondary rewards)
    // Scatter about 5-15% of the size in RNA
    const targetRNA = Math.floor(size * 0.5) + Math.floor(rand() * 5);
    let placedRNA = 0;
    attempts = 0;
    while (placedRNA < targetRNA && attempts < 100) {
      attempts++;
      const rx = Math.floor(rand() * size);
      const ry = Math.floor(rand() * size);
      if (tryPlace(rx, ry, CellType.RNA)) {
        placedRNA++;
      }
    }

    // Recount exact numbers placed to make HUD perfect
    let finalNodes = 0;
    let finalRNA = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (grid[y][x] === CellType.NODE) finalNodes++;
        if (grid[y][x] === CellType.RNA) finalRNA++;
      }
    }

    resolve({
      seed,
      width: size,
      height: size,
      grid,
      totalNodes: finalNodes,
      totalRNA: finalRNA,
    });
  });
}
