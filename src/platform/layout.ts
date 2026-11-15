/** Stable platform identity and responsive space are separate decisions.
 * Android's native main window keeps mobile interaction through rotation/IME
 * resize. Desktop/Web retain the existing breakpoint and separate-note rule.
 */
export function createMobileLayout(
  native: boolean,
  userAgent: string,
  separate: boolean,
): (width: number) => boolean {
  const nativeAndroid = native && /Android/i.test(userAgent);
  return (width) => !separate && (nativeAndroid || width < 700);
}
