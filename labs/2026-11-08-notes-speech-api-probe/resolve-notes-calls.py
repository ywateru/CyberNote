#!/usr/bin/env python3
"""Resolve a bounded subset of NotesShared's static calls to Speech exports.

Reads Apple's dyld cache and Apple-tool disassembly only. Does not load Notes
or Speech into a target process. Requires macOS's arm64e cache slide-info v5.
The output is static address/symbol evidence, not execution or a full call graph.
"""

import argparse
import hashlib
import json
import re
import struct
import subprocess
from pathlib import Path

CACHE = Path('/System/Volumes/Preboot/Cryptexes/OS/System/Library/dyld')
NOTES = '/System/Library/PrivateFrameworks/NotesShared.framework/Versions/A/NotesShared'
SPEECH = '/System/Library/Frameworks/Speech.framework/Versions/A/Speech'


class CacheReader:
    def __init__(self):
        self.maps = []
        for path in CACHE.glob('dyld_shared_cache_arm64e*'):
            if path.suffix in ('.map', '.atlas'):
                continue
            with path.open('rb') as file:
                header = file.read(512)
                if not header.startswith(b'dyld'):
                    continue
                # dyld_cache_header.mappingWithSlideOffset / Count, Apple's
                # dyld_cache_format.h. Verify structure/ranges rather than
                # treating the old mapping table as slide metadata.
                offset, count = struct.unpack_from('<II', header, 0x138)
                assert offset >= 0x140 and 0 < count < 100
                file.seek(offset)
                for _ in range(count):
                    a, size, fo, so, ss, flags, mp, ip = struct.unpack('<QQQQQQII', file.read(56))
                    self.maps.append(dict(start=a, end=a+size, file=path, offset=fo, slide_offset=so))
        assert self.maps
        self.minimum_mapping = min(m['start'] for m in self.maps)
        self.pages = {}

    def pointer(self, address):
        matches = [m for m in self.maps if m['start'] <= address and address+8 <= m['end']]
        if len(matches) != 1 or not matches[0]['slide_offset']:
            return None
        m = matches[0]
        with m['file'].open('rb') as file:
            file.seek(m['slide_offset'])
            head = file.read(24)
            version, page_size, count = struct.unpack_from('<III', head)
            if version != 5:
                return None
            value_add = struct.unpack_from('<Q', head, 16)[0]
            assert value_add == self.minimum_mapping
            assert page_size in (4096, 16384)
            page_index, within = divmod(address-m['start'], page_size)
            assert page_index < count and within % 8 == 0
            cache_key = (m['file'], m['start'], page_index)
            if cache_key not in self.pages:
                file.seek(m['slide_offset']+24+2*page_index)
                start = struct.unpack('<H', file.read(2))[0]
                file.seek(m['offset']+page_index*page_size)
                data = file.read(page_size)
                pointers = {}
                if start != 0xFFFF:
                    cursor = start*8
                    while cursor < page_size:
                        raw = struct.unpack_from('<Q', data, cursor)[0]
                        pointers[cursor] = raw
                        delta = ((raw >> 52) & 0x7FF)*8
                        if not delta:
                            break
                        cursor += delta
                self.pages[cache_key] = pointers
            # Only decode a slot proven to lie on its v5 rebase chain.
            raw = self.pages[cache_key].get(within)
            if raw is None:
                return None
            target = value_add+(raw & ((1 << 34)-1))
            if not raw >> 63:
                target |= ((raw >> 34) & 0xFF) << 56
            return dict(slot=hex(address), raw=hex(raw), target=hex(target),
                        auth=bool(raw >> 63), source_file=m['file'].name,
                        file_offset=hex(m['offset']+address-m['start']),
                        cache_uuid=header_uuid(m['file']), slide_info_version=version,
                        value_add=hex(value_add), page_size=page_size,
                        page_index=page_index, chain_membership_verified=True)


def header_uuid(path):
    with path.open('rb') as file:
        file.seek(0x58)
        return file.read(16).hex()


def tool(*args):
    result = subprocess.run(args, capture_output=True, check=True)
    return result.stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True, help='New JSON output file')
    parser.add_argument('--captured', type=Path, help='Reuse previously captured full disassembly/exports')
    args = parser.parse_args()
    if args.out.exists():
        parser.error('--out must be a new file')
    if args.captured:
        disassembly = (args.captured/'notes-shared-disassembly.txt').read_bytes()
        exports_data = (args.captured/'notes-speech-exports.txt').read_bytes()
    else:
        disassembly = tool('/usr/bin/dyld_info', '-arch', 'arm64e', '-disassemble', NOTES)
        exports_data = tool('/usr/bin/dyld_info', '-arch', 'arm64e', '-uuid', '-exports', SPEECH)
    segments = tool('/usr/bin/dyld_info', '-arch', 'arm64e', '-segments', SPEECH).decode()
    base = int(re.search(r'^\s*(0x[0-9a-fA-F]+)\s+__TEXT\s', segments, re.M)[1], 16)
    exports = {}
    for line in exports_data.decode().splitlines():
        match = re.match(r'\s*0x([0-9a-fA-F]+)\s+(\S+)', line)
        if match:
            exports[base+int(match[1], 16)] = match[2]
    symbols = list(exports.values())
    spellings = tool_with_input(symbols)
    names = dict(zip(symbols, spellings))
    lines = disassembly.decode().splitlines()
    instructions = {}
    for i, line in enumerate(lines):
        match = re.match(r'0x([0-9a-fA-F]+)\s+(.*)', line)
        if match:
            instructions[int(match[1], 16)] = (i+1, match[2])
    reader = CacheReader()
    calls, loads = [], []
    for address, (line, instruction) in instructions.items():
        match = re.match(r'bl\s+(0x[0-9a-f]+)', instruction)
        if match:
            stub = int(match[1], 16)
            sequence = [instructions.get(stub+4*k, (0, ''))[1] for k in range(4)]
            page = re.match(r'adrp\s+x17,.*; (0x[0-9a-f]+)', sequence[0])
            add = re.match(r'add\s+x17, x17, #(0x[0-9a-f]+)', sequence[1])
            if page and add and 'ldr' in sequence[2] and 'braa' in sequence[3]:
                result = reader.pointer(int(page[1], 16)+int(add[1], 16))
                if result and int(result['target'], 16) in exports:
                    symbol = exports[int(result['target'], 16)]
                    result.update(callsite=hex(address), stub=hex(stub), line=line,
                                  symbol=symbol, demangled=names[symbol])
                    calls.append(result)
        # Also identify resilient enum/global references used in module setup.
        match = re.match(r'adrp\s+(x\d+),.*; (0x[0-9a-f]+)', instruction)
        if match:
            register, page = match.groups()
            following = instructions.get(address+4, (0, ''))[1]
            load = re.match(r'ldr\s+x\d+, \['+register+r', #(0x[0-9a-f]+)\]', following)
            if load:
                result = reader.pointer(int(page, 16)+int(load[1], 16))
                if result and int(result['target'], 16) in exports:
                    symbol = exports[int(result['target'], 16)]
                    result.update(loadsite=hex(address), line=line,
                                  symbol=symbol, demangled=names[symbol])
                    loads.append(result)
    output = dict(scope='Direct BL to four-instruction arm64e auth stubs and adjacent ADRP/LDR globals; exact Speech export matches. Static observation, bounded coverage; no target execution.',
                  speech_image_base=hex(base), cache_minimum_mapping=hex(reader.minimum_mapping),
                  disassembly_sha256=hashlib.sha256(disassembly).hexdigest(),
                  speech_exports_sha256=hashlib.sha256(exports_data).hexdigest(),
                  slide_format_source='SDK mach-o/fixup-chains.h: dyld_chained_ptr_arm64e_shared_cache_*; dyld_cache_format.h slide_info5',
                  records=calls, global_references=loads)
    args.out.write_text(json.dumps(output, indent=2)+'\n')
    print(f'Resolved {len(calls)} calls and {len(loads)} global references; all have verified slide v5 chain membership.')


def tool_with_input(symbols):
    return subprocess.check_output(['xcrun', 'swift-demangle', '--compact'],
                                   input='\n'.join(symbols).encode()).decode().splitlines()


if __name__ == '__main__':
    main()
