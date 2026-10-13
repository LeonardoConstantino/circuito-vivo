/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Direction {
  NORTH = 0,
  EAST = 1,
  SOUTH = 2,
  WEST = 3,
}

export enum CellType {
  EMPTY = 0,
  NODE = 1,          // Green sphere (synaptic node)
  INACTIVE_NODE = 2, // Dark red sphere (collected node)
  CANCER = 3,        // Bright red throbbing mass
  RNA = 4,           // Golden floating fragment
}

export enum GameStage {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  RESULT = 'RESULT',
}

export interface PlayerState {
  gridX: number; // Integer current/previous cell X
  gridY: number; // Integer current/previous cell Y
  targetX: number; // Target cell X (for smooth movement interpolation)
  targetY: number; // Target cell Y
  moveProgress: number; // 0.0 to 1.0 interpolation between current and target cell
  direction: Direction;
  targetDirection: Direction; // For smooth turning camera transitions
  turnProgress: number; // 0.0 to 1.0 for smooth camera rotation
  
  // Jump properties
  isJumping: boolean;
  jumpType: 'SINGLE' | 'DOUBLE' | 'NONE';
  jumpProgress: number; // 0.0 to 1.0
  jumpHeight: number; // Current vertical height offset for pseudo-3D drawing
  
  // Track player position history for trail and heatmap
  history: Array<{ x: number; y: number; isJump: boolean; timestamp: number }>;
}

export interface GameLevel {
  seed: string;
  width: number;
  height: number;
  grid: CellType[][];
  totalNodes: number;
  totalRNA: number;
}

export interface GameMetrics {
  nodesCollected: number;
  rnaCollected: number;
  timeElapsed: number; // in seconds
  score: number;
  perfect: boolean;
}

export interface LeaderboardEntry {
  seed: string;
  score: number;
  nodes: number;
  rna: number;
  time: number;
  perfect: boolean;
  token: string;
  date: string;
}
