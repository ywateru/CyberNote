# Recording save 57: dedicated emulator preparation

Status: **BLOCKED — dedicated AVD created; Android boot did not complete; both owned emulator processes are now stopped.** No APK was installed and no notes or recordings were created. This is not a device-ready or application acceptance result. No Git commit was made for these evidence files, as requested.

## Isolation and resources

- New AVD: `notes_recording57_verify`; intended serial/console port `emulator-5582` / `5582`; `5582` and `5583` had no listener before each launch.
- Dedicated root: `/private/tmp/apple-notes-recording57-emulator-01`. `ANDROID_AVD_HOME`, `ANDROID_USER_HOME`, `ANDROID_EMULATOR_HOME` and `TMPDIR` point to separate directories below this root; `HOME` was not changed. New data/key/cache paths are all below this root.
- Existing installed image only: `system-images;android-30;google_apis;arm64-v8a`, revision 16. The image's metadata reports Android **11**, API **30**, ABI **arm64-v8a**. These are image metadata facts; runtime boot/API/ABI checks did not succeed because the guest stayed offline.
- SDK: `/Users/water/Library/Android/sdk`; JDK: `/opt/zerobrew/opt/openjdk@17`. Explicit SDK executable paths were used. No image or tool was downloaded.
- RAM: 2048MB, two cores. Actual normalized data partition size is **6GiB**, within the requested 4–6GiB range. An early desired 4G setting was not the effective normalized value; `attempt01-hardware-qemu.ini.txt` records the actual 6g value.
- Before creation there were about 33.74GB free. Each bounded startup monitor enforced a 2GiB free-space guard; it was never triggered. The final snapshot has 33,322,737,664 bytes free (about 31.03GiB).
- The emulator also reports its built-in crash metadata path as `/tmp/android-water/emu-crash-37.1.11.db` despite the explicit temporary-directory overrides. That diagnostic database was not read. All explicitly configured AVD/userdata/encryption/cache paths remain inside the dedicated root; this report does not claim that every internal emulator diagnostic uses that root.

## Two finite attempts

| Attempt | Exact behavior and outcome |
|---|---|
| 01 | PID **79541**, launched **12:32:51** on November 5, 2026 (+0800), `-gpu swiftshader_indirect`, `-no-window -no-snapshot`. Startup wait ended at **12:34:51** after **120.004s** without `sys.boot_completed=1`; the during-wait ADB inventory showed new 5582 offline. Its log mapped the old GPU alias to SwiftShader/ANGLE and warned about Vulkan, but that alone did not prove a root cause. A single pre-retry check at **12:38:24** still reported offline. Only owned PID79541 received normal SIGTERM at **12:38:51**; termination was confirmed **12:38:52**. Its original images, configs and logs were retained. |
| 02 | PID **82638**, launched **12:39:49**, same dedicated AVD and installed image, `-gpu host -feature -Vulkan -show-kernel -verbose`, new `runtime/attempt02` data/key/cache paths. Vulkan disabled and host rendering are directly confirmed by the log. Wait ended **12:41:49** after **120.002s**, still offline. On root's instruction to stop the reboot loop, only owned PID82638 received SIGTERM at **12:42:47**; termination was confirmed **12:42:48**. No third attempt occurred. |

`boot-result.json`, `attempt01-stop.json`, `pre-attempt02-state.json`, `attempt02/boot-result.json` and `attempt02/stop.json` retain the exact timestamps and commands. `attempt01-preservation-after-attempt02.json` confirms that all recorded first-attempt runtime file inodes, sizes, mtimes and allocated sizes remained unchanged across attempt02. This is metadata verification, not a read/hash of user data.

## Concrete blocking evidence

The full second-attempt kernel log is `attempt02/emulator-startup.log`. The first fatal sequence is preserved with original line numbers in `attempt02/first-fatal-excerpt.txt`:

```text
init: [libfs_mgr]ReadFstabFromDt(): failed to read fstab from dt
init: Using Android DT directory /proc/device-tree/firmware/android/
init: realpath failed: /dev/block/by-name/super: No such file or directory
init: Failed to mount required partitions early ...
init: InitFatalReboot: signal 6
reboot: Restarting system with command 'bootloader'
```

Across the complete log through the explicit shutdown, there are 27 kernel starts and 26 early-mount fatal reboots (`attempt02/kernel-summary.json`). The guest fails during first-stage partition mounting, before Android framework/ADB readiness. Changing GPU selection and disabling Vulkan did not resolve it. It is not an application, microphone-permission or recording-save error; no application was installed. The missing `super` device is the directly observed blocker, while the underlying emulator/image mapping incompatibility is not yet uniquely identified.

## Narrow comparison with the preserved working instance

Root separately authorized read-only host inspection of working PID3197's command, its AVD `config.ini`, and system-image path metadata. No new command was sent to emulator-5580 after dedicated creation was authorized; no signal, install, restart, upgrade, force-stop or state change targeted it. Its user data, key and cache contents were neither read nor copied.

- Working PID3197 started November 3 at **22:07:16**. Its full process command has no explicit `-system`, `-kernel` or `-ramdisk` override; it uses `-read-only`, the same AVD system-image directory, and its own recovered data/key/cache paths. See `working5580-process-identity.txt`.
- Both AVD configs use API30/google_apis/arm64-v8a, arm64 CPU, Pixel4, approximately 2GiB RAM and 6GiB data, with `kernel.newDeviceNaming=autodetect`, `kernel.supportsYaffs2=autodetect`, and no explicit super-partition or boot-device setting. Their fast-boot default preferences differ, but both process commands use `-no-snapshot`. Full authorized comparison is `config-comparison.json`.
- Filtered read-only descriptor metadata shows working PID3197 opens the same installed `system.img` and `vendor.img` paths (`working5580-open-system-images.txt`). No descriptor contents or data/key/cache files were read.
- Installed file metadata lists `system.img` (3,232,759,808 bytes), `vendor.img`, `kernel-ranchu`, `ramdisk.img`, initial user-data/key templates and metadata, with **no separate `super.img` file**. A missing standalone filename alone is not proof of a broken system image: the guest's dynamic partition can be supplied inside another image. See `installed-system-image-file-metadata.json`.
- The second-attempt verbose log confirms `SystemAsRoot=on` and `DynamicPartition=on`; its actual QEMU command attaches the installed `system.img` to `drive=system`, uses the installed kernel/ramdisk, and passes `androidboot.boot_devices=a003800.virtio_mmio`. Thus simply enabling DynamicPartition or changing the GPU again is not a supported fix based on this evidence.

## Limited next step

There is no verified additional launch flag or image correction yet. The next useful investigation, if separately pursued, is the installed emulator37/API30 dynamic-partition naming and boot-device mapping, using the retained exact QEMU options and first-stage fatal log. An emulator/image compatibility correction should be established before another bounded launch; do not randomly change flags or copy the working instance's user data to make this test boot. Both new instances are stopped, all new artifacts remain, the original live test remains outside this preparation's mutations, and no application verification on 5582 has started.
