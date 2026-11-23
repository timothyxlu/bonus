import type { AccountKind } from "@bonus/core";
import { IconBank, IconCard, IconTag } from "./icons";

export function KindIcon({ kind, small }: { kind: AccountKind; small?: boolean }) {
  if (kind === "bank_account") return <IconBank small={small} />;
  if (kind === "gift_card") return <IconTag small={small} />;
  return <IconCard small={small} />;
}
