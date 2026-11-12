import { writeFile } from 'node:fs/promises';

// Publish the final verdict only after all owned browser/server cleanup settles.
export async function finalizeBrowserResult(runtime, path, result) {
  let cleanupError;
  try {
    await runtime.cleanup();
    result.cleanup = { passed: true };
  } catch (error) {
    cleanupError = error;
    result.passed = false;
    result.cleanup = { passed: false, error: error?.name || 'Error' };
  }
  await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  if (cleanupError) throw cleanupError;
}
