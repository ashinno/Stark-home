import type { Point, Room, SceneObject, TileCell, ZoneId } from './types';

export const TILE = 16;
export const MAP_COLS = 36;
export const MAP_ROWS = 40;
export const WORLD_W = MAP_COLS * TILE;
export const WORLD_H = MAP_ROWS * TILE;

export const apartmentBounds = { x: 1, y: 0, w: 34, h: 40 };

export const rooms: Room[] = [
  { id: 'work', label: 'work', x: 2, y: 2, w: 18, h: 17, target: { x: 8.8, y: 8.7 } },
  { id: 'sleep', label: 'sleep', x: 21, y: 2, w: 13, h: 17, target: { x: 28.6, y: 9.3 } },
  { id: 'rest', label: 'rest', x: 2, y: 20, w: 18, h: 19, target: { x: 9.6, y: 26.2 } },
  { id: 'kitchen', label: 'brew', x: 21, y: 20, w: 13, h: 19, target: { x: 28.5, y: 29.1 } },
];

export const zoneCoordinates = {
  work: rooms[0],
  sleep: rooms[1],
  rest: rooms[2],
  kitchen: rooms[3],
} as const;

function addTile(layer: TileCell[], x: number, y: number, tile: TileCell['tile']) {
  layer.push({ x, y, tile });
}

function fillTiles(layer: TileCell[], x0: number, y0: number, w: number, h: number, tile: TileCell['tile']) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) addTile(layer, x, y, tile);
  }
}

function fillRoom(layer: TileCell[], room: Room, pattern: (x: number, y: number) => TileCell['tile']) {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) addTile(layer, x, y, pattern(x, y));
  }
}

function horizontalWall(layer: TileCell[], x0: number, x1: number, y: number, tile: TileCell['tile']) {
  for (let x = x0; x <= x1; x += 1) addTile(layer, x, y, tile);
}

function verticalWall(layer: TileCell[], x: number, y0: number, y1: number, tile: TileCell['tile']) {
  for (let y = y0; y <= y1; y += 1) addTile(layer, x, y, tile);
}

const [work, sleep, rest, kitchen] = rooms;

export const baseLayer: TileCell[] = [];
fillTiles(baseLayer, apartmentBounds.x, apartmentBounds.y, apartmentBounds.w, apartmentBounds.h, 'floorPaleAlt');
fillTiles(baseLayer, apartmentBounds.x, apartmentBounds.y, apartmentBounds.w, 2, 'wallCream');
fillTiles(baseLayer, apartmentBounds.x, apartmentBounds.y + apartmentBounds.h - 1, apartmentBounds.w, 1, 'wallPanelOak');

// Fixed apartment floor map. Every cell references a concrete 16x16 tile index
// from floorswalls_LRK.png through the TileId registry in tileset.ts.
export const floorLayer: TileCell[] = [];
fillRoom(floorLayer, work, () => 'floorDark');
fillRoom(floorLayer, sleep, () => 'floorPale');
fillRoom(floorLayer, rest, () => 'floorOak');
fillRoom(floorLayer, kitchen, () => 'tileSage');

export const wallLayer: TileCell[] = [];
horizontalWall(wallLayer, apartmentBounds.x, apartmentBounds.x + apartmentBounds.w - 1, 0, 'wallCream');
horizontalWall(wallLayer, apartmentBounds.x, apartmentBounds.x + apartmentBounds.w - 1, 1, 'wallPanelOak');
horizontalWall(wallLayer, apartmentBounds.x, apartmentBounds.x + apartmentBounds.w - 1, 39, 'wallPanelOak');
verticalWall(wallLayer, apartmentBounds.x, 1, 39, 'wallPanelOak');
verticalWall(wallLayer, apartmentBounds.x + apartmentBounds.w - 1, 1, 39, 'wallPanelOak');

// Partial shared walls define zones while keeping one connected apartment flow.
verticalWall(wallLayer, 20, 2, 9, 'wallPanelOak');
verticalWall(wallLayer, 20, 30, 39, 'wallPanelOak');
verticalWall(wallLayer, 21, 2, 9, 'wallPanelLight');
verticalWall(wallLayer, 21, 32, 39, 'wallPanelLight');
horizontalWall(wallLayer, 2, 8, 19, 'wallPanelOak');
horizontalWall(wallLayer, 25, 34, 19, 'wallPanelOak');
horizontalWall(wallLayer, 2, 7, 20, 'wallPanelLight');
horizontalWall(wallLayer, 26, 34, 20, 'wallPanelLight');
horizontalWall(wallLayer, 15, 20, 18, 'wallPanelLight');

export const objects: SceneObject[] = [
  // Work: fixed top-left productivity corner.
  { sprite: 'windowDay', x: 78, y: 2, zone: 'work' },
  { sprite: 'longShelf', x: 48, y: 30, zone: 'work' },
  { sprite: 'wallShelf', x: 178, y: 32, zone: 'work' },
  { sprite: 'desk', x: 48, y: 50, zone: 'work' },
  { sprite: 'monitorBlue', x: 80, y: 32, zone: 'work' },
  { sprite: 'monitorDark', x: 126, y: 34, zone: 'work' },
  { sprite: 'chairDark', x: 108, y: 102, zone: 'work' },
  { sprite: 'bookshelfMixed', x: 32, y: 150, zone: 'work' },
  { sprite: 'lowCabinet', x: 150, y: 160, zone: 'work' },
  { sprite: 'floorLamp', x: 262, y: 92, zone: 'work' },
  { sprite: 'plantSmall', x: 274, y: 232, zone: 'work' },

  // Sleep: fixed top-right bedroom group.
  { sprite: 'windowNight', x: 434, y: 2, zone: 'sleep' },
  { sprite: 'rugLight', x: 386, y: 122, zone: 'sleep' },
  { sprite: 'bedLikeSofa', x: 494, y: 44, zone: 'sleep' },
  { sprite: 'sideTable', x: 454, y: 72, zone: 'sleep' },
  { sprite: 'tableLamp', x: 462, y: 42, zone: 'sleep' },
  { sprite: 'bookshelfFull', x: 376, y: 168, zone: 'sleep' },
  { sprite: 'lowCabinet', x: 456, y: 206, zone: 'sleep' },
  { sprite: 'plantTall', x: 528, y: 220, zone: 'sleep' },

  // Rest: fixed bottom-left living group.
  { sprite: 'rugPlumPattern', x: 78, y: 388, zone: 'rest' },
  { sprite: 'sofaGrey', x: 32, y: 348, zone: 'rest' },
  { sprite: 'roundTable', x: 116, y: 402, zone: 'rest' },
  { sprite: 'chairWhite', x: 164, y: 390, zone: 'rest' },
  { sprite: 'bookshelfFull', x: 32, y: 500, zone: 'rest' },
  { sprite: 'lowCabinet', x: 160, y: 322, zone: 'rest' },
  { sprite: 'wallPicture', x: 96, y: 322, zone: 'rest' },
  { sprite: 'floorLamp', x: 222, y: 348, zone: 'rest' },
  { sprite: 'plantPot', x: 36, y: 584, zone: 'rest' },
  { sprite: 'plantSmall', x: 272, y: 560, zone: 'rest' },

  // Kitchen: fixed bottom-right compact counter run and small dining spot.
  { sprite: 'kitchenCounterOlive', x: 354, y: 326, zone: 'kitchen' },
  { sprite: 'sinkSmall', x: 424, y: 310, zone: 'kitchen' },
  { sprite: 'wallShelf', x: 378, y: 298, zone: 'kitchen' },
  { sprite: 'fridge', x: 520, y: 326, zone: 'kitchen' },
  { sprite: 'roundTable', x: 434, y: 466, zone: 'kitchen' },
  { sprite: 'chairWhite', x: 414, y: 474, zone: 'kitchen' },
  { sprite: 'chairDark', x: 478, y: 472, zone: 'kitchen' },
  { sprite: 'lowCabinet', x: 462, y: 548, zone: 'kitchen' },
  { sprite: 'plantPot', x: 530, y: 584, zone: 'kitchen' },
];

export const spawn: Point = rooms[0].target;

export function zoneAt(point: Point): ZoneId | null {
  const room = rooms.find(
    (r) => point.x >= r.x && point.x < r.x + r.w && point.y >= r.y && point.y < r.y + r.h,
  );
  return room?.id ?? null;
}

export function roomFor(zone: ZoneId) {
  return rooms.find((r) => r.id === zone) ?? rooms[0];
}
