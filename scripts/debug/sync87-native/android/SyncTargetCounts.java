import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import java.io.File;

/** One fixed synthetic target, read-only counts. No body/config/key output. */
public final class SyncTargetCounts {
  private static final String DB = "/data/data/com.local.notesclone/notes.sqlite3";
  private static final String TARGET = "eac3b7e0-12cd-43cc-a1c0-2457e8cc4320";
  private static final String QUERY = "SELECT "
    + "(SELECT count(*) FROM sync_inbox),"
    + "(SELECT count(*) FROM sync_inbox WHERE json_extract(wire,'$.kind')='note' AND json_extract(wire,'$.entityId')=?),"
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
        stage = "QUERY";
        try (Cursor cursor = db.rawQuery(QUERY, new String[]{TARGET,TARGET,TARGET,TARGET})) {
        stage = "SCHEMA";
        if (!db.isReadOnly() || cursor.getColumnCount()!=5 || !cursor.moveToFirst()) throw new IllegalStateException();
        stage = "VALUES"; long[] n = new long[5];
        for (int i=0;i<5;i++) { n[i]=cursor.getLong(i); if(n[i]<0 || n[i]>2147483647L) throw new IllegalStateException(); }
        stage = "TRAILING"; if(cursor.moveToNext()) throw new IllegalStateException();
        System.out.println("{\"ok\":true,\"counts\":{\"inboxTotal\":"+n[0]+",\"targetInbox\":"+n[1]+",\"targetNotes\":"+n[2]+",\"targetProjection\":"+n[3]+",\"targetSeen\":"+n[4]+"}}");
        }
      }
    } catch (Throwable ignored) {
      if (stage.equals("QUERY") && ignored instanceof android.database.sqlite.SQLiteException) {
        String message = ignored.getMessage();
        if (message != null && message.contains("no such function: json_extract")) stage = "QUERY_JSON_UNAVAILABLE";
      }
      System.out.println("{\"ok\":false,\"error\":\"READONLY_COUNTS_FAILED\",\"stage\":\""+stage+"\"}");
    }
  }
}
