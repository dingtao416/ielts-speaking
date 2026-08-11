// 本地音频存储（IndexedDB）。
// 录音 Blob 存用户本地浏览器，不占数据库；支持会话内与同设备跨会话回放。

const DB_NAME = "ielts-audio";
const STORE_NAME = "recordings";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open failed"));
  });
  return dbPromise;
}

function requestAsPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("idb request failed"));
  });
}

/** 保存录音 Blob，key 建议用 session_record id。 */
export async function saveAudio(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(blob, key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("save failed"));
  });
}

/** 按 key 读取录音，不存在返回 null。 */
export async function getAudio(key: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  const value = await requestAsPromise(tx.objectStore(STORE_NAME).get(key));
  return (value as Blob | undefined) ?? null;
}

/** 删除录音。 */
export async function deleteAudio(key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("delete failed"));
  });
}
