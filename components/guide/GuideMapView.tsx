/**
 * components/guide/GuideMapView.tsx
 *
 * Renders a route map for a guide: each step with a location_anchor appears
 * as a numbered pin in order, connected by a polyline.
 *
 * Tapping a pin calls onStepPress(stepIndex) so the parent can scroll the
 * step list to that position.
 *
 * Requires `react-native-maps` — install with:
 *   npx expo install react-native-maps
 * and add to app.json plugins:
 *   ["react-native-maps", { "googleMapsApiKey": "..." }]   (Android)
 *
 * Until the package is installed this component shows a placeholder card
 * (same lazy-require guard used in lib/notifications.ts).
 */

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// Lazy require — keeps the app buildable before react-native-maps is added.
let MapView: any = null;
let Marker:  any = null;
let Polyline: any = null;
try {
  const maps = require('react-native-maps');
  MapView   = maps.default;
  Marker    = maps.Marker;
  Polyline  = maps.Polyline;
} catch {
  // react-native-maps not installed — GuideMapView renders a placeholder.
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeoStep = {
  id: string;
  title: string;
  /** latitude */
  lat: number;
  /** longitude */
  lng: number;
  /** 0-based index within the flattened step list */
  stepIndex: number;
};

type Props = {
  steps: GeoStep[];
  onStepPress?: (stepIndex: number) => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GuideMapView({ steps, onStepPress }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const mapRef = useRef<any>(null);

  // Fit all pins in view once the map mounts
  useEffect(() => {
    if (!mapRef.current || steps.length < 2) return;
    const coords = steps.map(s => ({ latitude: s.lat, longitude: s.lng }));
    // Small delay ensures the map has rendered before fitToCoordinates
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
        animated: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [steps]);

  // --- Package not installed ---
  if (!MapView) {
    return (
      <View style={[styles.placeholder, { backgroundColor: theme.cardBackground }]}>
        <Ionicons name="map-outline" size={48} color="#ccc" />
        <Text style={styles.placeholderTitle}>Map Not Available</Text>
        <Text style={styles.placeholderBody}>
          Install <Text style={{ fontFamily: 'Chivo_700Bold' }}>react-native-maps</Text> to see the
          step-by-step route for this guide.
        </Text>
      </View>
    );
  }

  const polylineCoords = steps.map(s => ({ latitude: s.lat, longitude: s.lng }));

  // Initial region — centre on the first step
  const initialRegion = {
    latitude:      steps[0].lat,
    longitude:     steps[0].lng,
    latitudeDelta:  0.05,
    longitudeDelta: 0.05,
  };

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={initialRegion}
    >
      {/* Route line */}
      <Polyline
        coordinates={polylineCoords}
        strokeColor="#BC8A2F"
        strokeWidth={3}
        lineDashPattern={[6, 4]}
      />

      {/* Numbered waypoint pins */}
      {steps.map((step, i) => (
        <Marker
          key={step.id}
          coordinate={{ latitude: step.lat, longitude: step.lng }}
          title={`${i + 1}. ${step.title}`}
          onPress={() => onStepPress?.(step.stepIndex)}
        >
          <View style={[styles.pin, i === 0 ? styles.pinFirst : i === steps.length - 1 ? styles.pinLast : {}]}>
            <Text style={styles.pinNumber}>{i + 1}</Text>
          </View>
        </Marker>
      ))}
    </MapView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  map: { flex: 1 },

  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    borderRadius: 16,
    padding: 32,
    gap: 12,
  },
  placeholderTitle: {
    fontSize: 16,
    fontFamily: 'Chivo_700Bold',
    color: '#999',
  },
  placeholderBody: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 20,
  },

  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#BC8A2F',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  pinFirst:  { backgroundColor: '#375E3F' },
  pinLast:   { backgroundColor: '#080A12' },
  pinNumber: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
