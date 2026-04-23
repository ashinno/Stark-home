import type { SpriteId, TileId } from './tileset';

export type ZoneId = 'work' | 'sleep' | 'rest' | 'kitchen';

export type RobotMode = 'idle' | 'walk' | 'typing' | 'sleeping' | 'sitting';

export type Point = {
  x: number;
  y: number;
};

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Room = Rect & {
  id: ZoneId;
  label: string;
  target: Point;
};

export type TileCell = {
  x: number;
  y: number;
  tile: TileId;
};

export type SceneObject = {
  sprite: SpriteId;
  x: number;
  y: number;
  zone?: ZoneId;
};
