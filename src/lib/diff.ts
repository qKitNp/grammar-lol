import DiffMatchPatch from "diff-match-patch";

export type Op =
  | { kind: "equal"; text: string }
  | { kind: "insert"; text: string }
  | { kind: "delete"; text: string };

const dmp = new DiffMatchPatch();

export function wordDiff(before: string, after: string): Op[] {
  const { chars1, chars2, lineArray } = wordsToChars(before, after);
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_cleanupSemantic(diffs);

  return diffs.map(([op, data]): Op => {
    const text = [...data].map((c) => lineArray[c.charCodeAt(0)]).join("");
    if (op === 0) return { kind: "equal", text };
    if (op === 1) return { kind: "insert", text };
    return { kind: "delete", text };
  });
}

function wordsToChars(a: string, b: string) {
  const lineArray: string[] = [""];
  const lineHash = new Map<string, number>();

  const encode = (text: string | undefined) => {
    const tokens = String(text ?? "").match(/(\s+|[^\s]+)/g) ?? [];
    let out = "";
    for (const t of tokens) {
      let idx = lineHash.get(t);
      if (idx === undefined) {
        idx = lineArray.length;
        lineArray.push(t);
        lineHash.set(t, idx);
      }
      out += String.fromCharCode(idx);
    }
    return out;
  };

  return { chars1: encode(a), chars2: encode(b), lineArray };
}
