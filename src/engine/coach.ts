import { assignPeople } from './assign';
import { scorePose, type PointScore, type PoseScore } from './match';
import { anchorOf, center, frameVisible, segmentAngle, withVirtualJoints } from './skeleton';
import { BONES, type BoneName, type PlacedFigure, type PoseFrame, type Skeleton } from './types';

export type Phase = 'no-people' | 'framing' | 'position' | 'pose' | 'ready';

export interface SlotState {
  present: boolean;
  /** Standing close enough to the ghost for pose matching to make sense. */
  positioned: boolean;
  score: PoseScore | null;
  /** Per-slot instruction, already phrased for the subject. */
  hint: string | null;
}

export interface Guidance {
  phase: Phase;
  /** The one line to show/speak. */
  headline: string;
  /** Mean pose score across present slots, 0..1, or null if not measurable. */
  score: number | null;
  slots: SlotState[];
  /** People detected beyond the number the pose needs. */
  extra: number;
}

export interface EvaluateOptions {
  /**
   * True when the preview is a mirror (front camera): the subject's left is then on the screen's
   * left, so "outward" and head-tilt directions flip. Targets must be mirrored to match.
   */
  mirrored?: boolean;
}

/** Position tolerances, as fractions of the target figure's apparent height. */
const X_TOL = 0.1;
const SCALE_LO = 0.88;
const SCALE_HI = 1.12;
/** Any bone below this gets a spoken fix when the pose isn't matched yet, so there's never a silent dead-end. */
const FIX_BELOW = 0.95;
/** Bones below this are clearly wrong and outrank "show me your hand" hints. */
const CLEARLY_OFF = 0.8;
/** Severity given to a hidden limb when ranking which person to coach first. */
const HIDDEN_SEVERITY = 0.7;

const FRAMING_MESSAGE: Record<PoseFrame, string> = {
  full: 'Step back so your whole body is visible',
  upper: 'Step back so your head and shoulders are in frame',
  face: 'Show your face and shoulders',
};

function positionHint(target: PlacedFigure, user: Skeleton): string | null {
  const ua = anchorOf(user, target.frame);
  const ta = anchorOf(target.joints, target.frame);
  if (!ua || !ta) return null;
  const ratio = ua.h / ta.h;
  const dx = (ta.x - ua.x) / ta.h;

  if (ratio > SCALE_HI) return ratio > 1.35 ? 'Take a big step back' : 'Take a small step back';
  if (ratio < SCALE_LO) return ratio < 0.7 ? 'Come much closer' : 'Come a little closer';
  if (Math.abs(dx) > X_TOL) {
    const dir = dx > 0 ? 'right' : 'left';
    return Math.abs(dx) > 0.4 ? `Move a few steps ${dir}` : `Move a little ${dir}`;
  }
  return null;
}

const SIDE_PART: Record<BoneName, { side: 'left' | 'right' | null; noun: string; verb: 'arm' | 'leg' | 'head' | 'body' | 'shoulders' }> = {
  head: { side: null, noun: 'head', verb: 'head' },
  eyeLine: { side: null, noun: 'head', verb: 'head' },
  earLine: { side: null, noun: 'head', verb: 'head' },
  spine: { side: null, noun: 'body', verb: 'body' },
  shoulders: { side: null, noun: 'shoulders', verb: 'shoulders' },
  leftUpperArm: { side: 'left', noun: 'left arm', verb: 'arm' },
  leftForeArm: { side: 'left', noun: 'left forearm', verb: 'arm' },
  rightUpperArm: { side: 'right', noun: 'right arm', verb: 'arm' },
  rightForeArm: { side: 'right', noun: 'right forearm', verb: 'arm' },
  leftThigh: { side: 'left', noun: 'left leg', verb: 'leg' },
  leftShin: { side: 'left', noun: 'left foot', verb: 'leg' },
  rightThigh: { side: 'right', noun: 'right leg', verb: 'leg' },
  rightShin: { side: 'right', noun: 'right foot', verb: 'leg' },
};

/**
 * Screen-right is outward for the subject's left limbs (screen-left for the right limbs) when
 * facing the camera. In a mirrored preview that flips.
 */
const outward = (side: 'left' | 'right', dx: number, mirrored: boolean) => ((side === 'left') !== mirrored ? dx > 0 : dx < 0);

/** "Toward your left" in screen terms: screen-right normally, screen-left when mirrored. */
const towardLeft = (dx: number, mirrored: boolean) => (mirrored ? dx < 0 : dx > 0);

/**
 * Turns "this bone is off by N°" into a sentence. Works out where the bone's
 * far end has to go, then names that move in the subject's own left/right.
 */
export function describeFix(bone: BoneName, target: Skeleton, user: Skeleton, mirrored = false): string {
  const def = BONES.find((b) => b.name === bone)!;
  const t = withVirtualJoints(target);
  const u = withVirtualJoints(user);
  const ta = t[def.from]!;
  const tb = t[def.to]!;
  const ua = u[def.from]!;
  const ub = u[def.to]!;
  const len = Math.hypot(ub.x - ua.x, ub.y - ua.y);
  const ang = segmentAngle(ta, tb);
  const dx = ua.x + Math.cos(ang) * len - ub.x;
  const dy = ua.y + Math.sin(ang) * len - ub.y;
  const info = SIDE_PART[bone];

  switch (info.verb) {
    case 'head':
      return towardLeft(dx, mirrored) ? 'Tilt your head toward your left' : 'Tilt your head toward your right';
    case 'body':
      return towardLeft(dx, mirrored) ? 'Lean toward your left' : 'Lean toward your right';
    case 'shoulders':
      return 'Level your shoulders';
    case 'leg':
      return Math.abs(dy) > Math.abs(dx)
        ? `${dy < 0 ? 'Lift' : 'Lower'} your ${info.noun}`
        : `Move your ${info.noun} ${outward(info.side!, dx, mirrored) ? 'out' : 'in'}`;
    case 'arm':
      if (Math.abs(dy) >= Math.abs(dx) * 0.8) return `${dy < 0 ? 'Raise' : 'Lower'} your ${info.noun}`;
      return `Move your ${info.noun} ${outward(info.side!, dx, mirrored) ? 'out' : 'in'}`;
  }
}

/** Hint for a hand that has to be somewhere specific on the face (dx/dy = where it must move to). */
export function describePointFix(p: PointScore, mirrored = false): string {
  const side = p.joint.startsWith('left') ? 'left' : 'right';
  if (Math.abs(p.dy) >= Math.abs(p.dx) * 0.8) return `${p.dy < 0 ? 'Raise' : 'Lower'} your ${side} hand`;
  return `Move your ${side} hand ${outward(side, p.dx, mirrored) ? 'out' : 'toward your face'}`;
}

const HIDDEN_NOUN: Record<BoneName, string> = {
  head: 'face',
  eyeLine: 'face',
  earLine: 'face',
  spine: 'upper body',
  shoulders: 'upper body',
  leftUpperArm: 'left arm',
  leftForeArm: 'left hand',
  rightUpperArm: 'right arm',
  rightForeArm: 'right hand',
  leftThigh: 'left leg',
  leftShin: 'left foot',
  rightThigh: 'right leg',
  rightShin: 'right foot',
};

const ordinalPrefix = (i: number, n: number) => (n > 1 ? `Person ${i + 1}: ` : '');

/**
 * One-shot evaluation of the whole scene.
 * `targets` and `detected` must share one coordinate space (view pixels).
 */
export function evaluateScene(targets: PlacedFigure[], detected: Skeleton[], opts: EvaluateOptions = {}): Guidance {
  const mirrored = opts.mirrored ?? false;
  const { people, extra } = assignPeople(detected, targets);
  const n = targets.length;
  const frame: PoseFrame = targets[0]?.frame ?? 'full';
  const present = people.filter(Boolean).length;
  const slots: SlotState[] = people.map((p) => ({ present: !!p, positioned: false, score: null, hint: null }));

  if (present === 0) {
    return { phase: 'no-people', headline: n > 1 ? `Get ${n} people in the frame` : 'Step into the frame', score: null, slots, extra };
  }
  if (present < n) {
    return { phase: 'no-people', headline: `${present} of ${n} people found. Everyone into the frame`, score: null, slots, extra };
  }

  // Slots are ordered the same way people were paired (left-to-right for groups).
  const leftToRight = targets.map((_, i) => i).sort((a, b) => center(targets[a].box).x - center(targets[b].box).x);
  const ordinal = (slot: number) => leftToRight.indexOf(slot);

  const unseen = people.findIndex((p) => p && !frameVisible(p, frame));
  if (unseen >= 0) {
    slots[unseen].hint = FRAMING_MESSAGE[frame];
    return { phase: 'framing', headline: `${ordinalPrefix(ordinal(unseen), n)}${FRAMING_MESSAGE[frame]}`, score: null, slots, extra };
  }

  let positionIssue: string | undefined;
  for (let i = 0; i < n; i++) {
    const hint = positionHint(targets[i], people[i]!);
    slots[i].positioned = hint === null;
    if (hint) {
      slots[i].hint = hint;
      positionIssue ??= `${ordinalPrefix(ordinal(i), n)}${hint}`;
    }
  }
  if (positionIssue) {
    return { phase: 'position', headline: positionIssue, score: null, slots, extra };
  }

  let sum = 0;
  let worst: { slot: number; severity: number } | undefined;
  for (let i = 0; i < n; i++) {
    const tgt = targets[i];
    const sc = scorePose(tgt.joints, people[i]!, tgt.occluded, { frame: tgt.frame, points: tgt.points });
    slots[i].score = sc;
    sum += sc.score ?? 0;
    if (sc.matched) continue;

    // Fix the worst limb or hand; if everything visible is fine but a limb is hidden, ask to show it.
    const wb = sc.bones.filter((b) => b.score < FIX_BELOW).sort((a, b) => a.score - b.score)[0];
    const wp = sc.points.filter((p) => p.score < FIX_BELOW).sort((a, b) => a.score - b.score)[0];
    const worstVisible = wp && (!wb || wp.score < wb.score) ? { score: wp.score, hint: describePointFix(wp, mirrored) } : wb ? { score: wb.score, hint: describeFix(wb.bone, tgt.joints, people[i]!, mirrored) } : null;

    let severity = 1;
    if (worstVisible && (worstVisible.score < CLEARLY_OFF || sc.hidden.length === 0)) {
      slots[i].hint = worstVisible.hint;
      severity = worstVisible.score;
    } else if (sc.hidden.length > 0) {
      slots[i].hint = `Show your ${HIDDEN_NOUN[sc.hidden[0]]}`;
      severity = HIDDEN_SEVERITY;
    }
    if (slots[i].hint && (!worst || severity < worst.severity)) worst = { slot: i, severity };
  }

  const score = sum / n;
  const allMatched = slots.every((s) => s.score?.matched);
  if (allMatched) return { phase: 'ready', headline: 'Perfect! Hold still…', score, slots, extra };

  const headline = worst
    ? `${ordinalPrefix(ordinal(worst.slot), n)}${slots[worst.slot].hint}`
    : 'Almost there. Fine-tune your pose';
  return { phase: 'pose', headline, score, slots, extra };
}
