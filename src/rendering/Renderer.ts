/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Direction, CellType, PlayerState, GameLevel } from '../types';

export class BiopunkRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animFrame: number = 0;
  
  // Camera smooth rotation state
  private cameraAngle: number = -Math.PI / 2; // Starts facing North

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  // Get angle in radians for a given Direction
  private getAngleForDirection(dir: Direction): number {
    switch (dir) {
      case Direction.NORTH: return -Math.PI / 2;
      case Direction.EAST: return 0;
      case Direction.SOUTH: return Math.PI / 2;
      case Direction.WEST: return Math.PI;
    }
  }

  // Wraps relative coordinates correctly for toroidal space
  private wrapDiff(diff: number, size: number): number {
    if (diff > size / 2) return diff - size;
    if (diff < -size / 2) return diff + size;
    return diff;
  }

  public render(
    level: GameLevel,
    player: PlayerState,
    time: number,
    gameState: string,
    isGlitching: boolean = false
  ) {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const W = canvas.width;
    const H = canvas.height;

    // Clear with biopunk near-black green background
    ctx.fillStyle = '#050c06';
    ctx.fillRect(0, 0, W, H);

    // Apply glitch effect randomly
    if (isGlitching && Math.random() < 0.25) {
      ctx.save();
      ctx.translate((Math.random() - 0.5) * 15, (Math.random() - 0.5) * 15);
      if (Math.random() < 0.3) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        ctx.fillRect(0, 0, W, H);
      }
    }

    // Smoothly interpolate camera angle to player direction
    const targetAngle = this.getAngleForDirection(player.direction);
    // Handle wrapping issues during interpolation
    let diffAngle = targetAngle - this.cameraAngle;
    while (diffAngle < -Math.PI) diffAngle += Math.PI * 2;
    while (diffAngle > Math.PI) diffAngle -= Math.PI * 2;
    this.cameraAngle += diffAngle * 0.15; // Smooth camera rotation turn

    // Determine current player fractional coordinates for smooth scrolling
    let pX = player.gridX;
    let pY = player.gridY;
    let tX = player.targetX;
    let tY = player.targetY;

    // Handle wrap-around interpolation
    if (tX - pX > 1) pX += level.width;
    else if (tX - pX < -1) pX -= level.width;
    if (tY - pY > 1) pY += level.height;
    else if (tY - pY < -1) pY -= level.height;

    const playerFineX = pX + (tX - pX) * player.moveProgress;
    const playerFineY = pY + (tY - pY) * player.moveProgress;

    // 1. Draw Deep Background (Planets / Cells breathing in the void)
    this.drawDeepBackground(time);

    // 2. Prepare 3D Perspective Projection Constants
    const centerX = W / 2;
    const horizonY = H * 0.36; // Lowered horizon for expansive perspective view
    const cameraHeight = 0.62; // Stable low-angle camera height looking down forward
    const cameraOffsetZ = 1.95; // Stable camera distance behind player
    const fov = Math.min(W * 0.72, H * 1.18); // Viewport-adaptive FOV (handles mobile portrait, landscape, and desktop)

    // Helper to project local (lx, ly, lz) to screen (sx, sy)
    const project = (lx: number, ly: number, lz: number) => {
      if (lz <= 0.05) return null;
      const scale = fov / lz;
      return {
        x: centerX + lx * scale,
        y: horizonY + ly * scale,
        scale: scale
      };
    };

    // Camera direction vectors for local transformation
    const cosA = Math.cos(this.cameraAngle);
    const sinA = Math.sin(this.cameraAngle);

    // Transform relative global offsets into local camera coordinates
    // Where +z is forward, +x is right
    const getLocalCoords = (dx: number, dy: number) => {
      // Rotate world by negative camera angle
      const lx = dx * (-sinA) + dy * cosA;
      const lz = dx * cosA + dy * sinA;
      return { lx, lz };
    };

    // 3. Collect Visible Cells to render
    interface RenderableCell {
      gx: number;
      gy: number;
      lx: number;
      lz: number;
      cellType: CellType;
    }

    const visibleCells: RenderableCell[] = [];
    const renderRadius = 9; // Range of cells to scan around the player

    const playerIntX = Math.floor(playerFineX);
    const playerIntY = Math.floor(playerFineY);

    for (let dy = -renderRadius; dy <= renderRadius; dy++) {
      for (let dx = -renderRadius; dx <= renderRadius; dx++) {
        const gx = (playerIntX + dx + level.width * 2) % level.width;
        const gy = (playerIntY + dy + level.height * 2) % level.height;

        // Calculate offset in continuous wrapped coordinates relative to fine player coordinates
        let relX = this.wrapDiff(gx - playerFineX, level.width);
        let relY = this.wrapDiff(gy - playerFineY, level.height);

        const { lx, lz } = getLocalCoords(relX, relY);

        // Keep cells that are in front of the camera (lz + cameraOffsetZ > 0.08)
        const camLz = lz + cameraOffsetZ;
        if (camLz > 0.08 && camLz < 11.5 && Math.abs(lx) < 9) {
          visibleCells.push({
            gx,
            gy,
            lx,
            lz: camLz,
            cellType: level.grid[gy][gx]
          });
        }
      }
    }

    // Sort cells by distance (lz) in descending order (far to near) - Painter's Algorithm
    visibleCells.sort((a, b) => b.lz - a.lz);

    // 4. Draw Cells & Elements on the Grid
    visibleCells.forEach((cell) => {
      const { gx, gy, lx, lz, cellType } = cell;

      // Draw cell grid outline
      const halfSize = 0.5;
      const corners = [
        { dx: -halfSize, dy: -halfSize },
        { dx: halfSize, dy: -halfSize },
        { dx: halfSize, dy: halfSize },
        { dx: -halfSize, dy: halfSize }
      ];

      const projectedCorners = corners.map((c) => {
        // Calculate corner offset relative to fine player
        const cgx = gx + c.dx;
        const cgy = gy + c.dy;
        const cRelX = this.wrapDiff(cgx - playerFineX, level.width);
        const cRelY = this.wrapDiff(cgy - playerFineY, level.height);
        const cl = getLocalCoords(cRelX, cRelY);
        // Clip corners behind camera
        const clipLz = Math.max(0.08, cl.lz + cameraOffsetZ);
        return project(cl.lx, cameraHeight, clipLz);
      });

      // Draw cell floor surface
      if (projectedCorners.every(p => p !== null)) {
        ctx.beginPath();
        ctx.moveTo(projectedCorners[0]!.x, projectedCorners[0]!.y);
        for (let i = 1; i < 4; i++) {
          ctx.lineTo(projectedCorners[i]!.x, projectedCorners[i]!.y);
        }
        ctx.closePath();

        // Alternating biological grid tiles (checkerboard)
        const isOdd = (gx + gy) % 2 === 0;
        ctx.fillStyle = isOdd ? 'rgba(10, 40, 15, 0.15)' : 'rgba(5, 20, 8, 0.05)';
        ctx.fill();

        // Stroke neon boundaries (Nerves)
        ctx.strokeStyle = isGlitching ? 'rgba(230, 40, 40, 0.12)' : 'rgba(40, 180, 80, 0.15)';
        ctx.lineWidth = Math.max(1, 15 / lz);
        ctx.stroke();

        // Draw nerve fibers connecting nodes (Axons) if it's not empty
        if (cellType !== CellType.EMPTY) {
          const centerProj = project(lx, cameraHeight, lz);
          if (centerProj) {
            ctx.strokeStyle = 'rgba(40, 180, 80, 0.06)';
            ctx.lineWidth = 1;
            projectedCorners.forEach((corner) => {
              ctx.beginPath();
              ctx.moveTo(centerProj.x, centerProj.y);
              ctx.lineTo(corner!.x, corner!.y);
              ctx.stroke();
            });
          }
        }
      }

      // Draw item inside the cell (only if lz is sufficiently in front of the camera)
      if (lz > 0.15) {
        this.drawCellEntity(ctx, cellType, lx, lz, cameraHeight, project, time, gx, gy);
      }
    });

    // 5. Draw Player Signal Particle (Foreground, centered)
    this.drawPlayer(ctx, player, centerX, H, cameraHeight, project, time, isGlitching);

    // 6. Post-processing atmospheric juice (Scanlines, light vignette, grid overlay)
    this.drawAtmosphericOverlay(ctx, W, H, time);

    if (isGlitching) {
      ctx.restore();
    }
  }

  // Draw giant organic organs breathing in the deep background
  private drawDeepBackground(time: number) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Subtle breathing bio-structures (large transparent circles simulating organelles)
    const structures = [
      { x: W * 0.2, y: H * 0.2, r: W * 0.15, speed: 0.4, color: 'rgba(20, 50, 30, 0.03)' },
      { x: W * 0.8, y: H * 0.15, r: W * 0.2, speed: 0.3, color: 'rgba(30, 60, 40, 0.04)' },
      { x: W * 0.5, y: H * 0.08, r: W * 0.1, speed: 0.6, color: 'rgba(15, 40, 20, 0.03)' }
    ];

    structures.forEach((s) => {
      const breath = 1.0 + Math.sin(time * s.speed) * 0.08;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * breath, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    });

    // Draw some distant biological nerve fibers crossing the horizon
    ctx.strokeStyle = 'rgba(30, 90, 50, 0.06)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, H * 0.35);
    ctx.bezierCurveTo(W * 0.35, H * 0.2, W * 0.65, H * 0.45, W, H * 0.3);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, H * 0.3);
    ctx.bezierCurveTo(W * 0.25, H * 0.45, W * 0.75, H * 0.15, W, H * 0.4);
    ctx.stroke();
  }

  // Render individual entities inside visible cells in perspective
  private drawCellEntity(
    ctx: CanvasRenderingContext2D,
    type: CellType,
    lx: number,
    lz: number,
    cameraHeight: number,
    project: (lx: number, ly: number, lz: number) => { x: number; y: number; scale: number } | null,
    time: number,
    gx: number,
    gy: number
  ) {
    if (type === CellType.EMPTY) return;

    // Hover effect (sine wave based on time + cell coordinate to offset phases)
    const phaseOffset = (gx * 3.14 + gy * 1.59) % 6.28;
    const hover = Math.sin(time * 3 + phaseOffset) * 0.05;
    const ly = cameraHeight - 0.04 - hover;

    const proj = project(lx, ly, lz);
    if (!proj) return;

    const { x, y, scale } = proj;

    if (type === CellType.NODE) {
      // --- GREEN SYNAPTIC NODE ---
      const baseR = scale * 0.075;
      const pulse = 1.0 + Math.sin(time * 5 + phaseOffset) * 0.12;
      const r = baseR * pulse;

      // Glow effect
      const glowGrad = ctx.createRadialGradient(x, y, 1, x, y, r * 2.5);
      glowGrad.addColorStop(0, '#00ff88');
      glowGrad.addColorStop(0.2, 'rgba(0, 255, 136, 0.8)');
      glowGrad.addColorStop(0.5, 'rgba(0, 255, 136, 0.2)');
      glowGrad.addColorStop(1, 'rgba(0, 255, 136, 0)');
      
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Solid inner core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Outer orbit rings (3D Ellipses)
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
      ctx.lineWidth = Math.max(1, scale * 0.012);
      
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 1.5 + phaseOffset);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.8, r * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

    } else if (type === CellType.INACTIVE_NODE) {
      // --- INACTIVE DARK RED NODE ---
      const r = scale * 0.06;
      
      // Dull radial gradient
      const grad = ctx.createRadialGradient(x, y, 1, x, y, r * 1.5);
      grad.addColorStop(0, '#4a0505');
      grad.addColorStop(0.7, '#240202');
      grad.addColorStop(1, 'rgba(0,0,0,0.8)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(100, 10, 10, 0.5)';
      ctx.lineWidth = Math.max(1, scale * 0.01);
      ctx.stroke();

    } else if (type === CellType.CANCER) {
      // --- SQUIRMING ASYMMETRICAL CANCER CELL ---
      const baseR = scale * 0.085;
      const numPoints = 8;
      
      ctx.save();
      ctx.translate(x, y);
      
      ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        // Modulate distance to create asymmetrical squirming pseudopodia
        const wave = Math.sin(time * 4 + angle * 3 + phaseOffset) * 0.25;
        const dist = baseR * (1.0 + wave);
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;
        
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // Corrupted red gradient
      const cancerGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, baseR * 1.8);
      cancerGrad.addColorStop(0, '#ff6666');
      cancerGrad.addColorStop(0.3, '#ff2222');
      cancerGrad.addColorStop(0.7, '#8b0000');
      cancerGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = cancerGrad;
      ctx.fill();

      // Draw aggressive fibrous details
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.7)';
      ctx.lineWidth = Math.max(1, scale * 0.012);
      ctx.stroke();

      // Dynamic nucleus
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(0, 0, baseR * 0.3 + Math.sin(time * 6) * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

    } else if (type === CellType.RNA) {
      // --- GOLDEN RNA HELIX ---
      const w = scale * 0.09;
      const h = scale * 0.15;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 2 + phaseOffset);

      // Render RNA double strands as wavy golden lines
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = Math.max(1.5, scale * 0.015);

      // Draw a vertical-ish twin helix coil
      ctx.beginPath();
      for (let offset = -h/2; offset <= h/2; offset += 2) {
        const theta = (offset / h) * Math.PI * 4 + time * 4;
        const hx = Math.sin(theta) * w * 0.5;
        if (offset === -h/2) ctx.moveTo(hx, offset);
        else ctx.lineTo(hx, offset);
      }
      ctx.stroke();

      // Complementary strand
      ctx.strokeStyle = '#ff9900';
      ctx.beginPath();
      for (let offset = -h/2; offset <= h/2; offset += 2) {
        const theta = (offset / h) * Math.PI * 4 + time * 4 + Math.PI; // Offset by 180deg
        const hx = Math.sin(theta) * w * 0.5;
        if (offset === -h/2) ctx.moveTo(hx, offset);
        else ctx.lineTo(hx, offset);
      }
      ctx.stroke();

      // Draw connecting genetic base links (Horizontal rungs)
      ctx.strokeStyle = 'rgba(255, 224, 102, 0.4)';
      ctx.lineWidth = 1;
      for (let offset = -h/2 + 3; offset <= h/2 - 3; offset += 5) {
        const theta = (offset / h) * Math.PI * 4 + time * 4;
        const hx1 = Math.sin(theta) * w * 0.5;
        const hx2 = Math.sin(theta + Math.PI) * w * 0.5;
        ctx.beginPath();
        ctx.moveTo(hx1, offset);
        ctx.lineTo(hx2, offset);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // Draw Player Neural Signal Particle
  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    player: PlayerState,
    centerX: number,
    canvasH: number,
    cameraHeight: number,
    project: (lx: number, ly: number, lz: number) => { x: number; y: number; scale: number } | null,
    time: number,
    isGlitching: boolean
  ) {
    // 1. Draw projected Player Trail (Rastro)
    if (player.history.length > 1) {
      ctx.save();
      ctx.beginPath();
      
      let firstPoint = true;
      
      // Drawing trail back in time, fading out
      for (let i = player.history.length - 1; i >= 0; i--) {
        const node = player.history[i];
        
        // Calculate difference relative to the current fine player state
        const tX = player.targetX;
        const tY = player.targetY;
        let pX = player.gridX;
        let pY = player.gridY;
        if (tX - pX > 1) pX += 16; 
        else if (tX - pX < -1) pX -= 16;
        if (tY - pY > 1) pY += 16;
        else if (tY - pY < -1) pY -= 16;
        const playerFineX = pX + (tX - pX) * player.moveProgress;
        const playerFineY = pY + (tY - pY) * player.moveProgress;

        let rx = this.wrapDiff(node.x - playerFineX, 16); 
        let ry = this.wrapDiff(node.y - playerFineY, 16);

        // Rotate by camera angle
        const cosA = Math.cos(this.cameraAngle);
        const sinA = Math.sin(this.cameraAngle);
        const lx = rx * (-sinA) + ry * cosA;
        const lz = rx * cosA + ry * sinA;

        // Player trail on ground level
        const nodeY = cameraHeight - 0.04; 

        // Project relative to camera offset
        const cameraOffsetZ = 1.95;
        const proj = project(lx, nodeY, lz + cameraOffsetZ);
        if (proj) {
          if (firstPoint) {
            ctx.moveTo(proj.x, proj.y);
            firstPoint = false;
          } else {
            ctx.lineTo(proj.x, proj.y);
          }
        }
      }

      ctx.strokeStyle = isGlitching ? 'rgba(230, 40, 40, 0.45)' : 'rgba(0, 255, 136, 0.35)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // 2. Project Ground Shadow under player (anchored to the floor)
    const cameraOffsetZ = 1.95;
    const playerZ = cameraOffsetZ;
    const groundProj = project(0, cameraHeight - 0.02, playerZ);
    if (groundProj) {
      const sScale = groundProj.scale;
      const shadowR = sScale * 0.09;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(groundProj.x, groundProj.y, shadowR * 1.3, shadowR * 0.45, 0, 0, Math.PI * 2);
      ctx.fillStyle = isGlitching ? 'rgba(80, 10, 10, 0.45)' : 'rgba(0, 35, 15, 0.55)';
      ctx.fill();
      ctx.restore();
    }

    // 3. Project Player Node in the foreground
    // Ground position: cameraHeight - 0.06; When jumping: moves up toward sky
    const playerY = cameraHeight - 0.06 - player.jumpHeight * 0.38;
    const playerProj = project(0, playerY, playerZ);

    if (playerProj) {
      const px = playerProj.x;
      const py = playerProj.y;
      const pScale = playerProj.scale;
      // Proportional scale to perspective (compact, readable, exactly like Sonic Blue Sphere)
      const baseR = pScale * 0.085;

      // Sizing modifiers based on movement and jump states
      // - Normal: slightly stretched vertically
      // - Turn: squished vertically, stretched horizontally
      // - Jump (initial): compressed vertically
      // - Jump (air/peak): stretched vertically like a fast pulse
      let scaleX = 1.0;
      let scaleY = 1.0;

      const isTurning = player.direction !== player.targetDirection;

      if (isTurning) {
        // Squish vertically when turning
        scaleX = 1.3;
        scaleY = 0.75;
      } else if (player.isJumping) {
        if (player.jumpProgress < 0.15 || player.jumpProgress > 0.85) {
          // Compress on takeoff or landing
          scaleX = 1.25;
          scaleY = 0.7;
        } else {
          // Stretch into an elongated pulse in midair
          scaleX = 0.75;
          scaleY = 1.45;
        }
      } else {
        // Normal state: slightly elongated forward + tiny breathing pulse
        const breath = Math.sin(time * 9) * 0.04;
        scaleX = 0.95 + breath;
        scaleY = 1.15 - breath;
      }

      ctx.save();
      ctx.translate(px, py);

      // --- AXON TAIL (Cauda de Cometa) ---
      // Extends backward (which is DOWN on the 2D screen coordinate system)
      ctx.beginPath();
      ctx.moveTo(0, baseR * 0.7 * scaleY);
      
      const tailLength = baseR * 3.2 * scaleY;
      const waveFreq = player.isJumping ? 18 : 12;
      const waveAmp = player.isJumping ? baseR * 0.15 : baseR * 0.28;
      
      ctx.bezierCurveTo(
        Math.sin(time * waveFreq) * waveAmp, baseR * 1.5 * scaleY,
        Math.sin(time * waveFreq - 1.5) * waveAmp * 0.8, baseR * 2.3 * scaleY,
        Math.sin(time * waveFreq - 3.0) * waveAmp * 0.5, tailLength
      );
      
      ctx.strokeStyle = isGlitching ? '#ff4444' : '#00FF88';
      ctx.lineWidth = Math.max(1.5, 3.5 * (pScale / 100));
      ctx.lineCap = 'round';
      ctx.stroke();

      // --- MAIN DROPLET BODY (Corpo Membrana) ---
      const r = baseR;

      // Glow gradient (Energia neural)
      const glowGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 3.5);
      const glowColor = isGlitching ? '255, 60, 60' : '0, 255, 136';
      glowGrad.addColorStop(0, `rgba(${glowColor}, 0.85)`);
      glowGrad.addColorStop(0.2, `rgba(${glowColor}, 0.5)`);
      glowGrad.addColorStop(0.5, `rgba(${glowColor}, 0.18)`);
      glowGrad.addColorStop(1, `rgba(${glowColor}, 0)`);
      
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 3.5 * scaleX, r * 3.5 * scaleY, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw Teardrop/Droplet Membrane Path
      ctx.beginPath();
      // Tip of droplet (pointing straight UP on screen, toward negative Y)
      ctx.moveTo(0, -r * 1.55 * scaleY);
      // Right flank curves down
      ctx.bezierCurveTo(
        r * 1.15 * scaleX, -r * 0.75 * scaleY,
        r * 1.25 * scaleX, r * 0.65 * scaleY,
        0, r * 1.12 * scaleY
      );
      // Left flank curves back up
      ctx.bezierCurveTo(
        -r * 1.25 * scaleX, r * 0.65 * scaleY,
        -r * 1.15 * scaleX, -r * 0.75 * scaleY,
        0, -r * 1.55 * scaleY
      );
      ctx.closePath();

      // Membrane body fill with 45% transparency (Membrana verde-clara / transparência parcial)
      const bodyColor = isGlitching ? 'rgba(255, 150, 150, 0.45)' : 'rgba(170, 255, 204, 0.45)';
      ctx.fillStyle = bodyColor;
      ctx.fill();

      // Sombra interna (Depth / Profundidade)
      ctx.strokeStyle = isGlitching ? '#aa2222' : '#187A50';
      ctx.lineWidth = Math.max(1, 3.5 * (pScale / 100));
      ctx.stroke();

      // Contorno / Legibilidade
      ctx.strokeStyle = isGlitching ? '#ffaacc' : '#DFFFF0';
      ctx.lineWidth = Math.max(1, 1.5 * (pScale / 100));
      ctx.stroke();

      // --- FILAMENTS (Pequenos filamentos biológicos que reagem com o tempo) ---
      ctx.strokeStyle = isGlitching ? 'rgba(255, 100, 100, 0.5)' : 'rgba(0, 255, 136, 0.6)';
      ctx.lineWidth = 1;
      const filamentsCount = 4;
      for (let i = 0; i < filamentsCount; i++) {
        const angle = (i / filamentsCount) * Math.PI * 2 + time * 3;
        const fx = Math.cos(angle) * r * 0.9 * scaleX;
        const fy = Math.sin(angle) * r * 0.9 * scaleY;
        const len = r * 0.35 * (1.0 + Math.sin(time * 10 + i) * 0.3);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + Math.cos(angle) * len, fy + Math.sin(angle) * len);
        ctx.stroke();
      }

      // --- CONSCIOUSNESS CORE (Núcleo Branco) ---
      // Becomes brighter and larger during jumps
      const corePulse = player.isJumping ? 1.45 : 1.0;
      const coreR = r * 0.35 * corePulse;

      ctx.save();
      // Add a bright shadow blur representing consciousness light emitting
      ctx.shadowBlur = r * 1.5;
      ctx.shadowColor = '#ffffff';

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Sharp core boundary (Core border outline)
      ctx.strokeStyle = isGlitching ? '#ff4444' : '#AAFFCC';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, coreR, 0, Math.PI * 2);
      ctx.stroke();

      // --- DYNAMIC PARTICLES / SPARKS ---
      ctx.fillStyle = isGlitching ? '#ff9999' : '#ffffff';
      const sparkCount = player.isJumping ? 5 : 3;
      for (let i = 0; i < sparkCount; i++) {
        const angle = time * (player.isJumping ? 15 : 7) + (i * Math.PI * 2) / sparkCount;
        const sx = Math.cos(angle) * r * 1.35 * scaleX;
        const sy = Math.sin(angle) * r * 0.6 * scaleY; // Flattened orbit
        ctx.beginPath();
        ctx.arc(sx, sy, player.isJumping ? 3.0 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  // Draw scientific overlay (Scanlines, vignetting, diagnostic noise)
  private drawAtmosphericOverlay(ctx: CanvasRenderingContext2D, W: number, H: number, time: number) {
    // 1. Scanlines
    ctx.fillStyle = 'rgba(5, 12, 6, 0.04)';
    const scanlineHeight = 2.5;
    for (let y = 0; y < H; y += 5) {
      ctx.fillRect(0, y, W, scanlineHeight);
    }

    // 2. Subtle diagnostic grid overlay lines in corners
    ctx.strokeStyle = 'rgba(0, 204, 102, 0.08)';
    ctx.lineWidth = 1;
    const len = 40;
    const padding = 20;

    // Top-Left Corner Bracket
    ctx.beginPath();
    ctx.moveTo(padding, padding + len);
    ctx.lineTo(padding, padding);
    ctx.lineTo(padding + len, padding);
    ctx.stroke();

    // Top-Right Corner Bracket
    ctx.beginPath();
    ctx.moveTo(W - padding, padding + len);
    ctx.lineTo(W - padding, padding);
    ctx.lineTo(W - padding - len, padding);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(padding, H - padding - len);
    ctx.lineTo(padding, H - padding);
    ctx.lineTo(padding + len, H - padding);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(W - padding, H - padding - len);
    ctx.lineTo(W - padding, H - padding);
    ctx.lineTo(W - padding - len, H - padding);
    ctx.stroke();

    // 3. Ambient lighting vignette (Dark biological borders)
    const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.65);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(0.5, 'rgba(5, 12, 6, 0.15)');
    vignette.addColorStop(0.85, 'rgba(2, 6, 3, 0.6)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.9)');

    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }
}
