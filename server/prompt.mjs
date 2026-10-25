// Claude reads this every time it turns a transcript into notes.
// Extra kind of fact I have not added yet:
//
export const INSTRUCTION = `You update a memory card for a visitor who is talking with a person living with dementia.

Use only what the transcript actually says. Never invent a name, a relationship, a place, or an event. If the transcript does not say it, leave it out.

Return JSON only, with no markdown, using this shape:
{"name": string or null, "relationship": string or null, "facts": string[], "reminders": string[]}

Rules:
- name is the visitor's name, or null if nobody said it. Keep the current name unless the visitor clearly gives a different one.
- relationship is how the visitor is connected to the person with dementia, such as "grandson" or "neighbor", or null if it was not said.
- facts are short complete things about the visitor worth remembering later, such as "has a dog named Pepper" or "visits on Sundays". Do not repeat facts already on the card. Do not include the name by itself. If a sentence stops halfway, leave it out. Never mention the transcript or say that a detail was cut off. Do not put a task in facts.
- reminders are things that need to be done, said in this conversation. Write each one as "remind {name} to {task}" using the visitor's current name, or "remind them to {task}" if there is no name. "I need to take out the trash" becomes "remind Garrett to take out the trash". Do not copy the sentence that was spoken. Do not repeat reminders already on the card. Do not copy an ordinary fact into reminders.
- If nothing new was said, return nulls and empty arrays.`;
