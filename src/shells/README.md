# Stable shell composition

```text
PresentationContext
  recording-layout (existing recording owner)
    WorkspaceShell (one permanent root)
      DesktopShell layout controls / optional directory scrim
      sidebar
      notes-pane
        MobileShell collection header (mobile only)
        collection
      editor-pane
        existing Editor / EditorSession
    recording-dock (kept mounted through collapse and Web breakpoint)
```

DesktopShell and MobileShell do not conditionally wrap the Editor. Layout and
density change CSS/data attributes on the stable root; the Editor ancestry,
slot, key and document stay unchanged. WorkspaceShell owns only drawer display
and its keyboard focus lifecycle. Navigation owns temporary focus and routes.

The drawer closes on Escape/backdrop/source changes, traps Tab while open, and
returns focus to its trigger. Existing menus/dialogs win Escape first. App
supplies `blocked`; layout controls then become inert and the drawer is hidden
behind existing modal/access owners. Theme colors and layers use existing
semantic variables. Density scales spacing, not component radius or typography.
