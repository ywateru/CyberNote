#!/usr/bin/env python3
"""Read-only preparation audit; never freezes inputs or runs Gradle/Cargo."""
import argparse
import os
import common as c

p = argparse.ArgumentParser()
p.add_argument('output')
a = p.parse_args()
result = {'at': c.now(), 'status': 'PREPARATION ONLY; NOT A SOURCE FREEZE', 'resources': c.resource_paths(), 'effectiveProposedEnvironment': c.effective_environment(), 'parentEnvironment': {k: os.environ.get(k) for k in ['ANDROID_HOME', 'NDK_HOME', 'JAVA_HOME', 'GRADLE_USER_HOME', 'GRADLE_OPTS', 'JAVA_OPTS', 'JAVA_TOOL_OPTIONS']}, 'vmStat': c.command(['/usr/bin/vm_stat']), 'limits': 'No build/generation/freeze/download/clean/target copy/GUI/device action. Cache presence is not proof all unified Gradle dependencies resolve offline.'}
c.write_new(a.output, result)
print({'output': a.output, 'free': result['resources']['diskFree'], 'models': result['resources']['modelFiles'], 'scanGenerated': result['resources']['scanInGeneratedSettings']})
