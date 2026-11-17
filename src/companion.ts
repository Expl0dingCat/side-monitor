// The lamb. While the fire burns you are not alone: a lamb from the flock
// wanders over from the right, turns round once, and lies down beside it. It
// stays through your rest while the embers glow, and when the fire is cold it
// gets up and ambles off again. Now and then it lifts its head to look at you;
// it does so too when you point at it, and gives a little start if clicked.
//
// It notices the weather. In rain it gets up and tucks in closer to the fire,
// and its wool goes dark and wet. At a stroke of lightning it starts to its
// feet and looks at the sky, and after a while settles again. Falling snow
// gathers on its back until it shakes it off. On a hot day it lies further
// from the fire, stretched out with its chin on its legs; in a cold wind it
// huddles close with its head tucked in.
//
// And it follows you. If it is with you when you go down to the beach, a few
// seconds later it walks onto the shingle from the side and stands near your
// feet, watching the water; its head follows a stone you throw. When you go
// back up, it is by the fire again.

import { BEACH, FACING, FIRE, land } from './scene/land';

/** Where it is and how it holds itself, for drawing. */
export interface FriendPose {
  /** How big it is beside the lamb it began as (1 at first; it grows). Filled in by whoever knows. */
  grow: number;
  x: number;
  y: number;
  z: number;
  /** Which way it faces, as a turn about the upright axis. */
  yaw: number;
  /** 0 standing, 1 lying down. */
  low: number;
  /** How far its head is raised above where it would otherwise be, in metres. */
  head: number;
  /** Where it is in its stride (an angle), and how fully it is striding, 0 standing still to 1 walking. */
  gait: number;
  stride: number;
  /** Its head turned to one side of the way its body faces, and tipped up (or, below zero, down): both angles. */
  turn: number;
  tilt: number;
  /** How wet its wool is, and how much snow lies on its back, 0..1 each. */
  wet: number;
  snowy: number;
  /** Lying stretched out with its legs in front and behind, 0..1. */
  sprawl: number;
  /** Whether it is down on the beach, and not in the meadow. */
  ashore: boolean;
}

/** What the lamb can feel and see round it. */
export interface Around {
  rain: number;
  snow: number;
  /** Wind, 0..1, and the air's temperature in Celsius. */
  wind: number;
  temp: number;
  /** How hot the day feels, 0..1. */
  heat: number;
  /** Whether you are down on the beach. */
  ashore: boolean;
  /** A skipping stone in the air or on the water, if there is one. */
  stone: [number, number, number] | null;
}

type Phase = 'cold' | 'burning' | 'embers';
type Spot = [number, number];

/** Out of sight to the right, where it comes from and goes back to. */
const AWAY: Spot = [FIRE.x + 9.6, FIRE.z + 2.9];
/** Its place by the fire: a little to the right of it and on your side. */
const REST: Spot = [FIRE.x + 1.3, FIRE.z + 1.9];
/** In rain it lies as near the fire as it can; in a cold wind, nearly as near; on a hot day, well back from it. */
const NEAR: Spot = [FIRE.x + 0.82, FIRE.z + 1.32];
const SNUG: Spot = [FIRE.x + 1.05, FIRE.z + 1.6];
const FAR: Spot = [FIRE.x - 0.1, FIRE.z + 3.8];
/** Lying down it faces left along the fire, so you see it side-on. */
const REST_YAW = 2.84;
const PACE = 0.8; // metres a second

// The beach, measured from where you stand on it: `ahead` toward the water, `aside` to your right.
const onBeach = (ahead: number, aside: number): Spot => [
  BEACH.x + Math.sin(FACING) * ahead + Math.cos(FACING) * aside,
  BEACH.z - Math.cos(FACING) * ahead + Math.sin(FACING) * aside,
];
/** Its place on the shingle: near your feet, a little to the right, above where the waves reach. */
const SHORE: Spot = onBeach(4.0, 1.5);
/** Where it walks on from, and off to: along the beach to the right, out of sight. */
const SHORE_AWAY: Spot = onBeach(3.3, 6.4);
/** There it stands side-on to you, facing along the beach and a little toward the sea. */
const SHORE_YAW = Math.atan2(Math.sin(FACING) * 0.9 + Math.cos(FACING) * 0.42, -Math.cos(FACING) * 0.9 + Math.sin(FACING) * 0.42);

/** The way to face to walk from one spot toward another. */
const toward = (from: Spot, to: Spot) => Math.atan2(-(to[1] - from[1]), to[0] - from[0]);
/** The short way round from angle `a` to angle `b`. */
const between = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
/** Turn `a` toward `b` by the short way round. */
const turnTo = (a: number, b: number, t: number) => a + between(a, b) * t;
const apart = (a: Spot, b: Spot) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** How far its head will turn to either side. */
const NECK = 1.25;

export function createCompanion() {
  let state: 'away' | 'coming' | 'settling' | 'resting' | 'rising' | 'leaving' | 'following' | 'arriving' | 'ashore' | 'departing' = 'away';
  let at: Spot = [...AWAY];
  let yaw = toward(AWAY, REST);
  let low = 0;
  let head = 0;
  let gait = 0; // where it is in its stride
  let stride = 0; // 0 standing still, 1 walking
  let start = 0; // a little jump, fading
  let noticed = -1; // how long the fire has been burning without it yet
  let comeAfter = 12 + Math.random() * 18; // it takes its time to notice a fire
  let lookUntil = 0;
  let nextLook = 15 + Math.random() * 25;
  let clock = 0;
  let first = true;

  // What the weather has done to it.
  let wet = 0;
  let snowy = 0;
  let shakeAt = 0.8; // how much snow it lets gather before shaking
  let shaking = 9; // seconds since it began to shake itself
  let rainy = false;
  let hot = false;
  let bitter = false;
  let spot: Spot = REST; // where by the fire it wants to lie in this weather
  let lain = 0; // when it last lay down
  let sprawl = 0;
  // A start at thunder: until when it stays on its feet, and where in the sky it looks.
  let alertUntil = -1;
  let alertWay = 0;
  // Its head: turned and tipped, each easing toward what has its attention.
  let turn = 0;
  let tilt = 0;
  let watched = -9; // when a stone was last in the air
  let watchWay = 0;
  // Coming down to the beach after you.
  let followAt = 0;
  let lieAt = 0;

  /** Back up in the meadow, on its feet by the fire, as you come up from the beach. */
  const backUp = (lit: boolean) => {
    at = [...spot];
    yaw = REST_YAW;
    low = 0;
    state = lit ? 'settling' : 'leaving';
  };

  /** Walk toward a spot; true once it is there. */
  const walk = (goal: Spot, dt: number): boolean => {
    const dx = goal[0] - at[0];
    const dz = goal[1] - at[1];
    const left = Math.hypot(dx, dz);
    const step = PACE * dt;
    yaw = turnTo(yaw, toward(at, goal), 1 - Math.exp(-dt * 5));
    gait += dt * 7.5;
    if (left <= step) {
      at = [...goal];
      return true;
    }
    at = [at[0] + (dx / left) * step, at[1] + (dz / left) * step];
    return false;
  };

  return {
    /** Called every frame; returns how to draw it, or null while it is away. */
    update(dt: number, fire: Phase, pointed: boolean, around: Around): FriendPose | null {
      clock += dt;
      const lit = fire !== 'cold';
      if (first) {
        first = false;
        // Opening the page part-way through a spell of work: it is already there, asleep by the fire.
        if (lit) {
          state = 'resting';
          at = [...REST];
          yaw = REST_YAW;
          low = 1;
        }
      }

      // ---- the weather on its back ----
      // Rain soaks in within half a minute; by the fire it dries again in a couple of minutes.
      const soaking = clamp((around.rain - 0.03) / 0.3, 0, 1);
      wet += (soaking - wet) * (1 - Math.exp(-dt / (soaking > wet ? 22 : 100)));
      shaking += dt;
      if (around.snow > 0.04) snowy = Math.min(1, snowy + dt * (0.011 + 0.03 * around.snow));
      else snowy = Math.max(0, snowy - dt / 40);
      const afoot = state === 'coming' || state === 'leaving' || state === 'arriving' || state === 'departing';
      if (snowy >= shakeAt && shaking > 4 && !afoot && clock > alertUntil) {
        shaking = 0;
        shakeAt = 0.7 + 0.3 * Math.random();
      }
      if (shaking < 1.3) snowy = Math.max(0.06, snowy * Math.exp(-dt / 0.3)); // off it comes
      // What kind of day it is, each with a little give so that it does not keep changing its mind.
      rainy = around.rain > (rainy ? 0.06 : 0.12);
      hot = around.heat > (hot ? 0.18 : 0.3);
      bitter = bitter ? around.wind > 0.33 && around.temp < 8 : around.wind > 0.45 && around.temp < 6;
      spot = rainy ? NEAR : hot ? FAR : bitter ? SNUG : REST;
      const alert = clock < alertUntil;

      switch (state) {
        case 'away':
          if (lit) {
            noticed += dt;
            if (noticed > comeAfter) {
              state = 'coming';
              at = [...AWAY];
              yaw = toward(AWAY, REST);
            }
          } else {
            noticed = 0;
          }
          break;
        case 'coming':
        case 'leaving': {
          // A fire relit as it leaves brings it back; one that dies as it comes sends it home.
          if (state === 'leaving' && lit) state = 'coming';
          else if (state === 'coming' && !lit) state = 'leaving';
          if (walk(state === 'coming' ? spot : AWAY, dt)) {
            if (state === 'coming') {
              state = 'settling';
            } else {
              state = 'away';
              noticed = 0;
              comeAfter = 20 + Math.random() * 30;
            }
          }
          break;
        }
        case 'settling':
          // Turn to lie along the fire, then fold down.
          yaw = turnTo(yaw, REST_YAW, 1 - Math.exp(-dt * 3.5));
          if (Math.abs(between(yaw, REST_YAW)) < 0.08) {
            low = Math.min(1, low + dt / 0.9);
            if (low >= 1) {
              state = 'resting';
              lain = clock;
              nextLook = clock + 10 + Math.random() * 20;
            }
          }
          if (!lit && low < 0.5) state = 'rising';
          break;
        case 'resting':
          if (!lit) {
            state = 'rising';
          } else if (around.ashore) {
            // You have gone down to the water. It thinks about it, and comes after you.
            state = 'following';
            followAt = clock + 3 + Math.random() * 2;
          } else if (alert) {
            // Thunder: up on its feet at once, though not all in one frame.
            low -= low * (1 - Math.exp(-dt * 8));
            lain = clock;
          } else if (low < 1) {
            low = Math.min(1, low + dt / 1.1); // and down again when it has passed
          } else if (apart(at, spot) > 0.3 && clock - lain > 12) {
            state = 'rising'; // the weather has changed: it wants a better place by the fire
          } else if (clock > nextLook) {
            lookUntil = clock + 2.2;
            nextLook = clock + 18 + Math.random() * 40;
          }
          break;
        case 'rising':
          low = Math.max(0, low - dt / 0.8);
          if (low <= 0) state = !lit ? 'leaving' : apart(at, spot) > 0.15 ? 'coming' : 'settling';
          break;
        case 'following':
          // (Between the meadow and the beach it is nowhere to be seen.)
          if (!around.ashore) {
            state = 'resting'; // you came straight back: it had not stirred
          } else if (clock > followAt) {
            state = 'arriving';
            at = [...SHORE_AWAY];
            yaw = toward(SHORE_AWAY, SHORE);
            low = 0;
          }
          break;
        case 'arriving':
          if (!around.ashore) backUp(lit);
          else if (walk(SHORE, dt)) {
            state = 'ashore';
            lieAt = clock + 16 + Math.random() * 12;
          }
          break;
        case 'ashore': {
          if (!around.ashore) {
            backUp(lit);
            break;
          }
          yaw = turnTo(yaw, SHORE_YAW, 1 - Math.exp(-dt * 3));
          // It stands a while looking at the water, then lies down on the stones. Thunder has it up again.
          const down = lit && !alert && clock > lieAt;
          if (alert) low -= low * (1 - Math.exp(-dt * 8));
          else low = clamp(low + (down ? dt / 1.0 : -dt / 0.8), 0, 1);
          if (!lit && low <= 0) state = 'departing';
          break;
        }
        case 'departing':
          if (!around.ashore) backUp(lit);
          else if (walk(SHORE_AWAY, dt)) {
            state = 'away';
            noticed = 0;
            comeAfter = 20 + Math.random() * 30;
          }
          break;
      }
      if (state === 'away' || state === 'following') return null;
      const shore = state === 'arriving' || state === 'ashore' || state === 'departing';
      const lying = (state === 'resting' || state === 'ashore') && low > 0.6;
      const still = state === 'resting' || state === 'ashore';

      // ---- its head: what has its attention ----
      const eye: Spot = shore ? [BEACH.x, BEACH.z] : [0, 0]; // where you are
      if (around.stone && shore) {
        watched = clock;
        watchWay = toward(at, [around.stone[0], around.stone[2]]);
      }
      const looking = still && (pointed || clock < lookUntil);
      let wantHead = 0;
      let wantTurn = 0;
      let wantTilt = 0;
      let quick = 3;
      if (alert && still) {
        // Up at the sky, where the flash was.
        wantHead = 0.1;
        wantTurn = clamp(between(yaw, alertWay), -0.5, 0.5);
        wantTilt = 0.5;
        quick = 9;
      } else if (shore && clock - watched < 1.6) {
        // After the stone, and for a moment at the place where it went under.
        wantHead = 0.07;
        wantTurn = clamp(between(yaw, watchWay), -NECK, NECK);
        wantTilt = 0.06;
        quick = 7;
      } else if (looking) {
        // At you.
        wantHead = 0.13;
        wantTurn = clamp(between(yaw, toward(at, eye)), -0.8, 0.8);
        quick = 7;
      } else if (lying && bitter && !shore) {
        // Huddled: its head tucked round against its side.
        wantHead = -0.07;
        wantTurn = 2.25;
        wantTilt = -0.3;
      } else if (lying && hot) {
        wantHead = -0.17; // its chin down on its forelegs
        wantTilt = -0.12;
      } else if (state === 'ashore') {
        // Watching the water, its gaze wandering slowly along it.
        wantHead = lying ? 0.02 : 0.05;
        wantTurn = clamp(between(yaw, toward(at, onBeach(40, 6 + 16 * Math.sin(clock * 0.07)))), -NECK, NECK);
      }
      const ease = 1 - Math.exp(-dt * quick);
      head += (wantHead - head) * ease;
      turn += (wantTurn - turn) * ease;
      tilt += (wantTilt - tilt) * ease;
      sprawl += ((lying && hot ? 1 : 0) - sprawl) * (1 - Math.exp(-dt * 1.2));
      start *= Math.exp(-dt * 6);

      const walking = afoot;
      stride += ((walking ? 1 : 0) - stride) * (1 - Math.exp(-dt * 9));
      // Its legs move in eight steps to the stride, like a drawn walk, not a glide.
      const step = Math.round(gait / (Math.PI / 4)) * (Math.PI / 4);
      const trot = Math.abs(Math.sin(step)) * 0.035 * stride;
      // Breathing, while it lies there.
      const breath = still && low > 0.9 ? Math.sin(clock * 1.5) * 0.012 : 0;
      // Its head nods as it goes.
      const nod = Math.sin(step * 2) * 0.014 * stride;
      // Shaking the snow off: a few quick turns of the body one way and the other, dying away, drawn in steps.
      const shake = shaking < 1.3 ? Math.sin(Math.floor(shaking * 12) * 1.9) * 0.085 * Math.sin((Math.PI * shaking) / 1.3) : 0;
      // The head moves in small steps too.
      const notch = (v: number, size: number) => Math.round(v / size) * size;
      return {
        grow: 1,
        x: at[0],
        y: land(at[0], at[1]) + trot + breath + start,
        z: at[1],
        yaw: yaw + shake,
        low,
        head: head + nod,
        gait: step,
        stride,
        turn: notch(turn, Math.PI / 30) - shake * 1.6,
        tilt: notch(tilt, 0.05),
        wet,
        snowy,
        sprawl,
        ashore: shore,
      };
    },

    /** A click on it: it gives a start and looks up. Returns true if it was there to be clicked. */
    pet(): boolean {
      if (state === 'away' || state === 'following') return false;
      start = 0.09;
      lookUntil = clock + 2.5;
      return true;
    },

    /**
     * Lightning has struck, on the bearing given (an angle from straight out to sea, toward the right).
     * It starts up and looks at that part of the sky for a while.
     */
    startle(bearing: number): void {
      if (state === 'away' || state === 'following') return;
      if (clock > alertUntil) start = 0.06;
      alertUntil = clock + 6 + Math.random() * 3;
      alertWay = Math.atan2(Math.cos(bearing), Math.sin(bearing));
    },

    /** For testing: what it is doing; and a way to hurry it along instead of waiting for it to notice the fire. */
    state: () => state,
    hurry(): void {
      comeAfter = 0;
      followAt = 0;
      lieAt = 0;
    },
  };
}
