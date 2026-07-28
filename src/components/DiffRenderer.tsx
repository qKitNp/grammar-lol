import { wordDiff } from "../lib/diff";

type Props = {
  before: string;
  after: string;
};

export function DiffRenderer({ before, after }: Props) {
  const ops = wordDiff(before, after);
  return (
    <span className="text-[13.5px] leading-[1.6] text-[var(--text)]">
      {ops.map((op, i) => {
        if (op.kind === "equal") return <span key={i}>{op.text}</span>;
        if (op.kind === "delete") {
          if (/^\s+$/.test(op.text)) return null;
          return (
            <span
              key={i}
              className="line-through decoration-[var(--accent)]/70 text-[var(--text-faint)]"
            >
              {op.text}
            </span>
          );
        }
        if (/^\s+$/.test(op.text)) return <span key={i}>{op.text}</span>;
        return (
          <span key={i} className="font-medium text-[var(--text)]">
            {op.text}
          </span>
        );
      })}
    </span>
  );
}
