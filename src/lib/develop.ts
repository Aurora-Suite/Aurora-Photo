import type { Fx, Grade } from '../types';
import { bakeLut, needsFx, needsLut } from './color';

// Revelado en GPU: detalle (claridad, nitidez, desenfoque) + LUT 3D de color + viñeta + grano.
// La vista previa y la exportación pasan por aquí, así que lo que se ve es lo que se exporta.

const VS = `#version 300 es
in vec2 pos; uniform float flipY; out vec2 uv;
void main() { uv = vec2(pos.x * 0.5 + 0.5, flipY > 0.5 ? 0.5 - pos.y * 0.5 : pos.y * 0.5 + 0.5); gl_Position = vec4(pos, 0.0, 1.0); }`;

// Desenfoque gaussiano separable leyendo de un nivel de mipmap para radios grandes.
const BLUR = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform vec2 dir; uniform float lod;
void main() {
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float f = float(i) / 6.0;
    float w = exp(-f * f * 2.0);
    acc += textureLod(src, uv + dir * float(i), lod) * w;
    wsum += w;
  }
  o = acc / wsum;
}`;

const FINAL = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 uv; out vec4 o;
uniform sampler2D src, blurS, blurL, blurB; uniform sampler3D lut;
uniform float useLut, lutN, sharpen, clarity, blurAmt, vignette, grain, seed, aspect;
uniform vec2 size;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
void main() {
  vec4 c = texture(src, uv);
  vec3 col = c.rgb;
  float a = c.a;
  if (blurAmt > 0.0) { vec4 b = texture(blurB, uv); col = b.rgb; a = b.a; }
  if (sharpen > 0.0) col += (col - texture(blurS, uv).rgb) * sharpen;
  if (clarity != 0.0) {
    float L = luma(col);
    float mid = 1.0 - pow(abs(L * 2.0 - 1.0), 2.0);
    col += (col - texture(blurL, uv).rgb) * clarity * 1.4 * mid;
  }
  col = clamp(col, 0.0, 1.0);
  if (useLut > 0.5) col = texture(lut, col * ((lutN - 1.0) / lutN) + 0.5 / lutN).rgb;
  if (vignette != 0.0) {
    vec2 d = (uv - 0.5) * vec2(aspect > 1.0 ? 1.0 : aspect, aspect > 1.0 ? 1.0 / aspect : 1.0) * 2.0;
    float v = smoothstep(0.45, 1.45, length(d));
    if (vignette > 0.0) col *= 1.0 - vignette * v * 0.9;
    else col += -vignette * v * 0.7 * (1.0 - col);
  }
  if (grain > 0.0) {
    float n = hash(floor(uv * size) + seed) - 0.5;
    float L = luma(col);
    col += n * grain * 0.22 * (0.35 + 0.65 * (1.0 - abs(L - 0.5) * 2.0));
  }
  o = vec4(clamp(col, 0.0, 1.0), a);
}`;

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture; w: number; h: number };

class Developer {
  canvas = document.createElement('canvas');
  gl: WebGL2RenderingContext;
  blur: Prog;
  final: Prog;
  vao: WebGLVertexArrayObject;
  srcTex: WebGLTexture;
  lutTex: WebGLTexture;
  lutKey = '';
  black: WebGLTexture;
  maxSize: number;

  constructor() {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error('WebGL2 no disponible');
    this.gl = gl;
    this.maxSize = Math.min(16384, gl.getParameter(gl.MAX_TEXTURE_SIZE));
    this.blur = this.program(BLUR, ['src', 'dir', 'lod', 'flipY']);
    this.final = this.program(FINAL, ['src', 'blurS', 'blurL', 'blurB', 'lut', 'useLut', 'lutN', 'sharpen', 'clarity', 'blurAmt', 'vignette', 'grain', 'seed', 'aspect', 'size', 'flipY']);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.srcTex = gl.createTexture()!;
    this.lutTex = gl.createTexture()!;
    this.black = this.tex2d(1, 1);
  }

  private program(fs: string, names: string[]): Prog {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    const u: Prog['u'] = {};
    for (const n of names) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }

  private tex2d(w: number, h: number) {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.tex2d(w, h);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fbo, tex, w, h };
  }

  private free(t: Target) {
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.tex);
  }

  // Desenfoque de radio `r` píxeles (de la imagen a resolución w×h).
  private blurPass(w: number, h: number, r: number): Target {
    const gl = this.gl;
    const down = Math.max(1, r / 6);
    const lod = Math.max(0, Math.log2(down) - 0.5);
    const bw = Math.max(1, Math.round(w / down));
    const bh = Math.max(1, Math.round(h / down));
    const a = this.target(bw, bh);
    const b = this.target(bw, bh);
    gl.useProgram(this.blur.p);
    gl.uniform1f(this.blur.u.flipY, 0);
    gl.uniform1i(this.blur.u.src, 0);
    gl.activeTexture(gl.TEXTURE0);
    // Horizontal desde la fuente (mipmap), vertical desde el resultado intermedio.
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.uniform2f(this.blur.u.dir, r / 6 / w, 0);
    gl.uniform1f(this.blur.u.lod, lod);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, a.tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo);
    gl.uniform2f(this.blur.u.dir, 0, r / 6 / h);
    gl.uniform1f(this.blur.u.lod, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.free(a);
    return b;
  }

  private uploadLut(g: Grade) {
    const key = JSON.stringify(g);
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    if (key === this.lutKey) return;
    const n = 33;
    const data = bakeLut(g, n);
    const rgba = new Float32Array(n * n * n * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i + 1];
      rgba[j + 2] = data[i + 2];
      rgba[j + 3] = 1;
    }
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, rgba);
    this.lutKey = key;
  }

  // Devuelve un lienzo nuevo w×h con el revelado aplicado. `detailScale` adapta los radios a la resolución.
  run(src: TexImageSource, w: number, h: number, grade: Grade | undefined, fx: Fx | undefined, seed = 0): HTMLCanvasElement {
    const gl = this.gl;
    w = Math.max(1, Math.min(this.maxSize, Math.round(w)));
    h = Math.max(1, Math.min(this.maxSize, Math.round(h)));
    this.canvas.width = w;
    this.canvas.height = h;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    // La fuente se escala a w×h al subirla con un lienzo intermedio si hace falta.
    const srcW = (src as any).naturalWidth || (src as any).width;
    const srcH = (src as any).naturalHeight || (src as any).height;
    let upload: TexImageSource = src;
    if (srcW !== w || srcH !== h) {
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const ctx = tmp.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src as CanvasImageSource, 0, 0, w, h);
      upload = tmp;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);

    const f = needsFx(fx) ? fx! : null;
    const long = Math.max(w, h);
    const temps: Target[] = [];
    const sharpT = f && f.sharpen > 0 ? this.blurPass(w, h, Math.max(1, long / 1600)) : null;
    const clarT = f && f.clarity !== 0 ? this.blurPass(w, h, long * 0.02) : null;
    const blurT = f && f.blur > 0 ? this.blurPass(w, h, long * 0.03 * f.blur) : null;
    for (const t of [sharpT, clarT, blurT]) if (t) temps.push(t);

    const fp = this.final;
    gl.useProgram(fp.p);
    const bind = (unit: number, tex: WebGLTexture, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(fp.u[name], unit);
    };
    bind(0, this.srcTex, 'src');
    bind(1, sharpT?.tex ?? this.black, 'blurS');
    bind(2, clarT?.tex ?? this.black, 'blurL');
    bind(3, blurT?.tex ?? this.black, 'blurB');
    const useLut = needsLut(grade);
    if (useLut) this.uploadLut(grade!);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.uniform1i(fp.u.lut, 4);
    gl.uniform1f(fp.u.useLut, useLut ? 1 : 0);
    gl.uniform1f(fp.u.lutN, 33);
    gl.uniform1f(fp.u.sharpen, f ? f.sharpen : 0);
    gl.uniform1f(fp.u.clarity, f ? f.clarity : 0);
    gl.uniform1f(fp.u.blurAmt, f ? f.blur : 0);
    gl.uniform1f(fp.u.vignette, f ? f.vignette : 0);
    gl.uniform1f(fp.u.grain, f ? f.grain : 0);
    gl.uniform1f(fp.u.seed, seed);
    gl.uniform1f(fp.u.aspect, w / h);
    gl.uniform2f(fp.u.size, w, h);
    gl.uniform1f(fp.u.flipY, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d')!.drawImage(this.canvas, 0, 0);
    for (const t of temps) this.free(t);
    return out;
  }
}

let dev: Developer | null = null;
export const developer = () => (dev ??= new Developer());

export const isNeutral = (grade?: Grade, fx?: Fx) => !needsLut(grade) && !needsFx(fx);
