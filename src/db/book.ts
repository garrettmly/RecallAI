import type { Person } from "../types";

const DB_NAME = "recallai";
const LEGACY_DB_NAME = "porchlight";
const STORE = "people";

function openNamed(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
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

function openBook(): Promise<IDBDatabase> {
  return openNamed(DB_NAME);
}

// One-time copy so people saved under the old database name still load.
async function copyLegacyPeople(db: IDBDatabase): Promise<void> {
  const known = (await indexedDB.databases?.()) ?? [];
  if (!known.some((entry) => entry.name === LEGACY_DB_NAME)) return;
  const legacy = await openNamed(LEGACY_DB_NAME);
  let copied = false;
  try {
    if (legacy.objectStoreNames.contains(STORE)) {
      const old = (await requestToPromise(legacy.transaction(STORE).objectStore(STORE).getAll())) as Person[];
      if (old.length > 0) {
        const store = db.transaction(STORE, "readwrite").objectStore(STORE);
        await Promise.all(old.map((person) => requestToPromise(store.put(person))));
      }
    }
    copied = true;
  } finally {
    legacy.close();
  }
  if (copied) indexedDB.deleteDatabase(LEGACY_DB_NAME);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadPeople(): Promise<Person[]> {
  const db = await openBook();
  try {
    await copyLegacyPeople(db);
  } catch {
    // A bad old database must not hide people already stored under recallai.
  }
  const people = await requestToPromise(db.transaction(STORE).objectStore(STORE).getAll());
  db.close();
  return (people as Person[])
    .map((person) => ({ ...person, reminders: Array.isArray(person.reminders) ? person.reminders : [] }))
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
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
