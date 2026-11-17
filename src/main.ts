import { ALMANAC_OVER, ALMANAC_UNDER, createAlmanac } from './almanac';
import { createBond, type Moment } from './bond';
import { createBottles } from './bottles';
import { createKite } from './kite';
import { createGuide, type Saying } from './guide';
import { createStacking } from './stacking';
import { fireHeart, SHORE_EYE, stoneFace } from './scene/land';
import { dayHolds, dressFor } from './calendar';
import { createFishing, type FishingAround } from './fishing';
import { createSights } from './sights';
import { createBoat } from './boat';
import { createCompanion } from './companion';
import { createDebug, type DebugState } from './debug';
import { createFireShow } from './fireShow';
import { createFocus } from './focus';
import { createIndoors } from './indoors';
import { createDoing } from './doing';
import { setWords } from './words';
import { WASHING } from './scene/yard';
import type { RoomSpot } from './scene/view';
import { createHouseholds, darkness } from './households';
import { createKeepsake } from './keepsake';
import { createGramophone } from './music/gramophone';
import { createNotes, type Named } from './notes';
import { createReminders } from './reminders';
import { lanternFlames, lanternTops } from './scene/land';
import { createPuffins } from './puffins';
import { perches } from './scene/land';
import { FACING, musicTop, PITCH, thawAt } from './scene/land';
import { HOUSE_SHAPES } from './scene/land';
import { seaGlowFor } from './weather/seaGlow';
import { tideAt, tideHeld, type Tide } from './sky/tide';
import { CHURCH } from './scene/land';
import type { Sounding } from './sound';
import { heavensAt, type Heavens } from './sky/stars';
import { createSkipping } from './skipping';
import { createSound } from './sound';
import { CARVE } from './scene/shaders';
import { createStarPlay } from './starplay';
import { createTasks } from './tasks';
import { atmosphereFor } from './scene/atmosphere';
import { GAZE, Landscape, type Scene } from './scene/view';
import { CALM, easeWeather, skyAt, smoothstep, type Env, type Weather } from './weather/env';
import { auroraFrom, fetchKp } from './weather/aurora';
import { fetchAround, type Live, type Place } from './weather/openMeteo';
import { fetchWeather, findInOsm, findPlaceAnywhere, onlySource, sourcesResting, type Source } from './weather/sources';
import { callsMade } from './weather/calls';
import { rimeFor, type Rime } from './weather/frost';
import { describeAhead, describeNow } from './weather/phrases';
import { findByIp } from './weather/whereabouts';
import { earthShadowAt, earthShadowTried } from './sky/eclipses';
import { fetchHaze } from './weather/airQuality';
import { createCloudRound } from './weather/cloudRound';
import { fetchCoverBy } from './weather/openMeteo';
import { offerNewFile, updateOnLaunch, updateStarted, VERSION } from './update';

// UPDATE: before anything is begun, the page becomes the newest version of itself, if there is a newer
// one (see update.ts). Nearly always there is not, and this is over in a moment.
await updateOnLaunch();

const TAU = Math.PI * 2;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- the scene -----------------------------------------------------------------

const canvas = $<HTMLCanvasElement>('scene');
const landscape = new Landscape(canvas);

let sizedFor = [0, 0];
function resize(): void {
  sizedFor = [window.innerWidth, window.innerHeight];
  landscape.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ---- state ---------------------------------------------------------------------

const PLACE_KEY = 'nightpond.place';
const weather: Weather = { ...CALM };
let live: Live | null = null;
let place: Place | null = loadPlace();
let locating = false; // asking the network which city this is
let snap = true; // jump straight to the next target instead of easing

const debug = createDebug((): Partial<DebugState> => {
  const now = new Date();
  const speed = Math.hypot(weather.windX, weather.windZ);
  return {
    hour: now.getHours() + now.getMinutes() / 60,
    rain: weather.rain,
    snow: weather.snow,
    wind: speed,
    windFrom: ((Math.atan2(-weather.windX, weather.windZ) * 180) / Math.PI + 360) % 360,
    cloud: weather.cloud,
    fog: weather.fog,
    thunder: Math.round(weather.thunder),
    temp: weather.temp,
    snowDepth: weather.snowDepth,
    moon: skyAt(Date.now(), 0, 1).moonPhase,
  };
});

/** How many hours the sun is up on a given day at a given latitude (it never quite says "never" or "always"). */
function dayLength(ms: number, latitude: number): number {
  const date = new Date(ms);
  const n = (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 86_400_000;
  const tilt = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + n)) / 365);
  const reach = -Math.tan((latitude * Math.PI) / 180) * Math.tan(tilt);
  const halfTurn = Math.acos(Math.max(-0.99, Math.min(0.99, reach)));
  return (2 * halfTurn * 12) / Math.PI;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Animation clocks. Each is kept wrapped (texture offsets to 0..1, angles to a
// full turn) so the panel can run for weeks without anything drifting or jumping.
const clock: Scene['clock'] = {
  gustA: [0, 0],
  gustB: [0, 0],
  shadow: [0, 0],
  cloud: [0, 0],
  sea: [0, 0],
  waves: [0, 0, 0, 0, 0, 0, 0, 0],
  flutter: 0,
  twinkle: 0,
  rain: 0,
  snow: 0,
  fall: 0,
  lap: 0,
  pulse: 0,
  smoke: 0,
  bird: 0,
  flap: 0,
  beacon: 0,
  flame: 0,
  spark: 0,
  note: 0,
  shimmer: 0,
  aurora: 0,
  fine: 0,
  surf: 0,
  combers: [1, 0, 0.1, 0, 0.76, 0, 0.47, 0],
};
const WAVE_LENGTHS = [300, 120, 47, 29, 17, 9, 5.3, 3.1]; // metres; matches the sea shader
// Pixel art is animated in steps, not smoothly. The grass and the water are
// redrawn a few times a second, like frames of hand-drawn animation, and held
// still in between. That is what stops a scene this size from shimmering.
const shown: Scene['clock'] = structuredClone(clock);
const GRASS_FRAMES = 12; // a second
const WATER_FRAMES = 6;
let grassFrame = -1;
let waterFrame = -1;
const wrap1 = (v: number) => v - Math.floor(v);
function scroll(offset: [number, number], dx: number, dz: number, amount: number): void {
  offset[0] = wrap1(offset[0] - dx * amount);
  offset[1] = wrap1(offset[1] - dz * amount);
}

let overStone = false;
let wasPointing = false;
let starlight = 0; // how well the stars show, 0..1
let warmth = 0; // how warm the ground round the fire is, 0..1
let rimeNow: Rime | null = null; // the hoarfrost and dew as last drawn
// ---- the carving on the stone ------------------------------------------------------
// Nine signs, and each is made from every ninth letter of what is written: so a
// letter added at the end recuts one sign, the next letter the next sign, and
// the carving follows the writing along. A bigger change recuts them all, one
// after another in reading order. (The same words always give the same carving.)
const SIGNS = 9;
const CUT_TAKES = 1.5; // seconds one sign is under the chisel
// The chisel keeps one steady time: it moves to the next sign on the beat, a
// blow's length after the last, so that every blow on the stone, whichever
// sign it is cutting, lands together with the others.
const CUT_APART = CARVE.blowGap * CARVE.beat;
function spelling(words: string): number[] {
  const made: number[] = [];
  for (let k = 0; k < SIGNS; k++) {
    let h = (2166136261 ^ Math.imul(k + 1, 374761393)) >>> 0;
    for (let i = k; i < words.length; i += SIGNS) h = Math.imul(h ^ words.charCodeAt(i), 16777619);
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519);
    h ^= h >>> 13;
    made.push((h >>> 0) / 4294967296);
  }
  return made;
}
let carvedFor = '';
let wanted = spelling('');
/** For each sign: what it spells, what it spelled before, and the seconds since its recutting began. */
const signs: number[] = Array.from({ length: SIGNS * 3 }, (_, i) => (i % 3 === 2 ? 99 : wanted[Math.floor(i / 3)]));
let chiselAt = 0; // the sign the chisel goes to next
let carveClock = 0; // seconds of carving time: the beat is counted on it
let carving = false;
let settled = 9; // seconds since the last sign was finished
/** Carry the carving on by `dt` seconds. (It is silent: a knock for each blow was tried, and taken out.) */
function carve(written: string, dt: number): void {
  if (written !== carvedFor) {
    carvedFor = written;
    wanted = spelling(written);
  }
  const before = carveClock;
  carveClock += dt;
  let busy = false;
  for (let k = 0; k < SIGNS; k++) {
    const age = Math.min(99, signs[k * 3 + 2] + dt);
    signs[k * 3 + 2] = age;
    if (age < CUT_TAKES || signs[k * 3] !== wanted[k]) busy = true;
  }
  if (Math.floor(carveClock / CUT_APART) !== Math.floor(before / CUT_APART)) {
    // On the beat: the next sign, in reading order from where the chisel is, that no longer says what is written.
    for (let n = 0; n < SIGNS; n++) {
      const k = (chiselAt + n) % SIGNS;
      if (signs[k * 3] === wanted[k] || signs[k * 3 + 2] < CUT_TAKES) continue;
      signs[k * 3 + 1] = signs[k * 3];
      signs[k * 3] = wanted[k];
      signs[k * 3 + 2] = carveClock % CUT_APART; // counted from the beat itself, not from this frame
      chiselAt = (k + 1) % SIGNS;
      break;
    }
  }
  if (carving && !busy) settled = 0; // the last blow has landed
  carving = busy;
  settled += dt;
}
let surfSize = 0.5; // how big the waves breaking on the beach are, 0..1
/**
 * COMBERS. How many waves have set out for the beach, and what the n-th of them is like: its size against
 * the sea's (waves come in sets: the swell is more than one train of waves, which now add and now
 * cancel, so a few big ones come together and then a few small), how far aslant it comes in, a number
 * of its own (which shapes how its crest wavers), and where along the beach its peak is.
 */
let surfWaves = 2;
function comber(n: number): [number, number, number, number] {
  const chance = (salt: number) => {
    const v = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453;
    return v - Math.floor(v);
  };
  const set = 0.5 + 0.5 * Math.sin((n * Math.PI * 2) / 6.3 + 1);
  return [0.6 + 0.5 * set + (chance(1) - 0.5) * 0.3, (chance(2) - 0.5) * 0.17, chance(3), (chance(4) - 0.5) * 1.5 * 18]; // (the beach reaches 18 metres to either hand)
}
// The washing on the line by the wall: how many pieces are out (it goes out, and comes in, a piece at a time).
let washOut = 0;
let washKnown = false; // whether there has been a reading to judge by yet
let washMoving = false; // a piece is on its way out or in, and wants smooth frames
// The battery of this machine, for the storm lantern: how full, whether on charge, and whether the browser will say at all.
const battery = { level: 1, charging: false, has: false, forced: false };
let readBattery = () => {}; // reads the real one again (it is set once the browser has handed the battery over)
type Battery = { level: number; charging: boolean; addEventListener(kind: string, heard: () => void): void };
void (navigator as Navigator & { getBattery?: () => Promise<Battery> }).getBattery?.().then((b) => {
  const read = () => {
    if (battery.forced) return;
    battery.level = b.level;
    battery.charging = b.charging;
    battery.has = true;
  };
  b.addEventListener('levelchange', read);
  b.addEventListener('chargingchange', read);
  readBattery = read;
  read();
}).catch(() => {});
const wall = [0, 0, 0]; // where the cloud of weather in sight stands (x, z: its length is how near), and whether it is snow
const cloudRound = createCloudRound(); // how cloudy it is toward each compass bearing, easing as the rest of the weather does
let eclipseStage = 0; // how deep in the Earth's shadow the moon was last seen to be
let kp = 0; // how disturbed the Earth's magnetic field is: what the northern lights follow
let northernLights = 0;
let seaGlow = 0; // how brightly the sea glows where it is stirred, 0..1
let tide: Tide = tideHeld(0); // where the sea stands, as the moon has it
let lastPhase: 'cold' | 'burning' | 'embers' = 'cold';
let lambSays = '';
let lambSaysUntil = 0;
let moment: Moment = { hour: 12, rain: 0, snow: 0, heat: 0, stars: 0, phase: 'cold', logs: 5 };
let lying = false; // on your back, looking up at the sky
let ashore = false; // down on the beach at the water's edge, skipping stones
let afloat = false; // FISHING: out on the bay in the rowing boat (you set out from the beach, and come back to it)
let fishAround: FishingAround | null = null; // what the boat and the fish were last told of the weather and the fire
let indoors = false; // in the room of the nearest house, at its window
let lampLit = localStorage.getItem('nightpond.room') !== 'out'; // the lamp on the sill in there: lit until you put it out
let lampNow = lampLit ? 1 : 0; // how brightly it burns just now: it comes up and dies down over a moment
let roomSpot: RoomSpot | null = null; // what of the room the pointer is on
let bookRead = false; // whether the book has been opened since you came in
let skyAsked = { at: 0, x: -99, y: -99, open: false }; // whether the pointer was last found to be on open sky
let stoneLit = 0;
let heavens: Heavens | null = null;
let heavensFor = 0;
// The way you face, in compass terms: x north, y up, z east.
const LOOKING: [number, number, number] = [Math.cos(PITCH) * Math.sin(FACING), Math.sin(PITCH), -Math.cos(PITCH) * Math.cos(FACING)];
let flash = 0;
let nextFlash = 0;
/**
 * A lightning strike: somewhere ahead of you, near or far. Most come to ground
 * as a forked bolt; some only light the cloud from inside. The thunder follows
 * after as long as its distance takes, loud if it was close.
 */
let strikePower = 1;
const bolt: [number, number, number, number] = [0, 0.4, 0, 0];
let boltKind = 0;
function strike(): void {
  const near = Math.random(); // 1 is close by, 0 far out over the sea
  flash = 1;
  strikePower = 0.45 + 0.55 * near;
  boltKind = Math.random() < 0.3 ? 1 : 0;
  bolt[0] = FACING + (Math.random() - 0.5) * 1.3; // its bearing: somewhere in view
  bolt[1] = 0.3 + 0.2 * near + Math.random() * 0.08; // near strikes start higher up the sky
  bolt[2] = Math.random();
  sound.thunder(near);
  almanac.saw('thunder');
  friend.startle(bolt[0]); // the lamb starts up and looks
}

// A shooting star: where it starts, its heading, how far along it is, and when the next is due.
const meteor: [number, number, number, number] = [0, 0, 0, -1];
let nextMeteor = 20_000 + Math.random() * 40_000;
let lastTime = performance.now();
let lastInk = 0;
/** Whether the guide was being shown last frame; and where the foot of the corner's text was then, for the guide's own words under it. */
let guideShowing = false;
let cornerFoot = 0;
/** Whether the words in the sky's corner, and the words low in the view, are in dark ink just now (pale otherwise). */
const inkDark = { high: false, low: false };
let lastLabelInk = 0; // when each label over the scene last had its ink judged

/** When the pointer or a key was last used, and whether anything is going on that needs smooth motion. */
let lastStir = performance.now();
let lively = true;
for (const kind of ['pointermove', 'pointerdown', 'keydown']) {
  window.addEventListener(kind, () => {
    lastStir = performance.now();
    document.body.classList.remove('late');
  });
}

function loop(time: number): void {
  requestAnimationFrame(loop);
  // About 30 frames a second is plenty, and kind to the machine. Left alone in
  // quiet weather it drops to 12, which is all the grass and water ever move at.
  const resting = !lively && time - lastStir > 20_000;
  if (time - lastTime >= (resting ? 80 : 31)) tick(time);
}

// Kind to the screen as well, since it is on all day. Every few minutes the
// whole picture and the clock shift by one big pixel, round a small circuit, so
// nothing rests on the same spot; and late at night, left alone, it dims.
const CIRCUIT = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
let station = 0;
window.setInterval(() => {
  station = (station + 1) % CIRCUIT.length;
  const [nx, ny] = CIRCUIT[station];
  landscape.nudge(nx, ny);
  $('hud').style.transform = `translate(${nx * landscape.bigPixel}px, ${ny * landscape.bigPixel}px)`;
}, 180_000);
window.setInterval(() => {
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  document.body.classList.toggle('late', (hour >= 23.5 || hour < 6) && performance.now() - lastStir > 180_000);
}, 5000);

function tick(time: number): void {
  // A window can gain its size without saying so (a page opened in a tab that was hidden): notice.
  if (window.innerWidth !== sizedFor[0] || window.innerHeight !== sizedFor[1]) resize();
  const elapsed = time - lastTime;
  lastTime = time;
  const dt = Math.min(0.1, elapsed / 1000);

  // Weather eases toward the latest reading over a few minutes, like weather does.
  const manual = debug.state.manual;
  const target = manual ? debug.weather() : (live?.weather ?? CALM);
  easeWeather(weather, target, dt, snap ? 0 : manual ? 0.5 : 75);
  const snapped = snap;
  snap = false;
  // The cloud far off on every side eases in step with the cloud overhead.
  const coverBy = cloudRound.update(dt, manual ? debug.state.coverBy : (live?.coverBy ?? null), target.cloud, weather.cloud, snapped ? 0 : manual ? 0.5 : 75);

  const today = startOfToday();
  let sunrise = live?.sunrise ?? today + 6.5 * 3_600_000;
  let sunset = live?.sunset ?? today + 18.5 * 3_600_000;
  // Another time of year can be asked for (see debug.ts): the day is then as long as it would be on that date here.
  const day0 = today + (manual ? debug.state.days * 86_400_000 : 0);
  if (manual && debug.state.days !== 0) {
    const half = (dayLength(day0, place?.lat ?? 62) / 2) * 3_600_000;
    const noon = (sunrise + sunset) / 2;
    sunrise = noon - half;
    sunset = noon + half;
  }
  const skyMs = manual ? day0 + debug.state.hour * 3_600_000 : Date.now();
  const sky = skyAt(skyMs, sunrise, sunset, (place?.lat ?? 1) < 0);
  // Where the real stars are. The sky turns slowly, so every few seconds is often enough.
  // (Until you say where you are, it is the sky over the Faroe Islands.)
  if (!heavens || Math.abs(skyMs - heavensFor) > 4000) {
    heavensFor = skyMs;
    // Lying back takes in far more of the sky, so more of its stars are wanted.
    heavens = lying ? heavensAt(skyMs, place?.lat ?? 62, place?.lon ?? -6.8, GAZE, 0.36) : heavensAt(skyMs, place?.lat ?? 62, place?.lon ?? -6.8, LOOKING);
  }
  if (manual) {
    sky.moonPhase = debug.state.moon;
    sky.moonLit = (1 - Math.cos(TAU * sky.moonPhase)) / 2;
  }
  // The moon in the Earth's shadow, on the nights it really is (or as asked for, when trying things out).
  const eclipse = manual && debug.state.eclipse >= 0 ? earthShadowTried(debug.state.eclipse) : earthShadowAt(skyMs);
  sky.eclipsed = eclipse.shadow[3];
  const env: Env = { ...weather, sky };

  // Lightning, now and then in a thunderstorm.
  if (env.thunder > 0.5) {
    if (time > nextFlash) {
      strike();
      nextFlash = time + 6000 + Math.random() * 20_000;
    }
  } else {
    nextFlash = time + 3000;
  }
  // It flares, dips, flares again more faintly, and dies away: the strokes of one strike.
  flash = Math.max(0, flash - dt * (flash > 0.55 ? 9 : 2.2));
  const flicker = (flash > 0.55 || (flash > 0.3 && flash < 0.45) ? flash : flash * 0.3) * strikePower;

  const air = atmosphereFor(env, flicker);
  // The same hour with no cloud at all, and under full cloud: a side of the sky that is clearer or
  // cloudier than overhead is drawn part of the way to one or the other.
  const clearAir = atmosphereFor({ ...env, cloud: 0, cloudLow: 0, cloudMid: 0, cloudHigh: 0 }, flicker);
  const greyAir = atmosphereFor({ ...env, cloud: 1, cloudLow: 1, cloudMid: 0.8, cloudHigh: 0.5 }, flicker);
  const skyBy = { clear: [...clearAir.zenith, ...clearAir.skyMid, ...clearAir.horizon], grey: [...greyAir.zenith, ...greyAir.skyMid, ...greyAir.horizon], stars: clearAir.stars };
  // The hour on the wall and the date, which the place lives by. (A date asked for by hand keeps the hour asked for.)
  const wallNow = new Date();
  const wallHour = manual ? debug.state.hour : wallNow.getHours() + wallNow.getMinutes() / 60 + wallNow.getSeconds() / 3600;
  const wallDay = new Date(day0 + 12 * 3_600_000);
  // Each household lights its windows, and puts them out, in its own time.
  const windows = households.update(dt, wallHour, wallDay, darkness(sky.dayness, env.cloud, env.rain, env.snow));
  // A few words as the shadow first bites, and again when the moon is right inside it (if the moon can be seen at all).
  if (eclipse.stage > eclipseStage && air.moonVisible > 0.3) say(eclipse.stage === 2 ? 'the moon has turned to copper' : "the earth's shadow is on the moon");
  eclipseStage = eclipse.stage;

  // The view looks west: compass east is behind you (+z), south is to your left (-x).
  const windX = -env.windZ;
  const windZ = env.windX;
  const wind = Math.hypot(windX, windZ);
  const dirX = wind > 0.001 ? windX / wind : 0.6;
  const dirZ = wind > 0.001 ? windZ / wind : -0.8;
  // The fishing boat is where the hour has it: at anchor, on its way, or far out; and the puffins, if it is their season.
  const boatNow = boat.update(dt, skyMs, sunrise, sunset, { wind, windX, windZ, thunder: env.thunder });
  const puffinsNow = puffins.update(dt, wallHour, wallDay, air.lamp, env.rain);

  // Gusts cross the grass at walking pace in a breeze and far faster in a gale.
  const gustSpeed = 1.5 + 15 * wind; // metres a second
  scroll(clock.gustA, dirX, dirZ, dt * gustSpeed * 0.0045);
  scroll(clock.gustB, dirX, dirZ, dt * gustSpeed * 1.35 * 0.019);
  scroll(clock.shadow, dirX, dirZ, dt * (3 + 26 * wind) * 0.0013);
  // Clouds go with the wind up where they are, which is not the wind on the grass:
  // sideways across the view with its sideways part, and (for those overhead)
  // toward you or away with the rest. They never quite stop.
  const aloftX = -env.aloftZ; // into the scene's bearings, as with the wind on the ground
  const aloftZ = env.aloftX;
  clock.cloud[0] = wrap1(clock.cloud[0] - dt * ((aloftX < 0 ? -1 : 1) * 0.00012 + 0.0016 * aloftX));
  clock.cloud[1] = wrap1(clock.cloud[1] - dt * 0.0016 * aloftZ);
  // Weather comes from where that wind comes from (failing any wind, from ahead, out to sea).
  const aloft = Math.hypot(aloftX, aloftZ);
  const comesFrom = aloft > 0.02 ? Math.atan2(-aloftX, aloftZ) : FACING;
  // Where the dark cloud stands. Rain or snow that is really falling somewhere
  // round about stands on the side it was found, low and far off; what the
  // forecast says is about to arrive climbs from the side the wind brings it
  // from. If both are so, and the rain in sight is up the wind, it is the same
  // weather: it stands where it is seen and climbs as it nears.
  const dry = 1 - smoothstep(0.02, 0.12, env.rain + env.snow); // while it falls here the whole sky is grey already
  const seen = Math.hypot(env.aroundX, env.aroundZ);
  let standsX = Math.sin(comesFrom) * env.front;
  let standsZ = -Math.cos(comesFrom) * env.front;
  let standsSnow = env.frontSnow;
  if (seen * dry > 0.02) {
    const sx = -env.aroundZ / seen; // into the scene's bearings
    const sz = env.aroundX / seen;
    const upwind = sx * Math.sin(comesFrom) - sz * Math.cos(comesFrom) > 0.2;
    const much = upwind ? Math.max(seen * dry, env.front) : seen * dry;
    if (upwind || much >= env.front) {
      standsX = sx * much;
      standsZ = sz * much;
      standsSnow = env.front > seen ? env.frontSnow : env.aroundSnow;
    }
  }
  // It never jumps from one side of the sky to another: it sinks, and rises again.
  const turning = snapped ? 1 : 1 - Math.exp(-dt / 6);
  wall[0] += (standsX - wall[0]) * turning;
  wall[1] += (standsZ - wall[1]) * turning;
  wall[2] += (standsSnow - wall[2]) * turning;
  // (The ruffled patches on the sea are sampled at an angle; the direction is turned to match.)
  scroll(clock.sea, 0.866 * dirX - 0.5 * dirZ, 0.5 * dirX + 0.866 * dirZ, dt * (2 + 12 * wind) * 0.0035);
  // Each wave train moves at the speed real water gives a wave of its length.
  WAVE_LENGTHS.forEach((length, i) => {
    clock.waves[i] = ((time / 1000) * 0.6 * Math.sqrt((9.8 * TAU) / length)) % TAU;
  });
  clock.flutter = (clock.flutter + dt * (1.6 + 3.5 * wind)) % TAU;
  clock.twinkle = (clock.twinkle + dt * 0.5) % TAU;
  clock.rain = wrap1(clock.rain + dt * 0.085 * (0.8 + 0.5 * env.rain));
  clock.snow = wrap1(clock.snow + dt * 0.011);
  clock.fall = wrap1(clock.fall + dt * 0.55);
  clock.lap = wrap1(clock.lap + dt * 0.035);
  clock.fine = (clock.fine + dt * 0.9) % TAU;
  // The washing: out while it is dry and will stay dry for a couple of hours yet; taken in when rain or
  // snow is an hour or two off (by the quarter-hour forecast, or by the hours ahead). A piece at a time.
  {
    let dry = env.rain < 0.02 && env.snow < 0.02 && env.front < 0.3;
    if (dry && !manual) {
      const soon = live ? live.hours.filter((h) => h.time + 3_600_000 > Date.now()).slice(0, 3) : [];
      dry = !!live && !soon.some((h) => h.precip >= 0.1 || h.snowfall > 0.05);
    }
    const wanted = dry ? WASHING : 0;
    // (What is already so when the page opens is simply so: nobody is seen pegging it out.)
    if (!washKnown && (live || manual)) {
      washKnown = true;
      washOut = wanted;
    }
    washOut += Math.max(-dt / 0.8, Math.min(dt / 0.8, wanted - washOut));
    washMoving = washOut !== wanted;
  }
  // The surf follows the wind as a sea does. In a calm it only laps; a breeze
  // raises small breakers; a gale brings waves taller than you are. A sea does
  // not answer the wind at once: it builds over a minute or two of blowing and
  // dies away more slowly when the wind drops. Thunder brings its own squalls.
  // (Rain by itself raises no waves.)
  const seaWants = Math.min(1.25, 0.16 + 1.02 * wind ** 1.15 + 0.1 * env.thunder);
  surfSize += (seaWants - surfSize) * (snapped ? 1 : 1 - Math.exp(-dt / (manual ? 2.5 : seaWants > surfSize ? 90 : 240)));
  // A wave lands every four or five seconds; the bigger they are, a little sooner.
  const surfBefore = clock.surf;
  clock.surf = wrap1(clock.surf + dt / (9.5 - 2.3 * Math.min(1, surfSize)));
  // COMBERS: every wave that sets out is a new wave, with a character of its own. (The first of the
  // two sets out as the clock comes round, the second half way through.)
  if (clock.surf < surfBefore) surfWaves += 2;
  clock.combers = [...comber(surfWaves), ...comber(surfWaves - 1 + (clock.surf >= 0.5 ? 2 : 0))];
  clock.pulse = (clock.pulse + dt * 0.9) % TAU;
  clock.smoke = wrap1(clock.smoke + dt * 0.045);
  clock.bird = wrap1(clock.bird + dt * 0.011);
  clock.flap = (clock.flap + dt * 5) % TAU;
  clock.beacon = wrap1(clock.beacon + dt / 7);
  clock.flame = wrap1(clock.flame + dt * 0.85);
  clock.spark = wrap1(clock.spark + dt * 0.3);
  clock.note = wrap1(clock.note + dt * 0.1);
  clock.shimmer = wrap1(clock.shimmer + dt * 0.16);
  clock.aurora = wrap1(clock.aurora + dt * 0.012);

  // What the pointer is resting on. (Checked every frame, because the picture
  // can slide under a pointer that is holding still.) The stone's carving
  // brightens under it.
  const under = pointer.onScene ? landscape.thingAt(pointer.x, pointer.y) : null;
  // (Indoors it rests on the room: on the lamp, the window, or the wall that lets you out again.)
  roomSpot = indoors && pointer.onScene ? landscape.roomAt(pointer.x, pointer.y) : null;
  // Failing those, perhaps a star: on a clear night they can be joined into their figures.
  const overSky = pointer.onScene && !under && !notes.isOpen() && !indoors;
  starlight = air.stars;
  const skyMarks = starPlay.update(time, overSky ? [pointer.x, pointer.y] : null, heavens, starlight, lying);
  // Standing up, the open sky itself can be clicked: you lie back to watch the clouds, or the stars.
  // (Asked of the picture only a few times a second, and only when the pointer has moved.)
  if (overSky && !lying) {
    if (time - skyAsked.at > 200 && Math.hypot(pointer.x - skyAsked.x, pointer.y - skyAsked.y) > 3) {
      // (The sea can be clicked as well: a stone is thrown to skip across it.)
      skyAsked = { at: time, x: pointer.x, y: pointer.y, open: landscape.kindAt(pointer.x, pointer.y).kind !== 'other' };
    }
  } else {
    skyAsked.open = false;
    skyAsked.x = -99;
  }
  // (Down on the beach everything answers a click: the water, the sky, and the land behind, which takes you back up.)
  const pointing = indoors ? roomSpot !== null && (seated || (roomSpot !== 'window' && roomSpot !== 'thing')) : !!under || skyMarks.pointing || skyAsked.open || (ashore && !lying && pointer.onScene) || (!ashore && !lying && pointer.onScene && (kite.over(pointer.x, pointer.y) || fishing.overMeadow(pointer.x, pointer.y)));
  if (pointing !== wasPointing) canvas.style.cursor = pointing ? 'pointer' : '';
  wasPointing = pointing;
  overStone = under === 'stone';

  // On a starry night, now and then, a shooting star.
  if (meteor[3] >= 0) {
    meteor[3] += dt / 0.75;
    if (meteor[3] >= 1) meteor[3] = -1;
  } else if (air.stars > 0.35 && time > nextMeteor) {
    const leftward = Math.random() < 0.5;
    meteor[0] = -0.19 + (Math.random() - 0.5) * 1.1;
    meteor[1] = lying ? 0.5 + Math.random() * 0.45 : 0.2 + Math.random() * 0.18; // higher up when you are on your back
    meteor[2] = leftward ? Math.PI + 0.35 + Math.random() * 0.5 : -0.35 - Math.random() * 0.5;
    meteor[3] = 0;
    // On the nights of a real meteor shower there are many more, and they all
    // streak away from the same point in the sky, as that shower's really do.
    const shower = heavens?.shower;
    const high = shower ? Math.max(0.15, shower.radiant[1]) : 0; // fewer while its radiant is low
    if (shower && Math.random() < shower.strength / (shower.strength + 0.12)) {
      const from = [Math.atan2(shower.radiant[0], -shower.radiant[2]), Math.asin(Math.max(-1, Math.min(1, shower.radiant[1])))];
      const across = Math.atan2(Math.sin(meteor[0] - from[0]), Math.cos(meteor[0] - from[0]));
      meteor[2] = Math.atan2(meteor[1] - from[1], across);
    }
    nextMeteor = time + (30_000 + Math.random() * 70_000) / (1 + 10 * (shower?.strength ?? 0) * high);
  }

  // The fire keeps the time.
  const fire = focus.update();
  const title = fire.phase === 'burning' ? `${fire.minutesLeft} min · nightpond` : fire.phase === 'embers' ? 'resting · nightpond' : 'nightpond';
  // Rain, snow, lightning, a shooting star, lying back or reading all want smooth motion; a quiet scene does not.
  lively = env.rain > 0.03 || env.snow > 0.03 || flash > 0 || meteor[3] >= 0 || lying || notes.isOpen() || postcardDue || skipping.inFlight() || carving || settled < 2 || stacking.busy() || washMoving;
  if (tasks.busy() || reminders.busy() || almanac.busy()) lively = true;
  if (document.title !== title) document.title = title;
  // The carving spells what is written: when the words change, the signs that no longer fit are cut again.
  carve(notes.text(), dt);
  // The carving brightens under the pointer and while you are at the stone, and flickers at each key you strike.
  const reading = notes.isOpen();
  // When the work is done the whole carving swells once, slowly, and settles.
  const swell = settled < 4 ? 0.9 * (1 - Math.exp(-settled / 0.25)) * Math.exp(-settled / 0.9) : 0;
  stoneLit += ((overStone || reading ? 1 : 0) + 0.7 * notes.spark() + swell - stoneLit) * (1 - Math.exp(-dt * (reading ? 14 : 5)));
  landscape.leanIn(reading);
  if (document.body.classList.contains('reading') !== reading) document.body.classList.toggle('reading', reading);

  const g = Math.floor((time / 1000) * GRASS_FRAMES);
  if (g !== grassFrame) {
    grassFrame = g;
    shown.gustA = [...clock.gustA];
    shown.gustB = [...clock.gustB];
    shown.shadow = [...clock.shadow];
    shown.flutter = clock.flutter;
    shown.fall = clock.fall;
    shown.smoke = clock.smoke;
    shown.flame = clock.flame;
    shown.note = clock.note;
    shown.shimmer = clock.shimmer;
    shown.aurora = clock.aurora;
    shown.surf = clock.surf;
    shown.combers = [...clock.combers];
  }
  const w = Math.floor((time / 1000) * WATER_FRAMES);
  if (w !== waterFrame) {
    waterFrame = w;
    shown.sea = [...clock.sea];
    shown.waves = [...clock.waves];
    shown.lap = clock.lap;
    shown.fine = clock.fine;
    shown.twinkle = clock.twinkle;
  }
  // (FISHING: out in the boat you move with the water, so there the water moves every frame too: a sea that
  // went in steps under a boat that rocked smoothly would jerk against her side.)
  if (afloat) {
    shown.sea = [...clock.sea];
    shown.waves = [...clock.waves];
    shown.lap = clock.lap;
    shown.fine = clock.fine;
    shown.twinkle = clock.twinkle;
  }
  // Slow things, and things that fall or fly, move every frame.
  shown.cloud = clock.cloud;
  shown.rain = clock.rain;
  shown.snow = clock.snow;
  shown.pulse = clock.pulse;
  shown.bird = clock.bird;
  shown.flap = clock.flap;
  shown.beacon = clock.beacon;
  shown.spark = clock.spark;

  // The northern lights: as strong as the real ones are from where you are (or as asked for, when trying things out).
  const lightsWanted = manual && debug.state.aurora >= 0 ? debug.state.aurora : auroraFrom(kp, place?.lat ?? 62, place?.lon ?? -6.8);
  northernLights += (lightsWanted - northernLights) * (1 - Math.exp(-dt / (manual ? 1 : 40)));
  // The sea glowing: on a dark, mild night in the warm half of the year, and then only on some nights (or as asked for, when trying things out).
  const glowWanted = manual && debug.state.glow >= 0 ? debug.state.glow : seaGlowFor(skyMs, (place?.lat ?? 62) < 0, env.sky.height, sky.moonLit * air.moonVisible, env.temp);
  seaGlow += (glowWanted - seaGlow) * (1 - Math.exp(-dt / (manual ? 1.5 : 90)));
  // The tide, from where the moon really is over the place you are (or held where asked, when trying things out).
  // (It is eased toward, so that a clock moved by hand does not make the sea jump.)
  const tideNow = manual && debug.state.tide >= -1 ? tideHeld(debug.state.tide) : tideAt(skyMs, place?.lon ?? -6.8);
  const settle = 1 - Math.exp(-dt / 1.5);
  tide = { ...tideNow, level: tide.level + (tideNow.level - tide.level) * settle, high: tide.high + (tideNow.high - tide.high) * settle, damp: tide.damp + (tideNow.damp - tide.damp) * settle };
  sights.sea(tide.level);
  const skip = skipping.update(time);
  // The bottles on the beach, and any on its way out to sea; their rings go on the water with the stone's.
  const bottlesNow = bottles.update(time, dt, { ashore: ashore && !afloat, meadow: !ashore && !lying && !reading && !indoors, tide: tide.level }, skip.ripples);
  if (bottles.moving()) lively = true;
  const fireLook = fireShow.update(fire, dt, under === 'fire');
  // The name of the tune hangs just above the gramophone.
  const musicPlaying = music.update(dt, under === 'music' && !reading, landscape.pageAt(musicTop));
  // Each task written on the stone is a lantern by the path; the words of the one under the pointer hang over it.
  const overLantern = under === 'lantern' ? landscape.lantern : -1;
  const lanterns = tasks.update(dt, { reading, pointed: overLantern, at: overLantern >= 0 ? landscape.pageAt(lanternTops[overLantern]) : null, wind: [windX, windZ], lamp: air.lamp });
  // A line on the stone that begins with a time is kept for that time; and at the stone, what the place remembers hangs by it.
  reminders.update();
  almanac.hang(reading ? [landscape.pageAt(ALMANAC_OVER), landscape.pageAt(ALMANAC_UNDER)] : null);
  const snowCover = 1 - Math.exp(-env.snowDepth / 0.02);
  // Hoarfrost on a freezing morning, dew on a mild damp one (or as much of either as is asked for, when trying things out).
  const rime = rimeFor(env, snowCover);
  if (manual && debug.state.frost >= 0) rime.frost = debug.state.frost;
  if (manual && debug.state.dew >= 0) rime.dew = debug.state.dew;
  rimeNow = rime;
  // The ground round the fire warms in half a minute and takes minutes to cool,
  // so the snow melts back from a fire and creeps in again once it is out
  // (sooner if more is falling).
  const heat = Math.min(1, fireLook.flame + 0.35 * fireLook.embers);
  warmth += (heat - warmth) * (1 - Math.exp(-dt * (heat > warmth ? 0.09 : 0.006 + 0.03 * env.snow)));
  // The lamb walks on the snow, sinking in a little.
  const friendThere = friend.update(dt, fire.phase, under === 'friend', { rain: env.rain, snow: env.snow, wind, temp: env.temp, heat: air.heat, ashore, stone: skip.stone });
  // (It is seen only from where it is: by the fire from the meadow, on the shingle from the beach.)
  const friendPose = friendThere && friendThere.ashore === ashore ? friendThere : null;
  if (friendPose) friendPose.y += env.snowDepth * 0.7 * (1 - thawAt(friendPose.x, friendPose.z, warmth));
  // It grows, over the weeks, with the days it spends by your fire and the work you see out together.
  if (friendPose) friendPose.grow = 1 + 0.32 * bond.grown();
  if (friend.state() === 'resting') bond.together();
  if (lastPhase === 'burning' && fire.phase === 'embers' && friendThere) bond.session();
  if (lastPhase === 'burning' && fire.phase === 'embers') almanac.saw('fire');
  lastPhase = fire.phase;
  // Its name (if the stone gives it one) shows when you point at it; what it says, when you click it.
  const lambAt = friendPose && !reading ? landscape.pageAt([friendPose.x, friendPose.y + 1.2 * friendPose.grow, friendPose.z], ashore) : null;
  const speaking = time < lambSaysUntil;
  const showLamb = !!lambAt && (speaking || under === 'friend');
  if (lambAt) {
    lambEl.style.left = `${Math.round(lambAt[0])}px`;
    lambEl.style.top = `${Math.round(lambAt[1])}px`;
    const words = speaking ? lambSays : bond.about();
    if (showLamb) setWords(lambEl, words);
  }
  lambEl.classList.toggle('shown', showLamb);
  moment = { hour: new Date().getHours() + new Date().getMinutes() / 60, rain: env.rain, snow: env.snow, heat: air.heat, stars: air.stars, phase: fire.phase, logs: fire.logs, wind, temp: env.temp, fog: env.fog, thunder: env.thunder, ashore };

  // What you hear follows the same weather as what you see.
  sound.update(dt, {
    rain: env.rain,
    snow: snowCover,
    fog: env.fog,
    flame: fireLook.flame,
    embers: fireLook.embers,
    music: musicPlaying,
    indoors: indoors ? 1 : 0,
    // (The fire is up in the meadow: it is not heard from the beach, nor from the boat.)
    afar: afloat ? 2 : ashore ? 1 : 0,
    heat: air.heat,
    // Crickets on a warm dry night with no snow about.
    crickets: Math.max(0, Math.min(1, (env.temp - 12) / 8)) * (1 - sky.dayness) * (1 - Math.min(1, env.rain * 3)) * (1 - snowCover),
  });

  // The almanac keeps what is seen from here: snow, the northern lights, a full moon, a meteor shower, the turns of the year.
  almanac.watch({ south: (place?.lat ?? 1) < 0, snow: env.snow, snowDepth: env.snowDepth, lights: northernLights, stars: air.stars, moonPhase: sky.moonPhase, moonSeen: air.moonVisible, shower: heavens?.shower ?? null, best: skipping.best() });

  // While H is held: a few words over each thing, wherever the picture has slid it to.
  if (guide.held()) {
    const over = (p: [number, number, number], lift = 0): [number, number] | null => landscape.spotOnPage([p[0], p[1] + lift, p[2]]);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const sayings: Saying[] = [];
    if (lying) {
      sayings.push({ at: [w / 2, h * 0.5], words: 'the sky', more: 'click a marked star, then the next, to join them · click empty sky to sit up', fixed: true });
    } else if (indoors) {
      const room = landscape.roomOnPage();
      sayings.push({ at: room.lamp, words: 'the lamp', more: lampLit ? 'click to put it out' : 'click to light it' });
      sayings.push({ at: room.window, words: 'the window', more: 'the weather is on the other side of it' });
      sayings.push({ at: room.wall, words: 'the wall · click it to step back out · esc does the same', fixed: true, keys: true });
    } else if (afloat) {
      sayings.push({ at: [w * 0.5, h * 0.42], words: 'the water', more: 'click to drop your line there · click again when the float goes under', fixed: true });
      sayings.push({ at: [w * 0.5, h * 0.8], words: 'the boat', more: 'click her to row home · esc does the same', fixed: true });
      sayings.push({ at: [w * 0.5, h * 0.14], words: 'look about you', more: 'move the pointer toward either side to turn your head that way', fixed: true });
    } else if (ashore) {
      const ahead: [number, number, number] = [SHORE_EYE[0] + Math.sin(FACING) * 24, 0, SHORE_EYE[2] - Math.cos(FACING) * 24];
      sayings.push({ at: over(fishing.boatAt(), 1.3), words: 'the boat', more: fishing.fair() ? 'click her to row out and fish' : 'hauled up: the weather is against her' });
      sayings.push({ at: over(ahead), words: 'the water', more: 'click to throw a stone · click again just as it touches' });
      const bottle = bottles.state();
      if (bottle.fresh) sayings.push({ at: bottle.freshOnPage, words: 'a bottle', more: 'click to write to a later day' });
      sayings.push({ at: over(stacking.topAt()), words: 'stones to stack', more: 'click to lift one · click again to set it down · drag across them to knock them over' });
      if (bottle.washed) sayings.push({ at: bottle.washedOnPage, words: 'a bottle has come back', more: 'click to read it' });
      if (lambAt) sayings.push({ at: lambAt, words: 'the lamb', more: 'click to say hello' });
      sayings.push({ at: [w / 2, h * 0.12], words: 'the sky', more: 'click to lie back and look', fixed: true });
      sayings.push({ at: [w * 0.5, h - 12], words: 'the land · click it to walk back up · esc does the same', fixed: true, keys: true });
    } else {
      const top = stoneFace.length === 4 ? ([(stoneFace[2][0] + stoneFace[3][0]) / 2, stoneFace[2][1], (stoneFace[2][2] + stoneFace[3][2]) / 2] as [number, number, number]) : null;
      if (top) sayings.push({ at: over(top, 0.5), words: 'the stone keeps what you write', more: 'lamb: a name · 15:00 a reminder · - a task' });
      sayings.push({ at: over(fireHeart, 1.7), words: 'the fire keeps time', more: 'click to light it · again to put it out' });
      if (fishing.list().length) sayings.push({ at: over(fishing.rackAt(), 1.5), words: 'the catch', more: 'click a fish to cook it over the fire · click it again to eat it' });
      sayings.push({ at: over(musicTop, 0.3), words: 'the gramophone', more: 'click to play or pause · shift-click skips' });
      const k = kite.where();
      // (The kite is only out when there is wind for it.)
      if (k.there) sayings.push({ at: over(k.at, k.up ? 2.2 : 1.6), words: 'a kite', more: k.up ? 'click to wind it in' : 'click to send it up' });
      if (lambAt) sayings.push({ at: lambAt, words: 'the lamb', more: 'click to say hello' });
      const first = tasks.list().places.findIndex((p) => p.there > 0.5);
      // (Under its lantern, so as not to hang in front of the fire.)
      if (first >= 0) sayings.push({ at: over(lanternTops[first], -1.25), words: 'a task', more: 'click it when it is done', below: true });
      sayings.push({ at: over([HOUSE_SHAPES[0].x, HOUSE_SHAPES[0].top, HOUSE_SHAPES[0].z], 1.2), words: 'the nearest house', more: 'click to go indoors' });
      sayings.push({ at: over([-150, 0, -560]), words: 'the sea', more: 'click to go down to the shore' });
      sayings.push({ at: [w / 2, h * 0.12], words: 'the sky', more: 'click to lie back and look', fixed: true });
      sayings.push({ at: [w * 0.5, h - 12], words: 'f full screen · m sound · p postcard · e keep everything · i bring it back · esc step back', fixed: true, keys: true });
    }
    // (Each sound has its own loudness, set by scrolling over the thing that makes it.)
    sayings.push({ at: [w * 0.5, h - 40], words: indoors ? 'scroll over the window to turn the rain and thunder up or down' : ashore || lying ? 'scroll over the sky to turn the rain and thunder up or down' : 'scroll over the fire, the sky, the grass or the far church to turn its sound up or down', fixed: true, keys: true });
    if (!lying) {
      // (The corner of the window has something to say for itself too.)
      // It sits straight under whatever the corner is showing just now, ranged left with it: under the time alone,
      // or under the lines that come when the pointer is there. (It follows them down and up smoothly; but when
      // the guide first shows, it is simply there.)
      const corner = clockEl.getBoundingClientRect();
      let foot = corner.bottom;
      for (const line of hudEl.querySelectorAll<HTMLElement>('#more > *')) {
        const box = line.getBoundingClientRect();
        const look = getComputedStyle(line);
        if (box.height > 1 && look.visibility !== 'hidden' && Number(look.opacity) > 0.3) foot = Math.max(foot, box.bottom);
      }
      cornerFoot = guideShowing ? cornerFoot + (foot - cornerFoot) * (1 - Math.exp(-dt * 9)) : foot;
      sayings.push({ at: [corner.left, cornerFoot + 10], words: 'the day, the weather, your place', more: 'rest the pointer in this corner', fixed: true, corner: true });
    }
    guide.place(sayings);
    guideShowing = true;
  } else guideShowing = false;
  // The small things that come and go: the kite; what the calendar hangs on the village; and, rarely, something passing.
  const extras = kite.update(time, dt, { windX, windZ, wind, thunder: env.thunder, pointer: pointer.onScene ? (pointer.x / window.innerWidth) * 2 - 1 : 0 });
  dressFor(extras, skyMs, { lamp: air.lamp, sunUp: env.sky.height > 0, windX, windZ, wind, time });
  sights.draw(extras, skyMs, time, sunrise, sunset, wind > 0.75);
  // FISHING: the rowing boat at her mooring or out on the bay, the line, and the catch by the fire (see fishing.ts).
  const around: FishingAround = {
    ashore,
    meadow: !ashore && !lying && !reading && !indoors,
    wind,
    thunder: env.thunder,
    fog: env.fog,
    sea: surfSize,
    waves: shown.waves,
    surf: shown.surf,
    combers: shown.combers,
    tide: tide.level,
    light: air.lightDir,
    dark: air.lamp,
    flame: fireLook.flame,
    embers: fireLook.embers,
    hour: wallHour,
    rain: env.rain,
    eye: landscape.eye,
    look: pointer.onScene ? [(pointer.x / window.innerWidth) * 2 - 1, 1 - (pointer.y / window.innerHeight) * 2] : [0, 0],
  };
  fishAround = around;
  const fishNow = fishing.update(dt, time, around);
  const fishThings = fishing.draw(extras, around, time);
  fishing.ripples(skip.ripples, time);
  if (fishNow.lively) lively = true;
  if (fishNow.home && afloat) goAfloat(false);
  // The stones stacked on the beach, with the weather on them: the wind as it crosses your view there, and how
  // far up the stones the water has run just now (the same sum the picture's own wash is drawn from).
  let stacked: number[] = [];
  if (ashore && !lying && !afloat) {
    const step = (a: number, b: number, x: number) => {
      const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
      return u * u * (3 - 2 * u);
    };
    const ranUp = (life: number) => step(0.58, 0.7, life) * (1 - step(0.72, 1, life));
    // (The picture's wash runs unevenly along the beach, up to a quarter further in places: it is taken at the further.)
    const reach = tide.level + 1.2 * Math.max(ranUp(shown.surf) * (0.14 + 0.34 * surfSize * 1.16 * shown.combers[0]), ranUp((shown.surf + 0.5) % 1) * (0.14 + 0.34 * surfSize * 1.16 * shown.combers[4]));
    stacked = stacking.draw(time, dt, { wind, push: windX * Math.cos(FACING) + windZ * Math.sin(FACING), reach });
  } else stacking.cancel(); // a stone in the hand is put back if you leave
  if (pointer.onScene && !lying && !indoors && sights.over(pointer.x, pointer.y)) sights.seen(skyMs);
  // The room indoors: the lamp comes up or dies down over a moment; the weather is on the glass.
  lampNow += ((lampLit ? 1 : 0) - lampNow) * (1 - Math.exp(-dt * 2.2));
  if (Math.abs((lampLit ? 1 : 0) - lampNow) < 0.004) lampNow = lampLit ? 1 : 0;
  else if (indoors) lively = true;
  const cold = Math.max(0, Math.min(1, (9 - env.temp) / 14));
  // What is going on in there: the stove, the kettle, the cat, the curtains.
  const life = roomLife.update(indoors ? dt : 0);
  const wipedNow = roomLife.wipedNow();
  if (wipedNow) landscape.setWiped(wipedNow);
  const room = {
    // (And the hourglass on the table runs with the campfire's half hour: its sand is what is left of it.)
    life,
    sand: fire.phase === 'burning' ? Math.max(0.001, Math.min(1, (fire.minutesLeft - 0.5) / 25)) : -1,
    dayIn: air.ambient.map((c, i) => Math.min(1, c * 1.05 + air.lightCol[i] * 0.4)),
    night: air.lamp,
    lamp: lampNow,
    // Rain on the panes; frost when it is well below freezing; snow lying on the ledge; and mist, when it is cold or wet out.
    glass: [Math.min(1, env.rain * 1.2), Math.max(rime.frost * 0.45, Math.max(0, Math.min(1, (-2 - env.temp) / 16))), Math.min(1, snowCover), Math.min(1, Math.max(cold * 0.75 + env.rain * 0.3, 0.2 + 0.8 * life.fog))],
    hands: [((wallHour % 12) / 12) * TAU, (wallHour % 1) * TAU],
    time: Math.floor(((time / 1000) % 3600) * 12) / 12,
    flick: Math.floor(((time / 1000) % (TAU * 4)) * 6) / 6,
  };
  // (A lamp left lit shows in that house's window from the meadow, once it is dark enough to tell.)
  const windowsNow = windows.slice();
  windowsNow[0] = Math.max(windowsNow[0], lampNow * Math.min(1, air.lamp * 1.5));
  landscape.draw({
    air,
    dt,
    sky: skyMarks,
    stoneLit,
    signs,
    fire: fireLook,
    friend: friendPose,
    music: musicPlaying,
    meteor,
    layers: [env.cloudLow, env.cloudMid, env.cloudHigh],
    front: [Math.atan2(wall[0], -wall[1]), Math.hypot(wall[0], wall[1]), wall[2], Math.max(-1, Math.min(1, aloftX * 8))],
    aurora: northernLights,
    coverBy,
    shadow: eclipse.shadow,
    skyBy,
    stone: skip.stone,
    ripples: skip.ripples,
    bottles: bottlesNow,
    kite: extras,
    bolt: [bolt[0], bolt[1], bolt[2], flicker],
    boltKind,
    windX,
    windZ,
    rain: env.rain,
    snowfall: env.snow,
    // A couple of centimetres whitens most of the ground; the rest is how deep it lies.
    snowCover,
    melt: warmth,
    snowDepth: env.snowDepth,
    cloud: env.cloud,
    temp: env.temp,
    rime,
    moonLit: sky.moonLit,
    heavens,
    clock: shown,
    yard: {
      out: washOut,
      // (The guttering of a low flame is a number that jumps eight times a second.)
      storm: [battery.level, battery.charging ? 1 : 0, battery.has ? 1 : 0, Math.abs(Math.sin(Math.floor(time / 125) * 12.9898) * 43758.5453) % 1],
      time: Math.floor(((time / 1000) % 3600) * 12) / 12,
    },
    surfSize,
    skiff: { eye: fishNow.eye, tilt: fishNow.tilt, boat: fishNow.boat, wet: fishNow.wet, lamp: fishNow.lamp, sea: fishNow.swell, things: fishThings },
    seaGlow,
    tide,
    stacked,
    lanterns,
    ...almanac.stones(dt),
    windows: windowsNow,
    doorLamps: households.lanterns(),
    room,
    boat: boatNow,
    puffins: puffinsNow,
  });

  if (postcardDue) {
    postcardDue = false;
    takePostcard(); // straight after drawing, while the picture is still in hand
  }

  // The text follows the sky: dark ink on a bright day, pale ink at night.
  if (time - lastInk > 1000) {
    lastInk = time;
    // It is judged from the picture itself, where the words lie: so a dark day of cloud or rain gets pale ink
    // at noon, and a bright bank of cloud gets dark ink. (It takes a clear difference to change it back, so
    // that a cloud drifting behind the words does not set them flickering.)
    const hud = document.getElementById('hud')?.getBoundingClientRect();
    const high = hud ? landscape.brightUnder(hud.left, hud.top, hud.left + Math.max(hud.width, 240), hud.top + Math.max(hud.height, 96)) : null;
    const low = landscape.brightUnder(window.innerWidth * 0.2, window.innerHeight * 0.82, window.innerWidth * 0.8, window.innerHeight * 0.98);
    if (high !== null) inkDark.high = high > (inkDark.high ? 0.17 : 0.27);
    if (low !== null) inkDark.low = low > (inkDark.low ? 0.17 : 0.27);
    const PALE = '244, 246, 252';
    const DARK = '18, 25, 40';
    document.documentElement.style.setProperty('--ink', inkDark.high ? DARK : PALE);
    document.documentElement.style.setProperty('--ink-high', inkDark.high ? DARK : PALE);
    document.documentElement.style.setProperty('--ink-low', inkDark.low ? DARK : PALE);
  }
  // The words that hang over a thing in the scene (the tune over the gramophone, what the lamb says, a
  // passing word) are each judged by what is behind that very label, not by the foot of the picture: the
  // tune's name lies across a dark wall when the grass at your feet is bright, and dark ink is lost on it.
  if (time - lastLabelInk > 300) {
    lastLabelInk = time;
    for (const el of document.querySelectorAll<HTMLElement>('#tune, #lamb-word, #word, #task-word, #music-form')) {
      const box = el.getBoundingClientRect();
      if (indoors || box.width < 4 || box.height < 4 || !el.textContent?.trim()) {
        if (el.dataset.ink) {
          delete el.dataset.ink;
          el.style.removeProperty('--ink');
        }
        continue;
      }
      const stands = landscape.inkUnder(box.left, box.top, box.right, box.bottom);
      if (stands === null) continue;
      // Whichever ink stands out better against the worst of what is behind it. (It takes a clear
      // advantage to change over, so the words never flicker between the two.)
      const was = el.dataset.ink;
      const dark = was === 'dark' ? stands.dark * 1.25 > stands.pale : was === 'pale' ? stands.dark > stands.pale * 1.25 : stands.dark > stands.pale;
      if (el.dataset.ink !== (dark ? 'dark' : 'pale')) {
        el.dataset.ink = dark ? 'dark' : 'pale';
        el.style.setProperty('--ink', dark ? '18, 25, 40' : '244, 246, 252');
      }
    }
  }
}
requestAnimationFrame(loop);

// ---- looking around, and the stone ---------------------------------------------------

// When a line naming the lamb is found as you stand back from the stone, it
// lifts off the stone and drifts away, and the name is the lamb's from then on.
const awayEl = $('name-away');
function nameTheLamb(named: Named): void {
  bond.setName(named.name);
  almanac.saw('named', named.name);
  awayEl.textContent = named.line;
  awayEl.style.left = `${Math.round(named.x)}px`;
  awayEl.style.top = `${Math.round(named.y)}px`;
  awayEl.style.fontSize = `${named.size}px`;
  awayEl.classList.remove('going');
  void awayEl.offsetWidth; // so that the drift starts afresh if it was still going
  awayEl.classList.add('going');
  // If the lamb is by the fire, it answers to it once you are back on your feet.
  lambSays = `${named.name}. that is me.`;
  lambSaysUntil = lastTime + 5200;
}
const notes = createNotes(nameTheLamb);
const focus = createFocus();
const roomLife = createIndoors(say);
const music = createGramophone();
const friend = createCompanion();
const households = createHouseholds();
const boat = createBoat();
const puffins = createPuffins(perches.length);
const bond = createBond();
// A naming line left on the stone from before is taken up quietly at the start.
const leftOver = notes.takeNaming();
if (leftOver) bond.setName(leftOver.name);
// What is already written is already carved: nothing is recut when the page opens.
carvedFor = notes.text();
wanted = spelling(carvedFor);
for (let k = 0; k < SIGNS; k++) signs[k * 3] = signs[k * 3 + 1] = wanted[k];
const skipping = createSkipping(say);
const bottles = createBottles(say, landscape);
const kite = createKite(say, (corners, x, y) => landscape.covers(corners, x, y));
const fishing = createFishing(say, (corners, x, y) => landscape.covers(corners, x, y));
// Stones to stack, down on the beach.
const stacking = createStacking(say, (corners, x, y) => landscape.covers(corners, x, y));
// Hold H, and the place says what each thing is for.
const guide = createGuide((x0, y0, x1, y1) => landscape.inkUnder(x0, y0, x1, y1));
window.addEventListener('keydown', (e) => {
  const at = e.target;
  const typing = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || (at instanceof HTMLElement && at.isContentEditable);
  if (typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'h') return;
  guide.hold(true);
});
window.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'h') guide.hold(false);
});
window.addEventListener('blur', () => guide.hold(false));
// (A rare sight, once looked at, goes into the almanac.)
const sights = createSights(say, (corners, x, y) => landscape.covers(corners, x, y), (_kind, words) => almanac.saw('sight', words));
// The stone's other work: tasks as lanterns by the path, reminders kept for their time, and the almanac of what has been seen.
const tasks = createTasks(notes);
const reminders = createReminders(notes, () => sound.chime(1), say, (p) => landscape.pageAt(p));
// What goes with finishing a task: how many are left is said, Z puts one back, and the day's record is kept.
const doing = createDoing(notes, tasks, say);
const almanac = createAlmanac(say, () => (debug.state.manual ? debug.state.days : null));
if (leftOver) almanac.saw('named', leftOver.name);
// The northern lights follow the real thing: asked of the space weather service every twenty minutes.
const askKp = () => void fetchKp().then((got) => (kp = got ?? kp));
askKp();
window.setInterval(askKp, 20 * 60_000);
const lambEl = $('lamb-word');
const sound = createSound();
// Finishing a figure in the stars is answered with a shooting star.
const starPlay = createStarPlay(landscape, () => {
  nextMeteor = lastTime + 900;
});
const fireShow = createFireShow();

// The picture is larger than the window. Moving the pointer slides it a little
// that way, as if you had turned your head; when the pointer leaves, it centres again.
const pointer = { x: 0, y: 0, onScene: false };
window.addEventListener('pointermove', (e) => {
  hudVisit(e.clientX, e.clientY);
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.onScene = e.target === canvas;
  // Indoors, a press dragged across the window is a finger on the misted glass. (The view holds still
  // meanwhile, or the glass would slide away from under the finger.)
  if (wiping) {
    roomLife.wipe(...landscape.onGlass(e.clientX, e.clientY), false);
    return;
  }
  landscape.lookToward((e.clientX / window.innerWidth) * 2 - 1, 1 - (e.clientY / window.innerHeight) * 2);
});
let wiping = false;
/** Where the pointer was last pressed on the picture: a click that has travelled from there was a drag (a wipe of the glass), not a click. */
let pressedAt: [number, number] | null = null;
canvas.addEventListener('pointerdown', (e) => {
  pressedAt = [e.clientX, e.clientY];
  if (!indoors || landscape.roomAt(e.clientX, e.clientY) !== 'window') return;
  wiping = true;
  roomLife.wipe(...landscape.onGlass(e.clientX, e.clientY), true);
});
window.addEventListener('pointerup', () => {
  wiping = false;
  roomLife.wipeEnd();
});
document.documentElement.addEventListener('pointerleave', () => {
  pointer.onScene = false;
  landscape.lookToward(0, 0);
});
// On the beach, a press dragged across the stacked stones knocks them over the way it went.
// (The click that ends such a drag is not a click on anything.)
let sweep: { x: number; y: number; done: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  sweep = ashore && !afloat && !lying && e.button === 0 ? { x: e.clientX, y: e.clientY, done: false } : null;
});
canvas.addEventListener('pointermove', (e) => {
  if (!sweep || sweep.done || !(e.buttons & 1) || Math.abs(e.clientX - sweep.x) < 14) return;
  if (stacking.knock(e.clientX, e.clientY, Math.sign(e.clientX - sweep.x))) sweep.done = true;
});
canvas.addEventListener('click', (e) => {
  if (sweep?.done) {
    sweep = null;
    return;
  }
  if (notes.justClosed()) return; // that click was you standing back from the stone
  if (bottles.justClosed()) return; // or putting away what a bottle holds
  if (skipping.inFlight()) {
    skipping.tap(lastTime); // a stone is out on the water: the click is for its next skip
    return;
  }
  if (lying) {
    // On your back: a click on a star joins it; a click on empty sky sits you up again.
    if (!starPlay.click(lastTime, heavens, e.clientX, e.clientY, starlight)) lieBack(false);
    return;
  }
  if (afloat) {
    // FISHING: out in the boat, the water takes your line (or the fish, if one is on it); the boat herself takes you home.
    const there = landscape.kindAt(e.clientX, e.clientY);
    if (fishAround && fishing.clickAfloat(there.kind, there.spot, fishAround, lastTime)) goAfloat(false);
    return;
  }
  if (indoors) {
    // In the room: the lamp is lit or put out; the wall lets you out again; the window is only for looking through.
    const spot = landscape.roomAt(e.clientX, e.clientY);
    if (spot === 'lamp') lightLamp(!lampLit);
    else if (spot === 'stove') roomLife.stoke();
    else if (spot === 'kettle') roomLife.kettle();
    else if (spot === 'mug') roomLife.pour();
    else if (spot === 'cat') roomLife.pet();
    else if (spot === 'curtain') roomLife.curtains();
    else if (spot === 'book') {
      // The book opens at today: what has been done. After that, its pages.
      const today = doing.today();
      if (!bookRead && today.length) say(`done today · ${today.slice(-4).join(' · ')}${today.length > 4 ? ` · and ${today.length - 4} more` : ''}`);
      else roomLife.turnPage();
      bookRead = true;
    }
    // The hourglass is the campfire's half hour, kept indoors: turning it lights the fire out there, or puts it out.
    else if (spot === 'hourglass') {
      const burning = focus.update().phase === 'burning';
      focus.toggle();
      say(burning ? 'the glass is laid down · the fire is out' : 'the glass is turned · half an hour');
    }
    // The wireless is the gramophone's music.
    else if (spot === 'wireless') music.click(e.shiftKey, e.altKey);
    else if (spot === 'chair') sitDown(true);
    // SIT-CLICK: sitting, a click on anything that does not answer for itself lets you up again: the wall,
    // the table, the window (a press dragged across the window is still a finger on the glass, not a click).
    else if (seated) {
      const dragged = pressedAt !== null && Math.hypot(e.clientX - pressedAt[0], e.clientY - pressedAt[1]) > 6;
      if (!dragged) sitDown(false);
    }
    // Standing, the bare wall lets you out of the house.
    else if (spot === 'wall') goIndoors(false);
    return;
  }
  if (ashore) {
    // FISHING: the rowing boat at her mooring takes you out, if the weather will let her.
    const boat = fishing.clickBeach(e.clientX, e.clientY);
    if (boat === 'go') goAfloat(true);
    if (boat) return;
  } else if (fishAround && fishing.clickMeadow(e.clientX, e.clientY, fishAround)) return; // a fish by the fire is put on to cook, or eaten
  if (ashore && bottles.click(e.clientX, e.clientY)) return; // a bottle on the shingle is opened
  if (!ashore && kite.click(e.clientX, e.clientY)) return; // the kite is sent up, or wound in
  if (ashore && stacking.click(e.clientX, e.clientY)) return; // a stone is lifted, or set down on the stack
  if (sights.over(e.clientX, e.clientY)) {
    sights.seen(Date.now()); // something rare is passing, and you have marked it
    return;
  }
  const thing = landscape.thingAt(e.clientX, e.clientY);
  if (thing === 'stone') notes.open();
  if (thing === 'fire') focus.toggle(); // light it, or put it out
  if (thing === 'music') music.click(e.shiftKey, e.altKey);
  if (thing === 'lantern') doing.finish(landscape.lantern); // that task is done: its light is let go
  if (thing === 'house') goIndoors(true); // in at the door of the nearest house, to its window
  if (thing === 'friend' && friend.pet()) {
    // It gives a start, looks up, and says something.
    lambSays = bond.says(moment);
    lambSaysUntil = lastTime + 3200;
  }
  if (thing) return;
  // Click the sky to lie back and look up at all of it: clouds by day, stars by night.
  // Click the sea from the meadow to go down to the beach; there, a click on the water
  // throws a stone to skip across it, and a click on the land walks you back up.
  const there = landscape.kindAt(e.clientX, e.clientY);
  if (there.kind === 'sky') lieBack(true);
  else if (!ashore) {
    if (there.kind === 'sea') goAshore(true);
  } else if (there.kind === 'sea' && there.spot) skipping.throwAt(there.spot, lastTime, landscape.eye);
  else goAshore(false);
});

/**
 * Lie back to look at the sky, or sit up again. The view does not swing:
 * it closes like an eye, and opens on the other one.
 */
let blink = 0;
function lieBack(on: boolean): void {
  if (on === lying) return;
  window.clearTimeout(blink);
  canvas.style.opacity = '0';
  blink = window.setTimeout(() => {
    lying = on;
    landscape.lieBack(on);
    heavens = null; // a different part of the sky is wanted
    document.body.classList.toggle('gazing', on);
    canvas.style.opacity = '1';
  }, 450);
}

/**
 * Go down to the beach, or back up to the meadow. Like lying back, it is a
 * blink and not a walk: the picture closes on one place and opens on the other.
 */
let shoreToldOnce = false;
function goAshore(on: boolean): void {
  if (on === ashore) return;
  window.clearTimeout(blink);
  canvas.style.opacity = '0';
  blink = window.setTimeout(() => {
    ashore = on;
    if (!on && afloat) {
      // (FISHING: leaving the shore brings you out of the boat as well.)
      afloat = false;
      fishing.setOut(false);
    }
    landscape.goAshore(on);
    document.body.classList.toggle('ashore', on);
    canvas.style.opacity = '1';
    if (on && !shoreToldOnce) {
      shoreToldOnce = true;
      say('the water takes a stone · the land takes you back');
    }
  }, 450);
}

/**
 * FISHING: row out into the bay in the boat that lies off the beach, or home again: a blink, and you are
 * sitting in her stern out on the water, or standing on the shingle once more.
 */
function goAfloat(on: boolean): void {
  if (on === afloat || (on && (!ashore || lying))) return;
  window.clearTimeout(blink);
  canvas.style.opacity = '0';
  blink = window.setTimeout(() => {
    afloat = on;
    landscape.goAfloat(on);
    fishing.setOut(on);
    canvas.style.opacity = '1';
  }, 450);
}

/**
 * Go indoors, to the window of the nearest house, or back out to the meadow:
 * a blink again, and you are standing in the other place.
 */
let roomToldOnce = false;
function goIndoors(on: boolean): void {
  if (on === indoors || (on && (ashore || lying))) return;
  window.clearTimeout(blink);
  canvas.style.opacity = '0';
  blink = window.setTimeout(() => {
    indoors = on;
    seated = false;
    bookRead = false;
    landscape.goIndoors(on);
    document.body.classList.toggle('indoors', on);
    canvas.style.opacity = '1';
    if (on && !roomToldOnce) {
      roomToldOnce = true;
      say('most things in here answer a click · the wall lets you out again');
    }
  }, 450);
}
/**
 * Sit down in the chair at the table, or stand up again: a blink, and you are in the other place.
 * Seated you are lower, and close enough to the window to have the table under your hands.
 */
let seated = false;
let seatToldOnce = false;
function sitDown(on: boolean): void {
  if (!indoors || on === seated) return;
  window.clearTimeout(blink);
  canvas.style.opacity = '0';
  blink = window.setTimeout(() => {
    seated = on;
    landscape.sit(on);
    canvas.style.opacity = '1';
    if (on && !seatToldOnce) {
      seatToldOnce = true;
      say('sat down · a click lets you up again');
    }
  }, 450);
}
/** Light the lamp on the sill, or put it out. It is left as you leave it. */
function lightLamp(on: boolean): void {
  lampLit = on;
  localStorage.setItem('nightpond.room', on ? 'lit' : 'out');
}
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (lying) lieBack(false);
  else if (indoors && seated) sitDown(false); // up from the chair first; out of the house after
  else if (indoors) goIndoors(false);
  else if (stacking.holding()) stacking.cancel(); // the stone in your hand goes back on the beach
  else if (afloat) goAfloat(false); // FISHING: home from the bay first; up from the beach after
  else if (ashore && !skipping.inFlight()) goAshore(false);
});

/** A few passing words, low in the view, that fade by themselves: the answer to a key press. */
const wordEl = $('word');
let wordTimer = 0;
function say(words: string): void {
  // (If other words are still showing, they fade out and these fade in.)
  if (wordEl.classList.contains('shown')) setWords(wordEl, words);
  else {
    wordEl.dataset.says = words;
    wordEl.textContent = words;
  }
  wordEl.classList.add('shown');
  window.clearTimeout(wordTimer);
  wordTimer = window.setTimeout(() => wordEl.classList.remove('shown'), 2600);
}

// P saves a postcard: what you are looking at, pixel for pixel, as a picture, with the day and the weather written in a corner.
let postcardDue = false;
window.addEventListener('keydown', (e) => {
  const at = e.target;
  const typing = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || (at instanceof HTMLElement && at.isContentEditable);
  if (typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'p') return;
  postcardDue = true;
});
function takePostcard(): void {
  const box = canvas.getBoundingClientRect();
  const perCss = canvas.width / box.width; // big pixels to a screen pixel
  const sx = Math.max(0, Math.round(-box.left * perCss));
  const sy = Math.max(0, Math.round(-box.top * perCss));
  const sw = Math.min(canvas.width - sx, Math.round(window.innerWidth * perCss));
  const sh = Math.min(canvas.height - sy, Math.round(window.innerHeight * perCss));
  if (sw < 8 || sh < 8) return;
  const times = Math.max(2, Math.round(1800 / sw)); // each big pixel becomes a clean square this many across
  const card = document.createElement('canvas');
  card.width = sw * times;
  card.height = sh * times;
  const g = card.getContext('2d');
  if (!g) return;
  g.imageSmoothingEnabled = false;
  g.drawImage(canvas, sx, sy, sw, sh, 0, 0, card.width, card.height);
  // The day, the place and the weather, small in the bottom corner.
  const words = [dateEl.textContent, place?.name, live ? describeNow(live) : ''].filter(Boolean).join(' · ');
  const style = getComputedStyle(document.documentElement);
  const size = Math.round(card.height * 0.027);
  g.font = `${size}px 'Darumadrop One', sans-serif`;
  g.shadowColor = `rgba(${style.getPropertyValue('--halo')}, 0.6)`;
  g.shadowBlur = size * 0.5;
  g.fillStyle = `rgb(${style.getPropertyValue('--ink')})`;
  g.fillText(words, size * 1.3, card.height - size * 1.3);
  card.toBlob((blob) => {
    if (!blob) return;
    const now = new Date();
    const two = (v: number) => String(v).padStart(2, '0');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `nightpond-${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    say('a postcard is saved');
  }, 'image/png');
}

// M silences the sound of the place, and M brings it back.
window.addEventListener('keydown', (e) => {
  const at = e.target;
  const typing = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || (at instanceof HTMLElement && at.isContentEditable);
  if (typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'm') return;
  say(sound.toggle() ? 'you can hear the meadow again' : 'the meadow falls silent');
});

// Each kind of sound can be turned up or down by itself: scroll over the thing that makes it. Over the
// fire, the fire; over the sky (or the window, indoors), the rain and the thunder; over the grass, the
// crickets and cicadas; over the church in the far village, its bell. A few words say where it now stands.
const SOUND_NAMES: Record<Sounding, string> = { fire: 'the fire', weather: 'rain and thunder', insects: 'crickets and cicadas', bell: 'the church bell' };
function soundUnder(x: number, y: number): Sounding | null {
  if (lying) return 'weather';
  if (indoors) return landscape.roomAt(x, y) === 'window' ? 'weather' : null;
  if (!ashore && landscape.thingAt(x, y) === 'fire') return 'fire';
  const church = landscape.spotOnPage([CHURCH.x, CHURCH.top - 2, CHURCH.z]);
  if (church && Math.hypot(x - church[0], y - church[1]) < 56) return 'bell';
  const kind = landscape.kindAt(x, y).kind;
  return kind === 'sky' ? 'weather' : kind === 'other' ? 'insects' : null;
}
let wheelSum = 0;
let wheelAt = 0;
let bellHeard = 0;
canvas.addEventListener(
  'wheel',
  (e) => {
    if (notes.isOpen()) return;
    // (A wheel turns in clicks and a trackpad in a stream: either way, one step for a fair push, and not too many a second.)
    const now = performance.now();
    if (now - wheelAt > 700) wheelSum = 0;
    wheelSum += e.deltaY;
    if (Math.abs(wheelSum) < 40 || now - wheelAt < 220) return;
    const which = soundUnder(e.clientX, e.clientY);
    const up = wheelSum < 0;
    wheelSum = 0;
    wheelAt = now;
    if (!which) return;
    const stands = sound.turn(which, up ? 1 : -1);
    say(sound.isOn() ? `${SOUND_NAMES[which]} · ${stands}` : `${SOUND_NAMES[which]} · ${stands} · m to hear the meadow`);
    // (The bell is not ringing just now to be judged by: one stroke of it, once you have settled.)
    if (which === 'bell') {
      window.clearTimeout(bellHeard);
      if (stands !== 'silent') bellHeard = window.setTimeout(() => sound.chime(1), 900);
    }
  },
  { passive: true },
);

// E saves a keepsake of everything kept here; I (or dropping the file on the page) loads one.
const keepsake = createKeepsake(say, notes);

// F fills the whole screen with the view, and F (or Esc) brings the window back.
window.addEventListener('keydown', (e) => {
  const at = e.target;
  const typing = at instanceof HTMLInputElement || at instanceof HTMLTextAreaElement || (at instanceof HTMLElement && at.isContentEditable);
  if (typing || e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'f') return;
  e.preventDefault();
  type Old = { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void; webkitRequestFullscreen?: () => void };
  const doc = document as Document & Old;
  const page = document.documentElement as HTMLElement & Old;
  if (document.fullscreenElement ?? doc.webkitFullscreenElement) {
    if (document.exitFullscreen) void document.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
  } else if (page.requestFullscreen) {
    void page.requestFullscreen().catch(() => {}); // a browser may refuse; then nothing happens
  } else {
    page.webkitRequestFullscreen?.();
  }
});

// ---- the text in the sky ---------------------------------------------------------

// Only the time shows. The date, the weather and the place appear while the
// pointer is in that corner (and for a few seconds when the page opens), then
// tuck themselves away again. They stay while the place is being asked for.
const hudEl = $('hud');
let hudUntil = performance.now() + 6000;
function hudShow(): void {
  const asking = !formEl.hidden || locating || hudEl.contains(document.activeElement);
  hudEl.classList.toggle('open', asking || performance.now() < hudUntil);
}
function hudVisit(x: number, y: number, linger = 900): void {
  const box = hudEl.getBoundingClientRect();
  if (x > box.right + 30 || y > box.bottom + 30) return;
  hudUntil = Math.max(hudUntil, performance.now() + linger);
  hudShow(); // at once, as the pointer arrives
}
window.addEventListener('pointerdown', (e) => hudVisit(e.clientX, e.clientY, 4000)); // a touch shows it for longer
window.setInterval(hudShow, 150); // and this tucks it away again afterwards

const clockEl = $('clock');
const dateEl = $('date');
const weatherEl = $('weather-line');
const hintEl = $('hint-line');
const placeEl = $<HTMLButtonElement>('place');
const formEl = $<HTMLFormElement>('place-form');
const inputEl = $<HTMLInputElement>('place-input');
const errorEl = $('place-error');

let lastHour = new Date().getHours();
function drawClock(): void {
  const now = new Date();
  // On the hour the church in the far village strikes it: the count by day, a single soft stroke at night.
  if (now.getHours() !== lastHour) {
    lastHour = now.getHours();
    sound.chime(lastHour >= 7 && lastHour <= 22 ? lastHour % 12 || 12 : 1);
  }
  const parts = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).formatToParts(now);
  const period = parts.find((p) => p.type === 'dayPeriod')?.value.toLowerCase() ?? '';
  const digits = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  // (Each of these fades out and in when what it says changes: the minute, the day, what is coming.)
  setWords(clockEl, `${digits} ${period}`, (el) => {
    el.textContent = digits;
    if (period) {
      const small = document.createElement('small');
      small.textContent = period;
      el.append(small);
    }
  });
  setWords(dateEl, now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toLowerCase());
  if (live) setWords(hintEl, describeAhead(live, now.getTime()));
}
drawClock();
setInterval(drawClock, 1000);

/** The weather line while there is no reading: a few quiet words. */
function weatherWaits(words: string): void {
  setWords(weatherEl, words, (el) => {
    el.classList.add('waiting');
    el.textContent = words;
  });
}

function drawWeather(): void {
  // The place can always be touched to change it, even before there is one.
  setWords(placeEl, place ? place.name || 'here' : locating ? 'somewhere…' : 'set your place');
  if (!live) {
    weatherWaits(place ? 'reading the sky…' : locating ? 'finding where you are…' : '');
    setWords(hintEl, '');
    return;
  }
  // The temperature large, and what the sky is doing beside it.
  const now = describeNow(live);
  setWords(weatherEl, now, (el) => {
    const [temp, sky] = now.split(' · ');
    const big = document.createElement('span');
    big.className = 'temp';
    big.textContent = temp;
    const rest = document.createElement('span');
    rest.textContent = sky ?? '';
    el.classList.remove('waiting');
    el.replaceChildren(big, rest);
  });
  setWords(hintEl, describeAhead(live, Date.now()));
}

// ---- where, and the live weather ---------------------------------------------------

function loadPlace(): Place | null {
  try {
    const raw = localStorage.getItem(PLACE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return p && typeof p.lat === 'number' && typeof p.lon === 'number' ? p : null;
  } catch {
    return null;
  }
}

function savePlace(p: Place): void {
  place = p;
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(p));
  } catch {
    // Private windows may refuse storage; the place then lasts until reload.
  }
  askPlace(false);
  heavens = null; // the stars are different from here
  live = null;
  snap = true;
  drawWeather();
  void refresh();
}

let refreshTimer = 0;
let refused = 0; // how many times running the weather service has failed to answer
async function refresh(): Promise<void> {
  window.clearTimeout(refreshTimer);
  if (!place) return;
  const asked = place;
  let wait = 10 * 60_000;
  try {
    const first = !live;
    // The reading for here, and with it a look at what is falling round about
    // (which may fail by itself without spoiling the rest).
    // (Asked at the same moment: how cloudy it is on each side, which the look round about already tells, and what smoke is in the air.)
    const hazeAsked = fetchHaze(asked).catch(() => null);
    // (The weather itself comes from whichever service will give it: see weather/sources.ts.)
    const reading = await fetchWeather(asked);
    // The look round about: asked of the same service the weather came from (one look serves both questions, and is kept a while).
    const [around, coverBy, haze] = await Promise.all([fetchAround(asked).catch(() => null), fetchCoverBy(asked).catch(() => null), hazeAsked]);
    if (asked !== place) return; // the place changed while this was on its way
    if (coverBy) reading.coverBy = coverBy;
    if (haze) {
      reading.haze = haze;
      reading.weather.smoke = haze.smoke;
    }
    if (around) {
      reading.around = around;
      Object.assign(reading.weather, { aroundX: around.x, aroundZ: around.z, aroundSnow: around.snow ? 1 : 0 });
    }
    live = reading;
    refused = 0;
    if (first) snap = true; // the first reading appears at once; later ones ease in
  } catch (err) {
    if (asked !== place) return;
    console.warn(err);
    // Keep showing the last reading and try again soon; but if it keeps failing, or the
    // service says it has been asked too often today, leave it alone for longer each time.
    refused = /\(429\)/.test(String(err)) ? Math.max(refused, 3) + 1 : refused + 1;
    wait = Math.min(30, 2 ** refused) * 60_000;
    if (!live) weatherWaits('the sky is out of reach just now');
  }
  if (live) drawWeather();
  refreshTimer = window.setTimeout(refresh, wait);
}

/** Open or close the line where the place is changed. */
function askPlace(open: boolean): void {
  formEl.hidden = !open;
  hudEl.classList.toggle('asking', open);
  if (open) {
    // (A moment later: while the form is still easing into sight it cannot yet take the caret.)
    window.setTimeout(() => {
      if (!formEl.hidden) inputEl.focus();
    }, 60);
  } else {
    inputEl.value = '';
    errorEl.textContent = '';
    inputEl.blur();
  }
}
placeEl.addEventListener('click', () => askPlace(formEl.hidden));
// Esc puts it away, and so does a click anywhere else.
inputEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  askPlace(false);
});
window.addEventListener('pointerdown', (e) => {
  if (!formEl.hidden && !(e.target instanceof Node && hudEl.contains(e.target))) askPlace(false);
});

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = inputEl.value.trim();
  if (!name) return;
  errorEl.textContent = 'looking…';
  try {
    const found = await findPlaceAnywhere(name);
    if (!found) {
      errorEl.textContent = `no place called "${name}" turned up`;
      return;
    }
    errorEl.textContent = '';
    inputEl.value = '';
    savePlace(found);
  } catch {
    errorEl.textContent = 'could not look that up; try again in a moment';
  }
});

$('place-geo').addEventListener('click', () => {
  if (!navigator.geolocation) {
    errorEl.textContent = 'this browser cannot share a location; type a city instead';
    return;
  }
  errorEl.textContent = 'asking…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      errorEl.textContent = '';
      savePlace({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: '' });
    },
    () => {
      errorEl.textContent = 'location was not shared; type a city instead';
    },
    { maximumAge: 3_600_000, timeout: 15_000 },
  );
});

/**
 * Work out the city from the internet address. It runs by itself when no place
 * has been chosen by hand, and again from the form if you ask for it.
 */
async function detectPlace(byRequest: boolean): Promise<void> {
  locating = true;
  if (byRequest) errorEl.textContent = 'looking…';
  else drawWeather();
  const found = await findByIp();
  locating = false;
  if (!found) {
    if (byRequest) errorEl.textContent = 'could not tell where you are; type a city instead';
    else if (!place) askPlace(true); // nothing to go on, so ask
    drawWeather();
    return;
  }
  errorEl.textContent = '';
  // A place typed or shared while this was looking wins.
  if (!byRequest && place && !place.auto) return;
  // Still the same city as last time: keep the reading already on screen.
  const same = place?.auto && place.name === found.name && Math.abs(place.lat - found.lat) < 0.05 && Math.abs(place.lon - found.lon) < 0.05;
  if (same) askPlace(false);
  else savePlace(found);
}

$('place-auto').addEventListener('click', () => void detectPlace(true));

formEl.hidden = true;
drawWeather();
void refresh();
// With no place chosen by hand, find the city from the network each time the page opens.
if (!place || place.auto) void detectPlace(false);

// Handy from the console: nightpond.set({ rain: 1, hour: 23 }), nightpond.live()
// nightpond.step(33) draws one frame as if that many milliseconds had passed (for testing).
Object.assign(window, {
  nightpond: {
    /** UPDATE: this page's version. */
    version: VERSION,
    set: debug.set,
    live: debug.live,
    weather,
    focus,
    music,
    friend,
    sound,
    keepsake,
    skipping,
    bottles,
    kite,
    stacking,
    /** Rare sights, for testing: sights.force('whales' | 'ship' | 'hare' | 'seal') starts one now; and what the calendar holds today. */
    sights,
    dayHolds: () => dayHolds(Date.now()),
    sightOnPage: () => {
      const at = sights.where();
      return at ? landscape.spotOnPage(at) : null;
    },
    /** The stone's writing; the lanterns (and where the n-th falls on the page); the reminders; the almanac. All for testing. */
    notes,
    tasks: { ...tasks, where: (n: number) => landscape.pageAt(lanternFlames[n]) },
    reminders,
    almanac,
    shore: { go: goAshore, there: () => ashore },
    /** FISHING, for testing: the boat and the catch; and going out in her and coming home. */
    fishing,
    afloat: { go: goAfloat, there: () => afloat },
    /** For testing the storm lantern: pretend the battery is so full (0..1) and on charge or not; no arguments goes back to the real one. */
    battery: (level?: number, charging = false) => {
      battery.forced = level !== undefined;
      if (level !== undefined) Object.assign(battery, { level, charging, has: true });
      else readBattery();
      return { ...battery };
    },
    washing: () => washOut,
    room: { sit: sitDown, seated: () => seated, go: goIndoors, there: () => indoors, lamp: lightLamp, lit: () => lampLit, curtains: () => roomLife.curtains(), at: (x: number, y: number) => landscape.roomAt(x, y), onPage: () => landscape.roomOnPage() },
    thingAt: (x: number, y: number) => landscape.thingAt(x, y),
    soundUnder,
    /** Which weather service the present reading came from, and which are being left alone. */
    source: () => ({ from: live?.source ?? null, resting: sourcesResting(), around: live?.around ?? null, coverBy: live?.coverBy ?? null }),
    /** For testing: take the weather from one service only (or pass null to choose freely again), and look a city up in either gazetteer. */
    weatherFrom: (name: Source | null) => {
      onlySource(name);
      return refresh();
    },
    lookUp: { anywhere: findPlaceAnywhere, osm: findInOsm },
    /** How many questions have been put to each outside service: today, by this page, and this page's rate over a day. */
    calls: callsMade,
    /** Which rooms are lit in each house just now (gable, gable, by the door; the church last). */
    households,
    /** The fishing boat: how far out it is (0 at anchor, 1 on the ground) and whether the weather keeps it in. */
    boat,
    /** How cloudy it is toward each compass bearing just now (north first, then round by the east), and what the last look round about said. */
    coverBy: () => ({ shown: cloudRound.shown(), read: live?.coverBy ?? null }),
    /** Smoke in the air, as last read. */
    haze: () => live?.haze ?? null,
    /** The northern lights just now, and the Kp they follow. */
    lights: () => ({ kp, strength: northernLights }),
    ink: () => ({ ...inkDark }),
    seaGlow: () => ({ now: Math.round(seaGlow * 100) / 100, tonight: seaGlowFor(Date.now(), (place?.lat ?? 62) < 0, -1, 0, 12) }),
    tide: (ms?: number) => (ms === undefined ? tide : tideAt(ms, place?.lon ?? -6.8)),
    /** The star-joining game, for testing: which stars can be clicked now, and which figures are finished. */
    stars: { reachable: () => starPlay.reachable(heavens), found: () => starPlay.found(), lieBack, lying: () => lying, isSky: (x: number, y: number) => landscape.isSky(x, y), starlight: () => starlight },
    step: (ms = 33) => tick(lastTime + ms),
    /** The hoarfrost and the dew as last drawn. */
    rime: () => rimeNow,
    /** How the light tracer is getting on. */
    tracing: () => landscape.tracing,
    /** PATH-TRACE, for testing: the light gathered so far at a pixel of the picture. */
    lightProbe: (x: number, y: number) => landscape.lightProbe(x, y),
    /** Send a shooting star now (if the stars are out). */
    shoot: () => {
      nextMeteor = 0;
    },
    /** Send a stroke of lightning now. */
    strike,
  },
});

// UPDATE: the page has got this far, so it starts properly (see update.ts). And if the file it was
// opened from is out of date, it says so, with a way to have the new one.
updateStarted();
offerNewFile();
