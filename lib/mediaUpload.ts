/**
 * lib/mediaUpload.ts
 *
 * Helpers for picking images from the device library and uploading them to
 * Supabase Storage.
 *
 * Two upload paths:
 *   pickAndUploadHeroImage()  — guide hero images → guide-media bucket
 *   pickAndUploadStepImage()  — per-step photos   → step-media bucket
 *
 * Upload strategy:
 *   1. Request photo library permission via expo-image-picker.
 *   2. Launch the image picker (square crop for hero, free crop for steps).
 *   3. Convert the local file URI to a Blob via fetch().
 *   4. Upload to Supabase Storage under {userId}/{timestamp}.{ext}.
 *   5. Return the public URL, or null if the user cancelled.
 *
 * The public URL is stable — Supabase Storage public buckets serve objects
 * at a fixed URL that never expires.
 */

import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the file extension from a URI (defaults to 'jpg').
 */
function getExtension(uri: string): string {
  const match = uri.match(/\.(\w+)(\?|$)/);
  return match ? match[1].toLowerCase() : 'jpg';
}

/**
 * Converts a local file URI to a Blob for upload.
 * Works on both iOS (file://) and Android (content://) URIs.
 */
async function uriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  return response.blob();
}

/**
 * Uploads a local image URI to the specified bucket and returns its public URL.
 *
 * @param bucket  - 'guide-media' or 'step-media'
 * @param userId  - The authenticated user's ID (used as the folder name)
 * @param uri     - Local file URI from expo-image-picker
 */
async function uploadImage(bucket: string, userId: string, uri: string): Promise<string> {
  const ext  = getExtension(uri);
  const path = `${userId}/${Date.now()}.${ext}`;
  const blob = await uriToBlob(uri);

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: `image/${ext}`, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Requests photo library permissions, returning true if granted.
 * On iOS this shows a system prompt on first call; on Android it is a no-op
 * for most SDK versions (permissions are declared in AndroidManifest).
 */
async function requestPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return status === 'granted';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Opens the image picker for a guide hero image.
 * Uses a 16:9 aspect ratio crop and medium quality to keep file sizes small.
 *
 * Returns the public URL on success, or null if the user cancelled.
 * Throws if the upload fails.
 */
export async function pickAndUploadHeroImage(): Promise<string | null> {
  const granted = await requestPermission();
  if (!granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  return uploadImage('guide-media', user.id, result.assets[0].uri);
}

/**
 * Opens the image picker for a step photo.
 * Free crop — the creator decides the framing.
 *
 * Returns the public URL on success, or null if the user cancelled.
 * Throws if the upload fails.
 */
export async function pickAndUploadStepImage(): Promise<string | null> {
  const granted = await requestPermission();
  if (!granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    quality: 0.8,
  });

  if (result.canceled || !result.assets[0]) return null;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  return uploadImage('step-media', user.id, result.assets[0].uri);
}
