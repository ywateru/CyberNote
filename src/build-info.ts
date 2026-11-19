import packageInfo from '../package.json';
export type BuildInfo = {
  schema: 1;
  version: string;
  /** Exact verified publication version; absent/null on legacy, dev or untagged builds. */
  releaseVersion?: string | null;
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
  ? { schema: 1, version: packageInfo.version, releaseVersion: null, mode: 'development', builtAt: null, target: 'web', sourceRevision: 'unavailable', sourceFingerprint: 'unavailable', sourceDirty: true, inputCount: 0, releasePreparedAt: null }
  : __CYBERNOTE_BUILD_INFO__;

/** Integrating settings/updater UI should show this for old or untagged builds. */
export const releaseIdentityNotice: string | null = buildInfo.releaseVersion
  ? null
  : `当前构建没有可验证的发行标签，更新检查将按产品版本 ${buildInfo.version} 保守比较，无法判断同一产品版本的预发布先后。`;
