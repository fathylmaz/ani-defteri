function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("ani-defteri-drafts", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("drafts");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function remember(owner: string, value: any) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put({ owner, value }, owner + "/" + value.id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function forget(owner: string, id: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").delete(owner + "/" + id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function pending(owner: string): Promise<any[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const r = db.transaction("drafts").objectStore("drafts").getAll();
    r.onsuccess = () => {
      db.close();
      resolve(r.result.filter((x) => x.owner === owner).map((x) => x.value));
    };
    r.onerror = () => {
      db.close();
      reject(r.error);
    };
  });
}
