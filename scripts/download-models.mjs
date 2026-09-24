/**
 * download-models.mjs — Downloads MediaPipe model files into public/models/.
 *
 * Usage:  node scripts/download-models.mjs
 *
 * Models:
 *   - pose_landmarker_lite.task
 *   - selfie_multiclass_256x256.task
 *
 * Idempotent: skips download if files already exist.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MODELS_DIR = join(__dirname, '..', 'public', 'models');

const MODELS = [
  {
    name: 'pose_landmarker_lite.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
  },
  {
    name: 'selfie_multiclass_256x256.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
  },
];

async function downloadModel(model) {
  const dest = join(MODELS_DIR, model.name);

  if (existsSync(dest)) {
    console.log(`✓ ${model.name} already exists, skipping.`);
    return;
  }

  console.log(`↓ Downloading ${model.name}...`);
  const response = await fetch(model.url);

  if (!response.ok) {
    throw new Error(`Failed to download ${model.name}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(dest, buffer);
  console.log(`✓ Saved ${model.name} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
}

async function main() {
  console.log(`\nMediaPipe Model Downloader\n${'─'.repeat(40)}`);
  console.log(`Target: ${MODELS_DIR}\n`);

  if (!existsSync(MODELS_DIR)) {
    mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`Created ${MODELS_DIR}\n`);
  }

  for (const model of MODELS) {
    await downloadModel(model);
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log('All models ready.\n');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
