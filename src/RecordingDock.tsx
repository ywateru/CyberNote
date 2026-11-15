import {
  useLayoutEffect,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import RecordingView from "./RecordingView";
import type { RecordingOwner } from "./recording-coordinator";

export default function RecordingDock({
  owner,
  fail,
  top = 0,
}: {
  owner: RecordingOwner;
  top?: number;
  fail: (error: unknown) => void;
}) {
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  useLayoutEffect(() => {
    if (snapshot.dock && snapshot.state)
      owner.confirmDock(snapshot.state.sequence, snapshot.serial);
  }, [owner, snapshot]);
  if (!snapshot.dock || !snapshot.state) return null;
  return (
    <aside
      className="recording-dock"
      aria-label="录音面板"
      style={{ "--recording-native-top": `${top}px` } as CSSProperties}
    >
      {snapshot.error && (
        <div className="recording-window-error" role="alert">
          {snapshot.error}
        </div>
      )}
      <RecordingView
        state={snapshot.state}
        mobile={false}
        presentation="dock"
        switching={snapshot.switching}
        onPresentation={(mode) => {
          void owner.switchPresentation(mode).catch(fail);
        }}
        act={(action) => {
          void owner.action(action).catch(fail);
        }}
      />
    </aside>
  );
}
