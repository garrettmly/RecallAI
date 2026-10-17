import type { Person } from "../types";

const DB_NAME = "porchlight";
const STORE = "people";

function openBook(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadPeople(): Promise<Person[]> {
  const db = await openBook();
  const people = await requestToPromise(db.transaction(STORE).objectStore(STORE).getAll());
  db.close();
  return (people as Person[]).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function savePerson(person: Person): Promise<void> {
  const db = await openBook();
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(person));
  db.close();
}

export async function deletePerson(id: string): Promise<void> {
  const db = await openBook();
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  db.close();
}

export async function deleteAllPeople(): Promise<void> {
  const db = await openBook();
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
  db.close();
}
