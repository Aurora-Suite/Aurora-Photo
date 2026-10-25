declare global {
  interface Window {
    api: {
      testMode: boolean;
      info(): Promise<{ platform: string; version: string }>;
      openImages(multi: boolean): Promise<string[]>;
      readTextFile(exts: string[]): Promise<{ name: string; text: string } | null>;
      pathForFile(f: File): string;
      saveProject(data: unknown, filePath: string | null, name: string): Promise<string | null>;
      openProject(): Promise<{ filePath: string; data?: any; image?: boolean } | null>;
      autosave(data: unknown): Promise<void>;
      restore(): Promise<any>;
      clearAutosave(): Promise<void>;
      pickExportPath(name: string, ext: string): Promise<string | null>;
      writeFile(filePath: string, bytes: ArrayBuffer): Promise<number>;
      reveal(p: string): Promise<void>;
    };
  }
}
export {};
