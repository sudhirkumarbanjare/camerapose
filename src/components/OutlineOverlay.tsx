import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
import type { SceneTransform } from '@/engine/layout';
import type { PoseDef, Size } from '@/engine/types';
import { composeOverlay, type OutlineStyle } from '@/outline/compose';

export const HAND_FONT = 'Kalam_700Bold';

interface Props {
  pose: PoseDef;
  transform: SceneTransform;
  size: Size;
  /** 0..1 pose match; the outline warms from white to green as it rises. */
  match?: number | null;
  /** Live coach hint shown as an extra handwritten line under the figure. */
  hint?: string | null;
  showCaptions?: boolean;
  /** 'lasso' (Huawei-style loose line, default) or 'body' (tight silhouette). */
  outlineStyle?: OutlineStyle;
}

const lineColor = (m: number | null | undefined) => (m == null || m < 0.6 ? '#FFFFFF' : m < 0.85 ? '#E6FFEF' : '#7CFFB2');

/**
 * Huawei-style pose guide: a smooth white outline of the body (with props) and handwritten tips,
 * drawn over the live camera. Every line is drawn twice, a soft dark stroke under a white one, so
 * it reads on bright and dark backgrounds alike.
 */
function OutlineOverlayImpl({ pose, transform, size, match, hint, showCaptions = true, outlineStyle = 'lasso' }: Props) {
  const overlay = useMemo(
    () => composeOverlay(pose, transform, size, { captions: showCaptions, style: outlineStyle }),
    // the transform changes as the person moves; round it so tiny jitter doesn't re-trace
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pose, Math.round(transform.scale), Math.round(transform.ox), Math.round(transform.oy), size.width, size.height, showCaptions, outlineStyle],
  );
  const color = lineColor(match);
  const strokeW = Math.max(2.4, Math.min(3.6, transform.scale * 0.006));

  return (
    <Svg width={size.width} height={size.height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {overlay.paths.map((p, i) => (
        <G key={i}>
          <Path d={p.d} fill="none" stroke="#000" strokeOpacity={0.28} strokeWidth={strokeW + 3} strokeLinecap="round" strokeLinejoin="round" />
          <Path
            d={p.d}
            fill="none"
            stroke={color}
            strokeOpacity={p.kind === 'inner' ? 0.85 : 1}
            strokeWidth={p.kind === 'inner' ? strokeW * 0.8 : strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      ))}
      {overlay.captions.map((c, i) => (
        <G key={`c${i}`} rotation={c.rotate} origin={`${c.x}, ${c.y}`}>
          <SvgText x={c.x} y={c.onLine ? c.y + c.fontSize * 0.35 : c.y} textAnchor={c.anchor} fontFamily={HAND_FONT} fontSize={c.fontSize} fill="#000" fillOpacity={0.35} stroke="#000" strokeOpacity={0.35} strokeWidth={3}>
            {c.text}
          </SvgText>
          <SvgText x={c.x} y={c.onLine ? c.y + c.fontSize * 0.35 : c.y} textAnchor={c.anchor} fontFamily={HAND_FONT} fontSize={c.fontSize} fill="#fff">
            {c.text}
          </SvgText>
        </G>
      ))}
      {hint ? (
        <G>
          <SvgText x={size.width / 2} y={size.height * 0.2} textAnchor="middle" fontFamily={HAND_FONT} fontSize={20} fill="#000" fillOpacity={0.4} stroke="#000" strokeOpacity={0.4} strokeWidth={3}>
            {hint}
          </SvgText>
          <SvgText x={size.width / 2} y={size.height * 0.2} textAnchor="middle" fontFamily={HAND_FONT} fontSize={20} fill="#FFE38A">
            {hint}
          </SvgText>
        </G>
      ) : null}
    </Svg>
  );
}

export const OutlineOverlay = memo(OutlineOverlayImpl);
