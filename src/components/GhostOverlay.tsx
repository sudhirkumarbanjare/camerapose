import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { BONE_LINES, silhouette } from './figureShapes';
import type { Guidance } from '@/engine/coach';
import { BONES, type BoneName, type PlacedFigure, type Size, type Skeleton } from '@/engine/types';
import { isVisible } from '@/engine/skeleton';
import { colors } from '@/theme';

interface Props {
  size: Size;
  figures: PlacedFigure[];
  guidance: Guidance | null;
  users: Skeleton[];
  showUsers: boolean;
}

const boneColor = (score: number | undefined) =>
  score === undefined ? colors.ghost : score >= 0.8 ? colors.good : score >= 0.5 ? colors.warn : colors.bad;

/** The silhouette and head never change for a given pose, so they render once per figure. */
const FigureBody = memo(function FigureBody({ figure }: { figure: PlacedFigure }) {
  const sil = useMemo(() => silhouette(figure), [figure]);
  return (
    <G>
      {[sil.torso, sil.legs, sil.arms, sil.neck].map((s, k) => (
        <Path key={k} d={s.d} stroke={colors.ghost} strokeOpacity={0.16} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
      <Circle cx={figure.head.c.x} cy={figure.head.c.y} r={figure.head.r} fill={colors.ghost} fillOpacity={0.16} stroke={colors.ghost} strokeOpacity={0.9} strokeWidth={2.5} />
    </G>
  );
});

/**
 * The target pose as a translucent cyan "shadow" with a skeleton on top whose
 * bones turn green / amber / red as the live pose gets closer. The user's own
 * detected skeleton is drawn in white underneath for self-correction.
 */
function GhostOverlayImpl({ size, figures, guidance, users, showUsers }: Props) {
  return (
    <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {figures.map((f, i) => {
        const slot = guidance?.slots[i];
        const byBone = new Map<BoneName, number>(slot?.score?.bones.map((b) => [b.bone, b.score]) ?? []);
        const feet = f.joints.leftAnkle && f.joints.rightAnkle
          ? { x: (f.joints.leftAnkle.x + f.joints.rightAnkle.x) / 2, y: Math.max(f.joints.leftAnkle.y, f.joints.rightAnkle.y) + f.box.h * 0.03 }
          : null;
        const needPosition = guidance?.phase === 'position' && slot && !slot.positioned;
        return (
          <G key={i}>
            <FigureBody figure={f} />
            {BONES.map((b) => {
              const [a, c] = BONE_LINES[b.name];
              const ja = f.joints[a];
              const jc = f.joints[c];
              if (!ja || !jc) return null;
              return (
                <Line key={b.name} x1={ja.x} y1={ja.y} x2={jc.x} y2={jc.y} stroke={boneColor(byBone.get(b.name))} strokeWidth={3.5} strokeLinecap="round" strokeOpacity={0.95} />
              );
            })}
            {feet && needPosition ? (
              <G>
                <Ellipse cx={feet.x} cy={feet.y} rx={f.box.h * 0.22} ry={f.box.h * 0.045} stroke={colors.ghost} strokeWidth={3} strokeDasharray="10 8" fill={colors.ghost} fillOpacity={0.12} />
                <SvgText x={feet.x} y={feet.y + f.box.h * 0.1} fill={colors.ghost} fontSize={14} fontWeight="700" textAnchor="middle" letterSpacing={2}>
                  STAND HERE
                </SvgText>
              </G>
            ) : null}
          </G>
        );
      })}

      {showUsers
        ? users.map((u, i) => (
            <G key={`u${i}`} opacity={0.75}>
              {BONES.map((b) => {
                const [a, c] = BONE_LINES[b.name];
                const ja = u[a];
                const jc = u[c];
                if (!isVisible(ja) || !isVisible(jc)) return null;
                return <Line key={b.name} x1={ja.x} y1={ja.y} x2={jc.x} y2={jc.y} stroke="#fff" strokeWidth={2} strokeLinecap="round" />;
              })}
              {Object.entries(u).map(([k, j]) =>
                k.startsWith('mid') || !isVisible(j) ? null : <Circle key={k} cx={j.x} cy={j.y} r={3.5} fill="#fff" />,
              )}
            </G>
          ))
        : null}
    </Svg>
  );
}

export const GhostOverlay = memo(GhostOverlayImpl);
