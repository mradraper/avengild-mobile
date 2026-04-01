/**
 * StepTimer.tsx
 *
 * A self-contained countdown timer for timer-type steps.
 * Shows MM:SS countdown with start/pause/reset controls.
 * When the timer reaches zero, calls onComplete().
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

type Props = {
  totalSeconds: number;
  onComplete?: () => void;
};

export function StepTimer({ totalSeconds, onComplete }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';

  const [remaining, setRemaining] = useState(totalSeconds);
  const [running,   setRunning]   = useState(false);
  const [finished,  setFinished]  = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    if (remaining <= 0) return;
    setRunning(true);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          stop();
          setFinished(true);
          Vibration.vibrate([0, 200, 100, 200]);
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [remaining, stop, onComplete]);

  const reset = useCallback(() => {
    stop();
    setRemaining(totalSeconds);
    setFinished(false);
  }, [stop, totalSeconds]);

  // Clean up on unmount
  useEffect(() => () => stop(), [stop]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const ringColour = finished
    ? '#375E3F'
    : running
      ? theme.tint
      : (isDark ? '#1e2330' : '#e8e8e8');

  return (
    <View style={styles.container}>
      {/* Circular ring display */}
      <View style={[styles.ring, { borderColor: ringColour }]}>
        <Text style={[styles.time, { color: finished ? '#375E3F' : theme.text }]}>
          {finished
            ? 'Done!'
            : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
        </Text>
        {!finished && (
          <Text style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
            of {Math.floor(totalSeconds / 60)}:{String(totalSeconds % 60).padStart(2, '0')}
          </Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {!finished && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: running ? '#786C50' : theme.tint }]}
            onPress={running ? stop : start}
          >
            <Ionicons name={running ? 'pause' : 'play'} size={18} color="#fff" />
            <Text style={styles.btnText}>
              {running ? 'Pause' : (remaining === totalSeconds ? 'Start' : 'Resume')}
            </Text>
          </TouchableOpacity>
        )}
        {(remaining < totalSeconds || finished) && (
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: isDark ? '#1e2330' : '#eee' }]}
            onPress={reset}
          >
            <Ionicons name="refresh-outline" size={16} color={isDark ? '#ccc' : '#555'} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 16 },
  ring: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  time:     { fontSize: 28, fontWeight: '800' },
  controls: { flexDirection: 'row', gap: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 22,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
