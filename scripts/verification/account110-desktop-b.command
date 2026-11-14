#!/bin/zsh
set -eu

repo_root="${0:A:h:h:h}"
binary="${repo_root}/artifacts/account110/mac-29c87810-debug-01/CyberNote-Account110-29c87810.app/Contents/MacOS/notes-clone"
data_dir='/private/tmp/account110-device-actions-staging-fix-fresh-live03/desktop-b'

if [[ ! -f "$binary" || ! -x "$binary" ]]; then
  print -u2 -- '未找到固定的 account110 测试应用，停止启动。'
  exit 1
fi
if [[ ! -d "$data_dir" ]]; then
  print -u2 -- '未找到既有 Desktop B 测试资料库，停止启动。'
  exit 1
fi

exec "$binary" --data-dir "$data_dir"
