import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

type Props = {
  /** The guide's primary hero image, shown as the default state. */
  heroUrl: string | null;
  /**
   * The first media item from the currently active step's media_payload.
   * When non-null, smoothly replaces the hero image. When null (e.g., the
   * active step has no media, or the phase is Freeform), falls back to heroUrl.
   */
  activeMediaUrl: string | null;
};

const FADE_OUT_MS = 150;
const FADE_IN_MS  = 200;

/**
 * Sticky media header that sits above the BirdsEyeHeader on the Guide detail
 * screen. Displays the guide hero image by default and crossfades to the active
 * step's media as the user swipes through a Sequential phase.
 *
 * Uses standard React Native Animated (not Reanimated) because the fade is a
 * simple opacity transition and requires no layout-level animation.
 */
export function MediaHeader({ heroUrl, activeMediaUrl }: Props) {
  const resolvedUrl = activeMediaUrl ?? heroUrl;

  // displayedUrl is what the image element actually renders. It only updates
  // inside the fade-out callback so the swap is invisible to the user.
  const [displayedUrl, setDisplayedUrl] = useState<string | null>(resolvedUrl);
  const opacity = useRef(new Animated.Value(1)).current;
  // Track whether an animation is already running to avoid overlap.
  const animating = useRef(false);

  useEffect(() => {
    if (resolvedUrl === displayedUrl) return;
    if (animating.current) {
      // If a transition is in flight, just update the displayed URL directly
      // so the next render shows the correct image without stuttering.
      setDisplayedUrl(resolvedUrl);
      return;
    }

    animating.current = true;

    Animated.timing(opacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => {
      setDisplayedUrl(resolvedUrl);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }).start(() => {
        animating.current = false;
      });
    });
  }, [resolvedUrl]);

  return (
    <View style={styles.container}>
      {displayedUrl ? (
        <Animated.Image
          source={{ uri: displayedUrl }}
          style={[styles.image, { opacity }]}
          resizeMode="cover"
        />
      ) : (
        // Placeholder shown when neither the guide nor the step has any media.
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 220,
    backgroundColor: '#080A12', // midnightRoyal — prevents flash on load
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#121620', // obsidianCard
  },
});
