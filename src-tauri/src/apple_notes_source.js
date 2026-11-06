/* Fixed Apple Notes source adapter. Raw JSON is private and is captured by the
 * native host. The host owns process deadlines, source selection and all fresh
 * export paths. Only attachment objects may receive save, exactly once each.
 * No source mutation, UI activation, original file paths or filesystem access. */
function run(argv) {
  'use strict';
  var mode = 'scan';
  var reasons = ['invalid_request', 'property_unreadable', 'hierarchy_unreadable',
    'source_limit', 'source_changed', 'locked', 'export_failed',
    'automation_denied', 'event_timeout'];
  function fail(reason) { throw { sourceReason: reason }; }
  function numericCode(error) {
    try {
      var code = error && error.errorNumber;
      return typeof code === 'number' && isFinite(code) && Math.floor(code) === code ? code : null;
    } catch (_) { return null; }
  }
  function classify(error, fallback) {
    var code = numericCode(error);
    var reason = fallback || 'property_unreadable';
    if (code === -1743 || code === -10004) reason = 'automation_denied';
    else if (code === -1712) reason = 'event_timeout';
    else {
      try {
        if (error && reasons.indexOf(error.sourceReason) !== -1) reason = error.sourceReason;
      } catch (_) { /* Source exception accessors cannot escape safe diagnostics. */ }
    }
    return { reason: reason, code: code };
  }
  function errorResult(error) {
    var detail = classify(error);
    var status = detail.reason === 'automation_denied' ? 'automation_denied' :
      detail.reason === 'event_timeout' ? 'timeout' :
      detail.reason === 'invalid_request' ? 'invalid_request' : 'unreadable';
    var result = { version: 1, status: status, reason: detail.reason };
    if (detail.code !== null) result.code = detail.code;
    if (mode === 'read') result.note = null;
    else { result.accounts = []; result.folders = []; result.notes = []; }
    return result;
  }
  function plain(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function keys(value, expected) {
    if (!plain(value)) fail('invalid_request');
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    if (actual.length !== wanted.length || actual.some(function (key, index) { return key !== wanted[index]; })) fail('invalid_request');
  }
  function text(value, id) {
    if (typeof value !== 'string' || (id && (!value.length || value.length > 8192)) || value.length > 33554432) fail('property_unreadable');
    return value;
  }
  function nullableText(value) {
    return value === null || typeof value === 'undefined' ? null : text(value, false);
  }
  function dateMs(value) {
    var ms = value && typeof value.getTime === 'function' ? value.getTime() : NaN;
    if (typeof ms !== 'number' || !isFinite(ms) || Math.floor(ms) !== ms) fail('property_unreadable');
    return ms;
  }
  function collection(value, limit) {
    if (!Array.isArray(value)) fail('property_unreadable');
    if (value.length > limit) fail('source_limit');
    return value;
  }
  function bool(value) {
    if (typeof value !== 'boolean') fail('property_unreadable');
    return value;
  }
  function validatePaths(paths) {
    if (!Array.isArray(paths) || paths.length > 1000) fail('invalid_request');
    var seen = Object.create(null), parent = null;
    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      if (typeof path !== 'string' || path.length > 8192 || path.charAt(0) !== '/' || /[\u0000-\u001f\u007f]/.test(path)) fail('invalid_request');
      var parts = path.split('/');
      if (parts.length < 3 || parts.slice(1).some(function (part) { return !part || part === '.' || part === '..'; })) fail('invalid_request');
      var currentParent = parts.slice(0, -1).join('/');
      if (parent !== null && currentParent !== parent) fail('invalid_request');
      parent = currentParent;
      if (seen[path]) fail('invalid_request');
      seen[path] = true;
    }
  }
  function snapshot(note) {
    return { id: text(note.id(), true), title: text(note.name(), false),
      folderId: text(note.container().id(), true), modified: dateMs(note.modificationDate()) };
  }
  function sameSnapshot(a, b) {
    return a.id === b.id && a.title === b.title && a.folderId === b.folderId && a.modified === b.modified;
  }
  function scan(app, maxNotes) {
    var accountObjects = collection(app.accounts(), 1000);
    var accounts = [], accountIds = Object.create(null), folderMap = Object.create(null), folders = [];
    for (var i = 0; i < accountObjects.length; i++) {
      var account = { id: text(accountObjects[i].id(), true), name: text(accountObjects[i].name(), false) };
      if (accountIds[account.id]) fail('hierarchy_unreadable');
      accountIds[account.id] = true; accounts.push(account);
    }
    var queue = collection(app.folders(), 20000).slice();
    for (var cursor = 0; cursor < queue.length; cursor++) {
      if (cursor >= 20000) fail('source_limit');
      var folderObject = queue[cursor], folder;
      try {
        var folderId = text(folderObject.id(), true);
        if (folderMap[folderId]) continue;
        folder = { id: folderId, name: text(folderObject.name(), false), parentId: text(folderObject.container().id(), true) };
        if (accountIds[folder.id]) fail('hierarchy_unreadable');
        folderMap[folder.id] = folder; folders.push(folder);
        var children = collection(folderObject.folders(), 20000);
        if (queue.length + children.length > 40000) fail('source_limit');
        for (var c = 0; c < children.length; c++) queue.push(children[c]);
      } catch (error) {
        var detail = classify(error, 'hierarchy_unreadable');
        if (detail.reason === 'automation_denied' || detail.reason === 'event_timeout' || detail.reason === 'source_limit') throw error;
        fail('hierarchy_unreadable');
      }
    }
    function completeAncestry(id) {
      var visited = Object.create(null), remaining = folders.length + 1;
      while (remaining-- > 0) {
        if (accountIds[id]) return true;
        if (visited[id] || !folderMap[id]) return false;
        visited[id] = true; id = folderMap[id].parentId;
      }
      return false;
    }
    var noteObjects = collection(app.notes(), 100000), notes = [];
    for (var j = 0; j < Math.min(noteObjects.length, maxNotes); j++) {
      var source = noteObjects[j];
      var item = { id: null, title: '', folderId: null, status: 'unreadable', reason: 'property_unreadable' };
      try {
        item.id = text(source.id(), true); item.title = text(source.name(), false);
        item.folderId = text(source.container().id(), true);
        if (!completeAncestry(item.folderId)) { item.reason = 'hierarchy_unreadable'; }
        else if (bool(source.passwordProtected())) { item.status = 'locked'; item.reason = 'locked'; }
        else { item.status = 'ok'; item.reason = null; }
      } catch (error) {
        var noteDetail = classify(error);
        if (noteDetail.reason === 'automation_denied' || noteDetail.reason === 'event_timeout') throw error;
        item.reason = noteDetail.reason;
        if (noteDetail.code !== null) item.code = noteDetail.code;
      }
      notes.push(item);
    }
    return { version: 1, status: 'ok', reason: null, accounts: accounts, folders: folders, notes: notes, truncated: noteObjects.length > maxNotes };
  }
  function read(app, request) {
    var source = app.notes.byId(request.noteId);
    if (bool(source.passwordProtected())) return { version: 1, status: 'locked', reason: 'locked', note: null };
    var before = snapshot(source);
    if (before.id !== request.noteId) fail('property_unreadable');
    var note = { id: before.id, title: before.title, folderId: before.folderId,
      html: text(source.body(), false), plainText: text(source.plaintext(), false),
      createdAtMs: dateMs(source.creationDate()), updatedAtMs: before.modified,
      attachments: [], stable: false };
    var attachments = collection(source.attachments(), 1000);
    for (var j = 0; j < attachments.length; j++) {
      var attachment = attachments[j];
      var item = { id: text(attachment.id(), true), cid: null, name: null,
        status: 'unsupported_object', reason: 'property_unreadable', exportIndex: j };
      try {
        item.cid = nullableText(attachment.contentIdentifier()); item.name = nullableText(attachment.name());
        if (j >= request.exportPaths.length) item.reason = 'source_limit';
        else {
          app.save(attachment, { in: Path(request.exportPaths[j]) });
          // Host must still validate the exact exported regular file and bytes.
          item.status = 'ok'; item.reason = null;
        }
      } catch (error) {
        var detail = classify(error, 'export_failed');
        if (detail.reason === 'automation_denied' || detail.reason === 'event_timeout') throw error;
        item.status = 'export_failed'; item.reason = 'export_failed';
        if (detail.code !== null) item.code = detail.code;
      }
      note.attachments.push(item);
    }
    var after = snapshot(source);
    note.stable = sameSnapshot(before, after) && !bool(source.passwordProtected());
    return { version: 1, status: note.stable ? 'ok' : 'changed', reason: note.stable ? null : 'source_changed', note: note };
  }
  try {
    if (!Array.isArray(argv) || argv.length !== 1 || typeof argv[0] !== 'string' || argv[0].length > 16777216) fail('invalid_request');
    var request;
    try { request = JSON.parse(argv[0]); } catch (_) { fail('invalid_request'); }
    if (!plain(request) || request.version !== 1 || (request.mode !== 'scan' && request.mode !== 'read')) fail('invalid_request');
    mode = request.mode;
    if (mode === 'scan') {
      keys(request, ['version', 'mode', 'maxNotes']);
      if (typeof request.maxNotes !== 'number' || !isFinite(request.maxNotes) || Math.floor(request.maxNotes) !== request.maxNotes || request.maxNotes < 1 || request.maxNotes > 5000) fail('invalid_request');
    } else {
      keys(request, ['version', 'mode', 'noteId', 'exportPaths']);
      if (typeof request.noteId !== 'string' || !request.noteId.length || request.noteId.length > 8192 || request.noteId.indexOf('\u0000') !== -1) fail('invalid_request');
      validatePaths(request.exportPaths);
    }
    var app = Application('Notes');
    return JSON.stringify(mode === 'scan' ? scan(app, request.maxNotes) : read(app, request));
  } catch (error) {
    return JSON.stringify(errorResult(error));
  }
}
