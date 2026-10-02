import { useMemo } from 'react';
import Svg, { Circle, G, Line } from 'react-native-svg';
import { BONE_LINES } from './figureShapes';
import { placePose } from '@/engine/layout';
import { bonesFor, type PoseDef } from '@/engine/types';
import { colors } from '@/theme';

/** Static preview of a pose, drawn from the same data the camera overlay uses. */
export function PoseThumb({ pose, width, height, tint = colors.ghost }: { pose: PoseDef; width: number; height: number; tint?: string }) {
  const figures = useMemo(
    () => placePose(pose, { width, height }, { heightFrac: 0.84, bottomFrac: 0.95, widthFrac: 0.94 }),
    [pose, width, height],
  );
  return (
    <Svg width={width} height={height}>
      {figures.map((f, i) => (
        <G key={i}>
          {bonesFor(pose.frame).map((b) => {
            const [a, c] = BONE_LINES[b.name];
            const ja = f.joints[a];
            const jc = f.joints[c];
            if (!ja || !jc) return null;
            return <Line key={`${i}${b.name}`} x1={ja.x} y1={ja.y} x2={jc.x} y2={jc.y} stroke={tint} strokeWidth={Math.max(2, f.box.h * 0.035)} strokeLinecap="round" />;
          })}
          <Circle cx={f.head.c.x} cy={f.head.c.y} r={f.head.r} stroke={tint} strokeWidth={Math.max(1.5, f.box.h * 0.025)} fill="none" />
          {pose.frame !== 'full'
            ? [f.joints.leftEye, f.joints.rightEye, f.joints.mouthLeft, f.joints.mouthRight].map((d, k) =>
                d ? <Circle key={`d${i}${k}`} cx={d.x} cy={d.y} r={Math.max(1.5, f.head.r * 0.08)} fill={tint} /> : null,
              )
            : null}
          {(['left', 'right'] as const).map((side) => {
            const w = f.joints[`${side}Wrist` as const];
            const ix = f.joints[`${side}Index` as const];
            return pose.frame !== 'full' && w && ix ? <Line key={`f${i}${side}`} x1={w.x} y1={w.y} x2={ix.x} y2={ix.y} stroke={tint} strokeWidth={Math.max(2, f.head.r * 0.2)} strokeLinecap="round" /> : null;
          })}
        </G>
      ))}
    </Svg>
  );
}
