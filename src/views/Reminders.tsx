import type { Person } from "../types";

type RemindersProps = {
  people: Person[];
  onDone: (personId: string, reminderId: string) => void;
};

export function Reminders({ people, onDone }: RemindersProps) {
  const open = people
    .flatMap((person) =>
      (person.reminders ?? [])
        .filter((item) => !item.done)
        .map((item) => ({ ...item, personId: person.id, who: person.name })),
    )
    .sort((left, right) => right.at - left.at);

  return (
    <aside className="reminder-rail" aria-label="Reminders">
      <h2>Reminders</h2>
      {open.length === 0 ? (
        <p className="quiet-line">Nothing to remember yet.</p>
      ) : (
        <ul className="reminder-list">
          {open.map((item) => (
            <li key={item.id}>
              <p>{item.text}</p>
              {item.who ? <p className="meta">From {item.who}</p> : null}
              <button className="secondary" type="button" onClick={() => onDone(item.personId, item.id)}>
                Done
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
