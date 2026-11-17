// Parts that turn on a joint. The things that move about the meadow are drawn
// by turning and shifting a piece of the prop mesh as a whole (see uTurn, uNod
// and uShift in the prop shader), which turns it about its own origin. A head
// on a neck or a leg at a hip must turn about the joint instead: this works
// out the shift that puts it there.

import type { V3 } from './gl';
import { LAMB } from './land';

/** Turn a point about the upright axis, the way the prop shader does. */
const spin = (a: number, v: V3): V3 => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], v[2] * Math.cos(a) - v[0] * Math.sin(a)];
/** Tip a point up about the axis across it. */
const tip = (a: number, v: V3): V3 => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];

/**
 * How to draw a part of a body that stands at `base`, faces `yaw` and is
 * `grow` times its built size, when the part is turned by `turn` and tipped up
 * by `nod` about `joint` (a point in the body's own frame, as built).
 */
export function hinged(base: V3, yaw: number, grow: number, joint: V3, turn: number, nod: number): { uShift: V3; uTurn: [number, number]; uNod: number } {
  const c: V3 = [joint[0] * grow, joint[1] * grow, joint[2] * grow];
  const held = spin(yaw, c); // where the joint is, on the body
  const swung = spin(yaw + turn, tip(nod, c)); // where turning the part about the origin would have carried it
  return {
    uShift: [base[0] + held[0] - swung[0], base[1] + held[1] - swung[1], base[2] + held[2] - swung[2]],
    uTurn: [Math.cos(yaw + turn), Math.sin(yaw + turn)],
    uNod: nod,
  };
}

/** The lamb's joints, as it is built (see sheepBody and sheepLeg): the base of its neck, and the top of each leg. */
export const LAMB_NECK: V3 = [0.5 * LAMB.size, 0.8 * LAMB.size, 0];
export const LAMB_HIPS: V3[] = [0, 1, 2, 3].map((i): V3 => [(i < 2 ? 0.3 : -0.32) * LAMB.size, 0.42 * LAMB.size, (i % 2 === 0 ? 0.16 : -0.16) * LAMB.size]);
