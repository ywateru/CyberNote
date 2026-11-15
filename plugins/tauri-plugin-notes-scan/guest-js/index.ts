import { invoke } from '@tauri-apps/api/core';

export type Mode = 'text' | 'document';
export interface Corner { x: number; y: number }
export interface ScanFile { token: string; mime: string; size: number; width: number; height: number; sourceToken?: string }
export interface OcrResult {
  status: 'recognized' | 'empty' | 'failed';
  text?: string;
  fileToken?: string;
  lines?: { text: string; box?: { x: number; y: number; width: number; height: number }; confidence?: number; elements?: unknown[] }[];
  engine?: string;
  revision?: number;
  languages?: string[];
  error?: { code: string; message: string };
}
export interface ScanPage {
  pageId: string; originalToken: string; correctedToken: string; corners: Corner[];
  rotation: 0 | 90 | 180 | 270; filter: 'color' | 'grayscale' | 'blackWhite';
  width: number; height: number; ocr: { status: 'notRecognized' } | OcrResult;
}
export interface ScanSession {
  version: 1; sessionId: string; mode: Mode; state: 'draft' | 'ready';
  createdAt: number; updatedAt: number; files: ScanFile[]; pages: ScanPage[];
  ocr: OcrResult | null; pdfToken: string | null;
}
function call<T>(operation: string, args: Record<string, unknown> = {}): Promise<T> {
  return invoke<T>('plugin:notes-scan|execute', { request: { operation, ...args } });
}
export const begin = (mode: Mode) => call<ScanSession>('begin', { mode });
export const get = (sessionId: string) => call<ScanSession>('get', { sessionId });
/** Bytes must come from a user-selected image. Bounded at 20 MiB. Prefer Android pickImage. */
export const ingestImage = (sessionId: string, data: string) => call<ScanSession>('ingestImage', { sessionId, data });
export const pickImage = (sessionId: string) => call<ScanSession>('pickImage', { sessionId });
export const openCamera = (sessionId: string) => call<ScanSession>('openCamera', { sessionId });
export const recognize = (sessionId: string, fileToken: string) => call<ScanSession>('recognize', { sessionId, fileToken });
export const cropPage = (sessionId: string, fileToken: string, corners: Corner[], filter: ScanPage['filter'], pageId: string | null = null) =>
  call<ScanSession>('cropPage', { sessionId, fileToken, corners, filter, pageId });
export const movePage = (sessionId: string, from: number, to: number) => call<ScanSession>('movePage', { sessionId, from, to });
export const deletePage = (sessionId: string, pageId: string) => call<ScanSession>('deletePage', { sessionId, pageId });
export const rotatePage = (sessionId: string, pageId: string) => call<ScanSession>('rotatePage', { sessionId, pageId });
export const finish = (sessionId: string) => call<ScanSession>('finish', { sessionId });
/** Small previews only. Host Rust should copy resources through NotesScanExt::copy_file_to. */
export const readFile = (sessionId: string, fileToken: string, offset: number, length: number) =>
  call<{ data: string; offset: number; nextOffset: number; eof: boolean }>('readFile', { sessionId, fileToken, offset, length });
/** Call only AFTER the host's durable note/attachment transaction has committed. */
export const acknowledge = (sessionId: string) => call<{ removed: true }>('acknowledge', { sessionId });
export const cancel = (sessionId: string) => call<{ removed: true }>('cancel', { sessionId });
export const cleanup = () => call<{ removedSessions: number }>('cleanup');
