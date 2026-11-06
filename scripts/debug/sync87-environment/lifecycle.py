#!/usr/bin/env python3
"""Bounded, synthetic-only APP-SYNC87 emulator lifecycle; never installs an APK."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import shlex
import socket
import subprocess
import sys
import time
import uuid

ROOT = Path('/private/tmp/apple-notes-sync87-environment-01')
SDK = Path('/Users/water/Library/Android/sdk')
IMAGE = SDK / 'system-images/android-30/google_apis/arm64-v8a'
ADB = Path('/Applications/极空间.app/Contents/Resources/app.asar.unpacked/bin/platform-tools/adb')
EMULATOR = SDK / 'emulator/emulator'
AVDMANAGER = SDK / 'cmdline-tools/latest/bin/avdmanager'
CLOUDFLARED = Path('/opt/zerobrew/bin/cloudflared')
NAME, SERIAL, PORT = 'notes-sync87-isolated', 'emulator-5584', 5584
AVD_HOME, AVD, DATA = ROOT / 'avd-home', ROOT / 'avd-home/notes-sync87-isolated.avd', ROOT / 'data'
MIN_FREE = 8 * 1024**3
ENV = dict(os.environ, ANDROID_HOME=str(SDK), ANDROID_SDK_ROOT=str(SDK),
           ANDROID_AVD_HOME=str(AVD_HOME), ANDROID_USER_HOME=str(ROOT / 'android-user'),
           ANDROID_EMULATOR_HOME=str(ROOT / 'emulator-home'),
           TMPDIR=str(ROOT / 'tmp'), ANDROID_ADB_SERVER_PORT='5037')


class Refused(RuntimeError):
    pass


def require(condition, reason):
    if not condition:
        raise Refused(reason)


def emit(kind, **fields):
    event = dict(time_utc=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), kind=kind, **fields)
    print(json.dumps(event, ensure_ascii=False), flush=True)
    if ROOT.is_dir() and not ROOT.is_symlink():
        with (ROOT / 'events.jsonl').open('a') as log:
            log.write(json.dumps(event, ensure_ascii=False) + '\n')


def command(argv, timeout=15, input_text=None, check=True, env=None):
    started = time.monotonic()
    try:
        result = subprocess.run([str(x) for x in argv], input=input_text, text=True,
                                capture_output=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired as exc:
        emit('command', argv=[str(x) for x in argv], wall_seconds=round(time.monotonic()-started, 3),
             natural_exit=None, timed_out=True, stdout=str(exc.stdout or ''), stderr=str(exc.stderr or ''))
        raise Refused('bounded subprocess timed out') from exc
    emit('command', argv=[str(x) for x in argv], wall_seconds=round(time.monotonic()-started, 3),
         natural_exit=result.returncode if result.returncode >= 0 else None,
         signal=-result.returncode if result.returncode < 0 else None,
         timed_out=False, stdout=result.stdout, stderr=result.stderr)
    require(not check or result.returncode == 0, 'command failed: ' + str(argv[0]))
    return result


def validate_target(args):
    require(args.serial == SERIAL, 'only explicit new serial emulator-5584 is permitted')
    require(args.avd == NAME, 'only explicit new AVD notes-sync87-isolated is permitted')
    require(not ROOT.is_symlink(), 'resource root must not be a symlink')
    for path in (AVD_HOME, AVD, DATA, ROOT / 'state.json', ROOT / 'events.jsonl', ROOT / 'owner.json',
                 ROOT / 'lifecycle.lock', DATA / 'userdata-qemu.img', DATA / 'cache.img'):
        require(not path.is_symlink(), 'isolated path must not be a symlink: ' + str(path))


def free_bytes():
    size = shutil.disk_usage(ROOT if ROOT.exists() else ROOT.parent).free
    emit('disk', free_bytes=size, min_free_bytes=MIN_FREE)
    require(size >= MIN_FREE, 'less than 8GiB free; preserve shared SDK/targets and user data')
    return size


def ports_free():
    # Bind both address families; a check and launch can still race, so recheck ownership before ADB.
    for port in (PORT, PORT + 1):
        for family, address in ((socket.AF_INET, ('127.0.0.1', port)), (socket.AF_INET6, ('::1', port))):
            with socket.socket(family, socket.SOCK_STREAM) as sock:
                try:
                    sock.bind(address)
                except OSError as exc:
                    raise Refused('new emulator port occupied: ' + str(port)) from exc
    emit('ports_free', ports=[PORT, PORT + 1])


def save_state(state):
    temp = ROOT / 'state.tmp'
    require(not temp.is_symlink(), 'state temp must not be a symlink')
    temp.write_text(json.dumps(state, indent=2) + '\n')
    temp.replace(ROOT / 'state.json')


def read_state():
    require((ROOT / 'state.json').is_file(), 'no owned emulator state; run cycle first')
    state = json.loads((ROOT / 'state.json').read_text())
    owner = json.loads((ROOT / 'owner.json').read_text())
    require(state['serial'] == SERIAL and state['avd'] == NAME and state['root'] == str(ROOT), 'state target mismatch')
    require(state['owner_token'] == owner['token'], 'state owner token mismatch')
    require(state['pid'] > 1 and state['status'] in ('starting', 'ready'), 'no active owned emulator')
    return state


def identity(state, listener=False):
    # Inspect only the recorded PID, never enumerate or query existing devices/AVDs.
    ps = command(['/bin/ps', '-p', str(state['pid']), '-o', 'lstart=', '-o', 'command='], check=False)
    require(ps.returncode == 0, 'owned PID is no longer running')
    text = ps.stdout.strip()
    require(text.startswith(state['lstart']), 'owned PID start time changed')
    words = shlex.split(text[len(state['lstart']):].strip())
    require(words and words[0].startswith(str(SDK / 'emulator') + '/'), 'owned PID is not the SDK emulator')
    for flag, expected in (('-avd', NAME), ('-port', str(PORT)), ('-data', str(DATA / 'userdata-qemu.img'))):
        require(words.count(flag) == 1 and words.index(flag) + 1 < len(words)
                and words[words.index(flag) + 1] == expected, 'owned PID command mismatch: ' + flag)
    if listener:
        found = command(['/usr/sbin/lsof', '-nP', '-t', '-iTCP:' + str(PORT), '-sTCP:LISTEN'], check=False)
        require(found.returncode == 0 and set(found.stdout.split()) == {str(state['pid'])}, 'console listener is not the owned PID')


def adb(state, tail, timeout=8):
    # There is deliberately no generic ADB command passthrough, install, reboot, shell input, or forwarding.
    allowed = [('emu', 'avd', 'name'), ('get-state',), ('shell', 'getprop', 'sys.boot_completed'),
               ('shell', 'getprop', 'ro.build.version.sdk'), ('shell', 'getprop', 'ro.product.cpu.abi'),
               ('emu', 'kill')]
    require(tuple(tail) in allowed, 'ADB command is outside this environment-only allowlist')
    identity(state, listener=True)
    if tuple(tail) != ('emu', 'avd', 'name'):
        actual = command([ADB, '-s', SERIAL, 'emu', 'avd', 'name'], timeout=timeout)
        require(actual.stdout.splitlines() == [NAME, 'OK'], 'AVD name reported by explicit serial is wrong')
    return command([ADB, '-s', SERIAL, *tail], timeout=timeout)


def preflight():
    for path in (EMULATOR, ADB, AVDMANAGER, CLOUDFLARED, IMAGE / 'userdata.img', IMAGE / 'system.img'):
        require(path.is_file(), 'required installed tool/image missing: ' + str(path))
    props = (IMAGE / 'source.properties').read_text()
    require('AndroidVersion.ApiLevel=30' in props and 'SystemImage.Abi=arm64-v8a' in props
            and 'SystemImage.TagId=google_apis' in props, 'cached image identity mismatch')
    for argv in ([EMULATOR, '-version'], [ADB, 'version'], [CLOUDFLARED, '--version']):
        command(argv)
    # Refuse to start an ADB server. Existing host server is a prerequisite, no global management.
    server = command(['/usr/sbin/lsof', '-nP', '-t', '-iTCP:5037', '-sTCP:LISTEN'], check=False)
    require(server.returncode == 0 and server.stdout.strip(), 'existing ADB server on 5037 is required')
    free_bytes()


def prepare():
    require(not ROOT.exists(), 'resource directory already exists; never overwrite/recreate synthetic state')
    free_bytes()
    ports_free()
    ROOT.mkdir(mode=0o700)
    for part in (AVD_HOME, DATA, ROOT / 'android-user', ROOT / 'emulator-home', ROOT / 'tmp'):
        part.mkdir(mode=0o700)
    (ROOT / 'owner.json').write_text(json.dumps(dict(token=uuid.uuid4().hex, avd=NAME, serial=SERIAL)) + '\n')
    preflight()
    command([AVDMANAGER, 'create', 'avd', '--name', NAME, '--path', AVD,
             '--package', 'system-images;android-30;google_apis;arm64-v8a', '--device', 'pixel_2'],
            timeout=45, input_text='no\n', env=ENV)
    config = AVD / 'config.ini'
    settings = dict(line.split('=', 1) for line in config.read_text().splitlines() if '=' in line)
    # Emulator 37.1.11 raised the first 1536MiB/2G request to 2048MiB/6GiB.
    # Use the observed effective budget; never recreate the already-owned data.
    settings.update({'hw.ramSize': '2048', 'hw.cpu.ncore': '2', 'disk.dataPartition.size': '6442450944',
                     'disk.cachePartition.size': '128M', 'hw.lcd.width': '720', 'hw.lcd.height': '1280',
                     'hw.lcd.density': '320', 'hw.audioInput': 'no', 'hw.audioOutput': 'no',
                     'hw.sdCard': 'no', 'showDeviceFrame': 'no', 'fastboot.forceColdBoot': 'yes',
                     'fastboot.forceFastBoot': 'no', 'hw.camera.back': 'none', 'hw.camera.front': 'none'})
    config.write_text(''.join(key + '=' + value + '\n' for key, value in sorted(settings.items())))
    emit('prepared', root=str(ROOT), avd=str(AVD), data=str(DATA), serial=SERIAL,
         config=settings, source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())


def stop_owned(state, child=None):
    if child is not None and child.poll() is not None:
        code = child.returncode
    else:
        identity(state)
        try:
            adb(state, ['emu', 'kill'])
        except Refused as exc:
            emit('graceful_stop_unavailable', reason=str(exc))
            identity(state)
            os.kill(state['pid'], signal.SIGTERM)
            emit('signal_sent', pid=state['pid'], signal=signal.SIGTERM)
        if child is None:
            emit('stop_requested', pid=state['pid'], note='supervisor owns wait/exit evidence')
            return
        try:
            code = child.wait(timeout=20)
        except subprocess.TimeoutExpired:
            identity(state)
            os.kill(state['pid'], signal.SIGKILL)
            emit('signal_sent', pid=state['pid'], signal=signal.SIGKILL)
            code = child.wait(timeout=10)
    state.update(status='stopped', emulator_natural_exit=code if code >= 0 else None,
                 emulator_signal=-code if code < 0 else None)
    save_state(state)
    emit('emulator_exit', **state)


def cycle(args):
    require(ROOT.is_dir() and (ROOT / 'owner.json').is_file(), 'prepare the new isolated resource first')
    require(not (ROOT / 'state.json').exists() or json.loads((ROOT / 'state.json').read_text())['status'] == 'stopped',
            'an owned lifecycle is already active')
    preflight()
    ports_free()
    argv = [str(EMULATOR), '-avd', NAME, '-port', str(PORT), '-datadir', str(DATA),
            '-data', str(DATA / 'userdata-qemu.img'), '-cache', str(DATA / 'cache.img'),
            '-cache-size', '128', '-memory', '2048', '-cores', '2', '-no-snapshot', '-no-audio',
            '-no-window', '-no-boot-anim', '-no-metrics', '-gpu', 'software', '-show-kernel',
            '-camera-back', 'none', '-camera-front', 'none']
    start = time.monotonic()
    log_path = ROOT / ('emulator-' + time.strftime('%Y%m%dT%H%M%S', time.gmtime()) + '.log')
    with log_path.open('x') as log:
        child = subprocess.Popen(argv, stdout=log, stderr=subprocess.STDOUT, env=ENV, start_new_session=True)
    state = dict(root=str(ROOT), avd=NAME, serial=SERIAL, pid=child.pid, argv=argv,
                 owner_token=json.loads((ROOT / 'owner.json').read_text())['token'], status='starting',
                 supervisor_pid=os.getpid(), emulator_log=str(log_path), source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    try:
        ps = command(['/bin/ps', '-p', str(child.pid), '-o', 'lstart='])
        state['lstart'] = ps.stdout.strip()
        save_state(state)
        emit('emulator_started', **state)
        deadline = start + args.boot_timeout
        while time.monotonic() < deadline:
            require(child.poll() is None, 'emulator exited before ready')
            free_bytes()
            try:
                complete = adb(state, ['shell', 'getprop', 'sys.boot_completed'])
                if complete.stdout.strip() == '1':
                    sdk = adb(state, ['shell', 'getprop', 'ro.build.version.sdk']).stdout.strip()
                    abi = adb(state, ['shell', 'getprop', 'ro.product.cpu.abi']).stdout.strip()
                    require(sdk == '30' and abi == 'arm64-v8a', 'booted guest API/ABI mismatch')
                    state.update(status='ready', ready_wall_seconds=round(time.monotonic() - start, 3), sdk=sdk, abi=abi)
                    save_state(state)
                    emit('ready', **state)
                    hold_deadline = time.monotonic() + args.hold_seconds
                    while child.poll() is None and time.monotonic() < hold_deadline:
                        time.sleep(min(2, max(0, hold_deadline-time.monotonic())))
                        free_bytes()
                    return
            except Refused as exc:
                emit('not_ready', reason=str(exc))
            time.sleep(2)
        raise Refused('boot did not become ready within explicit bounded timeout')
    finally:
        if 'lstart' in state:
            stop_owned(state, child)
        else:
            # Popen is our only handle here; do not guess any other PID.
            child.terminate()
            try:
                child.wait(timeout=20)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=10)
            emit('owned_child_exit_without_state', pid=child.pid, returncode=child.returncode)
        emit('cycle_finished', wall_seconds=round(time.monotonic()-start, 3))


def bounded_int(low, high):
    def parse(value):
        number = int(value)
        if not low <= number <= high:
            raise argparse.ArgumentTypeError('value must be between ' + str(low) + ' and ' + str(high))
        return number
    return parse


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'cycle', 'status', 'stop'])
    parser.add_argument('--serial', required=True)
    parser.add_argument('--avd', required=True)
    parser.add_argument('--boot-timeout', type=bounded_int(15, 180), default=180)
    parser.add_argument('--hold-seconds', type=bounded_int(0, 600), default=0)
    args = parser.parse_args()
    validate_target(args)
    if args.action == 'prepare':
        prepare()
    elif args.action == 'cycle':
        require(ROOT.is_dir(), 'resource does not exist')
        with (ROOT / 'lifecycle.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise Refused('another lifecycle holds the owned lock') from exc
            awake_argv = ['/usr/bin/caffeinate', '-dimsu', '-t', str(args.boot_timeout + args.hold_seconds + 60),
                          '-w', str(os.getpid())]
            awake = subprocess.Popen(awake_argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            emit('owned_awake_started', pid=awake.pid, argv=awake_argv)
            try:
                cycle(args)
            finally:
                if awake.poll() is None:
                    awake.terminate()  # Popen child only; no global power setting is changed.
                code = awake.wait(timeout=15)
                emit('owned_awake_exit', pid=awake.pid, natural_exit=code if code >= 0 else None,
                     signal=-code if code < 0 else None)
    else:
        state = read_state()
        if args.action == 'status':
            result = adb(state, ['get-state'])
            emit('status', pid=state['pid'], serial=SERIAL, avd=NAME, transport=result.stdout.strip())
        else:
            stop_owned(state)


if __name__ == '__main__':
    started = time.monotonic()
    def interrupted(signum, _frame):
        raise Refused('supervisor interrupted by signal ' + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main()
    except (Refused, OSError, ValueError, KeyError) as error:
        emit('refused', reason=str(error), wall_seconds=round(time.monotonic()-started, 3))
        sys.exit(2)
