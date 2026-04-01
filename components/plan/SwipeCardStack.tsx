/**
 * SwipeCardStack.tsx
 *
 * A gesture-driven card deck for the Plan discovery flow.
 *
 * Architecture:
 * - Renders the top three cards of the stack. The active card (index 0)
 *   listens to PanResponder gestures. Cards 1 and 2 sit behind it, scaled
 *   and offset via transform to give a tactile "deck" depth effect.
 * - Uses React Native's built-in Animated + PanResponder — no external
 *   gesture library required.
 *
 * Key design decisions:
 * - topCardKey is useState (not useRef) so incrementing it triggers a React
 *   re-render, which remounts the top card's Animated.View and resets its
 *   transform after each swipe.
 * - Background cards use transform: translateY for their deck offset, not the
 *   `top` style property. `top` in an absolute flex container is relative to
 *   the container edge — translateY is a visual offset from the card's own
 *   natural position and is predictable regardless of container layout.
 * - Explicit zIndex hierarchy (top: 10, second: 2, third: 1) ensures the
 *   correct card always wins touch-hit testing on both iOS and Android.
 * - pointerEvents="none" on background cards prevents any residual gesture
 *   interception from their internal ScrollViews.
 * - onPanResponderTerminationRequest returns false to prevent iOS from
 *   stealing the gesture mid-swipe.
 *
 * Gesture conflict resolution (horizontal swipe vs. vertical scroll):
 * - onMoveShouldSetPanResponder only returns true when |dx| > |dy| + 2
 *   AND |dx| > 8px. If the gesture is predominantly vertical, this returns
 *   false and the ScrollView inside the card handles it normally.
 */

import type { GuideSwipeCard } from '@/lib/database.types';
import React, { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GuidePreviewCard } from './GuidePreviewCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Horizontal distance (px) before a swipe is committed. */
const SWIPE_THRESHOLD = 110;

/** How far off-screen to animate the departing card. */
const SWIPE_OUT_DISTANCE = 500;

/**
 * Vertical offset (px) applied to background cards via translateY to create
 * the "deck peeking behind" visual. Kept small so the depth reads clearly
 * without pushing the bottom card out of the visible area.
 */
const DECK_OFFSET_Y = 14;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  guides: GuideSwipeCard[];
  onPlan:  (guide: GuideSwipeCard) => void;
  onSkip:  () => void;
  onEmpty?: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SwipeCardStack({ guides, onPlan, onSkip, onEmpty }: Props) {
  const position = useRef(new Animated.ValueXY()).current;

  /**
   * useState (not useRef) so that incrementing this value triggers a
   * re-render and remounts the top card's Animated.View, resetting its
   * transform cleanly after every swipe.
   */
  const [topCardKey, setTopCardKey] = useState(0);

  // -------------------------------------------------------------------------
  // Derived animated values
  // -------------------------------------------------------------------------

  /** Gentle rotation as the card is dragged: ±8° at the threshold. */
  const rotate = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });

  /** Gold "PLAN IT" stamp fades in as the card moves right. */
  const planOpacity = position.x.interpolate({
    inputRange: [20, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  /** Muted "SKIP" stamp fades in as the card moves left. */
  const skipOpacity = position.x.interpolate({
    inputRange: [-80, -20],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  /**
   * Second card scale: animates from 0.95 (resting) → 1.0 (full size) as
   * the top card is dragged away.
   */
  const secondCardScale = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [1.0, 0.95, 1.0],
    extrapolate: 'clamp',
  });

  /**
   * Second card translateY: animates from DECK_OFFSET_Y (resting, peeking
   * below) → 0 (fully risen) as the top card departs. Combined with scale
   * this gives a natural "card rising to the top" feel.
   */
  const secondCardTranslateY = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [0, DECK_OFFSET_Y, 0],
    extrapolate: 'clamp',
  });

  // -------------------------------------------------------------------------
  // Swipe-out
  // -------------------------------------------------------------------------

  function swipeOff(direction: 'left' | 'right') {
    const targetX = direction === 'right' ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;

    Animated.timing(position, {
      toValue:         { x: targetX, y: 50 },
      duration:        260,
      useNativeDriver: false,
    }).start(() => {
      // Reset position first, then increment the key. The key change
      // triggers a remount of the Animated.View, which starts fresh at {0,0}.
      position.setValue({ x: 0, y: 0 });
      setTopCardKey(prev => prev + 1);

      if (direction === 'right') {
        onPlan(guides[0]);
      } else {
        onSkip();
      }

      if (guides.length <= 1) onEmpty?.();
    });
  }

  // -------------------------------------------------------------------------
  // PanResponder
  // -------------------------------------------------------------------------

  const panResponder = useRef(
    PanResponder.create({
      // Do not claim the gesture on the initial touch — wait to see direction.
      onStartShouldSetPanResponder: () => false,

      // Only claim horizontal gestures. If the gesture is predominantly
      // vertical (the user is scrolling the step list), return false and let
      // the card's internal ScrollView handle it.
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) + 2 && Math.abs(dx) > 8,

      onPanResponderMove: (_, { dx, dy }) => {
        position.setValue({ x: dx, y: dy * 0.25 }); // Damp vertical drift
      },

      onPanResponderRelease: (_, { dx, vx }) => {
        if (dx > SWIPE_THRESHOLD || vx > 0.5) {
          swipeOff('right');
        } else if (dx < -SWIPE_THRESHOLD || vx < -0.5) {
          swipeOff('left');
        } else {
          Animated.spring(position, {
            toValue:         { x: 0, y: 0 },
            tension:         40,
            friction:        7,
            useNativeDriver: false,
          }).start();
        }
      },

      // Prevent iOS scroll views in parent containers from stealing the
      // gesture once this responder has claimed it.
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!guides || guides.length === 0) return null;

  return (
    <View style={styles.container}>

      {/* ── Third card — static, furthest back ──────────────────────────── */}
      {guides.length >= 3 && (
        <View
          style={[styles.cardWrapper, styles.thirdCard]}
          pointerEvents="none"
        >
          <GuidePreviewCard guide={guides[2]} isInteractive={false} />
        </View>
      )}

      {/* ── Second card — rises and scales as the top card departs ───────── */}
      {guides.length >= 2 && (
        <Animated.View
          style={[
            styles.cardWrapper,
            styles.secondCard,
            {
              transform: [
                { translateY: secondCardTranslateY },
                { scale: secondCardScale },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <GuidePreviewCard guide={guides[1]} isInteractive={false} />
        </Animated.View>
      )}

      {/* ── Top card — sole receiver of gestures ─────────────────────────── */}
      <Animated.View
        key={topCardKey}
        style={[
          styles.cardWrapper,
          styles.topCard,
          {
            transform: [
              { translateX: position.x },
              { translateY: position.y },
              { rotate },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Gold "PLAN IT" stamp */}
        <Animated.View style={[styles.intentLabel, styles.planLabel, { opacity: planOpacity }]}>
          <Text style={styles.planLabelText}>PLAN IT</Text>
        </Animated.View>

        {/* Muted "SKIP" stamp */}
        <Animated.View style={[styles.intentLabel, styles.skipLabel, { opacity: skipOpacity }]}>
          <Text style={styles.skipLabelText}>SKIP</Text>
        </Animated.View>

        <GuidePreviewCard guide={guides[0]} isInteractive />
      </Animated.View>

      {/* ── Fallback action buttons for users who prefer tapping ──────────── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.skipBtn]}
          onPress={() => swipeOff('left')}
          activeOpacity={0.8}
        >
          <Text style={styles.skipBtnText}>✕  Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.planBtn]}
          onPress={() => swipeOff('right')}
          activeOpacity={0.8}
        >
          <Text style={styles.planBtnText}>Plan it  ✓</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    // paddingBottom reserves room for the action buttons so the bottom of
    // the card stack is not occluded by the Skip / Plan buttons.
    paddingBottom: 80,
    paddingTop: 16,
  },

  // Shared base for all three card wrappers.
  // All cards sit at the same top: 0 position; visual offset is applied
  // exclusively via transform: translateY to keep layout deterministic.
  cardWrapper: {
    position: 'absolute',
    top: 16,
    width: '92%',
  },

  // ── Z-index hierarchy ────────────────────────────────────────────────────
  // Explicit values on every card prevent React Native from using render
  // order as the implicit tiebreaker (which can differ between iOS/Android).
  topCard: {
    zIndex: 10,
  },
  secondCard: {
    zIndex: 2,
    // Initial visual offset: DECK_OFFSET_Y px down + 95% scale.
    // These values are the "resting" state when position.x === 0.
    // The animated secondCardTranslateY/secondCardScale values override
    // this as the top card is dragged.
  },
  thirdCard: {
    zIndex: 1,
    // Static resting offset: 2× the deck offset, slightly smaller.
    transform: [{ translateY: DECK_OFFSET_Y * 2 }, { scale: 0.90 }],
  },

  // ── Swipe intent stamps ───────────────────────────────────────────────────
  intentLabel: {
    position: 'absolute',
    top: 24,
    zIndex: 10,
    borderWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    transform: [{ rotate: '-15deg' }],
  },
  planLabel:     { left: 20,  borderColor: '#BC8A2F' },
  planLabelText: { color: '#BC8A2F', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  skipLabel:     { right: 20, borderColor: '#786C50' },
  skipLabelText: { color: '#786C50', fontSize: 22, fontWeight: '900', letterSpacing: 2 },

  // ── Action buttons ────────────────────────────────────────────────────────
  actions: {
    position: 'absolute',
    bottom: 16,
    flexDirection: 'row',
    gap: 20,
    zIndex: 20,
  },
  actionBtn: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  skipBtn:     { backgroundColor: '#1e2330' },
  skipBtnText: { color: '#786C50', fontWeight: '700', fontSize: 16 },
  planBtn:     { backgroundColor: '#BC8A2F' },
  planBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
