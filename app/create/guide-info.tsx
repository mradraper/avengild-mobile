/**
 * create/guide-info.tsx
 *
 * Step 1 of the Guide Creation wizard.
 *
 * The user sets the core identity of their Guide:
 * - Title (required)
 * - Description — the "what and why" of this Guide
 * - Summary — the short one-liner for Discovery cards
 * - Primary location name — the city or venue (e.g., "Edmonton, AB")
 * - Difficulty level — freetext (e.g., "Beginner", "Moderate", "Advanced")
 * - Duration estimate — freetext (e.g., "2–3 hours", "Full day")
 * - Stewardship level — Public / Guild Only / Private
 * - Derivative licence — allow forking / locked execution
 *
 * Navigation: Continue → /create/phases
 */

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { useGuideCreation } from '@/lib/GuideCreationContext';
import type { Enums } from '@/lib/database.types';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Small helper: pill selector for enum options
// ---------------------------------------------------------------------------

function PillSelector<T extends string>({
  options,
  value,
  onChange,
  theme,
  isDark,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  theme: any;
  isDark: boolean;
}) {
  return (
    <View style={pilStyles.row}>
      {options.map(opt => {
        const isSelected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.75}
            style={StyleSheet.flatten([
              pilStyles.pill,
              { borderColor: isSelected ? theme.tint : (isDark ? '#1e2330' : '#ddd') },
              isSelected && { backgroundColor: isDark ? 'rgba(188,138,47,0.12)' : 'rgba(55,94,63,0.08)' },
            ])}
          >
            <Text style={[pilStyles.pillLabel, { color: isSelected ? theme.tint : (isDark ? '#aaa' : '#666') }]}>
              {opt.label}
            </Text>
            {opt.hint ? (
              <Text style={[pilStyles.pillHint, { color: isDark ? '#666' : '#aaa' }]}>{opt.hint}</Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const pilStyles = StyleSheet.create({
  row:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  pill:      { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  pillLabel: { fontSize: 14, fontWeight: '600' },
  pillHint:  { fontSize: 11, marginTop: 2 },
});

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function GuideInfoScreen() {
  const colorScheme = useColorScheme();
  const theme  = Colors[colorScheme ?? 'dark'];
  const isDark = colorScheme === 'dark';
  const subText = isDark ? '#aaa' : '#666';
  const router  = useRouter();

  const { guide, setGuide } = useGuideCreation();

  function handleContinue() {
    if (!guide.title.trim()) {
      Alert.alert('Title required', 'Please give your Guide a title before continuing.');
      return;
    }
    router.push('/create/phases');
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <Stack.Screen
        options={{
          title: 'New Guide',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.tint,
          headerShadowVisible: false,
        }}
      />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Progress indicator */}
        <View style={styles.progressRow}>
          {[1, 2, 3, 4].map(step => (
            <View
              key={step}
              style={StyleSheet.flatten([
                styles.progressDot,
                step === 1 && { backgroundColor: theme.tint, width: 24 },
                step !== 1 && { backgroundColor: isDark ? '#1e2330' : '#ddd' },
              ])}
            />
          ))}
        </View>
        <Text style={[styles.stepLabel, { color: subText }]}>STEP 1 OF 4  ·  Guide Identity</Text>

        {/* Title */}
        <Text style={[styles.fieldLabel, { color: theme.text }]}>Title <Text style={{ color: '#BC2F38' }}>*</Text></Text>
        <TextInput
          style={StyleSheet.flatten([styles.input, styles.inputLg, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#121620' : '#fff' }])}
          placeholder="e.g., Thai Garden YEG — Best Thai in Edmonton"
          placeholderTextColor={subText}
          value={guide.title}
          onChangeText={t => setGuide({ title: t })}
          maxLength={100}
        />

        {/* Description */}
        <Text style={[styles.fieldLabel, { color: theme.text }]}>Description</Text>
        <Text style={[styles.fieldHint, { color: subText }]}>
          The "what and why" — shown on the Guide detail screen.
        </Text>
        <TextInput
          style={StyleSheet.flatten([styles.input, styles.inputTall, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#121620' : '#fff' }])}
          placeholder="Describe what this Guide covers and why you made it."
          placeholderTextColor={subText}
          value={guide.description}
          onChangeText={t => setGuide({ description: t })}
          multiline
          maxLength={500}
        />

        {/* Summary */}
        <Text style={[styles.fieldLabel, { color: theme.text }]}>Summary</Text>
        <Text style={[styles.fieldHint, { color: subText }]}>
          One sentence for Discovery cards and search results.
        </Text>
        <TextInput
          style={StyleSheet.flatten([styles.input, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#121620' : '#fff' }])}
          placeholder="e.g., The definitive guide to the best Thai restaurant in Edmonton."
          placeholderTextColor={subText}
          value={guide.summary}
          onChangeText={t => setGuide({ summary: t })}
          maxLength={160}
        />

        {/* Location */}
        <Text style={[styles.fieldLabel, { color: theme.text }]}>Location</Text>
        <View style={styles.iconInput}>
          <Ionicons name="location-outline" size={18} color={subText} style={styles.inputIcon} />
          <TextInput
            style={StyleSheet.flatten([styles.input, styles.inputFlex, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#121620' : '#fff' }])}
            placeholder="e.g., Edmonton, AB"
            placeholderTextColor={subText}
            value={guide.primary_location_name}
            onChangeText={t => setGuide({ primary_location_name: t })}
          />
        </View>

        {/* Difficulty + Duration */}
        <View style={styles.twoCol}>
          <View style={styles.half}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Difficulty</Text>
            <TextInput
              style={StyleSheet.flatten([styles.input, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#121620' : '#fff' }])}
              placeholder="e.g., Beginner"
              placeholderTextColor={subText}
              value={guide.difficulty_level}
              onChangeText={t => setGuide({ difficulty_level: t })}
            />
          </View>
          <View style={styles.half}>
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Duration</Text>
            <TextInput
              style={StyleSheet.flatten([styles.input, { color: theme.text, borderColor: isDark ? '#1e2330' : '#ddd', backgroundColor: isDark ? '#121620' : '#fff' }])}
              placeholder="e.g., 2–3 hours"
              placeholderTextColor={subText}
              value={guide.duration_estimate}
              onChangeText={t => setGuide({ duration_estimate: t })}
            />
          </View>
        </View>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: isDark ? '#1e2330' : '#e8e8e8' }]} />

        {/* Stewardship level */}
        <Text style={[styles.fieldLabel, { color: theme.text }]}>Visibility</Text>
        <Text style={[styles.fieldHint, { color: subText }]}>
          Who can see this Guide? You can change this after publishing.
        </Text>
        <PillSelector<Enums['stewardship_level']>
          options={[
            { value: 'Private',    label: 'Private',    hint: 'Only you' },
            { value: 'Guild_Only', label: 'Guild Only', hint: 'Your guilds' },
            { value: 'Public',     label: 'Public',     hint: 'Everyone' },
          ]}
          value={guide.stewardship_level}
          onChange={v => setGuide({ stewardship_level: v })}
          theme={theme}
          isDark={isDark}
        />

        {/* Derivative licence */}
        <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 20 }]}>Forking Permissions</Text>
        <Text style={[styles.fieldHint, { color: subText }]}>
          Can others adapt this Guide and publish their own version?
        </Text>
        <PillSelector<Enums['derivative_licence']>
          options={[
            { value: 'allow_forking',    label: 'Allow Forking',    hint: 'Others can fork & publish' },
            { value: 'locked_execution', label: 'Locked Execution', hint: 'Execute only, no forks' },
          ]}
          value={guide.derivative_licence}
          onChange={v => setGuide({ derivative_licence: v })}
          theme={theme}
          isDark={isDark}
        />

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Continue button */}
      <View style={[styles.footer, { backgroundColor: theme.background, borderTopColor: isDark ? '#1e2330' : '#e8e8e8' }]}>
        <TouchableOpacity
          style={[styles.continueBtn, { backgroundColor: guide.title.trim() ? theme.tint : '#333' }]}
          onPress={handleContinue}
          activeOpacity={0.85}
        >
          <Text style={styles.continueBtnText}>Add Phases  →</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressDot: { height: 4, borderRadius: 2, flex: 1 },
  stepLabel:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 20 },

  fieldLabel: { fontSize: 15, fontWeight: '700', marginBottom: 6, marginTop: 18 },
  fieldHint:  { fontSize: 13, marginBottom: 8, marginTop: -4 },

  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputLg:   { fontSize: 18, fontWeight: '700', paddingVertical: 12 },
  inputTall: { minHeight: 90, textAlignVertical: 'top', paddingTop: 10 },
  inputFlex: { flex: 1 },

  iconInput: { flexDirection: 'row', alignItems: 'center' },
  inputIcon: { position: 'absolute', left: 10, zIndex: 1 },

  twoCol: { flexDirection: 'row', gap: 12 },
  half:   { flex: 1 },

  divider: { height: 1, marginVertical: 24 },

  footer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  continueBtn:     { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  continueBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
