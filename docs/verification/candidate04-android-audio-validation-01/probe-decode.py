from pathlib import Path
import datetime, hashlib, json, math, re, shutil, subprocess

OUT = Path(__file__).resolve().parent
media = OUT / 'new-recording.webm'
assert shutil.disk_usage(OUT).free >= 2 * 1024**3
assert media.stat().st_size == 168397
assert hashlib.sha256(media.read_bytes()).hexdigest() == '6e145210f656836e9f1260f8e349af1ab8737e52885b27ed70fba80bf15fb32c'
events = []
for executable in ['/opt/zerobrew/bin/ffprobe', '/opt/zerobrew/bin/ffmpeg']:
    p = subprocess.run([executable, '-version'], capture_output=True, timeout=10)
    assert p.returncode == 0
    events.append({'command': [executable, '-version'], 'exitCode': p.returncode, 'stdout': p.stdout.decode(), 'stderr': p.stderr.decode()})

command = ['/opt/zerobrew/bin/ffprobe', '-v', 'error', '-count_packets', '-show_streams', '-show_format', '-of', 'json', str(media)]
probe = subprocess.run(command, capture_output=True, timeout=25)
(OUT / 'ffprobe.json').write_bytes(probe.stdout)
(OUT / 'ffprobe-stderr.txt').write_bytes(probe.stderr)
events.append({'command': command, 'exitCode': probe.returncode})
assert probe.returncode == 0, probe.stderr.decode()
data = json.loads(probe.stdout)
audio = [s for s in data['streams'] if s['codec_type'] == 'audio']
assert len(audio) == 1 and audio[0]['codec_name'] == 'opus'
assert int(audio[0]['nb_read_packets']) > 0

assert shutil.disk_usage(OUT).free >= 2 * 1024**3
command = ['/opt/zerobrew/bin/ffmpeg', '-nostdin', '-hide_banner', '-v', 'info', '-xerror', '-err_detect', 'explode', '-i', str(media), '-map', '0:a:0', '-vn', '-af', 'astats=metadata=1:reset=0', '-f', 'null', '-']
decode = subprocess.run(command, capture_output=True, timeout=25)
(OUT / 'ffmpeg-decode.txt').write_bytes(decode.stderr)
events.append({'command': command, 'exitCode': decode.returncode, 'stdoutBytes': len(decode.stdout)})
assert decode.returncode == 0, decode.stderr.decode()
text = decode.stderr.decode()
overall = text.split('Overall')[-1]
def number(key):
    values = re.findall(re.escape(key) + r':\s*([^\s]+)', overall)
    assert values, key
    return float(values[-1])

samples = number('Number of samples')
sample_rate = int(audio[0]['sample_rate'])
stats = {key: number(key) for key in ['Min level', 'Max level', 'Peak level dB', 'RMS level dB', 'Number of samples']}
nonzero = stats['Min level'] != 0 or stats['Max level'] != 0
result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'attachmentId': '6771077d-eee5-4c9a-875b-e9b7445cf516', 'media': str(media), 'sha256': hashlib.sha256(media.read_bytes()).hexdigest(), 'bytes': media.stat().st_size, 'ffprobeExit': probe.returncode, 'ffmpegExit': decode.returncode, 'audioCodec': audio[0]['codec_name'], 'channels': audio[0]['channels'], 'sampleRate': sample_rate, 'packetCount': int(audio[0]['nb_read_packets']), 'decodedSamplesPerChannel': samples, 'decodedDurationSeconds': samples / sample_rate, 'signalStats': stats, 'decodeValid': samples > 0, 'nonzeroTrack': nonzero, 'rmsFinite': math.isfinite(stats['RMS level dB']), 'actualAudibility': 'UNKNOWN', 'limits': ['No playback or listening performed.', 'Nonzero decoded samples do not establish useful or audible sound, microphone fidelity, or speech content.', 'No transcript or upload; decoded output discarded by ffmpeg null sink.'], 'freeAfter': shutil.disk_usage(OUT).free, 'events': events}
(OUT / 'media-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
assert samples > 0
print(json.dumps({k: v for k, v in result.items() if k != 'events'}, ensure_ascii=False, indent=2))
