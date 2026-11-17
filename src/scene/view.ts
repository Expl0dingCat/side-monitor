// Draws the landscape as pixel art.
//
// The scene is rendered to a small off-screen picture, then a final pass adds
// outlines and shore foam and puts it on the canvas, which the page scales up
// with hard pixels. The geometry is fixed; everything that moves (grass, sea,
// clouds, rain, smoke, the waterfall) is animated on the graphics card.
//
// The picture is drawn larger than the window, from a camera that never
// moves. Looking around slides that picture under the window. Because nothing
// is re-rendered from a new angle, no pixel changes when you look around: the
// whole image just glides.

import type { FireLook } from '../fireShow';
import { MAX_STARS, type Heavens } from '../sky/stars';
import type { Rime } from '../weather/frost';
import type { Atmosphere } from './atmosphere';
import { cross, invert, multiply, noiseTexture, norm, perspective, Program, viewMatrix, type Mat4, type V3 } from './gl';
import { BLADE_FLOATS, buildBeachSheet, buildShingle, buildStoneShape, STONE_FLOATS, buildFall, buildGrass, buildHeightField, buildLand, buildProps, buildSeeds, BEACH, EYE, FACING, FIELD, fireHeart, hornMouth, hornWay, LAMB, musicFrame, lampSpots, PATH, PITCH, SHORE_EYE, shoreStones, smokeSources, stoneFace, villageSmoke, type Props } from './land';
import { bottleRange } from './land';
import { buildRayExtras, buildRayScene, buildRaySceneOf, type RayScene } from './rays';
import { lanternFlames, lanternFrames, lanternParts, paperPart, tokenParts, TOKENS } from './land';
import { HOMES, perches } from './land';
import { homeFrame, ROOM_EYE } from './land';
import { buildPanes, buildParlour, PANE_FLOATS, PANE_FRAG, PANE_VERT, PARLOUR, PARLOUR_FLOATS, PARLOUR_FRAG, PARLOUR_VERT, ROOM_DEPTH, ROOM_SHAPE_FRAG, ROOM_TRACE_FRAG, roomRayTriangles, TOUCH } from './parlour';
import { WIPE, type RoomLife } from '../indoors';
import { buildYard, STORM_FLAME, YARD_FLOATS, YARD_FRAG, YARD_VERT } from './yard';
import { buildBoatSea, SKIFF_SPOT } from './afloat';
import { BOW_LAMP, buildSkiff, SKIFF_FLOATS, SKIFF_FRAG, SKIFF_VERT } from './skiff';
import { buildCatch } from './catch';
import { hinged, LAMB_HIPS, LAMB_NECK } from './hinge';
import { PUFFIN_FLIGHT_FRAG, PUFFIN_FLIGHT_VERT, PUFFIN_NECK } from './life';
import * as S from './shaders';
import { BREATHS, createBreath } from './breath';

/** Tufts of grass in the meadow; each is three blades (five for a rush). */
const TUFTS = 10_500;
const DROPS = 3200;
const FLAKES = 2600;
const PUFFS = 54;
const GULLS = 7;
const NOTES = 9;
/** Lying back: how far up the sky you face, how wide you see, and the direction itself. */
const GAZE_TILT = (50 * Math.PI) / 180;
const GAZE_LENS = (80 * Math.PI) / 180;
export const GAZE: V3 = [Math.cos(GAZE_TILT) * Math.sin(FACING), Math.sin(GAZE_TILT), -Math.cos(GAZE_TILT) * Math.cos(FACING)];
/** Rows of big pixels across the height of the window. */
const ROWS = 360;
const ROWS_TALL = 580;
const LENS_TALL = (90 * Math.PI) / 180;
/** How much wider and taller than the window the picture is, as a fraction. */
const SPARE = { x: 0.24, y: 0.16 };
/** The lens, as the angle the window's height covers when the window is wider than tall. */
const LENS = (50 * Math.PI) / 180;
const NEAR = 0.3;
const FAR = 16000;

/** What a point on the page can be on, indoors. */
export type RoomSpot = 'lamp' | 'mug' | 'hourglass' | 'book' | 'kettle' | 'wireless' | 'cat' | 'chair' | 'stove' | 'curtain' | 'window' | 'wall' | 'thing';

export interface Scene {
  air: Atmosphere;
  /** Seconds since the last frame. */
  dt: number;
  /** Wind as the direction it travels in the scene (x right, z toward you), length 0..1. */
  windX: number;
  windZ: number;
  rain: number;
  snowfall: number;
  /** How much of the ground snow covers (0..1), and how deep it lies in metres. */
  snowCover: number;
  snowDepth: number;
  /** How warm the ground round the fire is, 0..1: the snow melts back from it. */
  melt: number;
  cloud: number;
  temp: number;
  /** Hoarfrost and dew: how much of each, and how far the sun has got with them (see weather/frost.ts). */
  rime: Rime;
  /** How much of the moon's disc is lit, 0..1. */
  moonLit: number;
  /** Where the real stars are. */
  heavens: Heavens;
  /** Extra glow on the stone's carving, 0..1 (for when the pointer is on it). */
  stoneLit: number;
  /** How the campfire looks this frame. */
  fire: FireLook;
  /** A shooting star: bearing, height, heading, and progress 0..1 (or -1 for none). */
  meteor: [number, number, number, number];
  /** Wrapped animation clocks. */
  clock: {
    gustA: [number, number];
    gustB: [number, number];
    shadow: [number, number];
    cloud: [number, number];
    sea: [number, number];
    /** Phase of each of the eight wave trains on the sea. */
    waves: number[];
    flutter: number;
    twinkle: number;
    rain: number;
    snow: number;
    fall: number;
    lap: number;
    pulse: number;
    smoke: number;
    bird: number;
    flap: number;
    beacon: number;
    flame: number;
    spark: number;
    note: number;
    /** Heat haze wavering, 0..1. */
    shimmer: number;
    /** The northern lights drifting, 0..1. */
    aurora: number;
    /** The small waves and ripples near to: an angle that every one of them turns a whole number of times as fast as. */
    fine: number;
    /** The surf on the beach: how far through its life the wave now coming in is, 0..1. */
    surf: number;
    /** COMBERS: the two waves on their way in, four numbers each: its size against the sea's, how far aslant it lies, a number of its own, and where along the shore its peak is. */
    combers: number[];
  };
  /**
   * The washing line and the storm lantern: how many pieces of washing are out (the last perhaps only
   * partly), the lantern (how full the battery is, whether it is on charge, whether there is one to tell
   * of, and a number that jumps about for when it gutters), and the time their small motions keep.
   */
  yard: { out: number; storm: number[]; time: number };
  /** How big the waves breaking on the beach are, 0..1. */
  surfSize: number;
  /**
   * AFLOAT: the rowing boat (see fishing.ts). Where your eyes are when you are out in her; the boat as the
   * sea needs to know her while she lies in the water in sight (where her middle is, and the ways her
   * starboard, up and bow point), so that no water is drawn inside her; and how big the swell runs.
   */
  skiff: {
    eye: V3;
    /** How your head is carried with her, and turned: tipped up, rolled, and turned to the right, in radians. */
    tilt: [number, number, number];
    /** Where she is to be drawn (null if she is not in sight), and whether she lies in the water. */
    boat: { at: V3; x: V3; y: V3; z: V3 } | null;
    wet: boolean;
    /** How brightly the lantern on her stem burns; and how big the swell runs out on the bay. */
    lamp: number;
    sea: number;
    /** CATCH: the fish, the rack and the spit (see catch.ts): which shape, where it is set, how far cooked, and whether it lies in the boat. */
    things: { mesh: string; at: V3; x: V3; y: V3; z: V3; cooked: number; aboard: boolean }[];
  };
  /** How brightly the sea glows where it is stirred, 0..1 (see weather/seaGlow.ts). */
  seaGlow: number;
  /** The stones you stack on the beach (see stacking.ts): twelve numbers a stone (where it is and how big; how it is turned, how flat, its tone and a number of its own; the axis it is tipped about, and how far). */
  stacked: number[];
  /** The tide (see sky/tide.ts): how far the sea stands above its mean level, the level the last high water reached, and how damp that has left the stones. */
  tide: { level: number; high: number; damp: number };
  /** The nine signs cut in the stone, three numbers each: what it spells, what it spelled before, seconds since its recutting began. */
  signs: number[];
  /** How much music is in the air: 0 silent, 1 playing. */
  music: number;
  /** Cloud by height (low, middle, high), each 0..1. */
  layers: [number, number, number];
  /** Rain or snow on its way: the bearing it comes from, how near (0..1), whether it is snow (0..1), and how the wind aloft leans its cloud (-1 to the left, 1 to the right). */
  front: [number, number, number, number];
  /** How cloudy it is toward each of the eight compass bearings (north first, then round by the east), each 0..1. */
  coverBy: number[];
  /** The air's colours (zenith, middle, horizon: nine numbers) with no cloud and under full cloud, and how well the stars would show with none: for the sides of the sky that differ from overhead. */
  skyBy: { clear: number[]; grey: number[]; stars: number };
  /** The Earth's shadow on the moon: its middle from the moon's middle in moon radii (x, y), its radius in moon radii (0 for none), and how much of the moon's light it has taken. */
  shadow: [number, number, number, number];
  /** The northern lights tonight, 0..1. */
  aurora: number;
  /** A skipping stone in flight (null if there is none), and the rings where it has touched the water: x, z, age, size for each. */
  stone: V3 | null;
  ripples: number[];
  /** The bottles on the beach and out on the water (see bottles.ts): where each is, how it is turned, how wet it is, and how far the pointer has picked it out (0..1). */
  bottles: { x: number; y: number; z: number; yaw: number; wet: number; lit: number }[];
  /** The kite, its tail and its line, as coloured corners (six numbers each): triangles, then lines. Null for none. */
  kite: { tris: number[]; lines: number[] } | null;
  /** Lightning: its bearing, how high it starts, a number that shapes it, how brightly it shows now; and its kind (0 a bolt, 1 a flash in the cloud). */
  bolt: [number, number, number, number];
  boltKind: number;
  /** The lamb by the fire: where it is and how it holds itself; null while it is away. */
  friend: { x: number; y: number; z: number; yaw: number; low: number; head: number; gait: number; stride: number; grow: number; turn: number; tilt: number; wet: number; snowy: number; sprawl: number } | null;
  /** Lines joined between stars and rings round stars, for the star-joining game (see starplay.ts). */
  sky: { joinA: number[]; joinB: number[]; joins: number; rings: number[]; ringCount: number; stars: number[] | null };
  /**
   * The lanterns by the path, one for each task written on the stone (see
   * tasks.ts). For each of their places: how much of the lantern is there
   * (0..1), how brightly it burns (0..1), how far above its place it still is
   * in metres, and whether it can be clicked. And the paper lanterns rising
   * away with finished tasks: for each its x, y, z, its size beside full size,
   * how far it has turned, how much of it is there and how brightly it glows.
   */
  lanterns: { there: number[]; lit: number[]; lift: number[]; sway: number[]; sparks: number[]; low: number[]; moss: number[]; up: boolean[]; rising: number[][] };
  /** The small stones laid on the old stone, one for each thing the almanac remembers (see almanac.ts); and how far above its seat the newest still is. */
  tokens: number;
  tokenLift: number;
  /** How brightly each household's windows are lit: three rooms for each (see households.ts). */
  windows: number[];
  /** How brightly the lantern by each meadow house's door burns, 0..1, in the order the houses are built. */
  doorLamps: number[];
  /** The fishing boat: where it is, the way it points, how much larger than built it is drawn, and how many pixels the swell has lifted it. */
  boat: { x: number; z: number; yaw: number; grow: number; rise: number };
  /**
   * Puffins: how each standing bird holds its head (null for one that is not about, in the order of
   * the places they stand), how many are on the wing, and the time their flights keep, in seconds.
   */
  puffins: { birds: ({ turn: number; tilt: number } | null)[]; flying: number; time: number };
  /**
   * The room indoors (see room.ts): the daylight coming in at its window, how dark it is out, how brightly
   * the lamp on the sill burns, what the weather has put on the glass (rain, frost, snow on the ledge, mist),
   * the hands of the clock on the wall (as angles), and the time its small motions keep.
   */
  room: {
    dayIn: number[];
    night: number;
    lamp: number;
    glass: number[];
    hands: number[];
    time: number;
    flick: number;
    /** How the room's moving parts stand (see indoors.ts), and how much sand is left in the hourglass (below 0: it is not running). */
    life: RoomLife;
    sand: number;
  };
}

/** A set of pictures the gathered light is kept in. */
type LightSet = { target: WebGLFramebuffer; a: WebGLTexture; b: WebGLTexture; c: WebGLTexture; d: WebGLTexture };
/** A place you can stand, each with light of its own to gather. */
type Place = 'meadow' | 'shore' | 'room' | 'seat';
/** The light gathered for one of them, and how far its gathering has got. */
type LightState = { set: LightSet; settled: number; sunTaken: number; bounceTaken: number; stillTaken: number; stillFor: number; tracedFor: V3; trust: number };

export class Landscape {
  private gl: WebGL2RenderingContext;
  private sky: Program;
  private land: Program;
  private grass: Program;
  private prop: Program;
  private sea: Program;
  private fall: Program;
  private rain: Program;
  private snow: Program;
  private smoke: Program;
  private breath: Program;
  private bird: Program;
  private puffin: Program;
  private flame: Program;
  private glow: Program;
  private spark: Program;
  private note: Program;
  private pebble: Program;
  private spray: Program;
  private room: Program;
  private panes: Program;
  private roomVao!: WebGLVertexArrayObject;
  private roomCount = 0;
  private panesVao!: WebGLVertexArrayObject;
  private panesCount = 0;
  private wipedGlass!: WebGLTexture;
  private yard: Program;
  private yardVao!: WebGLVertexArrayObject;
  private yardCount = 0;
  // AFLOAT: out in the rowing boat. The piece of sea round her that rises and falls, and where your eyes are.
  private afloat = false;
  private skiffEye: V3 = [0, 0, 0];
  private beamDrift = 0; // SUNBEAMS: how far the beams' pattern has drifted, 0..1 and round again (a quarter of an hour to come round)
  private tilt: [number, number, number] = [0, 0, 0]; // how she tips and rolls your head (bow up, starboard up), and how far you have turned it to the right
  private boatProgram: Program;
  private boatVao!: WebGLVertexArrayObject;
  private boatCount = 0;
  private catchVao!: WebGLVertexArrayObject;
  private catchParts: Record<string, [number, number]> = {};
  private boatSeaVao!: WebGLVertexArrayObject;
  private boatSeaCount = 0;
  /** The rocks that stand in the water off the beach, where waves break on them: x, z and size each. */
  private wetRocks: [number, number, number][] = [];
  private shingle: Program;
  private wash: Program;
  private shingleVao!: WebGLVertexArrayObject;
  private shingleCount = 0;
  /** The stones you stack on the beach: the same shape as the beach's own, placed afresh each frame. */
  private stackVao!: WebGLVertexArrayObject;
  private stackBuffer!: WebGLBuffer;
  private washVao!: WebGLVertexArrayObject;
  private washCount = 0;
  private swellVao!: WebGLVertexArrayObject;
  private swellCount = 0;
  private kite: Program;
  private kiteVao: WebGLVertexArrayObject;
  private kiteBuffer: WebGLBuffer;
  private post: Program;
  private shape: Program;
  private trace: Program;

  private emptyVao: WebGLVertexArrayObject;
  private landVao: WebGLVertexArrayObject;
  private landCount: number;
  private grassVao: WebGLVertexArrayObject;
  private grassCount: number;
  private beadVao: WebGLVertexArrayObject;
  private flowerVao: WebGLVertexArrayObject;
  private flowerCount: number;
  private propVao: WebGLVertexArrayObject;
  private props: Props;
  private flameVao: WebGLVertexArrayObject;
  private glowVao: WebGLVertexArrayObject;
  private sparkVao: WebGLVertexArrayObject;
  private noteVao: WebGLVertexArrayObject;
  private seaVao: WebGLVertexArrayObject;
  private ribbonVao: WebGLVertexArrayObject;
  private ribbonCount: number;
  private sprayVao: WebGLVertexArrayObject;
  private rainVao: WebGLVertexArrayObject;
  private snowVao: WebGLVertexArrayObject;
  private smokeVao: WebGLVertexArrayObject;
  private birdVao: WebGLVertexArrayObject;

  private target: WebGLFramebuffer;
  private colour: WebGLTexture;
  private depth: WebGLTexture;
  private noise: WebGLTexture;

  // Tracing the light. `shape*` hold where everything fixed is and which way it
  // faces; the two `gathered` sets hold the light built up so far, and take
  // turns being read from and written to.
  private canTrace: boolean;
  private onePixel = new Uint8Array(4);
  private nudgeX = 0;
  private nudgeY = 0;
  /** How far the fog pouring off the far cliff has slid (wraps 0..1). */
  private spilt = 0;
  /** Where the waterfall leaves the rim of the cliff. */
  private fallLip: V3;
  /** The lamb's breath, on a cold day. */
  private breathing = createBreath();
  /** A slow clock for the glints on frost and dew: it wraps 0..1 in most of a minute. */
  private slow = 0;
  /** Where the lamb was last drawn, if it is about. */
  private friendAt: V3 | null = null;
  /** Which of the lanterns by the path are standing, and the one `thingAt` last found the pointer on. */
  private lanternsUp: boolean[] = [];
  lantern = -1;
  /** Lying on your back, looking at the sky. */
  private lying = false;
  /** Down on the beach at the water's edge, and not up in the meadow. */
  private ashore = false;
  /** Indoors, at the window of the nearest house. */
  private indoors = false;
  /** Indoors: sitting in the chair at the table, and not standing in the room. */
  private seated = false;
  /** How many rows of big pixels the window shows (the picture itself has a few more, to look round in). */
  private seenRows = 360;
  /** The camera the sky was last painted through. */
  private skyCam: { right: V3; up: V3; fwd: V3; tanHalf: number; aspect: number } = { right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, -1], tanHalf: 0.5, aspect: 1 };
  /** False until the window has a real size (a page opened in a hidden tab can start with none). */
  private sized = false;
  private shapeTarget: WebGLFramebuffer;
  private shapeNormal: WebGLTexture;
  private shapeDepth: WebGLTexture;
  private heightMap: WebGLTexture;
  private gathered!: LightSet;
  /** A spare set, which each gathering is worked out into before it is carried back (see TRACE_VERT). */
  private scratch!: LightSet;
  private carry: Program;
  // PATH-TRACE: the scene's own triangles, sorted for rays to find (see rays.ts).
  private rayBoxes!: WebGLTexture;
  private rayTris!: WebGLTexture;
  private rays!: RayScene;
  /** The sea's surface off the beach, as a flat sheet: for the rays' picture of where things are (so the water there has light gathered for it too). */
  private seaSheetVao!: WebGLVertexArrayObject;
  private seaSheetBuffer!: WebGLBuffer;
  // The room's own, for the light indoors: its triangles (made the first time you go in), the program
  // that draws where its things are, and the one that follows the paths.
  private roomMesh!: Float32Array;
  private roomBoxes: WebGLTexture | null = null;
  private roomTris: WebGLTexture | null = null;
  private roomShape: Program;
  private roomTrace: Program;

  /** How many logs of the pile and stones of the cairn the rays were last told of (they come and go). */
  private extrasFor = [-1, -1];
  /** How many times light has been gathered since the picture was last made afresh. */
  private settled = 0;
  /**
   * How many samples each pixel has had: of the sun's own light, and of its light bounced (both begun
   * again when the light swings round sharply), and of the light that never moves (sky, fire, lanterns).
   */
  private sunTaken = 0;
  private bounceTaken = 0;
  private stillTaken = 0;
  /** The snow the unmoving light was gathered over (snow throws back far more light than grass). */
  private stillFor = -1;
  /**
   * The light is gathered for one place at a time: the meadow, the beach, the room standing, the room
   * seated. (The room's curtains make no difference to it: light is gathered for the room behind them
   * as if they were not there, and how much of the day they let by is reckoned as the light is laid on.
   * So drawing them or opening them changes the light as the cloth moves, and nothing is gathered
   * again.) What was gathered for the places you have left is kept here, the latest left last, and
   * taken up again when you go back. (No more than two are kept, one without a graphics chip: the one
   * longest left is let go, the meadow's last. All are thrown away if the window changes its size.)
   */
  private lightAt: Place = 'meadow';
  private lightKept = new Map<Place, LightState>();
  private tracedFor: V3 = [0, 0, 0];
  private trust = 0; // how far the traced light has taken over from the formula, 0..1
  // LIGHT-WORK: what the tracer's picture of the fixed things was last drawn for (it is only drawn again
  // when one of these changes), and how long since light was last gathered.
  private shapeFor: number[] = [];
  private sinceTraced = 1;
  // PLAIN-DRAW: whether this browser is drawing without a graphics chip (everything is then worked out on
  // the processor). Such a renderer takes each repeat of a repeated shape as a drawing of its own, so
  // fifty thousand blades of grass are fifty thousand drawings; there every blade and every beach stone
  // is written out in full instead and sent as one. The picture is the same either way.
  private plain = false;
  private stoneShape: Float32Array | null = null;
  private stoneRows: Float32Array | null = null;
  private stonesPlain = false;

  private width = 1;
  private height = 1;
  private scale = 3;
  private tanHalf = 0.5;

  // Where the pointer asks the view to slide (-1..1 each way), and where it has eased to.
  private wantX = 0;
  private wantY = 0;
  private lookX = 0;
  private lookY = 0;
  private slideX = 0;
  private slideY = 0;
  private cssWidth = 1;
  private cssHeight = 1;
  /** Leaning in toward the stone: where it is heading (0 or 1) and how far it has got. */
  private leanWant = 0;
  private lean = 0;
  private viewProj: Mat4 = new Float32Array(16);

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      this.plain = /swiftshader|llvmpipe|softpipe|software|basic render|warp/i.test(renderer);
      // (For trying either way of drawing on any machine: ?plain=1 or ?plain=0 in the page's address.)
      const asked = /[?&]plain=([01])/.exec(window.location.search);
      if (asked) this.plain = asked[1] === '1';
    }

    this.sky = new Program(gl, 'sky', S.SKY_VERT, S.SKY_FRAG, []);
    this.land = new Program(gl, 'land', S.LAND_VERT, S.LAND_FRAG, ['aPos', 'aNormal']);
    this.grass = new Program(gl, 'grass', S.GRASS_VERT, S.GRASS_FRAG, ['aTpl', 'aRoot', 'aParams', 'aSlope']);
    this.prop = new Program(gl, 'prop', S.PROP_VERT, S.PROP_FRAG, ['aPos', 'aNormal', 'aUv', 'aMat']);
    this.sea = new Program(gl, 'sea', S.SEA_VERT, S.SEA_FRAG, ['aXZ']);
    this.fall = new Program(gl, 'waterfall', S.FALL_VERT, S.FALL_FRAG, ['aPos', 'aUv']);
    this.rain = new Program(gl, 'rain', S.RAIN_VERT, S.RAIN_FRAG, ['aSeed', 'aEnd']);
    this.snow = new Program(gl, 'snow', S.SNOW_VERT, S.SNOW_FRAG, ['aSeed']);
    this.smoke = new Program(gl, 'smoke', S.SMOKE_VERT, S.SMOKE_FRAG, ['aSeed']);
    this.breath = new Program(gl, 'breath', S.BREATH_VERT, S.BREATH_FRAG, ['aSeed']);
    this.bird = new Program(gl, 'gulls', S.BIRD_VERT, S.BIRD_FRAG, ['aSeed']);
    this.puffin = new Program(gl, 'puffins', PUFFIN_FLIGHT_VERT, PUFFIN_FLIGHT_FRAG, ['aSeed']);
    this.flame = new Program(gl, 'flame', S.FLAME_VERT, S.FLAME_FRAG, ['aPos', 'aUv']);
    this.glow = new Program(gl, 'glow', S.FLAME_VERT, S.GLOW_FRAG, ['aPos', 'aUv']);
    this.spark = new Program(gl, 'sparks', S.SPARK_VERT, S.SPARK_FRAG, ['aSeed']);
    this.note = new Program(gl, 'notes', S.NOTE_VERT, S.NOTE_FRAG, ['aSeed']);
    this.pebble = new Program(gl, 'stone', S.PEBBLE_VERT, S.PEBBLE_FRAG, []);
    this.spray = new Program(gl, 'spray', S.SPRAY_VERT, S.SPRAY_FRAG, []);
    this.spray.use().sampler('uNoise', 0);
    this.room = new Program(gl, 'room', PARLOUR_VERT, PARLOUR_FRAG, ['aPos', 'aNormal', 'aUv', 'aMat']);
    this.panes = new Program(gl, 'window panes', PANE_VERT, PANE_FRAG, ['aPos', 'aIn', 'aWhich']);
    for (const p of [this.room, this.panes]) p.use().sampler('uNoise', 0);
    // Where the mist on the window has been wiped off: a small picture of its own, blank to begin with.
    this.panes.use().sampler('uWiped', 5);
    this.wipedGlass = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.wipedGlass);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, WIPE.wide, WIPE.high, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(WIPE.wide * WIPE.high));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.room.use().sampler('uNoise', 0).sampler('uTraceA', 3).sampler('uTraceB', 4).sampler('uTraceC', 8).sampler('uTraceD', 11);
    this.wetRocks = shoreStones.filter(([x, z]) => {
      const out = (x - BEACH.x) * Math.sin(FACING) - (z - BEACH.z) * Math.cos(FACING) - BEACH.toWater;
      return out > 0.5 && out < 18;
    });
    this.shingle = new Program(gl, 'shingle', S.SHINGLE_VERT, S.SHINGLE_FRAG, ['aPos', 'aFace', 'aRoot', 'aShape', 'aTumble']);
    this.wash = new Program(gl, 'wash', S.WASH_VERT, S.WASH_FRAG, ['aPos']);
    this.yard = new Program(gl, 'yard', YARD_VERT, YARD_FRAG, ['aPos', 'aNormal', 'aHang', 'aItem', 'aMat', 'aTint']);
    this.yard.use().sampler('uNoise', 0);
    this.boatProgram = new Program(gl, 'rowing boat', SKIFF_VERT, SKIFF_FRAG, ['aPos', 'aNormal', 'aCol', 'aMore']);
    this.boatProgram.use().sampler('uNoise', 0).sampler('uTraceA', 3).sampler('uTraceB', 4).sampler('uTraceC', 8);
    this.kite = new Program(gl, 'kite', S.KITE_VERT, S.KITE_FRAG, ['aPos', 'aCol']);
    this.post = new Program(gl, 'finish', S.SKY_VERT, S.POST_FRAG, []);
    this.shape = new Program(gl, 'shape', S.SHAPE_VERT, S.SHAPE_FRAG, ['aPos', 'aNormal']);
    this.trace = new Program(gl, 'light tracer', S.TRACE_VERT, S.TRACE_FRAG, []);
    this.carry = new Program(gl, 'light carried back', S.TRACE_VERT, S.CARRY_FRAG, []);
    this.carry.use().sampler('uPrevA', 3).sampler('uPrevB', 4).sampler('uPrevC', 8).sampler('uPrevD', 11);
    this.roomShape = new Program(gl, 'room shape', PARLOUR_VERT, ROOM_SHAPE_FRAG, ['aPos', 'aNormal', 'aUv', 'aMat']);
    this.roomTrace = new Program(gl, 'room light tracer', S.TRACE_VERT, ROOM_TRACE_FRAG, []);
    this.roomTrace.use().sampler('uPrevA', 3).sampler('uPrevB', 4).sampler('uPrevC', 8).sampler('uPrevD', 11).sampler('uDepth', 5).sampler('uNormal', 6).sampler('uBoxes', 9).sampler('uTris', 10);
    // Building light up over many frames needs a picture that can hold fine fractions.
    this.canTrace = !!gl.getExtension('EXT_color_buffer_float');

    this.noise = noiseTexture(gl);
    for (const p of [this.sky, this.land, this.grass, this.prop, this.sea, this.fall, this.flame, this.post, this.shingle, this.wash]) p.use().sampler('uNoise', 0);
    this.post.use().sampler('uColor', 1).sampler('uDepth', 2);
    for (const p of [this.land, this.grass, this.prop, this.shingle, this.sea, this.wash]) p.use().sampler('uTraceA', 3).sampler('uTraceB', 4).sampler('uTraceC', 8);
    this.trace.use().sampler('uPrevA', 3).sampler('uPrevB', 4).sampler('uPrevC', 8).sampler('uPrevD', 11).sampler('uDepth', 5).sampler('uNormal', 6).sampler('uHeight', 7).sampler('uBoxes', 9).sampler('uTris', 10);

    const buffer = (data: Float32Array | Uint32Array, target: number = gl.ARRAY_BUFFER) => {
      const b = gl.createBuffer()!;
      gl.bindBuffer(target, b);
      gl.bufferData(target, data as AllowSharedBufferSource, gl.STATIC_DRAW);
      return b;
    };
    /** Describe interleaved float attributes: [components, ...]. */
    const layout = (sizes: number[], divisor = 0, first = 0) => {
      const stride = sizes.reduce((a, b) => a + b, 0) * 4;
      let offset = 0;
      sizes.forEach((size, i) => {
        gl.enableVertexAttribArray(first + i);
        gl.vertexAttribPointer(first + i, size, gl.FLOAT, false, stride, offset);
        gl.vertexAttribDivisor(first + i, divisor);
        offset += size * 4;
      });
    };
    const vao = () => {
      const v = gl.createVertexArray()!;
      gl.bindVertexArray(v);
      return v;
    };

    this.emptyVao = vao();
    // The kite's corners are worked out afresh each frame and sent as they are.
    this.kiteVao = vao();
    this.kiteBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.kiteBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);

    // Land.
    const land = buildLand();
    this.landVao = vao();
    buffer(land.vertices);
    layout([3, 3]);
    buffer(land.indices, gl.ELEMENT_ARRAY_BUFFER);
    this.landCount = land.indices.length;

    // Houses, sheep, rocks, walls, the lighthouse and the standing stone.
    const props = buildProps();
    this.propVao = vao();
    buffer(props.vertices);
    layout([3, 3, 2, 1]);
    this.props = props;

    // The campfire's flames. A fire is not flat, so it is not one sheet but
    // four, standing in the pit at different angles and depths: two crossed
    // behind, one facing you, and a small bright heart in front. The logs
    // stand among them, so flame shows between the logs and behind them.
    const { right, fwd } = this.camera();
    const [fx, fy, fz] = fireHeart;
    const away = norm([fwd[0], 0, fwd[2]]); // level, from you toward the fire
    /** The six corners of an upright sheet through the fire: turned by `turn` from facing you, and set `back` metres further off. */
    const sheet = (half: number, low: number, high: number, turn = 0, back = 0): number[] => {
      const dx = right[0] * Math.cos(turn) + right[2] * Math.sin(turn);
      const dz = -right[0] * Math.sin(turn) + right[2] * Math.cos(turn);
      const cx = fx + away[0] * back;
      const cz = fz + away[2] * back;
      const a = [cx - dx * half, fy + low, cz - dz * half];
      const c = [cx + dx * half, fy + low, cz + dz * half];
      const tall = high - low;
      return [
        a[0], a[1], a[2], 0, 0, c[0], c[1], c[2], 1, 0, c[0], c[1] + tall, c[2], 1, 1,
        a[0], a[1], a[2], 0, 0, c[0], c[1] + tall, c[2], 1, 1, a[0], a[1] + tall, a[2], 0, 1,
      ];
    };
    this.flameVao = vao();
    buffer(new Float32Array([
      ...sheet(1.05, -0.15, 2.0, 0.95, 0.16),
      ...sheet(1.05, -0.15, 2.1, -0.95, 0.12),
      ...sheet(1.15, -0.15, 2.25),
      ...sheet(0.8, -0.12, 1.5, 0, -0.17),
    ]));
    layout([3, 2]);
    // The glow in the air round it is a much larger sheet.
    this.glowVao = vao();
    buffer(new Float32Array(sheet(4.5, -1.2, 5.6)));
    layout([3, 2]);
    this.sparkVao = vao();
    buffer(buildSeeds(56));
    layout([4]);
    this.noteVao = vao();
    buffer(buildSeeds(NOTES));
    layout([4]);

    // Grass: one seven-point strip, repeated for every blade.
    const meadow = buildGrass(TUFTS, props.roofs);
    const blades = meadow.blades;
    this.grassVao = vao();
    this.grassCount = blades.length / BLADE_FLOATS;
    const STRIP = [-1, 0, 1, 0, -1, 0.33, 1, 0.33, -1, 0.66, 1, 0.66, 0, 1];
    if (this.plain) {
      // (See PLAIN-DRAW.) Every blade's seven points written out, each with the blade's own numbers
      // beside it, and the strip as its five triangles (each ending on the point the strip's would).
      const each = 2 + BLADE_FLOATS;
      const out = new Float32Array(this.grassCount * 7 * each);
      for (let i = 0, o = 0; i < this.grassCount; i++) {
        for (let k = 0; k < 7; k++) {
          out[o++] = STRIP[k * 2];
          out[o++] = STRIP[k * 2 + 1];
          for (let j = 0; j < BLADE_FLOATS; j++) out[o++] = blades[i * BLADE_FLOATS + j];
        }
      }
      buffer(out);
      layout([2, 4, 4, 2]);
      const TRIANGLES = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
      const index = new Uint32Array(this.grassCount * 15);
      for (let i = 0; i < this.grassCount; i++) for (let k = 0; k < 15; k++) index[i * 15 + k] = i * 7 + TRIANGLES[k];
      buffer(index, gl.ELEMENT_ARRAY_BUFFER);
    } else {
      buffer(new Float32Array(STRIP));
      layout([2]);
      buffer(blades);
      layout([4, 4, 2], 1, 1);
    }
    const each1 = this.plain ? 0 : 1; // one set of numbers to a point, or to a repeat of the shape
    // Beads of dew and glints of frost sit on the tips of the same blades: one point each.
    this.beadVao = vao();
    buffer(blades);
    layout([4, 4, 2], each1, 1);
    // Flower heads use the same shader, drawn as single points at the top of their stems.
    this.flowerVao = vao();
    buffer(meadow.flowers);
    layout([4, 4, 2], each1, 1);
    this.flowerCount = meadow.flowers.length / BLADE_FLOATS;

    // The beach's stones: one small faceted shape, repeated for every stone; and the sheet the surf's water lies on.
    const stones = buildShingle();
    this.shingleVao = vao();
    buffer(buildStoneShape());
    layout([3, 3]);
    buffer(stones);
    layout([4, 4], 1, 2);
    this.shingleCount = stones.length / STONE_FLOATS;
    if (this.plain) {
      // (See PLAIN-DRAW. They are written out the first time you go down to the beach, not before.)
      this.stoneShape = buildStoneShape();
      this.stoneRows = stones;
    }
    // The stones you stack are the same stone again, each with its own place, shape and tip, sent as they stand.
    this.stackVao = vao();
    buffer(buildStoneShape());
    layout([3, 3]);
    this.stackBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stackBuffer);
    layout([4, 4, 4], 1, 2);
    // (The beach's own stones have no tip: where nothing is sent for it, it is none, about any axis.)
    gl.vertexAttrib4f(4, 1, 0, 0, 0);
    const washSheet = buildBeachSheet();
    this.washVao = vao();
    buffer(washSheet);
    layout([3]);
    this.washCount = washSheet.length / 3;

    // The sea off the beach, finely: this piece of it rises and falls with the waves coming in.
    {
      const fx = Math.sin(FACING);
      const fz = -Math.cos(FACING);
      const rows = 110; // out to sea, close together, so a crest keeps its shape
      const cols = 64; // along the shore
      const at = (i: number, j: number): [number, number] => {
        const out = BEACH.toWater - 0.8 + (i / rows) * 25.5;
        const along = (j / cols - 0.5) * 50;
        return [BEACH.x + fx * out - fz * along, BEACH.z + fz * out + fx * along];
      };
      const swell: number[] = [];
      for (let i = 0; i < rows; i++) {
        for (let j = 0; j < cols; j++) swell.push(...at(i, j), ...at(i + 1, j), ...at(i, j + 1), ...at(i, j + 1), ...at(i + 1, j), ...at(i + 1, j + 1));
      }
      this.swellVao = vao();
      buffer(new Float32Array(swell));
      layout([2]);
      this.swellCount = swell.length / 2;
    }

    // (AFLOAT) The rowing boat herself (see skiff.ts); and the piece of sea round her, for when you are out in her.
    {
      const boat = buildSkiff();
      this.boatVao = vao();
      buffer(boat);
      layout([3, 3, 3, 3]);
      this.boatCount = boat.length / SKIFF_FLOATS;
      // (CATCH) The fish, the rack by the fire and the spit: drawn by the boat's program.
      const caught = buildCatch();
      this.catchVao = vao();
      buffer(caught.data);
      layout([3, 3, 3, 3]);
      this.catchParts = caught.parts;
      this.boatProgram.use().set({ uFirePos: fireHeart });
    }
    {
      const patch = buildBoatSea();
      this.boatSeaVao = vao();
      buffer(patch);
      layout([2]);
      this.boatSeaCount = patch.length / 2;
    }

    // The washing line and the storm lantern.
    const yard = buildYard();
    this.yardVao = vao();
    buffer(yard);
    layout([3, 3, 1, 1, 1, 1]);
    this.yardCount = yard.length / YARD_FLOATS;

    // The room indoors: everything in it, and the panes of its window.
    const parlour = buildParlour();
    this.roomVao = vao();
    buffer(parlour);
    layout([3, 3, 2, 1]);
    this.roomCount = parlour.length / PARLOUR_FLOATS;
    this.roomMesh = parlour;
    const glass = buildPanes();
    this.panesVao = vao();
    buffer(glass);
    layout([3, 2, 2]);
    this.panesCount = glass.length / PANE_FLOATS;

    // Sea: one very large sheet.
    this.seaVao = vao();
    const far = 15000;
    buffer(new Float32Array([-far, 200, far, 200, -far, -far, far, 200, far, -far, -far, -far]));
    layout([2]);

    // The waterfall and its spray.
    const fall = buildFall();
    this.ribbonVao = vao();
    buffer(fall.ribbon);
    layout([3, 2]);
    this.ribbonCount = fall.ribbon.length / 5;
    this.fallLip = fall.lip;
    this.sprayVao = vao();
    buffer(fall.spray);
    layout([3, 2]);

    // Rain: two points per drop (head and tail). Snow, smoke and gulls: one each.
    const drops = buildSeeds(DROPS);
    const lines = new Float32Array(DROPS * 2 * 5);
    for (let i = 0; i < DROPS; i++) {
      for (let end = 0; end < 2; end++) {
        lines.set(drops.subarray(i * 4, i * 4 + 4), (i * 2 + end) * 5);
        lines[(i * 2 + end) * 5 + 4] = end;
      }
    }
    this.rainVao = vao();
    buffer(lines);
    layout([4, 1]);
    this.snowVao = vao();
    buffer(buildSeeds(FLAKES));
    layout([4]);
    this.smokeVao = vao();
    buffer(buildSeeds(PUFFS));
    layout([4]);
    this.birdVao = vao();
    buffer(buildSeeds(GULLS));
    layout([4]);
    gl.bindVertexArray(null);

    // For the light tracer: the lie of the ground as a grid of heights, and the
    // boxes and lumps that stand in for everything on it.
    const cells = 320;
    this.heightMap = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.heightMap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, cells, cells, 0, gl.RED, gl.FLOAT, buildHeightField(cells));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // PATH-TRACE: and the things that stand on it, as the very triangles they are drawn with, sorted
    // into a tree for rays to search. (Only what is on the mapped ground: nothing further off is traced.)
    const rays = buildRayScene(this.props.vertices, this.props.fixed, 9, 8, [FIELD[0] - 15, FIELD[1] - 15, FIELD[2] + 15, FIELD[3] + 15]);
    const numbers = (wide: number, high: number, data: Float32Array): WebGLTexture => {
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, wide, high, 0, gl.RGBA, gl.FLOAT, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };
    this.rayBoxes = numbers(rays.boxesWide, rays.boxesHigh, rays.boxes);
    this.rayTris = numbers(rays.trisWide, rays.trisHigh, rays.tris);
    this.rayScene = { boxes: rays.boxCount, triangles: rays.triCount };
    this.rays = { ...rays, boxes: new Float32Array(0), tris: new Float32Array(0) }; // (their places in the pictures are all that is wanted again)
    this.trace.use().list('uLampPos', 3, lampSpots.slice(0, 4).flat()).list('uTaskPos', 3, [...lanternFlames.slice(0, 7).flat(), ...STORM_FLAME]);
    this.trace.set({
      uBoxCount: rays.boxCount,
      uFirePos: fireHeart,
      uField: [FIELD[0], FIELD[1], 1 / (FIELD[2] - FIELD[0]), 1 / (FIELD[3] - FIELD[1])],
    });

    this.seaSheetVao = gl.createVertexArray()!;
    this.seaSheetBuffer = gl.createBuffer()!;
    gl.bindVertexArray(this.seaSheetVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seaSheetBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, 36 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);

    this.shapeTarget = gl.createFramebuffer()!;
    this.shapeNormal = gl.createTexture()!;
    this.shapeDepth = gl.createTexture()!;
    this.gathered = this.newLight();
    this.scratch = this.newLight();
    for (const tex of [this.shapeNormal, this.shapeDepth]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // Things that never change.
    this.land.use().list('uPath', 2, PATH.flat()).set({ uBeach: [BEACH.x, BEACH.z, BEACH.r] });
    this.land.list('uRocks', 3, shoreStones.flat());
    const lamps = lampSpots.slice(0, 4).flat();
    for (const p of [this.land, this.grass, this.prop]) p.use().list('uLampPos', 3, lamps).set({ uFirePos: fireHeart });
    this.spark.use().set({ uFirePos: fireHeart });
    this.prop.use().list('uHome', 4, HOMES.flat());

    // The small off-screen picture the scene is drawn into.
    this.target = gl.createFramebuffer()!;
    this.colour = gl.createTexture()!;
    this.depth = gl.createTexture()!;
    for (const tex of [this.colour, this.depth]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }

    // Blending is only for rain and snow, and must leave the labels in the alpha channel alone.
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
  }

  resize(cssWidth: number, cssHeight: number): void {
    const { gl, canvas } = this;
    // A window with no size yet has nothing to draw into; wait for the resize that gives it one.
    if (cssWidth < 8 || cssHeight < 8) return;
    this.sized = true;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    // A tall window is drawn with more rows and a wider lens, so that the stone, the
    // fire and the gramophone are all still in view and no coarser than in a wide one.
    const tall = cssHeight > cssWidth;
    this.scale = Math.max(2, Math.round(cssHeight / (tall ? ROWS_TALL : ROWS)));
    const seenRows = cssHeight / this.scale;
    this.seenRows = seenRows;
    this.width = Math.ceil((cssWidth * (1 + SPARE.x)) / this.scale);
    this.height = Math.ceil((cssHeight * (1 + SPARE.y)) / this.scale);
    // The lens is fixed by the window; the spare margin simply sees further round.
    const lens = tall ? LENS_TALL : LENS;
    this.tanHalf = (Math.tan(lens / 2) * this.height) / seenRows;
    this.slideX = (this.width * this.scale - cssWidth) / 2;
    this.slideY = (this.height * this.scale - cssHeight) / 2;

    canvas.width = this.width;
    canvas.height = this.height;
    canvas.style.width = `${this.width * this.scale}px`;
    canvas.style.height = `${this.height * this.scale}px`;

    gl.bindTexture(gl.TEXTURE_2D, this.colour);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, this.depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.width, this.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.colour, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depth, 0);

    // The tracer's pictures are the same size. (And are empty until drawn again: see LIGHT-WORK.)
    this.shapeFor = [];
    gl.bindTexture(gl.TEXTURE_2D, this.shapeNormal);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, this.shapeDepth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.width, this.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shapeTarget);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shapeNormal, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shapeDepth, 0);
    if (this.canTrace && !(this.sizeLight(this.gathered) && this.sizeLight(this.scratch))) this.canTrace = false;
    // (What was gathered for the other places was for the old size: it is let go, and made again when wanted.)
    for (const kept of this.lightKept.values()) this.dropLight(kept.set);
    this.lightKept.clear();
    this.settled = 0; // start gathering light afresh
    this.sunTaken = 0;
    this.bounceTaken = 0;
    this.stillTaken = 0;
    this.trust = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** A set of pictures for gathered light to be kept in. */
  private newLight(): LightSet {
    const { gl } = this;
    const set: LightSet = { target: gl.createFramebuffer()!, a: gl.createTexture()!, b: gl.createTexture()!, c: gl.createTexture()!, d: gl.createTexture()! };
    for (const tex of [set.a, set.b, set.c, set.d]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    return set;
  }

  private dropLight(set: LightSet): void {
    const { gl } = this;
    gl.deleteFramebuffer(set.target);
    for (const tex of [set.a, set.b, set.c, set.d]) gl.deleteTexture(tex);
  }

  /**
   * Make it the size of the picture, and empty. The light gathered is kept as whole floating numbers
   * where the browser can draw into those (a sample in several thousand has to make its difference);
   * failing that, as half ones. False if it can draw into neither.
   */
  private sizeLight(set: LightSet): boolean {
    const { gl } = this;
    let made = false;
    for (const [inner, type] of [[gl.RGBA32F, gl.FLOAT], [gl.RGBA16F, gl.HALF_FLOAT]] as const) {
      for (const tex of [set.a, set.b, set.c, set.d]) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, inner, this.width, this.height, 0, gl.RGBA, type, null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, set.target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, set.a, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, set.b, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, set.c, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT3, gl.TEXTURE_2D, set.d, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2, gl.COLOR_ATTACHMENT3]);
      made = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (made) break;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return made;
  }

  /** Where you are standing, of the places light is gathered for. */
  private get place(): Place {
    return this.indoors ? (this.seated ? 'seat' : 'room') : this.ashore ? 'shore' : 'meadow';
  }

  /** Going from one of those places to another: put by the light gathered for the one you leave, and take up what was gathered for the other. */
  private lightFor(place: Place): void {
    if (place === this.lightAt || !this.canTrace) return;
    let other = this.lightKept.get(place);
    if (other) this.lightKept.delete(place);
    else {
      const set = this.newLight();
      if (!this.sizeLight(set)) {
        this.dropLight(set);
        return; // (no room for another: that place is then lit by the plain rule, as it was)
      }
      other = { set, settled: 0, sunTaken: 0, bounceTaken: 0, stillTaken: 0, stillFor: -1, tracedFor: [0, 0, 0], trust: 0 };
    }
    this.lightKept.set(this.lightAt, { set: this.gathered, settled: this.settled, sunTaken: this.sunTaken, bounceTaken: this.bounceTaken, stillTaken: this.stillTaken, stillFor: this.stillFor, tracedFor: this.tracedFor, trust: this.trust });
    while (this.lightKept.size > (this.plain ? 1 : 2)) {
      // (The meadow's is the last to go: it is where the page spends its day.)
      const kept = [...this.lightKept.keys()];
      const longest = kept.find((k) => k !== 'meadow') ?? kept[0];
      this.dropLight(this.lightKept.get(longest)!.set);
      this.lightKept.delete(longest);
    }
    this.gathered = other.set;
    this.settled = other.settled;
    this.sunTaken = other.sunTaken;
    this.bounceTaken = other.bounceTaken;
    this.stillTaken = other.stillTaken;
    this.stillFor = other.stillFor;
    this.tracedFor = other.tracedFor;
    this.trust = other.trust;
    this.lightAt = place;
    this.shapeFor = [];
  }

  /** How the light tracer is getting on (for testing). */
  get tracing(): { able: boolean; frames: number; trust: number; samples: number[]; boxes: number; triangles: number; place: string; room: { boxes: number; triangles: number } } {
    return { able: this.canTrace, frames: this.settled, trust: this.trust, samples: [this.sunTaken, this.bounceTaken, this.stillTaken], ...this.rayScene, place: this.lightAt, room: this.roomRays };
  }
  private roomRays = { boxes: 0, triangles: 0 };
  private rayScene = { boxes: 0, triangles: 0 };

  /**
   * The light gathered so far at a pixel of the picture (counted from its top left), for testing: the
   * sky's (three numbers) and the sun's own; the sun's bounced (three) and the door lanterns'; the fire's
   * (three) and the path lanterns'.
   */
  lightProbe(x: number, y: number): number[] {
    const { gl } = this;
    const out: number[] = [];
    const px = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gathered.target);
    for (const at of [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]) {
      gl.readBuffer(at);
      gl.readPixels(x, this.height - 1 - y, 1, 1, gl.RGBA, gl.FLOAT, px);
      out.push(...px);
    }
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out.map((v) => Math.round(v * 1000) / 1000);
  }

  /** Ask the view to slide toward a point in the window: -1..1 across and up. Zero is straight ahead. */
  lookToward(x: number, y: number): void {
    this.wantX = Math.max(-1, Math.min(1, x));
    this.wantY = Math.max(-1, Math.min(1, y));
  }

  /**
   * Lean in toward the stone, or stand back again. Nothing is drawn
   * differently: the finished picture is magnified to exactly twice its size
   * (so its pixels stay square) and slid until the stone stands to one side.
   */
  leanIn(on: boolean): void {
    this.leanWant = on ? 1 : 0;
  }

  /**
   * Shift the whole picture by a big pixel or so. Done every few minutes, so
   * that nothing sits on exactly the same spot of the screen all day.
   */
  nudge(x: number, y: number): void {
    this.nudgeX = x;
    this.nudgeY = y;
  }

  /** How many screen pixels one of the picture's big pixels covers. */
  get bigPixel(): number {
    return this.scale;
  }

  /** Lie back to look at the sky, or sit up again. */
  lieBack(on: boolean): void {
    this.lying = on;
    this.leanWant = 0;
  }

  /**
   * Go down to the beach, or back up to the meadow. You face the same way from
   * both, so the sky does not change; the land is simply seen from the other place.
   */
  goAshore(on: boolean): void {
    if (on === this.ashore) return;
    this.ashore = on;
    if (!on) this.afloat = false;
    if (on && this.plain && !this.stonesPlain && this.stoneShape && this.stoneRows) {
      // (See PLAIN-DRAW.) Every stone's sixty corners, each with the stone's own numbers beside it.
      const { gl } = this;
      const shape = this.stoneShape;
      const rows = this.stoneRows;
      const corners = shape.length / 6;
      const each = 6 + STONE_FLOATS;
      const out = new Float32Array(this.shingleCount * corners * each);
      for (let i = 0, o = 0; i < this.shingleCount; i++) {
        for (let k = 0; k < corners; k++) {
          for (let j = 0; j < 6; j++) out[o++] = shape[k * 6 + j];
          for (let j = 0; j < STONE_FLOATS; j++) out[o++] = rows[i * STONE_FLOATS + j];
        }
      }
      this.shingleVao = gl.createVertexArray()!;
      gl.bindVertexArray(this.shingleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, out, gl.STATIC_DRAW);
      [3, 3, 4, 4].reduce((offset, size, i) => {
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, size, gl.FLOAT, false, each * 4, offset);
        return offset + size * 4;
      }, 0);
      // (The beach's own stones have no tip: where nothing is sent for it, it is none, about any axis.)
      gl.vertexAttrib4f(4, 1, 0, 0, 0);
      gl.bindVertexArray(null);
      this.stonesPlain = true;
      this.stoneShape = null;
      this.stoneRows = null;
    }
    this.leanWant = 0;
    this.lean = 0;
    this.friendAt = null;
  }

  /**
   * Go indoors, to the window of the nearest house, or back out to the meadow. From the window
   * you face the same way again; what is outside is the same place, seen from in there.
   */
  goIndoors(on: boolean): void {
    if (on === this.indoors) return;
    this.indoors = on;
    this.seated = false;
    this.leanWant = 0;
    this.lean = 0;
    this.friendAt = null;
  }

  /**
   * AFLOAT: out in the rowing boat on the bay, or back on the beach. (You are still reckoned to be down
   * at the shore: nothing of the meadow is in sight. Where your eyes are comes with each frame, for
   * she moves on the water.)
   */
  goAfloat(on: boolean): void {
    this.afloat = on && this.ashore;
    this.leanWant = 0;
    this.lean = 0;
    this.friendAt = null;
  }

  /** Sit down in the chair at the table, or stand up from it. Seated, you are lower and close to the window. */
  sit(on: boolean): void {
    this.seated = on && this.indoors;
  }

  /** A place in the room (in the room's own measure: metres to your right, up from the floor, and ahead) as a place in the scene. */
  private roomPoint(x: number, y: number, z: number): V3 {
    const fx = Math.sin(FACING);
    const fz = -Math.cos(FACING);
    return [ROOM_EYE[0] - fz * x + fx * z, ROOM_EYE[1] + y - PARLOUR.eyeHigh, ROOM_EYE[2] + fx * x + fz * z];
  }

  /** Where a place in the room falls in the picture: across and up, each -1..1. */
  private roomSeen(x: number, y: number, z: number): [number, number] {
    const m = this.viewProj;
    const p = this.roomPoint(x, y, z);
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w];
  }

  /**
   * What a point on the page is on, indoors: one of the things that answer a click (see TOUCH in
   * parlour.ts), the window, the bare walls and floor of the room ('wall': a click there lets you out),
   * or some other thing standing in it ('thing': a click there does nothing).
   */
  roomAt(clientX: number, clientY: number): RoomSpot {
    const box = this.canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * 2 - 1;
    const y = 1 - ((clientY - box.top) / box.height) * 2;
    // ROOM-RAY: the line of sight through that point, in the room's own measure, followed to the first of
    // the things it meets. (Each used to be matched by the rectangle its box made in the picture; from the
    // chair some of them are beside or behind you, where a box has no sensible rectangle, and the kettle
    // on the stove answered clicks on the window.)
    const { fwd, right, up } = this.camera();
    const sx = x * this.tanHalf * (this.width / this.height);
    const sy = y * this.tanHalf;
    const d: V3 = [fwd[0] + right[0] * sx + up[0] * sy, fwd[1] + right[1] * sx + up[1] * sy, fwd[2] + right[2] * sx + up[2] * sy];
    const fx = Math.sin(FACING);
    const fz = -Math.cos(FACING);
    const ray: V3 = [-fz * d[0] + fx * d[2], d[1], fx * d[0] + fz * d[2]];
    const from: V3 = this.seated ? [PARLOUR.seat[0], PARLOUR.seat[1], PARLOUR.seat[2]] : [0, PARLOUR.eyeHigh, 0];
    const REACH = 0.025; // a little kindness round each thing
    let found: RoomSpot | null = null;
    let nearest = Infinity;
    for (const [name, lo, hi] of TOUCH) {
      let enter = 0;
      let leave = Infinity;
      for (let i = 0; i < 3; i++) {
        const a = lo[i] - REACH - from[i];
        const b = hi[i] + REACH - from[i];
        if (Math.abs(ray[i]) < 1e-9) {
          if (a > 0 || b < 0) leave = -1;
          continue;
        }
        const t0 = a / ray[i];
        const t1 = b / ray[i];
        enter = Math.max(enter, Math.min(t0, t1));
        leave = Math.min(leave, Math.max(t0, t1));
      }
      // (A box you are sitting inside of, as the chair's is, does not count: only what lies ahead.)
      if (leave > enter && enter > 0.02 && enter < nearest) {
        nearest = enter;
        found = name as RoomSpot;
      }
    }
    if (found) return found;
    const { win, glassZ } = PARLOUR;
    if (ray[2] > 1e-6) {
      const t = (glassZ - from[2]) / ray[2];
      const wx = from[0] + ray[0] * t;
      const wy = from[1] + ray[1] * t;
      if (t > 0 && wx > win.x0 && wx < win.x1 && wy > win.y0 && wy < win.y1) return 'window';
    }
    // Failing those: the picture itself says whether this is the room's own shell or a thing standing in it.
    const px = Math.floor(((clientX - box.left) / box.width) * this.width);
    const py = Math.floor((1 - (clientY - box.top) / box.height) * this.height);
    if (!this.sized || px < 0 || py < 0 || px >= this.width || py >= this.height) return 'wall';
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.onePixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.onePixel[3] > 200 ? 'thing' : 'wall';
  }

  /** The picture of where the window's mist has been wiped (see indoors.ts) has changed: take the new one. */
  setWiped(picture: Uint8Array): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.wipedGlass);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, WIPE.wide, WIPE.high, gl.RED, gl.UNSIGNED_BYTE, picture);
  }

  /** Where on the window's glass a point of the page lies: 0..1 across and 0..1 up (outside that range if it misses the window). */
  onGlass(clientX: number, clientY: number): [number, number] {
    const box = this.canvas.getBoundingClientRect();
    const fx = (clientX - box.left) / box.width;
    const fy = (clientY - box.top) / box.height;
    // The line of sight through that point, in the room's own measure, followed to the glass.
    const { fwd, right, up } = this.camera();
    const x = (fx * 2 - 1) * this.tanHalf * (this.width / this.height);
    const y = (1 - fy * 2) * this.tanHalf;
    const ray: V3 = [fwd[0] + right[0] * x + up[0] * y, fwd[1] + right[1] * x + up[1] * y, fwd[2] + right[2] * x + up[2] * y];
    const across = ray[0] * Math.cos(FACING) + ray[2] * Math.sin(FACING);
    const ahead = ray[0] * Math.sin(FACING) - ray[2] * Math.cos(FACING);
    const t = PARLOUR.glassZ / Math.max(ahead, 1e-4);
    const { win } = PARLOUR;
    return [(across * t - win.x0) / (win.x1 - win.x0), (PARLOUR.eyeHigh + ray[1] * t - win.y0) / (win.y1 - win.y0)];
  }

  /** Where the lamp, the middle of the window and the wall beside it are on the page, in CSS pixels. */
  roomOnPage(): { lamp: [number, number]; window: [number, number]; wall: [number, number] } {
    const box = this.canvas.getBoundingClientRect();
    const page = ([x, y]: [number, number]): [number, number] => [box.left + (x * 0.5 + 0.5) * box.width, box.top + (0.5 - y * 0.5) * box.height];
    const { lamp, win, glassZ, wall } = PARLOUR;
    return {
      lamp: page(this.roomSeen(lamp[0], lamp[1] + 0.42, lamp[2])),
      window: page(this.roomSeen((win.x0 + win.x1) / 2, win.y0 + (win.y1 - win.y0) * 0.72, glassZ)),
      wall: page(this.roomSeen(win.x0 - 1.0, 1.25, wall)),
    };
  }

  /** Where your eyes are just now. */
  get eye(): V3 {
    if (this.indoors) return this.seated ? this.roomPoint(PARLOUR.seat[0], PARLOUR.seat[1], PARLOUR.seat[2]) : ROOM_EYE;
    if (this.afloat) return this.skiffEye;
    return this.ashore ? SHORE_EYE : EYE;
  }

  /** Where a direction in the sky falls on the page, in CSS pixels; null if it is behind you. */
  skyToPage(d: V3): [number, number] | null {
    const { right, up, fwd, tanHalf, aspect } = this.skyCam;
    const w = d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2];
    if (w <= 1e-4) return null;
    const x = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / w / (tanHalf * aspect);
    const y = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / w / tanHalf;
    const box = this.canvas.getBoundingClientRect();
    return [box.left + (x * 0.5 + 0.5) * box.width, box.top + (0.5 - y * 0.5) * box.height];
  }

  /**
   * How bright the picture is under a patch of the page (its corners, in CSS pixels), 0 to 1, as the eye
   * weighs it: for choosing whether words laid over it should be pale or dark. Null before anything is drawn.
   */
  brightUnder(x0: number, y0: number, x1: number, y1: number): number | null {
    if (!this.sized) return null;
    const { gl } = this;
    const box = this.canvas.getBoundingClientRect();
    const col = (x: number) => Math.max(0, Math.min(this.width - 1, Math.floor(((x - box.left) / box.width) * this.width)));
    const row = (y: number) => Math.max(0, Math.min(this.height - 1, Math.floor((1 - (y - box.top) / box.height) * this.height)));
    const left = col(x0);
    const bottom = row(y1);
    const wide = Math.max(1, col(x1) - left);
    const high = Math.max(1, row(y0) - bottom);
    const data = new Uint8Array(wide * high * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.readPixels(left, bottom, wide, high, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * (data[i] / 255) ** 2.2 + 0.7152 * (data[i + 1] / 255) ** 2.2 + 0.0722 * (data[i + 2] / 255) ** 2.2;
    return sum / (wide * high);
  }

  /**
   * How well pale ink and dark ink would each stand out over a patch of the page (its corners, in CSS
   * pixels). A label seldom lies on one tone: the tune's name crosses a dark wall and bright grass at
   * once. So each ink is judged against the part of the patch it would be most lost on: pale against
   * the brightest tenth, dark against the darkest tenth. Both numbers are contrast ratios (1 is invisible).
   */
  inkUnder(x0: number, y0: number, x1: number, y1: number): { pale: number; dark: number } | null {
    if (!this.sized) return null;
    const { gl } = this;
    const box = this.canvas.getBoundingClientRect();
    const col = (x: number) => Math.max(0, Math.min(this.width - 1, Math.floor(((x - box.left) / box.width) * this.width)));
    const row = (y: number) => Math.max(0, Math.min(this.height - 1, Math.floor((1 - (y - box.top) / box.height) * this.height)));
    const left = col(x0);
    const bottom = row(y1);
    const wide = Math.max(1, col(x1) - left);
    const high = Math.max(1, row(y0) - bottom);
    const data = new Uint8Array(wide * high * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.readPixels(left, bottom, wide, high, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const lums: number[] = [];
    for (let i = 0; i < data.length; i += 4) lums.push(0.2126 * (data[i] / 255) ** 2.2 + 0.7152 * (data[i + 1] / 255) ** 2.2 + 0.0722 * (data[i + 2] / 255) ** 2.2);
    lums.sort((a, b) => a - b);
    const dimmest = lums[Math.floor(lums.length * 0.1)];
    const brightest = lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.9))];
    return { pale: 0.95 / (brightest + 0.05), dark: (dimmest + 0.05) / 0.058 };
  }

  /**
   * What the picture shows at a point on the page: open sky, open sea, or
   * something else. For the sea it also gives the spot on the water, in the scene.
   */
  kindAt(clientX: number, clientY: number): { kind: 'sky' | 'sea' | 'other'; spot?: V3 } {
    const box = this.canvas.getBoundingClientRect();
    const fx = (clientX - box.left) / box.width;
    const fy = (clientY - box.top) / box.height;
    const px = Math.floor(fx * this.width);
    const py = Math.floor((1 - fy) * this.height);
    if (!this.sized || px < 0 || py < 0 || px >= this.width || py >= this.height) return { kind: 'other' };
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.onePixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const label = this.onePixel[3];
    if (label < 20) return { kind: 'sky' };
    if (this.lying || Math.abs(label - 51) > 14) return { kind: 'other' }; // the sea's label is a fifth of full
    // Follow the line of sight down to the water.
    const { fwd, right, up } = this.camera();
    const x = (fx * 2 - 1) * this.tanHalf * (this.width / this.height);
    const y = (1 - fy * 2) * this.tanHalf;
    const ray: V3 = [fwd[0] + right[0] * x + up[0] * y, fwd[1] + right[1] * x + up[1] * y, fwd[2] + right[2] * x + up[2] * y];
    if (ray[1] >= -1e-4) return { kind: 'other' };
    const eye = this.eye;
    const t = -eye[1] / ray[1];
    return { kind: 'sea', spot: [eye[0] + ray[0] * t, 0, eye[2] + ray[2] * t] };
  }

  /** Whether the picture shows open sky at a point on the page: not land, sea, or anything standing in front. */
  isSky(clientX: number, clientY: number): boolean {
    const box = this.canvas.getBoundingClientRect();
    const px = Math.floor(((clientX - box.left) / box.width) * this.width);
    const py = Math.floor((1 - (clientY - box.top) / box.height) * this.height);
    if (!this.sized || px < 0 || py < 0 || px >= this.width || py >= this.height) return false;
    const { gl } = this;
    // The picture keeps a label for every pixel in its fourth channel; the sky's is zero.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.onePixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return this.onePixel[3] < 20;
  }

  /** Where a place in the scene falls on the page, in CSS pixels (wherever the picture has been slid to). */
  pageAt(p: V3, onBeach = false): [number, number] | null {
    if (this.lying || this.indoors || this.afloat || this.ashore !== onBeach) return null; // nothing of the meadow is in view from the beach, nor of the beach from the meadow, nor either from indoors
    const m = this.viewProj;
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0) return null;
    const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
    const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
    const box = this.canvas.getBoundingClientRect();
    return [box.left + (x * 0.5 + 0.5) * box.width, box.top + (0.5 - y * 0.5) * box.height];
  }

  /** Where a place in the scene falls on the page from wherever you stand: unlike `pageAt`, it answers on the beach too. */
  spotOnPage(p: V3): [number, number] | null {
    const m = this.viewProj;
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (this.lying || w <= 0) return null;
    const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
    const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
    const box = this.canvas.getBoundingClientRect();
    return [box.left + (x * 0.5 + 0.5) * box.width, box.top + (0.5 - y * 0.5) * box.height];
  }

  /** Whether a point on the page is on something in the scene, given the corners of a box round it. */
  covers(corners: V3[], clientX: number, clientY: number): boolean {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const corner of corners) {
      const at = this.spotOnPage(corner);
      if (!at) return false;
      x0 = Math.min(x0, at[0]);
      x1 = Math.max(x1, at[0]);
      y0 = Math.min(y0, at[1]);
      y1 = Math.max(y1, at[1]);
    }
    return clientX > x0 && clientX < x1 && clientY > y0 && clientY < y1;
  }

  /** The camera never moves: this is where it looks. */
  private camera(): { fwd: V3; right: V3; up: V3 } {
    // (AFLOAT: out in the boat you can turn your head; everywhere else you face the one way.)
    const facing = FACING + (this.afloat && !this.lying ? this.tilt[2] : 0);
    const fwd: V3 = [Math.cos(PITCH) * Math.sin(facing), Math.sin(PITCH), -Math.cos(PITCH) * Math.cos(facing)];
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    if (this.afloat && !this.lying) {
      // (AFLOAT) Out in the boat your head goes with her: tipped as she pitches, rolled as she rolls.
      const [p, r] = this.tilt;
      const f2: V3 = [fwd[0] * Math.cos(p) + up[0] * Math.sin(p), fwd[1] * Math.cos(p) + up[1] * Math.sin(p), fwd[2] * Math.cos(p) + up[2] * Math.sin(p)];
      const u2: V3 = [up[0] * Math.cos(p) - fwd[0] * Math.sin(p), up[1] * Math.cos(p) - fwd[1] * Math.sin(p), up[2] * Math.cos(p) - fwd[2] * Math.sin(p)];
      const r3: V3 = [right[0] * Math.cos(r) + u2[0] * Math.sin(r), right[1] * Math.cos(r) + u2[1] * Math.sin(r), right[2] * Math.cos(r) + u2[2] * Math.sin(r)];
      const u3: V3 = [u2[0] * Math.cos(r) - right[0] * Math.sin(r), u2[1] * Math.cos(r) - right[1] * Math.sin(r), u2[2] * Math.cos(r) - right[2] * Math.sin(r)];
      return { fwd: f2, right: r3, up: u3 };
    }
    return { fwd, right, up };
  }

  /** Which thing in the scene, if any, a point on the page (in CSS pixels) is on. */
  thingAt(clientX: number, clientY: number): 'stone' | 'fire' | 'music' | 'friend' | 'lantern' | 'house' | null {
    if (this.lying || this.indoors) return null;
    const box = this.canvas.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * 2 - 1;
    const y = 1 - ((clientY - box.top) / box.height) * 2;
    const m = this.viewProj;
    const within = (corners: V3[]): boolean => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of corners) {
        const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
        if (w <= 0) return false;
        const sx = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
        const sy = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      }
      return x > x0 && x < x1 && y > y0 && y < y1;
    };
    // (Down on the beach nothing of the meadow can be pointed at: only the lamb, if it has come down too.)
    if (!this.ashore && within(stoneFace)) return 'stone';
    // A lantern by the path, the nearest first (which one is left in `lantern`).
    this.lantern = this.ashore ? -1 : lanternFrames.findIndex((frame, i) => this.lanternsUp[i] && within(frame));
    if (this.lantern >= 0) return 'lantern';
    if (!this.ashore && within(musicFrame)) return 'music';
    // The lamb, wherever it has got to (it is nearer than the fire, so it is asked first).
    if (this.friendAt) {
      const [lx, ly, lz] = this.friendAt;
      const box: V3[] = [];
      for (const dx of [-0.7, 0.7]) for (const dy of [0, 0.95]) for (const dz of [-0.7, 0.7]) box.push([lx + dx, ly + dy, lz + dz]);
      if (within(box)) return 'friend';
    }
    if (this.ashore) return null;
    // The fire: the pit, the flames above it and the woodpile beside it.
    const { right } = this.camera();
    const [fx, fy, fz] = fireHeart;
    const reach = (side: number, lift: number): V3 => [fx + right[0] * side, fy + lift, fz + right[2] * side];
    if (within([reach(-1.0, -0.4), reach(3.9, -0.4), reach(3.9, 1.5), reach(-1.0, 1.5)])) return 'fire';
    // The nearest of the houses: its door is open to you.
    if (within(homeFrame)) return 'house';
    return null;
  }

  /** Let the gathered light take over from the formula once there is enough of it to be smooth. */
  private takeOver(dt: number): void {
    const enough = this.plain ? 10 : 20;
    this.trust += ((this.sunTaken > enough && this.stillTaken > enough ? 1 : 0) - this.trust) * Math.min(1, dt * 0.8);
  }

  /**
   * Whether light is to be gathered this time the picture is drawn, and if so which rows take a sample
   * and how much a new sample counts for. (Null: not this time.) `plenty` is how many samples a pixel is
   * to have had before the gathering slows to a few times a second; `plainEvery`, how many turns the rows
   * are shared among where there is no graphics chip (an odd number: see below), and `plainPace` how
   * many times a second at most light is gathered there while it is still new; `chipEvery`, how many
   * turns the rows are shared among where there is one.
   */
  private lightTurn(s: Scene, plenty = this.plain ? 40 : 160, plainEvery = 7, plainPace = 1000, chipEvery = 4): { every: number; turn: number; share: number; blendSun: number; blendBounce: number; blendStill: number; stillWanted: boolean } | null {
    const { air } = s;
    // If the light has swung round sharply (a jump in the hour, or coming back after a long while away),
    // what was gathered of the sun is no longer true: let new samples of it count for more for a while.
    // (Its steady journey across the sky is followed as it goes, and is no such jump.)
    const moved = Math.hypot(air.lightDir[0] - this.tracedFor[0], air.lightDir[1] - this.tracedFor[1], air.lightDir[2] - this.tracedFor[2]);
    if (moved > 0.05) {
      this.sunTaken = Math.min(this.sunTaken, 2);
      this.bounceTaken = Math.min(this.bounceTaken, 2);
    }
    // (See LIGHT-WORK.) While the light is new it is gathered every time the picture is drawn. Once there
    // is plenty, only the sun's slow journey is left to follow, and it is gathered a few times a second
    // and no oftener, however fast the picture is being drawn for rain or a moving pointer.
    const steady = this.bounceTaken >= plenty && this.stillTaken >= plenty;
    const often = this.plain ? 3 : 8; // times a second, once steady
    this.sinceTraced += s.dt;
    if (this.sinceTraced < 1 / (steady ? often : this.plain ? plainPace : 1000)) {
      this.takeOver(s.dt);
      return null;
    }
    this.sinceTraced = 0;
    this.tracedFor = [...air.lightDir];
    // Whose turn. The picture's rows take it in turns: with a graphics chip every row takes a sample the
    // first two times, and after that every fourth row each time. Without one (PLAIN-DRAW) a path is a
    // good deal of work: every seventh row each time, from the start, and the light simply takes longer
    // to gather. (Rows, so that only those rows need be worked on at all: see TRACE_VERT.)
    // (Seven, not eight: a renderer without a chip shares the rows of the picture out among the
    // processor's cores in a fixed round, and rows a power of two apart all fall to the same core.)
    const every = this.plain ? plainEvery : this.settled < 2 ? 1 : chipEvery;
    const ORDER: Record<number, number[]> = { 1: [0], 2: [0, 1], 4: [0, 2, 1, 3], 7: [0, 3, 6, 2, 5, 1, 4], 13: [0, 5, 10, 2, 7, 12, 4, 9, 1, 6, 11, 3, 8] };
    const turn = ORDER[every][this.settled % every];
    const share = 1 / every;
    // How much a new sample counts for. Of the sun's own light, enough that its shadows keep up with it
    // (they are a couple of minutes behind at most); of its bounced light, which shifts far less, less.
    // (The count is taken in whole rounds of the rows, so that every row's n-th sample is weighed alike.)
    const perSecond = (steady ? often : 30) * share;
    return {
      every,
      turn,
      share,
      blendSun: Math.max(1 / (Math.floor(this.sunTaken + 1e-6) + 1), 1 / Math.max(40, 110 * perSecond)),
      blendBounce: Math.max(1 / (Math.floor(this.bounceTaken + 1e-6) + 1), 1 / Math.max(60, 420 * perSecond)),
      blendStill: Math.max(1 / (Math.floor(this.stillTaken + 1e-6) + 1), 1 / 4000),
      // The lights that never move are gathered until there is plenty, and then left alone.
      stillWanted: this.stillTaken < (this.plain ? 300 : 1500),
    };
  }

  /**
   * One gathering: the rows whose turn it is are worked out by `program` into the spare pictures (reading
   * what was gathered before from units 3, 4 and 8), and then carried back into the kept ones.
   */
  private gatherRows(program: Program, every: number, turn: number, share: number, dt: number): void {
    const { gl } = this;
    const bind = (unit: number, tex: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };
    const rows = (p: Program) => {
      p.set({ uRows: [every, turn, this.height] });
      gl.drawArrays(gl.TRIANGLES, 0, Math.ceil((Math.ceil(this.height / 2) - turn) / every) * 6);
    };
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.bindVertexArray(this.emptyVao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scratch.target);
    bind(3, this.gathered.a);
    bind(4, this.gathered.b);
    bind(8, this.gathered.c);
    bind(11, this.gathered.d);
    rows(program.use());
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.gathered.target);
    bind(3, this.scratch.a);
    bind(4, this.scratch.b);
    bind(8, this.scratch.c);
    bind(11, this.scratch.d);
    rows(this.carry.use());
    gl.activeTexture(gl.TEXTURE0);
    gl.depthMask(true);
    this.settled++;
    this.sunTaken += share;
    this.bounceTaken += share;
    this.stillTaken += share;
    this.takeOver(dt);
  }

  /**
   * Gather a little more light out of doors (PATH-TRACE). First everything fixed is drawn plainly, to
   * record where it is and which way it faces; then some of the pixels each follow one more path of light
   * from the spot they show, and add what it finds to the running average.
   */
  private traceLight(s: Scene, viewProj: Mat4, eye: V3): void {
    const { gl } = this;
    const { air } = s;
    // Snow come or gone changes what the ground throws back: the unmoving light is gathered again.
    if (Math.abs(s.snowCover - this.stillFor) > 0.08) {
      if (this.stillFor >= 0) this.stillTaken = Math.min(this.stillTaken, 30); // (new samples then count for a thirtieth: it follows the snow without the light ever being let go)
      this.stillFor = s.snowCover;
    }
    const plan = this.lightTurn(s);
    if (!plan) return;

    // The logs left in the pile and the stones the cairn has earned come and go (those at rest; one on
    // its way is left out till it lands). When there are more or fewer, the rays are told: a small tree
    // of their own is sorted afresh, and the light about them is gathered again somewhat faster.
    const { pile, cairn } = this.props;
    const logs = Math.max(0, Math.min(5, s.fire.logs) - (s.fire.logShift ? 1 : 0));
    const stones = Math.max(0, Math.min(12, s.fire.stones) - (s.fire.stoneLift > 0.002 ? 1 : 0));
    if (logs !== this.extrasFor[0] || stones !== this.extrasFor[1]) {
      const extras = buildRayExtras(this.rays, this.props.vertices, [[pile.start, logs * pile.each], [cairn.start, stones * cairn.each]], 9, 8);
      gl.activeTexture(gl.TEXTURE9);
      gl.bindTexture(gl.TEXTURE_2D, this.rayBoxes);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.rays.spareBoxRow, this.rays.boxesWide, extras.boxRows, gl.RGBA, gl.FLOAT, extras.boxes);
      gl.activeTexture(gl.TEXTURE10);
      gl.bindTexture(gl.TEXTURE_2D, this.rayTris);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.rays.spareTriRow, this.rays.trisWide, extras.triRows, gl.RGBA, gl.FLOAT, extras.tris);
      gl.activeTexture(gl.TEXTURE0);
      this.trace.use().set({ uExtras: [extras.from, extras.to] });
      if (this.extrasFor[0] >= 0) {
        this.sunTaken = Math.min(this.sunTaken, 30);
        this.bounceTaken = Math.min(this.bounceTaken, 30);
        this.stillTaken = Math.min(this.stillTaken, 30);
      }
      this.extrasFor = [logs, stones];
      this.shapeFor = [];
    }

    // The fixed things stay where they are, and you do not move: their picture is drawn again only when
    // the snow lying on the ground has deepened or melted back, the picture has changed its size, or a
    // log or a stone has come or gone. (Where the snow has melted back only matters while there is snow.)
    // (And, on the beach, when the tide has moved the sea's surface by a hand's breadth.)
    const drawnFor = [this.width, this.height, eye[0], eye[1], eye[2], s.snowDepth, s.snowDepth > 0 ? s.melt : 0, this.ashore ? s.tide.level : 0];
    const slack = [0, 0, 0, 0, 0, 0.00002, 0.0001, 0.04];
    if (this.shapeFor.length !== drawnFor.length || drawnFor.some((v, i) => Math.abs(v - this.shapeFor[i]) > slack[i])) {
      this.shapeFor = drawnFor;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shapeTarget);
      gl.viewport(0, 0, this.width, this.height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.clearColor(0.5, 1, 0.5, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      this.shape.use().set({ uViewProj: viewProj, uCam: eye, uSnowDepth: s.snowDepth, uGround: 1, uHearth: fireHeart, uMelt: s.melt });
      gl.bindVertexArray(this.landVao);
      gl.drawElements(gl.TRIANGLES, this.landCount, gl.UNSIGNED_INT, 0);
      this.shape.set({ uGround: 0 });
      gl.bindVertexArray(this.propVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.props.fixed);
      if (logs > 0) gl.drawArrays(gl.TRIANGLES, pile.start, logs * pile.each);
      if (stones > 0) gl.drawArrays(gl.TRIANGLES, cairn.start, stones * cairn.each);
      if (this.ashore) {
        // The sea's surface off the beach, level as the tide has it: so that light is gathered for the
        // water as for the stones (the bank's shadow lies across both of a morning).
        const ax = Math.sin(FACING);
        const az = -Math.cos(FACING);
        const edge = BEACH.toWater - s.tide.level / BEACH.slope;
        const y = s.tide.level + 0.01;
        const at = (out: number, along: number) => [BEACH.x + ax * (edge + out) - az * along, y, BEACH.z + az * (edge + out) + ax * along, 0, 1, 0];
        const wide = BEACH.r * 1.3;
        const sheet = new Float32Array([...at(-0.3, -wide), ...at(26, -wide), ...at(26, wide), ...at(-0.3, -wide), ...at(26, wide), ...at(-0.3, wide)]);
        gl.bindVertexArray(this.seaSheetVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.seaSheetBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, sheet);
        const culled = gl.isEnabled(gl.CULL_FACE);
        if (culled) gl.disable(gl.CULL_FACE);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        if (culled) gl.enable(gl.CULL_FACE);
      }
    }

    const bind = (unit: number, tex: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };
    bind(5, this.shapeDepth);
    bind(6, this.shapeNormal);
    bind(7, this.heightMap);
    bind(9, this.rayBoxes);
    bind(10, this.rayTris);
    gl.activeTexture(gl.TEXTURE0);
    // (Through thin cloud or haze the sun is a wider light, and its shadows softer at the edge.)
    const veiled = Math.max(0, Math.min(1, s.cloud));
    this.trace.use().set({
      uInvViewProj: invert(viewProj),
      uRes: [this.width, this.height],
      uCam: eye,
      uLightDir: air.lightDir,
      uGrass: air.grassLush.map((c) => c * 0.85),
      uSnowDepth: s.snowDepth,
      uSnow: s.snowCover,
      uHearth: fireHeart,
      uMelt: s.melt,
      uCount: [this.settled % 4096, plan.blendSun, plan.blendBounce, plan.blendStill],
      uStill: plan.stillWanted ? 1 : 0,
      uSunSize: 0.0075 + 0.05 * veiled * veiled,
      uGlow: 0.3 * (1 - veiled),
    });
    this.gatherRows(this.trace, plan.every, plan.turn, plan.share, s.dt);
  }

  /**
   * Gather a little more light indoors (PATH-TRACE): the same way as out of doors, in the room's own
   * measure and against the room's own triangles. Its lights are the window (the day, and the sun or
   * moon when it stands where it can shine in), the lamp on the sill and the stove.
   */
  private traceRoom(s: Scene, viewProj: Mat4): void {
    const { gl } = this;
    const { air } = s;
    const { life } = s.room;
    // (Nearly all the light in a room has bounced, which takes more samples to come smooth than the
    // open air does: it is gathered at full pace for longer, and with a graphics chip half the rows
    // take a turn each time at first, so that a room newly come into is right within a few seconds.
    // Without one every pixel of the picture is the room's, and each path is several rays: fewer rows
    // take a turn each time and no oftener than six times a second, a path is two bounces long, and a
    // pixel is done sooner. The room takes a few minutes to come smooth there.)
    const plan = this.lightTurn(s, this.plain ? 100 : 480, 13, 6, this.stillTaken < 100 ? 2 : 4);
    if (!plan) return;
    const bind = (unit: number, tex: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };
    // The room's triangles, sorted for rays: made the first time you are in it.
    if (!this.roomBoxes || !this.roomTris) {
      const tris = roomRayTriangles(this.roomMesh);
      const rays = buildRaySceneOf(tris.corners, tris.colours);
      const numbers = (unit: number, wide: number, high: number, data: Float32Array): WebGLTexture => {
        const tex = gl.createTexture()!;
        bind(unit, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, wide, high, 0, gl.RGBA, gl.FLOAT, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
      };
      this.roomBoxes = numbers(9, rays.boxesWide, rays.boxesHigh, rays.boxes);
      this.roomTris = numbers(10, rays.trisWide, rays.trisHigh, rays.tris);
      this.roomTrace.use().set({ uBoxCount: rays.boxCount, uExtras: [0, 0] });
      this.roomRays = { boxes: rays.boxCount, triangles: rays.triCount };
    }
    // Where the room's things are, and which way they face: drawn again when you sit or stand, when the
    // cat has moved, when a log has gone from the basket, or the picture has changed its size. (Not for
    // the curtains: they are left out of it, so that what is behind them always has its light.)
    const eye = this.eye;
    const says = { ...this.roomSays(s), uDrawn: life.drawn, uCat: [0, life.cat[1], life.cat[2]], uSwing: 0, uLogs: life.logs, uSand: -1 };
    const drawnFor = [this.width, this.height, eye[0], eye[1], eye[2], life.cat[1], life.cat[2], life.logs, 7];
    if (this.shapeFor.length !== drawnFor.length || drawnFor.some((v, i) => Math.abs(v - this.shapeFor[i]) > 1e-4)) {
      this.shapeFor = drawnFor;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shapeTarget);
      gl.viewport(0, 0, this.width, this.height);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.depthRange(0, 1);
      gl.clearColor(0.5, 1, 0.5, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const culled = gl.isEnabled(gl.CULL_FACE);
      if (culled) gl.disable(gl.CULL_FACE);
      this.roomShape.use().set(says);
      gl.bindVertexArray(this.roomVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.roomCount);
      if (culled) gl.enable(gl.CULL_FACE);
    }

    bind(5, this.shapeDepth);
    bind(6, this.shapeNormal);
    bind(9, this.roomBoxes);
    bind(10, this.roomTris);
    gl.activeTexture(gl.TEXTURE0);
    const right = says.uRight;
    const ahead = says.uAhead;
    const veiled = Math.max(0, Math.min(1, s.cloud));
    this.roomTrace.use().set({
      uInvViewProj: invert(viewProj),
      uRes: [this.width, this.height],
      uEye: says.uEye,
      uRight: right,
      uAhead: ahead,
      uEyeAt: this.seated ? PARLOUR.seat : [0, PARLOUR.eyeHigh, 0],
      // (The way to the sun, turned into the room's own measure: to your right, up, and ahead.)
      uSunWay: [air.lightDir[0] * right[0] + air.lightDir[2] * right[2], air.lightDir[1], air.lightDir[0] * ahead[0] + air.lightDir[2] * ahead[2]],
      uCount: [this.settled % 4096, plan.blendSun, plan.blendBounce, 0],
      uSunSize: 0.0075 + 0.05 * veiled * veiled,
      uEnough: [this.plain ? 260 : 3000, this.plain ? 2 : 3],
    });
    this.gatherRows(this.roomTrace, plan.every, plan.turn, plan.share, s.dt);
  }

  draw(s: Scene): void {
    if (!this.sized) return;
    if (this.afloat) {
      this.skiffEye = s.skiff.eye;
      this.tilt = s.skiff.tilt;
    }
    if (this.lying) return this.drawLying(s);
    if (!this.afloat) this.lightFor(this.place); // PATH-TRACE: the light gathered for where you stand
    const { gl } = this;
    const { air } = s;
    const aspect = this.width / this.height;
    const tanHalf = this.tanHalf;

    // Looking around: ease toward the pointer, then slide the finished picture.
    if (this.leanWant === 0) {
      // (While you are leaning in to the stone the view holds still.)
      const ease = 1 - Math.exp(-s.dt * 2.4);
      this.lookX += (this.wantX - this.lookX) * ease;
      this.lookY += (this.wantY - this.lookY) * ease;
    }
    const within = (v: number, most: number) => Math.max(-most, Math.min(most, v));
    let dx = within(-this.lookX * this.slideX + this.nudgeX * this.scale, this.slideX);
    let dy = within(this.lookY * this.slideY + this.nudgeY * this.scale, this.slideY);

    // The camera itself never moves.
    const { fwd, right, up } = this.camera();
    const eye = this.eye;
    const projection = perspective(2 * Math.atan(tanHalf), aspect, NEAR, FAR);
    const viewProj = multiply(projection, viewMatrix(eye, right, up, [-fwd[0], -fwd[1], -fwd[2]]));
    this.viewProj = viewProj;

    // Leaning in to the stone: magnify the picture and slide it, easing both ways.
    this.lean += (this.leanWant - this.lean) * (1 - Math.exp(-s.dt * 3.2));
    if (Math.abs(this.leanWant - this.lean) < 0.002) this.lean = this.leanWant;
    const near = this.lean * this.lean * (3 - 2 * this.lean);
    if (near > 0) {
      // Where the stone is in the picture, measured from the picture's middle, in screen pixels.
      let sx = 0;
      let sy = 0;
      for (const p of stoneFace) {
        const w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15];
        sx += ((viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12]) / w) * 0.25;
        sy += ((viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13]) / w) * 0.25;
      }
      sx *= (this.width * this.scale) / 2;
      sy *= (-this.height * this.scale) / 2;
      // Where it should end up in the window: to the left in a wide one, low in a tall one.
      const tall = this.cssHeight > this.cssWidth;
      const goalX = tall ? 0 : -0.27 * this.cssWidth;
      const goalY = (tall ? 0.24 : 0.13) * this.cssHeight;
      // Twice the size, and never so far over that the window shows past the picture's edge.
      const mostX = this.width * this.scale - this.cssWidth / 2;
      const mostY = this.height * this.scale - this.cssHeight / 2;
      const endX = Math.max(-mostX, Math.min(mostX, goalX - 2 * sx));
      const endY = Math.max(-mostY, Math.min(mostY, goalY - 2 * sy));
      dx += (endX - dx) * near;
      dy += (endY - dy) * near;
    }
    // Rounded to whole screen pixels so the big pixels stay crisp.
    const grow = near > 0 ? ` scale(${(1 + near).toFixed(4)})` : '';
    this.canvas.style.transform = `translate(calc(-50% + ${Math.round(dx)}px), calc(-50% + ${Math.round(dy)}px))${grow}`;

    const windAmt = Math.hypot(s.windX, s.windZ);
    const windDir: [number, number] = windAmt > 0.001 ? [s.windX / windAmt, s.windZ / windAmt] : [0.6, -0.8];
    this.slow = (this.slow + s.dt / 48) % 1;

    const common = {
      uShore: [BEACH.x, BEACH.z, Math.sin(FACING), -Math.cos(FACING)],
      // (The water's edge is where the sea, standing as the tide has it, meets the slope of the beach.)
      uSurf: [s.clock.surf, s.surfSize, BEACH.toWater - s.tide.level / BEACH.slope, BEACH.r],
      uSeaGlow: s.seaGlow,
      uTide: [s.tide.level, s.tide.high, s.tide.damp],
      uViewProj: viewProj,
      uHearth: fireHeart,
      uMelt: s.melt,
      uRime: [s.rime.frost, s.rime.burnt, s.rime.glint, this.slow],
      uDew: [s.rime.dew, s.rime.dried, s.rime.shine, 0],
      uCam: eye,
      uLightDir: air.lightDir,
      uLightCol: air.lightCol,
      uAmbient: air.ambient,
      uFogCol: air.fogCol,
      uFogDensity: air.fogDensity,
      uCloudFog: air.cloudFog,
      uScrollA: s.clock.gustA,
      uScrollB: s.clock.gustB,
      uScrollC: s.clock.shadow,
      uWindDir: windDir,
      uWindAmt: windAmt,
      uCloud: s.cloud,
      uSnow: s.snowCover,
      uWet: s.rain,
      uGrassLush: air.grassLush,
      uGrassDry: air.grassDry,
      uGrassLight: air.grassLight,
      uLampOn: air.lamp,
      uLampLit: s.doorLamps,
      // (PATH-TRACE. The light is gathered for the meadow and for the beach, each apart. Indoors the
      // room has its own light; and out in the boat you are never still, so there is no one spot for a
      // pixel's light to be gathered at: there the plainer formula lights everything.)
      uTraced: this.indoors || this.afloat || this.lightAt !== this.place ? 0 : this.trust,
      // (Out in the boat the beach's own waves are behind you and far off: they are not reckoned at all.)
      // Firelight shows most after dark, and wavers.
      uFireGlow:
        (Math.min(1.25, s.fire.flame) * 0.9 + s.fire.embers * 0.2) *
        (0.3 + 0.7 * air.lamp) *
        (0.9 + 0.06 * Math.sin(s.clock.flutter * 3) + 0.04 * Math.sin(s.clock.flutter * 7 + 1)),
    };
    const pixel = (2 * tanHalf) / this.height;
    // The lanterns by the path light the ground round them after dark, each as brightly as it burns.
    const taskLamps = lanternFlames.flatMap((at, i) => [...at, s.lanterns.lit[i] * s.lanterns.there[i] * air.lamp * (1 - 0.55 * (s.lanterns.low[i] ?? 0))]);
    // (PATH-TRACE: and the storm lantern on its post, which burns as its battery stands. It is a light like the rest.)
    // (A bigger flame than a candle's, hung at shoulder height: it counts for more than twice one of those.)
    taskLamps.push(...STORM_FLAME, s.yard.storm[2] > 0.5 ? 2.4 * (0.45 + 0.55 * Math.min(1, s.yard.storm[0])) * air.lamp : 0);
    for (const p of [this.land, this.grass, this.prop]) p.use().list('uTaskLamp', 4, taskLamps);
    // COMBERS: what each of the two waves on their way in is like.
    for (const p of [this.land, this.grass, this.prop, this.sea, this.shingle, this.wash, this.spray]) p.use().list('uComber', 4, s.clock.combers);
    // Each of those flames, and the storm lantern's, keeps the snow off a little ground round it: day and
    // night alike (a candle is as warm by day), wider the fuller it burns.
    const warm = lanternFlames.flatMap((at, i) => [...at, 0.85 * Math.min(1, s.lanterns.lit[i]) * s.lanterns.there[i] * (1 - 0.35 * (s.lanterns.low[i] ?? 0))]);
    warm.push(...STORM_FLAME, s.yard.storm[2] > 0.5 ? 0.4 + 0.6 * s.yard.storm[0] : 0);
    for (const p of [this.land, this.grass, this.prop, this.yard]) p.use().list('uWarm', 4, warm);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    if (this.canTrace && !this.afloat && this.lightAt === this.place) {
      if (this.indoors) this.traceRoom(s, viewProj);
      else this.traceLight(s, viewProj, eye);
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.gathered.a);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.gathered.b);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.gathered.c);
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_2D, this.gathered.d);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(0, 0, this.width, this.height);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // WINDOW-ONLY: indoors, nothing out of doors can show except through the window (the room is drawn
    // over every other part of the picture). So the sky, the land and all the rest are only worked out
    // within the window's place in the picture, and a little over.
    let hole: [number, number, number, number] | null = null;
    if (this.indoors) {
      const { win, wall } = PARLOUR;
      const a = this.roomSeen(win.x0, win.y0, wall);
      const b = this.roomSeen(win.x1, win.y1, wall);
      const x0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) * 0.5 + 0.5) * this.width) - 3);
      const x1 = Math.min(this.width, Math.ceil((Math.max(a[0], b[0]) * 0.5 + 0.5) * this.width) + 3);
      const y0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) * 0.5 + 0.5) * this.height) - 3);
      const y1 = Math.min(this.height, Math.ceil((Math.max(a[1], b[1]) * 0.5 + 0.5) * this.height) + 3);
      if (x1 > x0 && y1 > y0) hole = [x0, y0, x1 - x0, y1 - y0];
    }
    const throughHole = (on: boolean) => {
      if (!hole) return;
      if (on) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(hole[0], hole[1], hole[2], hole[3]);
      } else gl.disable(gl.SCISSOR_TEST);
    };
    throughHole(true);

    // Sky first, behind everything.
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.paintSky(s, right, up, fwd, tanHalf, aspect);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // Indoors, the room comes first: it is nearer than anything out of doors, so it is given the nearest
    // sliver of the picture's depth to itself, and all the rest of the scene is drawn behind that. What
    // is outside then shows only where the room has a hole in it: the window.
    gl.depthRange(0, 1);
    if (this.indoors) {
      throughHole(false);
      gl.depthRange(0, ROOM_DEPTH);
      this.paintRoom(s);
      gl.depthRange(ROOM_DEPTH, 1);
      throughHole(true);
    }

    // Nearest things first, so what they hide is never shaded.
    this.grass.use().set(common).set({ uFlutter: s.clock.flutter, uPixel: pixel, uRes: [this.width, this.height], uSnowDepth: s.snowDepth });
    // Dew and the glints on frost first: each a point on the tip of a blade, a hair nearer than the tip itself.
    if (s.rime.dew > 0.01 || s.rime.frost * s.rime.glint > 0.01) {
      this.grass.set({ uBead: 1 });
      gl.bindVertexArray(this.beadVao);
      gl.vertexAttrib2f(0, 0, 1);
      if (this.plain) gl.drawArrays(gl.POINTS, 0, this.grassCount);
      else gl.drawArraysInstanced(gl.POINTS, 0, 1, this.grassCount);
      this.grass.set({ uBead: 0 });
    }
    gl.bindVertexArray(this.grassVao);
    if (this.plain) gl.drawElements(gl.TRIANGLES, this.grassCount * 15, gl.UNSIGNED_INT, 0);
    else gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 7, this.grassCount);
    gl.bindVertexArray(this.flowerVao);
    gl.vertexAttrib2f(0, 0, 1); // every flower head sits at the very tip
    if (this.plain) gl.drawArrays(gl.POINTS, 0, this.flowerCount);
    else gl.drawArraysInstanced(gl.POINTS, 0, 1, this.flowerCount);

    // The carving is faintly alight even by day, so it can be read.
    const rune = Math.min(2.2, 0.48 + air.lamp * (0.4 + 0.2 * Math.sin(s.clock.pulse)) + s.stoneLit * 0.8);
    // The lighthouse: a long dark, then a flash as the lamp swings past.
    const sweep = s.clock.beacon;
    const beacon = air.lamp * (sweep < 0.08 ? 1 : sweep < 0.14 ? 0.45 : 0.06);
    const ember = Math.max(s.fire.embers, Math.min(1, s.fire.flame)) * (0.8 + 0.2 * Math.sin(s.clock.pulse * 2));
    const still = [0, 0, 0];
    const fill = norm([-right[0] * 0.55 - fwd[0] * 0.4, 0.75 - fwd[1] * 0.4, -right[2] * 0.55 - fwd[2] * 0.4]);
    this.prop.use().set(common).set({ uLamp: air.lamp, uRune: rune, uBeacon: beacon, uEmber: ember, uMusic: s.music, uFill: fill, uHorizon: air.horizon, uShift: still, uTurn: [1, 0], uGrow: 1 });
    this.prop.list('uSign', 3, s.signs);
    this.prop.list('uHomeLit', 3, s.windows);
    gl.bindVertexArray(this.propVao);
    const { fixed, pile, cairn } = this.props;
    gl.drawArrays(gl.TRIANGLES, 0, fixed);
    // As many logs as are left in the pile, and as many stones as the cairn has
    // earned. The last of each may be on the move: a log hopping into the fire
    // or being set down, a stone dropping into place.
    const logs = Math.min(5, s.fire.logs);
    const moved = s.fire.logShift ? 1 : 0;
    if (logs - moved > 0) gl.drawArrays(gl.TRIANGLES, pile.start, (logs - moved) * pile.each);
    if (logs > 0 && s.fire.logShift) {
      this.prop.set({ uShift: s.fire.logShift });
      gl.drawArrays(gl.TRIANGLES, pile.start + (logs - 1) * pile.each, pile.each);
      this.prop.set({ uShift: still });
    }
    const stones = Math.min(12, s.fire.stones);
    if (stones > 1) gl.drawArrays(gl.TRIANGLES, cairn.start, (stones - 1) * cairn.each);
    if (stones > 0) {
      this.prop.set({ uShift: [0, s.fire.stoneLift, 0] });
      gl.drawArrays(gl.TRIANGLES, cairn.start + (stones - 1) * cairn.each, cairn.each);
      this.prop.set({ uShift: still });
    }
    // The small stones laid on the old stone, one for each thing the almanac
    // remembers; the newest may still be dropping into place.
    const laid = Math.min(TOKENS, s.tokens);
    if (laid > 1) gl.drawArrays(gl.TRIANGLES, tokenParts.start, (laid - 1) * tokenParts.each);
    if (laid > 0) {
      this.prop.set({ uShift: [0, s.tokenLift, 0] });
      gl.drawArrays(gl.TRIANGLES, tokenParts.start + (laid - 1) * tokenParts.each, tokenParts.each);
      this.prop.set({ uShift: still });
    }
    // The lanterns by the path: as much of each as is there, as brightly lit as
    // it has got to. Then the paper lanterns that are rising away from them.
    this.lanternsUp = s.lanterns.up;
    s.lanterns.there.forEach((there, i) => {
      if (there <= 0) return;
      // (A lantern being let go burns up for a moment even by day, so that its going can be seen.)
      // (A candle that has burned low gives less light; one being let go flares all the same.)
      const low = s.lanterns.low[i] ?? 0;
      const burns = s.lanterns.lit[i] > 1 ? 1 : 1 - 0.55 * low;
      this.prop.set({ uTask: [Math.min(1.2, s.lanterns.lit[i] * burns * Math.max(air.lamp, s.lanterns.lit[i] > 1 ? 0.75 : 0)), there, low, s.lanterns.moss[i] ?? 0], uShift: [s.lanterns.sway[i] ?? 0, s.lanterns.lift[i], 0] });
      gl.drawArrays(gl.TRIANGLES, lanternParts[i][0], lanternParts[i][1]);
    });
    for (const [x, y, z, size, turn, there, lit] of s.lanterns.rising) {
      this.prop.set({ uTask: [lit, there, 0, 0], uGrow: size, uTurn: [Math.cos(turn), Math.sin(turn)], uShift: [x, y, z] });
      gl.drawArrays(gl.TRIANGLES, paperPart[0], paperPart[1]);
    }
    this.prop.set({ uGrow: 1, uTurn: [1, 0], uShift: still });

    // The lamb: its body, then its head, which is carried lower when it lies and lifted when it looks up.
    this.friendAt = s.friend ? [s.friend.x, s.friend.y - s.friend.low * LAMB.bodyDrop, s.friend.z] : null;
    if (s.friend) {
      const f = s.friend;
      const down = f.low * LAMB.bodyDrop * f.grow;
      const { body, legs, head } = this.props.lamb;
      // (Its wool darkens in the rain, and snow settles on its back.)
      this.prop.set({ uCoat: [f.wet, f.snowy], uGrow: f.grow, uTurn: [Math.cos(f.yaw), Math.sin(f.yaw)], uShift: [f.x, f.y - down, f.z] });
      gl.drawArrays(gl.TRIANGLES, body[0], body[1]);
      // Its legs step in diagonal pairs: each swings forward off the ground, then pushes back along it.
      const ahead: [number, number] = [Math.cos(f.yaw), -Math.sin(f.yaw)]; // the way it faces
      legs.forEach(([first, many], i) => {
        const swing = f.gait + (i === 0 || i === 3 ? 0 : Math.PI);
        const fore = Math.sin(swing) * LAMB.stride * f.stride * f.grow;
        const up = Math.max(0, Math.cos(swing)) * LAMB.lift * f.stride * f.grow;
        // Stretched out on a hot day, its legs lie along the ground in front of it and behind.
        this.prop.set(hinged([f.x + ahead[0] * fore, f.y - down + up, f.z + ahead[1] * fore], f.yaw, f.grow, LAMB_HIPS[i], 0, (i < 2 ? 1.3 : -1.3) * f.sprawl));
        gl.drawArrays(gl.TRIANGLES, first, many);
      });
      // Its head turns and tips on its neck.
      this.prop.set(hinged([f.x, f.y - down - f.low * LAMB.headDrop * f.grow + f.head, f.z], f.yaw, f.grow, LAMB_NECK, f.turn, f.tilt));
      gl.drawArrays(gl.TRIANGLES, head[0], head[1]);
      this.prop.set({ uGrow: 1, uTurn: [1, 0], uShift: still, uNod: 0, uCoat: [0, 0] });
    }

    // The fishing boat, wherever its day has taken it. The swell lifts it by whole pixels of the picture, so it rides as one piece.
    {
      const bt = s.boat;
      const lift = bt.rise * Math.hypot(bt.x - eye[0], bt.z - eye[2]) * pixel;
      this.prop.set({ uGrow: bt.grow, uTurn: [Math.cos(bt.yaw), Math.sin(bt.yaw)], uShift: [bt.x, lift, bt.z] });
      gl.drawArrays(gl.TRIANGLES, this.props.boat[0], this.props.boat[1]);
    }
    // Puffins, in their season: each stands in its place and turns its head by itself.
    perches.forEach((perch, i) => {
      const look = s.puffins.birds[i];
      if (!look || perch.beach !== this.ashore) return;
      const at: V3 = [perch.x, perch.y, perch.z];
      this.prop.set({ uGrow: perch.size, uTurn: [Math.cos(perch.yaw), Math.sin(perch.yaw)], uShift: at, uNod: 0 });
      gl.drawArrays(gl.TRIANGLES, this.props.puffin.body[0], this.props.puffin.body[1]);
      this.prop.set(hinged(at, perch.yaw, perch.size, PUFFIN_NECK, look.turn, look.tilt));
      gl.drawArrays(gl.TRIANGLES, this.props.puffin.head[0], this.props.puffin.head[1]);
    });
    this.prop.set({ uGrow: 1, uTurn: [1, 0], uShift: still, uNod: 0 });

    // The bottles on the beach, and one on its way out to sea: the same bottle each time, turned and moved.
    for (const bottle of s.bottles) {
      // (A good deal larger than life, and propped with its neck up on a stone, so that it is plainly a bottle among the stones.)
      this.prop.set({ uGrow: 1.45, uNod: 0.3, uTurn: [Math.cos(bottle.yaw), Math.sin(bottle.yaw)], uShift: [bottle.x, bottle.y, bottle.z], uBottle: [bottle.wet, bottle.lit, 0.5 + 0.5 * Math.sin(s.clock.pulse), 0] });
      gl.drawArrays(gl.TRIANGLES, bottleRange[0], bottleRange[1]);
    }
    if (s.bottles.length) this.prop.set({ uGrow: 1, uNod: 0, uTurn: [1, 0], uShift: still });

    if (s.fire.flame > 0.01) {
      const lean = (windDir[0] * right[0] + windDir[1] * right[2]) * windAmt * 1.3;
      this.flame.use().set({ uViewProj: viewProj, uFlameT: s.clock.flame, uLean: lean });
      gl.bindVertexArray(this.flameVao);
      // From the back of the fire to the front: [how strongly it burns, its own shape, how far forward it is].
      const sheets = [[0.86, 0.37, 0], [0.92, 0.71, 0.25], [1, 0, 0.8], [0.8, 0.53, 1]];
      sheets.forEach(([strength, seed, layer], i) => {
        this.flame.set({ uHeat: s.fire.flame * strength, uSeed: seed, uLayer: layer });
        gl.drawArrays(gl.TRIANGLES, i * 6, 6);
      });
    }
    if (s.fire.sparks > 0.01) {
      this.spark.use().set({ uViewProj: viewProj, uWindDir: windDir, uWindAmt: windAmt, uSparkT: s.clock.spark, uSparks: s.fire.sparks });
      gl.bindVertexArray(this.sparkVao);
      gl.drawArrays(gl.POINTS, 0, 56);
    }
    // A lantern whose task is done sends up a few sparks of its own as its light is let go.
    if (!this.ashore && !this.indoors && s.lanterns.sparks.some((much) => much > 0.02)) {
      this.spark.use().set({ uViewProj: viewProj, uWindDir: windDir, uWindAmt: windAmt, uSparkT: s.clock.spark });
      gl.bindVertexArray(this.sparkVao);
      s.lanterns.sparks.forEach((much, i) => {
        if (much <= 0.02) return;
        const at = lanternFlames[i];
        this.spark.set({ uFirePos: [at[0], at[1] - 0.3, at[2]], uSparks: much });
        gl.drawArrays(gl.POINTS, 0, 56);
      });
      this.spark.set({ uFirePos: fireHeart });
    }
    // Notes from the gramophone's horn, while there is music.
    if (s.music > 0.02) {
      this.note.use().set({ uViewProj: viewProj, uMouth: hornMouth, uWay: hornWay, uWindDir: windDir, uWindAmt: windAmt, uNoteT: s.clock.note, uNotes: s.music });
      gl.bindVertexArray(this.noteVao);
      gl.drawArrays(gl.POINTS, 0, NOTES);
    }

    // The washing on its line by the wall, and the storm lantern on its post (see yard.ts).
    if (!this.ashore) {
      const culled = gl.isEnabled(gl.CULL_FACE);
      if (culled) gl.disable(gl.CULL_FACE);
      this.yard.use().set(common).set({ uOut: s.yard.out, uYardT: s.yard.time, uStorm: s.yard.storm, uStormAt: STORM_FLAME });
      gl.bindVertexArray(this.yardVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.yardCount);
      if (culled) gl.enable(gl.CULL_FACE);
    }

    // (AFLOAT) The rowing boat: at her mooring, hauled up, or under you. (CATCH) And the fish, with what they hang and cook on.
    const boat = this.ashore ? s.skiff.boat : null;
    if (boat || s.skiff.things.length) {
      const b = boat ?? { at: [0, 0, 0] as V3, x: [1, 0, 0] as V3, y: [0, 1, 0] as V3, z: [0, 0, 1] as V3 };
      const lampAt = [0, 1, 2].map((i) => b.at[i] + b.x[i] * BOW_LAMP[0] + b.y[i] * BOW_LAMP[1] + b.z[i] * BOW_LAMP[2]);
      const lamp = [lampAt[0], lampAt[1], lampAt[2], boat ? s.skiff.lamp : 0];
      const culled = gl.isEnabled(gl.CULL_FACE);
      if (culled) gl.disable(gl.CULL_FACE);
      this.boatProgram.use().set(common).set({ uCooked: 0, uBowLamp: lamp });
      if (boat) {
        // PATH-TRACE: the light she stands in is the light rays found on the beach. Lying at her mooring
        // she is over water too deep for them to know the bottom of, so it is taken from the stones at
        // the water's edge abreast of her; hauled out, from the stones she lies on.
        const ax = Math.sin(FACING);
        const az = -Math.cos(FACING);
        const out = (b.at[0] - BEACH.x) * ax + (b.at[2] - BEACH.z) * az;
        const along = (b.at[0] - BEACH.x) * -az + (b.at[2] - BEACH.z) * ax;
        const edge = BEACH.toWater - s.tide.level / BEACH.slope - 0.8;
        const stand = Math.min(out, edge);
        const lightAt: V3 = [BEACH.x + ax * stand - az * along, Math.max(s.tide.level, 0) + 0.15 + Math.max(0, edge - stand) * BEACH.slope, BEACH.z + az * stand + ax * along];
        this.boatProgram.set({ uBoatAt: b.at, uBoatX: b.x, uBoatY: b.y, uBoatZ: b.z, uLightAt: lightAt });
        gl.bindVertexArray(this.boatVao);
        gl.drawArrays(gl.TRIANGLES, 0, this.boatCount);
      }
      if (s.skiff.things.length) {
        gl.bindVertexArray(this.catchVao);
        for (const thing of s.skiff.things) {
          const part = this.catchParts[thing.mesh];
          if (!part) continue;
          this.boatProgram.set({ uBoatAt: thing.at, uBoatX: thing.x, uBoatY: thing.y, uBoatZ: thing.z, uLightAt: thing.at, uCooked: thing.cooked, uBowLamp: thing.aboard ? lamp : [0, 0, 0, 0] });
          gl.drawArrays(gl.TRIANGLES, part[0], part[1]);
        }
      }
      if (culled) gl.enable(gl.CULL_FACE);
    }

    // Down on the beach: its stones, and the water each wave runs up among them.
    // (From the meadow none of it can be seen, so there it is not drawn.)
    if (this.ashore && !this.afloat) {
      this.shingle.use().set(common);
      gl.bindVertexArray(this.shingleVao);
      if (this.stonesPlain) gl.drawArrays(gl.TRIANGLES, 0, 60 * this.shingleCount);
      else gl.drawArraysInstanced(gl.TRIANGLES, 0, 60, this.shingleCount);
      if (s.stacked.length > 0) {
        this.shingle.set({ uHeld: 1 });
        gl.bindVertexArray(this.stackVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.stackBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(s.stacked), gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 60, s.stacked.length / 12);
        this.shingle.set({ uHeld: 0 });
      }
      this.wash.use().set(common).set({ uFoamCol: air.foam, uSeaDeep: air.seaDeep, uSeaPale: air.seaPale });
      gl.bindVertexArray(this.washVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.washCount);
    }

    // (The fog off the cliff slides in sixths of a second, like the water.)
    this.spilt = (this.spilt + s.dt * 0.045) % 1;
    this.land.use().set(common).set({ uSnowDepth: s.snowDepth, uFoamCol: air.foam, uSpill: [air.spill, Math.floor(this.spilt * 133) / 133] });
    gl.bindVertexArray(this.landVao);
    gl.drawElements(gl.TRIANGLES, this.landCount, gl.UNSIGNED_INT, 0);

    this.fall.use().set(common).set({ uFallT: s.clock.fall, uSpray: 0 });
    this.fall.set({ uLip: this.fallLip });
    gl.bindVertexArray(this.ribbonVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.ribbonCount);
    this.fall.set({ uSpray: 1 });
    gl.bindVertexArray(this.sprayVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.sea.use().set(common).set({
      uSeaDeep: air.seaDeep,
      uSeaPale: air.seaPale,
      uGlint: air.glint,
      uSeaA: s.clock.sea,
      uWaveA: s.clock.waves.slice(0, 4),
      uWaveB: s.clock.waves.slice(4, 8),
      uFine: s.clock.fine,
      uFoamCol: air.foam,
    });
    this.sea.list('uRipple', 4, s.ripples);
    this.sea.list('uRocks', 3, shoreStones.flat());
    // (AFLOAT) No water is drawn inside the rowing boat, wherever she lies in it; and when you are out in
    // her, the sea round her has the swell's real height.
    const hull = this.ashore && s.skiff.wet ? s.skiff.boat : null;
    this.sea.set({
      uHullAt: hull ? [hull.at[0], hull.at[1], hull.at[2], 1] : [0, 0, 0, 0],
      uHullX: hull ? hull.x : [1, 0, 0],
      uHullY: hull ? hull.y : [0, 1, 0],
      uHullZ: hull ? hull.z : [0, 0, 1],
      uAfloat: [SKIFF_SPOT[0], SKIFF_SPOT[1], this.afloat ? s.skiff.sea : 0, 0],
    });
    if (this.afloat) {
      this.sea.set({ uSwell: 2 });
      gl.bindVertexArray(this.boatSeaVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.boatSeaCount);
    }
    // (Off the beach first, where the waves have real height; then the level sea everywhere.)
    if (this.ashore && !this.afloat) {
      this.sea.set({ uSwell: 1 });
      gl.bindVertexArray(this.swellVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.swellCount);
    }
    this.sea.set({ uSwell: 0 });
    gl.bindVertexArray(this.seaVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // Spray going up off the rocks in the shallows as each wave strikes them.
    if (this.ashore && !this.afloat) {
      const culled = gl.isEnabled(gl.CULL_FACE);
      if (culled) gl.disable(gl.CULL_FACE);
      this.spray.use().set(common).set({ uFoamCol: air.foam });
      gl.bindVertexArray(this.emptyVao);
      for (const rock of this.wetRocks) {
        this.spray.set({ uRock: rock });
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (culled) gl.enable(gl.CULL_FACE);
    }
    // A stone skipping out over it.
    if (s.stone) {
      this.pebble.use().set({ uViewProj: viewProj, uPebble: [s.stone[0], s.stone[1] + s.tide.level, s.stone[2]] });
      gl.bindVertexArray(this.emptyVao);
      gl.drawArrays(gl.POINTS, 0, 1);
    }
    // The kite, on the ground or in the sky. (Its cloth is seen from both sides.)
    if (s.kite && s.kite.tris.length + s.kite.lines.length > 0) {
      const culled = gl.isEnabled(gl.CULL_FACE);
      if (culled) gl.disable(gl.CULL_FACE);
      this.kite.use().set({
        uViewProj: viewProj,
        uCam: eye,
        uTint: air.ambient.map((c, i) => Math.min(1.25, c + air.lightCol[i] * 0.55)),
        uFogCol: air.fogCol,
        uFogDensity: air.fogDensity,
      });
      gl.bindVertexArray(this.kiteVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.kiteBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...s.kite.tris, ...s.kite.lines]), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, s.kite.tris.length / 6);
      gl.drawArrays(gl.LINES, s.kite.tris.length / 6, s.kite.lines.length / 6);
      if (culled) gl.enable(gl.CULL_FACE);
    }

    // Chimney smoke: more of it the colder it is.
    const cold = Math.max(0, Math.min(1, (16 - s.temp) / 16));
    const smokeTint = air.foam.map((c) => c * 0.86);
    this.smoke.use().set({ uViewProj: viewProj, uCam: eye, uWindDir: windDir, uWindAmt: windAmt, uSmokeT: s.clock.smoke, uPixel: pixel, uTint: smokeTint });
    this.smoke.list('uSource', 3, smokeSources.slice(0, 3).flat());
    gl.bindVertexArray(this.smokeVao);
    gl.drawArrays(gl.POINTS, 0, Math.round(PUFFS * (0.35 + 0.65 * cold)));
    // A thread of it from a few chimneys in the far village too.
    if (villageSmoke.length === 3) {
      this.smoke.list('uSource', 3, villageSmoke.flat());
      gl.drawArrays(gl.POINTS, 0, Math.round(26 * (0.4 + 0.6 * cold)));
    }
    // And from the campfire, while it burns or smoulders.
    // Putting it out sends up a thick white gout of steam.
    const blaze = Math.min(1, s.fire.flame);
    const fireSmoke = Math.min(PUFFS, Math.round(4 + 16 * blaze + 5 * s.fire.embers + 34 * s.fire.steam));
    if (blaze > 0.02 || s.fire.embers > 0.3 || s.fire.steam > 0.03) {
      const above = [fireHeart[0], fireHeart[1] + 0.4 + 0.9 * blaze, fireHeart[2]];
      const pale = Math.min(1, s.fire.steam * 1.4);
      this.smoke.list('uSource', 3, [...above, ...above, ...above]);
      this.smoke.set({ uTint: smokeTint.map((c, i) => c + (air.foam[i] * 1.12 - c) * pale) });
      gl.drawArrays(gl.POINTS, 0, fireSmoke);
    }

    // The lamb's breath shows when it is cold: a small pale puff at its muzzle, going with the wind.
    const breathed = this.breathing.update(s.dt, s.friend ?? null, s.temp);
    if (breathed) {
      const carry = Math.min(windAmt, 0.7) * 1.5;
      this.breath.use().set({ uViewProj: viewProj, uCam: eye, uPixel: pixel, uCarry: [windDir[0] * carry, windDir[1] * carry], uTint: air.foam.map((c) => Math.min(1, c * 0.97)) });
      this.breath.list('uPuff', 4, breathed.puff).list('uPuffWay', 4, breathed.way);
      gl.bindVertexArray(this.smokeVao);
      gl.drawArrays(gl.POINTS, 0, BREATHS * 5);
    }

    // Gulls fly by day, and stay down in rain.
    if (air.lamp < 0.5 && s.rain < 0.4) {
      this.bird.use().set({ uViewProj: viewProj, uBirdT: s.clock.bird, uFlap: s.clock.flap, uTint: air.foam });
      gl.bindVertexArray(this.birdVao);
      gl.drawArrays(gl.POINTS, 0, GULLS);
    }

    // Puffins on the wing, low over the water: their wings beat in four frames, twelve a second.
    if (s.puffins.flying > 0) {
      this.puffin.use().set({ uViewProj: viewProj, uTime: s.puffins.time, uWing: Math.floor(s.puffins.time * 12) % 4, uTint: air.foam });
      gl.bindVertexArray(this.birdVao);
      gl.drawArrays(gl.POINTS, 0, Math.min(GULLS, s.puffins.flying));
    }

    // The glow in the air round the fire: added to what is behind it, so it only ever brightens.
    const haze = Math.min(1.2, s.fire.flame) * (0.22 + 0.78 * air.lamp);
    if (haze > 0.03) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      gl.depthMask(false);
      this.glow.use().set({ uViewProj: viewProj, uGlow: haze });
      gl.bindVertexArray(this.glowVao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
    }

    // Rain and snow, blended over the top.
    const falling = { uViewProj: viewProj, uHome: eye, uSlant: [windDir[0] * windAmt * 1.2, windDir[1] * windAmt * 1.2] };
    const brightness = Math.min(1, 0.3 + air.ambient[1] * 1.3);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    if (s.rain > 0.01) {
      const pale = air.fogCol.map((c) => (0.55 + 0.45 * c) * brightness);
      this.rain.use().set(falling).set({ uFall: s.clock.rain, uTint: pale });
      gl.bindVertexArray(this.rainVao);
      gl.drawArrays(gl.LINES, 0, Math.floor(DROPS * Math.min(1, s.rain)) * 2);
    }
    if (s.snowfall > 0.01) {
      this.snow.use().set(falling).set({
        uCam: eye,
        uFall: s.clock.snow,
        uSway: s.clock.flutter,
        uPixel: pixel,
        uTint: [brightness, brightness, brightness],
      });
      gl.bindVertexArray(this.snowVao);
      gl.drawArrays(gl.POINTS, 0, Math.floor(FLAKES * Math.min(1, s.snowfall)));
    }
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    throughHole(false);

    if (this.indoors) {
      gl.depthRange(0, ROOM_DEPTH);
      this.paintPanes(s);
    }
    gl.depthRange(0, 1);
    this.present(s);
  }

  /** What both of the room's passes are told: how it is turned, and its light. */
  private roomSays(s: Scene) {
    return {
      uViewProj: this.viewProj,
      uEye: ROOM_EYE,
      uRight: [Math.cos(FACING), 0, Math.sin(FACING)],
      uAhead: [Math.sin(FACING), 0, -Math.cos(FACING)],
      uDayIn: s.room.dayIn,
      uNight: s.room.night,
      uLamp: s.room.lamp,
      uRoomT: s.room.time,
    };
  }

  /** The room indoors (see parlour.ts): everything in it, as solid things. */
  private paintRoom(s: Scene): void {
    const { gl } = this;
    const culled = gl.isEnabled(gl.CULL_FACE);
    if (culled) gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    const { life } = s.room;
    this.room.use().set(this.roomSays(s)).set({
      uHands: s.room.hands,
      uFlick: s.room.flick,
      uDrawn: life.drawn,
      uCat: life.cat,
      uSwing: life.swing,
      uLogs: life.logs,
      uFlare: life.flare,
      uBoil: life.boil,
      uTea: life.tea,
      uSand: s.room.sand,
      uEyeAt: this.seated ? PARLOUR.seat : [0, PARLOUR.eyeHigh, 0],
      uMusic: s.music,
      uDay: new Date().getDate(),
      uRain: s.room.glass[0],
      // PATH-TRACE: the light gathered for where you are in the room, once there is enough of it; and the
      // sun's own light as it is out of doors (less of it the more cloud there is across it).
      uTraced: this.canTrace && this.lightAt === this.place ? this.trust : 0,
      // (How many samples a pixel is to have before its gathered light begins to show, and by how many it shows in full.)
      uSureAt: this.plain ? [6, 36] : [12, 90],
      // CANDLE: the candle on the table is alight while the curtains are drawn, and burns up as they close.
      uCandle: life.drawn,
      uSunIn: s.air.lightCol.map((c) => c * (1 - 0.8 * Math.max(0, Math.min(1, (s.cloud - 0.4) / 0.55)))),
    });
    gl.bindVertexArray(this.roomVao);
    gl.drawArrays(gl.TRIANGLES, 0, this.roomCount);
    if (culled) gl.enable(gl.CULL_FACE);
  }

  /** What the weather has put on the window's glass: laid over the view, after everything outside is drawn. */
  private paintPanes(s: Scene): void {
    const { gl } = this;
    const culled = gl.isEnabled(gl.CULL_FACE);
    if (culled) gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    this.panes.use().set(this.roomSays(s)).set({ uGlass: s.room.glass });
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D, this.wipedGlass);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.panesVao);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, this.panesCount);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    if (culled) gl.enable(gl.CULL_FACE);
  }

  /** Paint the sky as seen along `fwd`, into whatever is being drawn to. */
  private paintSky(s: Scene, right: V3, up: V3, fwd: V3, tanHalf: number, aspect: number): void {
    const { gl } = this;
    const { air } = s;
    this.skyCam = { right, up, fwd, tanHalf, aspect };
    this.sky.use().set({
      uRight: right,
      uUp: up,
      uFwd: fwd,
      uTanHalf: tanHalf,
      uAspect: aspect,
      uZenith: air.zenith,
      uSkyMid: air.skyMid,
      uHorizon: air.horizon,
      uFogCol: air.fogCol,
      uHaze: air.hazeFalloff,
      uSunDir: air.sunDir,
      uSunGlow: air.sunGlow,
      uSunDisc: air.sunDisc,
      uMoonDir: air.moonDir,
      uMoonLit: s.moonLit,
      uSkyTurn: s.heavens.turn,
      uGalaxy: s.heavens.galaxy,
      uGalaxyCore: s.heavens.core,
      uStarCount: Math.min(MAX_STARS, s.heavens.count),
      uMoonVis: air.moonVisible,
      uStars: air.stars,
      uStarsClear: s.skyBy.stars,
      uTwinkle: s.clock.twinkle,
      uMeteor: s.meteor,
      uJoins: s.sky.joins,
      uGrain: (2 * tanHalf) / this.height,
      uBolt: s.bolt,
      uAurora: s.aurora,
      uLayers: s.layers,
      uFront: s.front,
      uShadow: s.shadow,
      uAuroraT: s.clock.aurora,
      uBoltKind: s.boltKind,
      uRings: s.sky.ringCount,
      uCloud: s.cloud,
      uCloudLit: air.cloudLit,
      uCloudDark: air.cloudDark,
      uCloudGlow: air.cloudGlow,
      uCloudScroll: s.clock.cloud,
      uRain: s.rain,
      // A rainbow needs the sun at your back.
      uBow: air.bow * Math.min(1, Math.max(0, (-(air.sunDir[0] * fwd[0] + air.sunDir[1] * fwd[1] + air.sunDir[2] * fwd[2]) - 0.1) / 0.4)),
    });
    this.sky.list('uStar', 4, s.sky.stars ?? s.heavens.stars); // the game marks the stars that can be joined
    this.sky.list('uCoverBy', 4, s.coverBy).list('uSkyClear', 3, s.skyBy.clear).list('uSkyGrey', 3, s.skyBy.grey);
    this.sky.list('uJoinA', 4, s.sky.joinA).list('uJoinB', 4, s.sky.joinB).list('uRing', 4, s.sky.rings);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The final pass: outlines and foam, onto the canvas. */
  private present(s: Scene): void {
    const { gl } = this;
    const { air } = s;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.colour);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.depth);
    gl.activeTexture(gl.TEXTURE0);
    // SUNBEAMS (see the final pass): with the sun low and behind you, where the point of the sky opposite
    // it falls in the picture (its beams run toward that), and how strong they are: strongest when that
    // point is in front of you, and when there is some cloud for the light to come between.
    let beams = [0, 0, 0, 0];
    if (!this.lying && air.sunLow > 0.02) {
      const m = this.viewProj;
      const eye = this.eye;
      const p = [eye[0] - air.sunDir[0] * 1e4, eye[1] - air.sunDir[1] * 1e4, eye[2] - air.sunDir[2] * 1e4];
      const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      if (w > 0) {
        const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
        const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
        const inFront = Math.max(0, 1 - Math.max(0, Math.abs(x) - 1) / 1.6);
        const cloud = Math.max(0, Math.min(1, (s.cloud - 0.06) / 0.3));
        beams = [(x * 0.5 + 0.5) * this.width, (y * 0.5 + 0.5) * this.height, air.sunLow * inFront * (0.6 + 0.4 * cloud), this.beamDrift];
      }
    }
    this.beamDrift = (this.beamDrift + s.dt / 900) % 1;
    const sunlight = Math.min(1, (air.lightCol[0] + air.lightCol[1] + air.lightCol[2]) / 1.7);
    this.post.use().set({ uBeams: beams, uBeamCol: [1.0 * sunlight, 0.78 * sunlight, 0.45 * sunlight] });
    this.post.use().set({ uRoomDepth: this.indoors && !this.lying ? ROOM_DEPTH : 0, uNear: NEAR, uFar: FAR, uFoam: air.foam, uFogCol: air.fogCol, uFogDensity: air.fogDensity, uLap: s.clock.lap, uHeat: air.heat, uShimmer: s.clock.shimmer });
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /**
   * On your back in the grass: nothing but sky, seen from where you were
   * standing but turned well up toward the zenith. The land is not drawn, and
   * the light gathered for it is left as it was for when you sit up again.
   */
  private drawLying(s: Scene): void {
    const { gl } = this;
    // Looking around works as it does standing up.
    const ease = 1 - Math.exp(-s.dt * 2.4);
    this.lookX += (this.wantX - this.lookX) * ease;
    this.lookY += (this.wantY - this.lookY) * ease;
    this.lean = 0;
    const most = (v: number, m: number) => Math.max(-m, Math.min(m, v));
    const lx = most(-this.lookX * this.slideX + this.nudgeX * this.scale, this.slideX);
    const ly = most(this.lookY * this.slideY + this.nudgeY * this.scale, this.slideY);
    this.canvas.style.transform = `translate(calc(-50% + ${Math.round(lx)}px), calc(-50% + ${Math.round(ly)}px))`;

    const fwd = GAZE;
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    const tanHalf = (Math.tan(GAZE_LENS / 2) * this.height) / this.seenRows;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.noise);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.target);
    gl.viewport(0, 0, this.width, this.height);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    this.paintSky(s, right, up, fwd, tanHalf, this.width / this.height);
    gl.depthMask(true);
    this.present(s);
  }
}
