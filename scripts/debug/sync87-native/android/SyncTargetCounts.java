import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;
import org.json.JSONObject;

/** Fixed owned synthetic target. Read-only; no body/config/key output. */
public final class SyncTargetCounts {
  private static final String DB = "/data/data/com.local.notesclone/notes.sqlite3";
  private static final String TARGET = "eac3b7e0-12cd-43cc-a1c0-2457e8cc4320";
  private static final String QUERY = "SELECT "
    + "(SELECT count(*) FROM sync_inbox),"
    + "(SELECT count(*) FROM notes WHERE id=?),"
    + "(SELECT count(*) FROM sync_projection WHERE kind='note' AND entity_id=?),"
    + "(SELECT count(*) FROM sync_seen WHERE kind='note' AND entity_id=?)";
  public static void main(String[] args) {
    String stage = "IDENTITY";
    try {
      if (args.length != 0 || android.os.Process.myUid() < 10000) throw new IllegalStateException();
      stage = "FILE"; File file = new File(DB);
      if (!file.isFile()) throw new IllegalStateException();
      stage = "CANONICAL"; if (!file.getCanonicalPath().equals(DB)) throw new IllegalStateException();
      stage = "OPEN";
      try (SQLiteDatabase db = SQLiteDatabase.openDatabase(DB, null, SQLiteDatabase.OPEN_READONLY)) {
        if (!db.isReadOnly()) throw new IllegalStateException();
        long[] n = new long[4];
        stage = "QUERY";
        try (Cursor cursor = db.rawQuery(QUERY, new String[]{TARGET,TARGET,TARGET})) {
          stage = "SCHEMA";
          if (cursor.getColumnCount()!=4 || !cursor.moveToFirst()) throw new IllegalStateException();
          stage = "VALUES";
          for (int i=0;i<4;i++) { n[i]=cursor.getLong(i); if(n[i]<0 || n[i]>2147483647L) throw new IllegalStateException(); }
          stage = "TRAILING"; if(cursor.moveToNext()) throw new IllegalStateException();
        }
        long targetInbox=0, inspected=0;
        stage = "INBOX_QUERY";
        try (Cursor cursor = db.rawQuery("SELECT wire FROM sync_inbox", null)) {
          if (cursor.getColumnCount()!=1) throw new IllegalStateException();
          while (cursor.moveToNext()) {
            stage = "INBOX_PARSE";
            if (++inspected>10000) throw new IllegalStateException();
            JSONObject root = new JSONObject(cursor.getString(0));
            Object kind=root.opt("kind"), entity=root.opt("entityId");
            if (kind instanceof String && kind.equals("note") && entity instanceof String && entity.equals(TARGET)) targetInbox++;
          }
        }
        stage = "INBOX_VALUES";
        if (inspected!=n[0] || targetInbox>2147483647L) throw new IllegalStateException();
        System.out.println("{\"ok\":true,\"counts\":{\"inboxTotal\":"+n[0]+",\"targetInbox\":"+targetInbox+",\"targetNotes\":"+n[1]+",\"targetProjection\":"+n[2]+",\"targetSeen\":"+n[3]+"}}");
      }
    } catch (Throwable ignored) {
      System.out.println("{\"ok\":false,\"error\":\"READONLY_COUNTS_FAILED\",\"stage\":\""+stage+"\"}");
    }
  }
}
