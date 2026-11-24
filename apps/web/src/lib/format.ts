export const fmtUsd = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export const fmtNum = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toLocaleString("en-US"));

export const fmtDate = (d: string | null | undefined) => d ?? "—";

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
