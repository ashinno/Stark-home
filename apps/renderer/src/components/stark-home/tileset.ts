const TILE = 16;

export const sheetUrls = {
  floorswalls: new URL('../../assets/pixelinterior/floorswalls_LRK.png', import.meta.url).href,
  livingroom: new URL('../../assets/pixelinterior/livingroom_LRK.png', import.meta.url).href,
  kitchen: new URL('../../assets/pixelinterior/kitchen_LRK.png', import.meta.url).href,
  cabinets: new URL('../../assets/pixelinterior/cabinets_LRK.png', import.meta.url).href,
  decorations: new URL('../../assets/pixelinterior/decorations_LRK.png', import.meta.url).href,
  doorswindowsstairs: new URL('../../assets/pixelinterior/doorswindowsstairs_LRK.png', import.meta.url).href,
} as const;

export type SheetId = keyof typeof sheetUrls;

export type TileRef = {
  sheet: SheetId;
  tx: number;
  ty: number;
};

export type SpriteRef = {
  sheet: SheetId;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
};

export type TilesetImages = Record<SheetId, HTMLImageElement>;

function tile(sheet: SheetId, tx: number, ty: number): TileRef {
  return { sheet, tx, ty };
}

function sprite(sheet: SheetId, sx: number, sy: number, sw: number, sh: number): SpriteRef {
  return { sheet, sx, sy, sw, sh };
}

// Tile indices are 16x16 source-grid coordinates from floorswalls_LRK.png.
export const tiles = {
  wallCream: tile('floorswalls', 0, 0),
  wallGreen: tile('floorswalls', 5, 0),
  wallWhite: tile('floorswalls', 9, 0),
  wallPanelLight: tile('floorswalls', 0, 3),
  wallPanelOak: tile('floorswalls', 5, 3),
  wallPanelDark: tile('floorswalls', 9, 3),
  floorOak: tile('floorswalls', 0, 5),
  floorOakAlt: tile('floorswalls', 1, 5),
  floorPale: tile('floorswalls', 5, 5),
  floorPaleAlt: tile('floorswalls', 6, 5),
  floorDark: tile('floorswalls', 9, 5),
  floorDarkAlt: tile('floorswalls', 10, 5),
  tileRose: tile('floorswalls', 0, 11),
  tileSage: tile('floorswalls', 5, 11),
  tileGrey: tile('floorswalls', 9, 11),
} as const;

export type TileId = keyof typeof tiles;

// Sprite rectangles are source-pixel coordinates from the original itch.io sheets.
export const sprites = {
  desk: sprite('livingroom', 288, 144, 64, 32),
  monitorBlue: sprite('livingroom', 352, 352, 40, 32),
  monitorDark: sprite('livingroom', 312, 352, 40, 32),
  chairWhite: sprite('livingroom', 80, 176, 16, 32),
  chairDark: sprite('livingroom', 288, 208, 16, 32),
  sofaCream: sprite('livingroom', 16, 16, 48, 32),
  sofaGrey: sprite('livingroom', 16, 64, 48, 32),
  sofaWide: sprite('livingroom', 80, 16, 48, 32),
  sofaSideCream: sprite('livingroom', 144, 16, 32, 48),
  sofaSideGrey: sprite('livingroom', 144, 80, 32, 48),
  fireplaceLit: sprite('livingroom', 480, 80, 32, 48),
  roundTable: sprite('livingroom', 240, 184, 32, 24),
  ovalRug: sprite('livingroom', 432, 256, 48, 32),
  rugLight: sprite('livingroom', 16, 256, 64, 32),
  rugPlum: sprite('livingroom', 16, 336, 64, 32),
  rugPlumPattern: sprite('livingroom', 144, 336, 64, 32),
  rugPlumRunner: sprite('livingroom', 96, 336, 32, 64),
  lowTable: sprite('livingroom', 240, 144, 32, 32),
  bookshelfFull: sprite('cabinets', 16, 16, 48, 48),
  bookshelfMixed: sprite('cabinets', 16, 80, 48, 48),
  lowCabinet: sprite('cabinets', 528, 32, 48, 16),
  longShelf: sprite('cabinets', 688, 32, 48, 16),
  wallShelf: sprite('cabinets', 336, 32, 32, 32),
  bedLikeSofa: sprite('livingroom', 144, 16, 48, 48),
  sideTable: sprite('livingroom', 240, 184, 32, 24),
  plantPot: sprite('decorations', 16, 96, 16, 32),
  plantSmall: sprite('decorations', 64, 96, 24, 32),
  plantTall: sprite('decorations', 96, 96, 24, 32),
  floorLamp: sprite('decorations', 16, 16, 16, 48),
  tableLamp: sprite('decorations', 64, 16, 16, 32),
  wallPicture: sprite('decorations', 112, 64, 32, 16),
  mirror: sprite('decorations', 160, 48, 16, 64),
  kitchenCounter: sprite('kitchen', 16, 16, 152, 48),
  kitchenCounterOlive: sprite('kitchen', 16, 144, 152, 48),
  fridge: sprite('kitchen', 352, 16, 32, 64),
  glassFridge: sprite('kitchen', 352, 272, 64, 48),
  sinkSmall: sprite('kitchen', 288, 80, 32, 16),
  windowDay: sprite('doorswindowsstairs', 208, 16, 48, 48),
  windowNight: sprite('doorswindowsstairs', 208, 80, 48, 48),
  doorClosed: sprite('doorswindowsstairs', 112, 16, 32, 48),
} as const;

export type SpriteId = keyof typeof sprites;

export function drawTileById(
  ctx: CanvasRenderingContext2D,
  images: TilesetImages,
  tileId: TileId,
  x: number,
  y: number,
) {
  const t = tiles[tileId];
  ctx.drawImage(images[t.sheet], t.tx * TILE, t.ty * TILE, TILE, TILE, x * TILE, y * TILE, TILE, TILE);
}

export function drawSpriteById(
  ctx: CanvasRenderingContext2D,
  images: TilesetImages,
  spriteId: SpriteId,
  x: number,
  y: number,
) {
  const s = sprites[spriteId];
  ctx.drawImage(images[s.sheet], s.sx, s.sy, s.sw, s.sh, Math.round(x), Math.round(y), s.sw, s.sh);
}

export async function loadTilesetImages(): Promise<TilesetImages> {
  const entries = await Promise.all(
    Object.entries(sheetUrls).map(
      ([id, url]) =>
        new Promise<[SheetId, HTMLImageElement]>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve([id as SheetId, image]);
          image.onerror = () => reject(new Error(`Failed to load tileset sheet: ${url}`));
          image.src = url;
        }),
    ),
  );

  return Object.fromEntries(entries) as TilesetImages;
}
