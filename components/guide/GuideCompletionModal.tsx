/**
 * components/guide/GuideCompletionModal.tsx
 *
 * Celebrates the moment a user completes all required steps in a Guide.
 * Slides up from the bottom as a full-width sheet.
 *
 * Shown once per session when the last required (non-optional) step
 * is marked done. The parent is responsible for tracking whether this
 * modal has already been shown via a ref, to prevent it re-appearing
 * when the user undoes and redoes the final step.
 *
 * Props:
 *   visible          — Controls Modal visibility.
 *   guideTitle       — The Guide's title, shown in the header.
 *   totalSteps       — Total required steps (for the completion stat).
 *   phaseCount       — Total phases in the Guide.
 *   onClose          — Called when the user dismisses the modal.
 *   onShare          — Called when the user taps "Share to Hearth".
 *                      Pass null to hide the share button (e.g., anonymous users).
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

type Props = {
  visible: boolean;
  guideTitle: string;
  totalSteps: number;
  phaseCount: number;
  onClose: () => void;
  onShare: (() => void) | null;
};

export function GuideCompletionModal({
  visible,
  guideTitle,
  totalSteps,
  phaseCount,
  onClose,
  onShare,
}: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';

  const slideAnim = useRef(new Animated.Value(400)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start();
      fadeAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { backgroundColor: isDark ? '#0F1219' : '#fff', transform: [{ translateY: slideAnim }] },
        ]}
      >
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: isDark ? '#2a2f3e' : '#ddd' }]} />

        {/* Trophy */}
        <View style={styles.iconWrap}>
          <View style={[styles.iconBg, { backgroundColor: 'rgba(188,138,47,0.15)' }]}>
            <Ionicons name="trophy-outline" size={40} color="#BC8A2F" />
          </View>
        </View>

        {/* Heading */}
        <Text style={[styles.heading, { color: theme.text }]}>Guide Complete!</Text>
        <Text style={[styles.subheading, { color: '#BC8A2F' }]} numberOfLines={2}>
          {guideTitle}
        </Text>

        {/* Stats row */}
        <View style={[styles.statsRow, { borderColor: isDark ? '#1e2330' : '#eee' }]}>
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: theme.text }]}>{totalSteps}</Text>
            <Text style={[styles.statLabel, { color: isDark ? '#888' : '#666' }]}>
              {totalSteps === 1 ? 'step' : 'steps'}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: isDark ? '#1e2330' : '#eee' }]} />
          <View style={styles.stat}>
            <Text style={[styles.statNum, { color: theme.text }]}>{phaseCount}</Text>
            <Text style={[styles.statLabel, { color: isDark ? '#888' : '#666' }]}>
              {phaseCount === 1 ? 'phase' : 'phases'}
            </Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: isDark ? '#1e2330' : '#eee' }]} />
          <View style={styles.stat}>
            <Ionicons name="checkmark-circle" size={22} color="#375E3F" />
            <Text style={[styles.statLabel, { color: isDark ? '#888' : '#666' }]}>completed</Text>
          </View>
        </View>

        {/* Actions */}
        {onShare && (
          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: '#BC8A2F' }]}
            onPress={onShare}
            activeOpacity={0.85}
          >
            <Ionicons name="bonfire-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.shareBtnText}>Share to the Hearth</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[
            styles.closeBtn,
            { borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#121620' : '#f8f8f8' },
          ]}
          onPress={onClose}
          activeOpacity={0.8}
        >
          <Text style={[styles.closeBtnText, { color: isDark ? '#aaa' : '#666' }]}>
            Back to Guide
          </Text>
        </TouchableOpacity>

        {/* Bottom safe-area padding */}
        <View style={{ height: Platform.OS === 'ios' ? 28 : 16 }} />
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  iconWrap: { alignItems: 'center', marginBottom: 16 },
  iconBg: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 24,
    gap: 28,
  },
  stat: { alignItems: 'center', gap: 4 },
  statNum: { fontSize: 22, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 36 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  shareBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  closeBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  closeBtnText: { fontWeight: '700', fontSize: 15 },
});
