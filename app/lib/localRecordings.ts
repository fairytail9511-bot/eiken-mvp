const DB_NAME = "eiken_mvp_recordings";
const DB_VERSION = 1;
const STORE_NAME = "recordings";

export type RecordingPart = "speech" | `qa-${number}` | `turn-${number}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open recording storage"));
  });
}

function recordingKey(sessionId: string, part: RecordingPart) {
  return `${sessionId}:${part}`;
}

export function createRecordingSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export async function saveLocalRecording(sessionId: string, part: RecordingPart, blob: Blob) {
  if (!sessionId || blob.size === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(blob, recordingKey(sessionId, part));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save recording"));
      tx.onabort = () => reject(tx.error ?? new Error("Recording save was aborted"));
    });
  } finally {
    db.close();
  }
}

export async function loadLocalRecording(sessionId: string, part: RecordingPart) {
  if (!sessionId) return null;
  const db = await openDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(recordingKey(sessionId, part));
      request.onsuccess = async () => {
        const blob = request.result instanceof Blob ? request.result : null;
        if (!blob) {
          resolve(null);
          return;
        }

        // iOS/Safari can record MP4 even when MediaRecorder's selected MIME type
        // was not exposed correctly. Recover recordings previously stored as WebM
        // by recognizing the MP4 `ftyp` signature and correcting only the label.
        if (blob.type.includes("webm") || !blob.type) {
          try {
            const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
            const signature = String.fromCharCode(...header.slice(4, 8));
            if (signature === "ftyp") {
              resolve(new Blob([blob], { type: "audio/mp4" }));
              return;
            }
          } catch {}
        }

        resolve(blob);
      };
      request.onerror = () => reject(request.error ?? new Error("Failed to load recording"));
    });
  } finally {
    db.close();
  }
}

export async function clearLocalRecordingSession(sessionId: string) {
  if (!sessionId) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (String(cursor.key).startsWith(`${sessionId}:`)) cursor.delete();
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error("Failed to clear recordings"));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to clear recordings"));
    });
  } finally {
    db.close();
  }
}
