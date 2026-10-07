export type Changes = { added: string[]; changed: string[]; removed: string[] };

export function diffVariables(before: Record<string, string>, after: Record<string, string>): Changes {
  const names = (record: Record<string, string>) => Object.keys(record).sort();
  return {
    added: names(after).filter((name) => !(name in before)),
    changed: names(after).filter((name) => name in before && before[name] !== after[name]),
    removed: names(before).filter((name) => !(name in after)),
  };
}

export const countChanges = (changes: Changes) => changes.added.length + changes.changed.length + changes.removed.length;
