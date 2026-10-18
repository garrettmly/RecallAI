import type { Person } from "../types";

type NoteLine = {
  key: string;
  text: string;
  at: number;
  who: string | null;
};

function linesFrom(people: Person[]): NoteLine[] {
  const lines: NoteLine[] = [];
  for (const person of people) {
    const who = person.name;
    for (const fact of person.facts) {
      lines.push({ key: fact.id, text: fact.text, at: fact.at, who });
    }
    for (const reminder of person.reminders ?? []) {
      lines.push({ key: reminder.id, text: reminder.text, at: reminder.at, who });
    }
  }
  const seen = new Set<string>();
  return lines
    .sort((left, right) => left.at - right.at)
    .filter((line) => {
      const id = `${line.who ?? ""}:${line.text.toLowerCase()}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(-12);
}

export function Reminders({ people }: { people: Person[] }) {
  const lines = linesFrom(people);

  return (
    <aside className="notepad" aria-label="Notes">
      <h2>Notes</h2>
      {lines.length === 0 ? (
        <p className="quiet-line">Notes will appear as you talk.</p>
      ) : (
        <ul className="notepad-lines">
          {lines.map((line) => (
            <li key={line.key}>
              {line.who ? <span className="who">{line.who}</span> : null}
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
