import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme';

const SIZE = 84;
const R = 38;
const C = 2 * Math.PI * R;

/** Shutter button wrapped in a ring that fills while the pose is being held. */
export function Shutter({ progress, onPress, disabled }: { progress: number; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.wrap} accessibilityRole="button" accessibilityLabel="Take photo">
      <Svg width={SIZE} height={SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="rgba(255,255,255,0.35)" strokeWidth={4} fill="none" />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={colors.good}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${C * progress} ${C}`}
          rotation={-90}
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      <View style={[styles.core, disabled && { opacity: 0.4 }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  core: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#fff' },
});
