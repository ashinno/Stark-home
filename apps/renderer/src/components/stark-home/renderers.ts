import { blit, paintStark } from '../../lib/stark/sprite';
import { TILE, baseLayer, floorLayer, objects, wallLayer } from './scene';
import { drawSpriteById, drawTileById, type TilesetImages } from './tileset';
import type { Point, RobotMode, ZoneId } from './types';

function robotPose(mode: RobotMode) {
  if (mode === 'typing') return { expr: 'thinking' as const, pose: 'think' as const };
  if (mode === 'sleeping') return { expr: 'sleepy' as const, pose: 'idle' as const };
  if (mode === 'sitting') return { expr: 'happy' as const, pose: 'idle' as const };
  if (mode === 'walk') return { expr: 'idle' as const, pose: 'hover' as const };
  return { expr: 'idle' as const, pose: 'idle' as const };
}

function drawCharacter(ctx: CanvasRenderingContext2D, pos: Point, mode: RobotMode, frame: number) {
  const pose = robotPose(mode);
  const grid = paintStark({
    expr: Math.floor(frame / 58) % 7 === 0 && mode !== 'sleeping' ? 'blink' : pose.expr,
    pose: pose.pose,
    antennaPulse: mode === 'typing',
    frame,
  });
  blit(ctx, grid, 1, Math.round(pos.x * TILE - 16), Math.round(pos.y * TILE - 30));
}

export function drawScene(
  ctx: CanvasRenderingContext2D,
  images: TilesetImages,
  activeZone: ZoneId,
  _hoverZone: ZoneId | null,
  robot: Point,
  mode: RobotMode,
  frame: number,
) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const cell of baseLayer) drawTileById(ctx, images, cell.tile, cell.x, cell.y);
  for (const cell of floorLayer) drawTileById(ctx, images, cell.tile, cell.x, cell.y);
  for (const cell of wallLayer) drawTileById(ctx, images, cell.tile, cell.x, cell.y);

  for (const object of objects) {
    drawSpriteById(ctx, images, object.sprite, object.x, object.y);
  }

  drawCharacter(ctx, robot, mode, frame);

  if (activeZone === 'work') {
    const monitor = objects.find((object) => object.sprite === 'monitorBlue');
    if (monitor) drawSpriteById(ctx, images, 'monitorBlue', monitor.x, monitor.y);
  }
}
