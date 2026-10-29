/* Crest Academy: Google Drive receiver (Google Apps Script)
   Saves every file the website sends into your Drive:
     Crest Academy Submissions / <Student name (phone)> / <Uploads or Marked> / <date>_<file>

   SET UP (once, about 3 minutes)
   1. Go to script.google.com > New project. Delete the sample code and paste this whole file.
   2. Change SECRET below to any password you like (and keep it private).
   3. Deploy > New deployment > type "Web app".
        Execute as: Me          Who has access: Anyone
      Press Deploy, allow the permissions, and copy the "Web app URL".
   4. In index.html and admin.html find  var DRIVE_URL = '';  and  var DRIVE_SECRET = '';
      paste the URL and the same SECRET into both.
   If you change this script later, use Deploy > Manage deployments > Edit > New version. */

var SECRET = 'change-this-secret';
var ROOT_NAME = 'Crest Academy Submissions';
var MAX_BYTES = 30 * 1024 * 1024;

function child(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);
    if (p.secret !== SECRET) return out('forbidden');
    if (!p.data || p.data.length * 0.75 > MAX_BYTES) return out('too big');
    var clean = function (s) { return String(s || '').replace(/[\\\/:*?"<>|]/g, '_').slice(0, 120); };
    var root = child(DriveApp.getRootFolder(), ROOT_NAME);
    var folder = child(child(root, clean(p.student) || 'Unknown'), clean(p.folder) || 'Uploads');
    var day = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'application/octet-stream', day + '_' + clean(p.name));
    folder.createFile(blob);
    return out('ok');
  } catch (err) { return out('error: ' + err); }
}

function doGet() { return out('Crest Drive receiver is running'); }
function out(t) { return ContentService.createTextOutput(t); }
