#!/usr/bin/env python3
"""Guard contract checks; fake host responses, no ADB/emulator invocation."""
import contextlib
import importlib.util
import io
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('lifecycle', Path(__file__).with_name('lifecycle.py'))
life = importlib.util.module_from_spec(spec)
spec.loader.exec_module(life)


class Guards(unittest.TestCase):
    def test_old_and_other_serial_refused_before_subprocess(self):
        for serial in ('emulator-5580', 'emulator-5554', '', None):
            with self.subTest(serial=serial), patch.object(life.subprocess, 'run') as run:
                with self.assertRaises(life.Refused):
                    life.validate_target(SimpleNamespace(serial=serial, avd=life.NAME))
                run.assert_not_called()

    def test_other_avd_refused_before_subprocess(self):
        with patch.object(life.subprocess, 'run') as run:
            with self.assertRaises(life.Refused):
                life.validate_target(SimpleNamespace(serial=life.SERIAL, avd='other'))
            run.assert_not_called()

    def test_missing_serial_and_install_have_no_subprocess(self):
        cases = (['prepare', '--avd', life.NAME],
                 ['install', '--serial', life.SERIAL, '--avd', life.NAME],
                 ['cycle', '--serial', life.SERIAL, '--avd', life.NAME, '--apk', '/old.apk'])
        for argv in cases:
            with self.subTest(argv=argv), patch.object(life.sys, 'argv', ['lifecycle.py', *argv]), \
                    patch.object(life.subprocess, 'run') as run, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as caught:
                    life.main()
                self.assertEqual(caught.exception.code, 2)
                run.assert_not_called()

    def test_install_and_unknown_adb_rejected_before_identity(self):
        for tail in (['install', '/old.apk'], ['kill-server'], ['shell', 'cat', '/sdcard/file']):
            with self.subTest(tail=tail), patch.object(life, 'identity') as identity:
                with self.assertRaises(life.Refused):
                    life.adb({}, tail)
                identity.assert_not_called()

    def test_reused_pid_refuses_before_listener_or_adb(self):
        with patch.object(life, 'command', return_value=SimpleNamespace(returncode=0, stdout='different birth')) as run:
            with self.assertRaisesRegex(life.Refused, 'start time changed'):
                life.identity({'pid': 123, 'lstart': 'original birth'}, listener=True)
            self.assertEqual(run.call_count, 1)

    def test_unowned_command_refused(self):
        with patch.object(life, 'command', return_value=SimpleNamespace(returncode=0, stdout='birth other-command')):
            with self.assertRaisesRegex(life.Refused, 'not the SDK emulator'):
                life.identity({'pid': 123, 'lstart': 'birth'})

    def test_prefix_matching_is_not_owned_identity(self):
        process = 'birth /Users/water/Library/Android/sdk/emulator/qemu -avd ' + life.NAME + '-other'
        process += ' -port 5584 -data ' + str(life.DATA / 'userdata-qemu.img')
        with patch.object(life, 'command', return_value=SimpleNamespace(returncode=0, stdout=process)):
            with self.assertRaisesRegex(life.Refused, 'command mismatch'):
                life.identity({'pid': 123, 'lstart': 'birth'})

    def test_wrong_console_pid_refused(self):
        process = 'birth /Users/water/Library/Android/sdk/emulator/qemu -avd ' + life.NAME
        process += ' -port 5584 -data ' + str(life.DATA / 'userdata-qemu.img')
        replies = [SimpleNamespace(returncode=0, stdout=process), SimpleNamespace(returncode=0, stdout='999\n')]
        with patch.object(life, 'command', side_effect=replies):
            with self.assertRaisesRegex(life.Refused, 'not the owned PID'):
                life.identity({'pid': 123, 'lstart': 'birth'}, listener=True)

    def test_wrong_guest_name_refuses_requested_operation(self):
        with patch.object(life, 'identity'), patch.object(life, 'command', return_value=SimpleNamespace(stdout='other\nOK\n')) as run:
            with self.assertRaisesRegex(life.Refused, 'AVD name'):
                life.adb({}, ['get-state'])
            self.assertEqual(run.call_count, 1)
            self.assertEqual(run.call_args.args[0], [life.ADB, '-s', life.SERIAL, 'emu', 'avd', 'name'])

    def test_wait_bounds(self):
        for value in ('0', '181', '999999'):
            with self.assertRaises(Exception):
                life.bounded_int(15, 180)(value)

    def test_low_disk_refuses_without_cleanup(self):
        with patch.object(life.shutil, 'disk_usage', return_value=SimpleNamespace(free=1024)), \
                patch.object(life, 'emit'), patch.object(life.os, 'kill') as kill:
            with self.assertRaisesRegex(life.Refused, 'less than 8GiB'):
                life.free_bytes()
            kill.assert_not_called()


if __name__ == '__main__':
    unittest.main(verbosity=2)
