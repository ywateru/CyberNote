# Actual native WebView direct ancestor normalization

Actual UIA after opening the synthetic note contains two `android.webkit.WebView` nodes for the exact app package with identical [0,48][720,1184] bounds: an outer host and its direct semantic child. The old flat count==1 guard refuses this legitimate single native host. Raw hierarchy and original refusal are preserved.

The parser now preserves node and parent indexes. Native host normalization accepts one exact-package WebView or a direct parent-child chain with every rectangle exactly equal. Separate siblings, differing bounds, intermediate wrappers, missing/foreign package and malformed hierarchy remain rejected. It does not choose the first among independent hosts. Exact serial/AVD/emulator/PID lifetime/CDP page/installed APK receipt and full-byte hash checks remain.

17 host-only client checks pass, including seven new hierarchy cases. Await independent review before actual use of this host normalization.

An earlier ordinary touch ratio experiment (99a23a00) is retained in history and evidence; actual ratio input did not open the attachment menu. The unproven ratio code is removed. No claim of a product defect is made from this experiment. Source-level CDP touch uses CSS pixels again.

Independent review amendment: the first candidate 5edf5e4f was blocked by two host-only counterexamples. d27e18ca now tokenizes attribute-free opening nodes for balanced hierarchy accounting, and enumerates all WebView nodes before checking every package/rectangle. Four corresponding negative assertions were added (21 total client checks). Actual use remains paused until independent approval of the correction.

The ordinary UI adapter is prepared to use normal native taps for DOM-selected controls, preserving unique visible CSS target and verified native host-to-viewport mapping. It accepts a text constraint for repeated selectors such as menu buttons. No direct DOM clicks, database writes or fake native chooser are introduced. Actual execution awaits the reviewed host correction and the unchanged >=8GiB disk guard.
