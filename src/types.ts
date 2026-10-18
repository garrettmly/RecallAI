export type Fact = {
  id: string;
  text: string;
  at: number;
};

export type Excerpt = {
  text: string;
  at: number;
};

export type Reminder = {
  id: string;
  text: string;
  at: number;
  done: boolean;
};

export type Person = {
  id: string;
  name: string | null;
  relationship: string | null;
  facts: Fact[];
  reminders: Reminder[];
  excerpts: Excerpt[];
  descriptors: number[][];
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
};

export type Notes = {
  name: string | null;
  relationship: string | null;
  facts: string[];
  reminders: string[];
};
