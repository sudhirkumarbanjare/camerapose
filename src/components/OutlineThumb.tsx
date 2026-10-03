import { memo, useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { sceneTransform } from '@/engine/layout';
import type { PoseDef } from '@/engine/types';
import { composeOverlay } from '@/outline/compose';

/** Small outline preview for the pose panel (coarser raster, no captions). */
function OutlineThumbImpl({ pose, width, height, color = '#fff' }: { pose: PoseDef; width: number; height: number; color?: string }) {
  const paths = useMemo(() => {
    const view = { width, height };
    const t = sceneTransform(pose, view, { heightFrac: 0.86, bottomFrac: pose.frame === 'full' ? 0.95 : 1.02, widthFrac: 0.92 });
    return composeOverlay(pose, t, view, { captions: false, cell: 0.008 }).paths;
  }, [pose, width, height]);
  return (
    <Svg width={width} height={height}>
      {paths.map((p, i) => (
        <Path key={i} d={p.d} fill="none" stroke={color} strokeOpacity={p.kind === 'inner' ? 0.75 : 1} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

export const OutlineThumb = memo(OutlineThumbImpl);
