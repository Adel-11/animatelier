// QFF - passerelle Drive / Sheet pour les agents.
// A coller dans le Sheet « Theme de quiz » (compte abedzoubir91) : Extensions > Apps Script,
// remplacer tout le contenu de Code.gs par ce fichier, enregistrer, puis
// Déployer > Nouveau déploiement > type « Application Web » :
//   Exécuter en tant que : Moi    Qui a accès : Tout le monde
// Autoriser l'accès demandé, puis copier l'URL qui finit par /exec et l'envoyer à Claude.

const KEY = 'qffdda84e6b3cfa7d343';
const FOLDERS = {
  photos: '1CsNoj2JJVOmoHYjzkSivZmBDLvT7k-T4',
  tools: '1XLpyqA5pumJCd6n_TWinc1d4xRrDLXLR',
  music: '1iW1YssT1eHL_rooLOzcLzHwJw8D5rRBJ',
};
const TAB_PLAN = 'Plannification quiz';
const TAB_Q = 'Questions posées';
const TAB_PHOTOS = 'Photos utilisées';

function doGet(e) { return handle_(e && e.parameter ? e.parameter : {}); }

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  return handle_(Object.assign({}, e.parameter || {}, body));
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(p) {
  if (p.key !== KEY) return out_({ ok: false, error: 'bad key' });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    switch (p.action) {
      case 'state': return out_(state_());
      case 'log': return out_(log_(p));
      case 'upload': return out_(upload_(p));
      case 'get': return out_(get_(p));
      case 'list': return out_(list_(p));
      default: return out_({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (header) sh.appendRow(header);
  }
  return sh;
}

// Tout ce qu'il faut pour choisir un thème et éviter les doublons.
function state_() {
  const plan = sheet_(TAB_PLAN).getDataRange().getValues();
  const topics = plan.slice(1).filter(r => r[0] !== '').map((r, i) => ({
    row: i + 2, sujet: r[0], type: r[1], fait: r[2] === true || String(r[2]).toUpperCase() === 'TRUE',
    date: r[3] ? String(r[3]) : '',
  }));
  const qs = sheet_(TAB_Q).getDataRange().getValues().slice(1).filter(r => r[0] !== '').map(r => [r[0], String(r[1]), r[2]]);
  const ph = sheet_(TAB_PHOTOS, ['Empreinte', 'Fichier', 'Quiz', 'Date', 'Source']).getDataRange().getValues().slice(1)
    .filter(r => r[0] !== '').map(r => [r[0], r[4]]);
  return { ok: true, topics, questions: qs, photos: ph };
}

// Enregistre une publication : questions, photos, et coche le thème s'il vient du planning.
// p = {date, quiz, topic?, folderUrl?, reel?, questions:[texte], photos:[{hash,name,source}]}
function log_(p) {
  const date = p.date || Utilities.formatDate(new Date(), 'America/Toronto', 'yyyy-MM-dd');
  const qs = (p.questions || []).map(q => [q, date, p.quiz]);
  if (qs.length) {
    const sh = sheet_(TAB_Q);
    sh.getRange(sh.getLastRow() + 1, 1, qs.length, 3).setValues(qs);
  }
  const ph = (p.photos || []).map(x => [x.hash, x.name, p.quiz, date, x.source || '']);
  if (ph.length) {
    const sh = sheet_(TAB_PHOTOS, ['Empreinte', 'Fichier', 'Quiz', 'Date', 'Source']);
    sh.getRange(sh.getLastRow() + 1, 1, ph.length, 5).setValues(ph);
  }
  let marked = false;
  if (p.topic) {
    const sh = sheet_(TAB_PLAN);
    const vals = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim().toLowerCase() === String(p.topic).trim().toLowerCase()) {
        sh.getRange(i + 2, 3, 1, 3).setValues([[true, date, p.folderUrl || '']]);
        marked = true;
        break;
      }
    }
  }
  return { ok: true, questions: qs.length, photos: ph.length, topicMarked: marked };
}

function folder_(parent, sub) {
  const root = DriveApp.getFolderById(FOLDERS[parent] || parent);
  if (!sub) return root;
  const it = root.getFoldersByName(sub);
  return it.hasNext() ? it.next() : root.createFolder(sub);
}

// p = {parent:'photos'|'tools'|'music', folder?:'Flags - 2026-09-23', replace?:true, files:[{name, b64, mime?}]}
function upload_(p) {
  const f = folder_(p.parent, p.folder);
  const ids = [];
  (p.files || []).forEach(x => {
    if (p.replace) { const old = f.getFilesByName(x.name); while (old.hasNext()) old.next().setTrashed(true); }
    const blob = Utilities.newBlob(Utilities.base64Decode(x.b64), x.mime || 'application/octet-stream', x.name);
    ids.push(f.createFile(blob).getId());
  });
  return { ok: true, folderUrl: f.getUrl(), ids };
}

// p = {parent, folder?, name} -> contenu en base64
function get_(p) {
  const it = folder_(p.parent, p.folder).getFilesByName(p.name);
  if (!it.hasNext()) return { ok: false, error: 'not found: ' + p.name };
  const file = it.next();
  return { ok: true, name: file.getName(), mime: file.getMimeType(), b64: Utilities.base64Encode(file.getBlob().getBytes()) };
}

function list_(p) {
  const it = folder_(p.parent, p.folder).getFiles();
  const names = [];
  while (it.hasNext()) names.push(it.next().getName());
  return { ok: true, names };
}
