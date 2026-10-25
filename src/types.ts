export type CurvePoint = [number, number];
export type RGBW = { r: number; g: number; b: number; m: number };

// Revelado de color: se hornea en una LUT 3D que aplica la GPU (vista previa y exportación usan el mismo camino).
export interface Grade {
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  temperature: number;
  tint: number;
  saturation: number;
  vibrance: number;
  fade: number; // levanta los negros (look mate)
  lift: RGBW;
  gamma: RGBW;
  gain: RGBW;
  curves: { m: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[] };
  hsl: { enabled: boolean; hue: number; range: number; softness: number; hueShift: number; sat: number; lum: number };
  bw: number; // 0..1 mezcla a blanco y negro
  lut?: { name: string; size: number; data: number[] };
  lutMix: number;
}

// Detalle y efectos espaciales (pasadas de GPU fuera de la LUT).
export interface Fx {
  clarity: number; // -1..1 contraste local
  sharpen: number; // 0..2
  blur: number; // 0..1
  vignette: number; // -1..1 (negativo aclara bordes)
  grain: number; // 0..1
}

export type BlendMode =
  | 'source-over' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'color-dodge' | 'color-burn'
  | 'hard-light' | 'soft-light' | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

export type LayerKind = 'image' | 'paint' | 'text' | 'shape';

export interface TextStyle {
  content: string;
  font: string;
  size: number;
  weight: number;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  strokeColor: string;
  strokeWidth: number;
  shadow: number; // 0..1 intensidad de sombra
  background: string; // '' = sin caja
}

export interface ShapeStyle {
  type: 'rect' | 'ellipse';
  fill: string; // '' = sin relleno
  stroke: string;
  strokeWidth: number;
  radius: number;
}

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blend: BlendMode;
  // Transformación: centro en coordenadas del documento; w/h = tamaño natural del contenido.
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  src?: string; // imagen: ruta local o data URL
  grade?: Grade;
  fx?: Fx;
  hasMask?: boolean;
  text?: TextStyle;
  shape?: ShapeStyle;
}

export interface Doc {
  name: string;
  width: number;
  height: number;
  background: string; // 'transparent' o color
}

export type Tool = 'move' | 'crop' | 'brush' | 'eraser' | 'text' | 'shape' | 'eyedropper' | 'hand' | 'zoom';

export interface ProjectFile {
  version: 1;
  doc: Doc;
  layers: Layer[];
  pixels: Record<string, string>; // capas de pintura (data URL PNG)
  masks: Record<string, string>; // máscaras de capa (data URL PNG)
}
