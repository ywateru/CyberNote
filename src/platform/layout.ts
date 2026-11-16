/** Stable platform identity and responsive space are separate decisions.
 * Android's native main window keeps mobile interaction through rotation/IME
 * resize. Desktop/Web retain the existing breakpoint and separate-note rule.
 */
import { interactionMode, platformIdentity } from "../presentation/resolver";
export function createMobileLayout(
  native: boolean,
  userAgent: string,
  separate: boolean,
): (width: number) => boolean {
  const identity = platformIdentity(native, userAgent, separate);
  return (width) => interactionMode(identity, width) === "mobile";
}
