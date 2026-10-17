export type Fact = {
  id: string;
  text: string;
  at: number;
};

export type Excerpt = {
  text: string;
  at: number;
};

export type Person = {
  id: string;
  name: string | null;
  relationship: string | null;
  facts: Fact[];
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
};
