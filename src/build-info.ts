import packageInfo from '../package.json';
export type BuildInfo = {
  schema: 1;
  version: string;
  mode: 'development' | 'production';
  builtAt: string | null;
  target: string;
  sourceRevision: string;
  sourceFingerprint: string;
  sourceDirty: boolean;
  inputCount: number;
  releasePreparedAt: string | null;
};
declare const __CYBERNOTE_BUILD_INFO__: BuildInfo | undefined;
// Config-free test/preview hosts are explicitly development, never a fake release.
export const buildInfo: BuildInfo = typeof __CYBERNOTE_BUILD_INFO__ === 'undefined'
  ? { schema: 1, version: packageInfo.version, mode: 'development', builtAt: null, target: 'web', sourceRevision: 'unavailable', sourceFingerprint: 'unavailable', sourceDirty: true, inputCount: 0, releasePreparedAt: null }
  : __CYBERNOTE_BUILD_INFO__;
