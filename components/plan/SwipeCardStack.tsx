/**
 * SwipeCardStack.tsx
 *
 * A gesture-driven card deck for the Plan discovery flow.
 *
 * Architecture:
 * - Renders the top three cards of the stack. The active card (index 0)
 *   listens to PanResponder gestures. Cards 1 and 2 sit behind it, scaled
 *   and offset to give a tactile "deck" depth effect.
 * - Uses React Native's built-in Animated + PanResponder — no external
 *   gesture library required.
 *
 * Gesture logic:
 * - The PanResponder captures horizontal swipes (|dx| > |dy| + 2).
 *   This allows the card's internal ScrollView to receive vertical scroll
 *   events without interference.
 * - Right swipe (dx > THRESHOLD) → onPlan(guide)
 * - Left  swipe (dx < -THRESHOLD) → onSkip()
 * - Release below threshold → spring back to centre.
 *
 * Visual feedback:
 * - The card rotates gently as it's dragged (±8°).
 * - A gold "PLAN" label fades in on right swipe.
 * - A muted "SKIP" label fades in on left swipe.
 * - Background cards scale up subtly as the top card moves away.
 */

import type { GuideSwipeCard } from '@/lib/database.types';
import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GuidePreviewCard } from './GuidePreviewCard';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Horizontal distance in pixels before a swipe is committed. */
const SWIPE_THRESHOLD = 110;

/** How far off-screen to animate the departing card. */
const SWIPE_OUT_DISTANCE = 500;

/** Spring config for snapping the card back to centre. */
const SNAP_BACK_CONFIG = { tension: 40, friction: 7, useNativeDriver: false };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  guides: GuideSwipeCard[];
  /** Called when the user swipes right (commits to planning this Guide). */
  onPlan: (guide: GuideSwipeCard) => void;
  /** Called when the user swipes left (skips this Guide). */
  onSkip: () => void;
  /** Called when the stack is exhausted with no more Guides to show. */
  onEmpty?: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SwipeCardStack({ guides, onPlan, onSkip, onEmpty }: Props) {
  const position   = useRef(new Animated.ValueXY()).current;
  const topCardKey = useRef(0); // Forces re-mount of top card after each swipe

  // -------------------------------------------------------------------------
  // Derived animated values
  // -------------------------------------------------------------------------

  /** Rotation interpolated from horizontal drag: ±8° at the swipe threshold. */
  const rotate = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });

  /** "PLAN" label opacity fades in as the card moves right. */
  const planOpacity = position.x.interpolate({
    inputRange: [20, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  /** "SKIP" label opacity fades in as the card moves left. */
  const skipOpacity = position.x.interpolate({
    inputRange: [-80, -20],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  /**
   * The second card in the stack scales from 0.92 up to 1 as the top
   * card moves away, giving a satisfying "rising" effect.
   */
  const secondCardScale = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [1, 0.92, 1],
    extrapolate: 'clamp',
  });

  // -------------------------------------------------------------------------
  // Swipe-out helper
  // -------------------------------------------------------------------------

  function swipeOff(direction: 'left' | 'right') {
    const targetX = direction === 'right' ? SWIPE_OUT_DISTANCE : -SWIPE_OUT_DISTANCE;

    Animated.timing(position, {
      toValue: { x: targetX, y: 50 },
      duration: 280,
      useNativeDriver: false,
    }).start(() => {
      // After the animation, reset position and advance the stack
      position.setValue({ x: 0, y: 0 });
      topCardKey.current += 1;

      if (direction === 'right') {
        onPlan(guides[0]);
      } else {
        onSkip();
      }

      if (guides.length <= 1) {
        onEmpty?.();
      }
    });
  }

  // -------------------------------------------------------------------------
  // PanResponder
  // -------------------------------------------------------------------------

  const panResponder = useRef(
    PanResponder.create({
      // Only activate when the gesture is predominantly horizontal, so vertical
      // scroll inside the card's ScrollView is never blocked.
      onMoveShouldSetPanResponder: (_, { dx, dy }) => {
        return Math.abs(dx) > Math.abs(dy) + 2 && Math.abs(dx) > 5;
      },
      onPanResponderMove: (_, { dx, dy }) => {
        position.setValue({ x: dx, y: dy * 0.3 }); // Damp vertical movement
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        // A fast flick (velocity > 0.5) also counts as a committed swipe
        if (dx > SWIPE_THRESHOLD || vx > 0.5) {
          swipeOff('right');
        } else if (dx < -SWIPE_THRESHOLD || vx < -0.5) {
          swipeOff('left');
        } else {
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            ...SNAP_BACK_CONFIG,
          }).start();
        }
      },
    }),
  ).current;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!guides || guides.length === 0) {
    return null; // Parent handles the empty state
  }

  const topCardStyle = {
    transform: [
      { translateX: position.x },
      { translateY: position.y },
      { rotate },
    ],
  };

  return (
    <View style={styles.container}>
      {/* Third card — static, furthest back */}
      {guides.length >= 3 && (
        <View style={[styles.cardWrapper, styles.thirdCard]} pointerEvents="none">
          <GuidePreviewCard guide={guides[2]} isInteractive={false} />
        </View>
      )}

      {/* Second card — scales up as top card departs */}
      {guides.length >= 2 && (
        <Animated.View
          style={[styles.cardWrapper, styles.secondCard, { transform: [{ scale: secondCardScale }] }]}
          pointerEvents="none"
        >
          <GuidePreviewCard guide={guides[1]} isInteractive={false} />
        </Animated.View>
      )}

      {/* Top card — responds to gestures */}
      <Animated.View
        key={topCardKey.current}
        style={[styles.cardWrapper, topCardStyle]}
        {...panResponder.panHandlers}
      >
        {/* PLAN label — fades in on right swipe */}
        <Animated.View style={[styles.intentLabel, styles.planLabel, { opacity: planOpacity }]}>
          <Text style={styles.planLabelText}>PLAN IT</Text>
        </Animated.View>

        {/* SKIP label — fades in on left swipe */}
        <Animated.View style={[styles.intentLabel, styles.skipLabel, { opacity: skipOpacity }]}>
          <Text style={styles.skipLabelText}>SKIP</Text>
        </Animated.View>

        <GuidePreviewCard guide={guides[0]} isInteractive />
      </Animated.View>

      {/* Action buttons — fallback for users who prefer tapping */}
      <View style={styles.actions}>
        <Animated.View style={{ opacity: skipOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) }}>
          <View
            style={[styles.actionBtn, styles.skipBtn]}
            // @ts-ignore — onStartShouldSetResponder pattern for simple tap
          >
            <Text
              style={styles.skipBtnText}
              onPress={() => swipeOff('left')}
            >✕  Skip</Text>
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: planOpacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) }}>
          <View style={[styles.actionBtn, styles.planBtn]}>
            <Text
              style={styles.planBtnText}
              onPress={() => swipeOff('right')}
            >Plan it  ✓</Text>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const CARD_OFFSET = 10; // Vertical stagger between deck cards

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Each card sits in an absolute wrapper so they stack on top of each other
  cardWrapper: {
    position: 'absolute',
    width: '92%',
    // Cards are tall enough to show hero + scrollable steps
    maxHeight: 540,
  },

  secondCard: {
    top: CARD_OFFSET,
    zIndex: 1,
  },

  thirdCard: {
    top: CARD_OFFSET * 2,
    zIndex: 0,
  },

  // Swipe intent labels rendered over the top card
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
  planLabel: {
    left: 20,
    borderColor: '#BC8A2F',
  },
  planLabelText: {
    color: '#BC8A2F',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  skipLabel: {
    right: 20,
    borderColor: '#786C50',
  },
  skipLabelText: {
    color: '#786C50',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // Bottom action buttons
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
  skipBtn: {
    backgroundColor: '#1e2330',
  },
  skipBtnText: {
    color: '#786C50',
    fontWeight: '700',
    fontSize: 16,
  },
  planBtn: {
    backgroundColor: '#BC8A2F',
  },
  planBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
