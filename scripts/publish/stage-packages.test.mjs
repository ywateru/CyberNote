import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('package sidecar retains declared notices with ordinary dependency filenames', () => {
  execFileSync('python3', ['-c', `
import importlib.util, sys
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('staging', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
dependency = 'vendor/sdk/licenses/ordinary-dependency.txt'
provider = 'vendor/sdk/provider-assets/dependency-attribution.txt'
rights = 'scripts/publish/LICENSE.project-reserved.txt'
manifest = {'files': {dependency: 'hash', provider: 'hash', rights: 'hash'},
            'thirdParty': [{'licenses': [dependency]}],
            'runtimeAssets': [{'licenses': [provider]}],
            'firstParty': [{'rightsSource': rights}]}
assert {dependency, provider, rights}.issubset(module.notice_paths(manifest))
del manifest['files'][dependency]
try:
    module.notice_paths(manifest)
except RuntimeError:
    pass
else:
    raise AssertionError('Missing declared notice was silently skipped')
`, fileURLToPath(new URL('./stage-packages.py', import.meta.url))], { stdio: 'pipe' });
});
