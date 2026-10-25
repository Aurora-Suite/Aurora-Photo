import type { Fx, Grade } from '../types';
import { defaultFx, defaultGrade } from './color';

export interface Look {
  name: string;
  grade: Partial<Grade>;
  fx?: Partial<Fx>;
}

const w = (r: number, g: number, b: number, m: number) => ({ r, g, b, m });

// Looks de un clic. Se aplican sobre un revelado neutro.
export const LOOKS: Look[] = [
  { name: 'Original', grade: {} },
  { name: 'Vivo', grade: { contrast: 0.12, vibrance: 0.45, saturation: 1.08, shadows: 0.15 }, fx: { clarity: 0.15 } },
  { name: 'Cine', grade: { contrast: 0.18, lift: w(-0.02, 0.01, 0.05, 0), gain: w(1.04, 1, 0.94, 1), saturation: 0.92, highlights: -0.2 }, fx: { vignette: 0.25 } },
  { name: 'Teal & Orange', grade: { contrast: 0.15, lift: w(-0.03, 0.02, 0.06, 0), gain: w(1.08, 1, 0.9, 1), vibrance: 0.25, hsl: { enabled: true, hue: 30, range: 70, softness: 40, hueShift: -6, sat: 1.25, lum: 0.05 } } },
  { name: 'Cálido', grade: { temperature: 0.35, tint: -0.05, vibrance: 0.2, shadows: 0.08 } },
  { name: 'Frío', grade: { temperature: -0.35, tint: 0.04, contrast: 0.08, saturation: 0.95 } },
  { name: 'Atardecer', grade: { temperature: 0.5, tint: 0.12, exposure: 0.1, contrast: 0.1, vibrance: 0.35, gain: w(1.06, 0.98, 0.9, 1) }, fx: { vignette: 0.3 } },
  { name: 'Mate', grade: { fade: 0.55, contrast: -0.08, saturation: 0.88, curves: { m: [[0, 0.08], [0.5, 0.5], [1, 0.95]], r: [[0, 0], [1, 1]], g: [[0, 0], [1, 1]], b: [[0, 0], [1, 1]] } } },
  { name: 'Película', grade: { fade: 0.35, temperature: 0.12, contrast: 0.1, saturation: 0.85, lift: w(0, 0.01, 0.03, 0) }, fx: { grain: 0.35 } },
  { name: 'Vintage', grade: { fade: 0.6, temperature: 0.28, tint: 0.08, saturation: 0.7, contrast: -0.05 }, fx: { grain: 0.4, vignette: 0.45 } },
  { name: 'Dramático', grade: { contrast: 0.32, highlights: -0.35, shadows: 0.2, saturation: 0.85, blacks: -0.15 }, fx: { clarity: 0.55, vignette: 0.45 } },
  { name: 'Neón', grade: { saturation: 1.3, vibrance: 0.4, contrast: 0.2, tint: 0.15, temperature: -0.15 }, fx: { clarity: 0.2 } },
  { name: 'B/N Clásico', grade: { bw: 1, contrast: 0.25, blacks: -0.1 }, fx: { clarity: 0.2 } },
  { name: 'B/N Suave', grade: { bw: 1, fade: 0.4, contrast: -0.05, highlights: -0.2 }, fx: { grain: 0.25 } },
  { name: 'Noir', grade: { bw: 1, contrast: 0.45, blacks: -0.25, whites: 0.15 }, fx: { vignette: 0.6, grain: 0.3 } },
  { name: 'Sepia', grade: { bw: 1, temperature: 0.45, tint: 0.06, fade: 0.3 }, fx: { vignette: 0.3 } },
];

export function applyLook(look: Look): { grade: Grade; fx: Fx } {
  return { grade: { ...defaultGrade(), ...look.grade }, fx: { ...defaultFx(), ...(look.fx || {}) } };
}
