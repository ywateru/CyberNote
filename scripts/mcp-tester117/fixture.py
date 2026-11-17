#!/usr/bin/python3
import sys, json, time, os
mode = sys.argv[1]
if mode == "--workspace-id": mode = sys.argv[2] if sys.argv[2] in ("hang", "id", "oversize", "gate") else "ok"
names = ['notes_get_capabilities', 'notes_list_folders', 'notes_list', 'notes_search', 'notes_read', 'notes_create', 'notes_append', 'notes_update', 'notes_get_operation']
initialized = False
if mode == 'gate':
    root = sys.argv[sys.argv.index('--runtime-dir') + 1]
    child = os.fork()
    if child == 0:
        while True: time.sleep(60)
    with open(os.path.join(root, 'pids.json'), 'w') as f:
        json.dump([os.getpid(), child], f)

for line in sys.stdin:
    request = json.loads(line)
    if request['method'] == 'notifications/initialized':
        initialized = True
        continue
    if mode == 'hang': time.sleep(60)
    if mode == 'exit': sys.exit(2)
    if mode == 'oversize': print('x' * (2 * 1024 * 1024 + 2), flush=True); continue
    if mode == 'malformed': print('not json', flush=True); continue
    if mode == 'flood':
        for _ in range(33): print(json.dumps({'jsonrpc':'2.0', 'method':'notifications/message'}), flush=True)
        continue
    if request['method'] == 'initialize': result = {'protocolVersion':'2025-11-25', 'capabilities':{'tools':{}}}
    elif request['method'] == 'tools/list':
        assert initialized
        result = {'tools':[{'name':n, 'inputSchema':{'type':'object'}, 'outputSchema':{'type':'object'}} for n in names]}
    else:
        if mode == 'gate':
            with open(os.path.join(root, 'requests.log'), 'a') as f: f.write(request['params']['name'] + '\n')
            with open(os.path.join(root, 'entered'), 'w') as f: f.write(str(request['id']))
            while not os.path.exists(os.path.join(root, 'release')): time.sleep(.01)
        result = {'structuredContent':{'fixture':True}, 'content':[], 'isError':False}
    print('credentials must never be captured', file=sys.stderr, flush=True)
    print(json.dumps({'jsonrpc':'2.0','id':999 if mode == 'id' else request['id'],'result':result}), flush=True)
