import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "../lib/format";

/*
 * Styled single-select. Same API as a native <select> (children are <option>/<optgroup>,
 * onChange receives a real change event), so call sites don't change.
 *
 * A hidden native <select> stays in the DOM: it carries `name`/`required` for form
 * submission and validation, and choosing an option sets its value and dispatches a
 * native "change" event so React's onChange fires exactly as before.
 * The visible part is a combobox button + a listbox popover portalled to <body>
 * (so it escapes the Sheet's overflow clipping).
 */

type Item =
  | { kind: "group"; label: string; key: string }
  | { kind: "option"; value: string; label: ReactNode; text: string; disabled: boolean; grouped: boolean; key: string };

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };
type GroupProps = { label?: string; children?: ReactNode; disabled?: boolean };

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function parseItems(children: ReactNode): Item[] {
  const items: Item[] = [];
  const walk = (nodes: ReactNode, grouped: boolean, groupDisabled: boolean) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      if (child.type === "optgroup") {
        const p = (child as ReactElement<GroupProps>).props;
        items.push({ kind: "group", label: p.label ?? "", key: `g${items.length}` });
        walk(p.children, true, groupDisabled || !!p.disabled);
      } else if (child.type === "option") {
        const p = (child as ReactElement<OptionProps>).props;
        const text = textOf(p.children);
        items.push({
          kind: "option",
          value: p.value != null ? String(p.value) : text,
          label: p.children,
          text,
          disabled: groupDisabled || !!p.disabled,
          grouped,
          key: `o${items.length}`,
        });
      } else if (child.type === Fragment) {
        walk((child.props as { children?: ReactNode }).children, grouped, groupDisabled);
      }
    });
  };
  walk(children, false, false);
  return items;
}

const fieldCls =
  "flex items-center gap-2 rounded-[var(--radius-control)] bg-surface pr-2.5 pl-3 text-left text-base text-ink ring-1 ring-line ring-inset transition-[box-shadow,background-color] duration-150 hover:bg-sunken focus:ring-2 focus:ring-brand focus:outline-none disabled:pointer-events-none disabled:opacity-50 sm:text-sm";

const width = (cls?: string) => (cls && /(^|\s)(w-|flex-1|min-w-|basis-)/.test(cls) ? "" : "w-full");

const setNativeValue = (el: HTMLSelectElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

export function Select({ className, children, value, defaultValue, disabled, required, id, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const items = parseItems(children);
  const options = items.filter((i): i is Extract<Item, { kind: "option" }> => i.kind === "option");

  const nativeRef = useRef<HTMLSelectElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const autoId = useId();

  // Uncontrolled fallback (callers here are all controlled, but keep native semantics).
  const [inner, setInner] = useState(() => String(defaultValue ?? options[0]?.value ?? ""));
  const current = value !== undefined ? String(value) : inner;
  const selected = options.find((o) => o.value === current) ?? (value === undefined ? options[0] : undefined);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // index into `options`
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const b = buttonRef.current?.getBoundingClientRect();
    if (!b) return;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const gap = 6;
    const below = vh - b.bottom - gap - 8;
    const above = b.top - gap - 8;
    const want = 320;
    const up = below < Math.min(want, 200) && above > below;
    const w = Math.max(b.width, 180);
    const left = Math.max(8, Math.min(b.left, vw - w - 8));
    setPos(
      up
        ? { left, bottom: vh - b.top + gap, width: w, maxHeight: Math.min(want, above) }
        : { left, top: b.bottom + gap, width: w, maxHeight: Math.min(want, below) },
    );
  }, []);

  const openList = (start?: number) => {
    if (disabled) return;
    const sel = options.findIndex((o) => o.value === selected?.value);
    setActive(start ?? (sel >= 0 ? sel : options.findIndex((o) => !o.disabled)));
    place();
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const choose = (idx: number) => {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    close();
    if (opt.value === current) return;
    if (value === undefined) setInner(opt.value);
    if (nativeRef.current) setNativeValue(nativeRef.current, opt.value);
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = (e: Event) => {
      if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return;
      place();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, place]);

  // Keep the active option in view while navigating.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i]!.disabled) return i;
    return from;
  };
  const firstEnabled = () => options.findIndex((o) => !o.disabled);
  const lastEnabled = () => {
    for (let i = options.length - 1; i >= 0; i--) if (!options[i]!.disabled) return i;
    return -1;
  };

  // Type-to-jump, like a native select.
  const typed = useRef({ buf: "", at: 0 });
  const typeahead = (ch: string) => {
    const now = Date.now();
    const t = typed.current;
    t.buf = now - t.at > 600 ? ch : t.buf + ch;
    t.at = now;
    const q = t.buf.toLowerCase();
    const start = open ? active : options.findIndex((o) => o.value === selected?.value);
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (start + (t.buf.length > 1 ? k - 1 : k) + n) % n;
      if (!options[i]!.disabled && options[i]!.text.trim().toLowerCase().startsWith(q)) return i;
    }
    return -1;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const i = typeahead(e.key);
        if (i >= 0) openList(i);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => step(a, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => step(a, -1));
        break;
      case "Home":
      case "PageUp":
        e.preventDefault();
        setActive(firstEnabled());
        break;
      case "End":
      case "PageDown":
        e.preventDefault();
        setActive(lastEnabled());
        break;
      case "Enter":
        e.preventDefault();
        choose(active);
        break;
      case " ":
        e.preventDefault();
        // Space continues a type-ahead in progress ("Capital One"), otherwise selects.
        if (typed.current.buf && Date.now() - typed.current.at < 600) {
          const i = typeahead(" ");
          if (i >= 0) setActive(i);
        } else choose(active);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation(); // don't also close the surrounding Sheet
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const i = typeahead(e.key);
          if (i >= 0) setActive(i);
        }
    }
  };

  const placeholder = !selected || (selected.value === "" && required);

  return (
    <div className={cx("relative inline-flex align-middle", width(className), className)}>
      <button
        ref={buttonRef}
        id={id ?? autoId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={rest["aria-label"]}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={cx(fieldCls, "h-11 w-full min-w-0 sm:h-10", open && "ring-2 ring-brand")}
      >
        {/* All labels share one grid cell so the control is as wide as its widest option, like a native select. */}
        <span className="grid min-w-0 flex-1">
          {options.map((o) => (
            <span
              key={o.key}
              aria-hidden={o !== selected}
              className={cx(
                "col-start-1 row-start-1 truncate",
                o === selected ? (placeholder ? "text-faint" : "") : "invisible h-0",
              )}
            >
              {o.label}
            </span>
          ))}
        </span>
        <svg
          viewBox="0 0 20 20"
          className={cx("h-4 w-4 shrink-0 text-muted transition-transform duration-150", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="m5.5 8 4.5 4.5L14.5 8" />
        </svg>
      </button>

      {/* Native control: form value, `required` validation and the change event. */}
      <select
        {...rest}
        ref={nativeRef}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        required={required}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      >
        {children}
      </select>

      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={id ?? autoId}
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault() /* keep focus on the button */}
            style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: pos.width, maxWidth: "calc(100vw - 16px)", maxHeight: pos.maxHeight }}
            className={cx(
              "anim-pop fixed z-[60] overflow-y-auto overscroll-contain rounded-[var(--radius-row)] border border-line bg-surface p-1 text-base shadow-[0_14px_36px_-10px_rgb(9_20_27/0.28)] sm:text-sm dark:shadow-[0_14px_36px_-10px_rgb(0_0_0/0.7)]",
              pos.bottom !== undefined && "origin-bottom",
            )}
          >
            {items.map((it) => {
              if (it.kind === "group")
                return (
                  <li key={it.key} role="presentation" className="px-2.5 pt-2.5 pb-1 text-xs font-semibold tracking-wide text-faint uppercase first:pt-1">
                    {it.label}
                  </li>
                );
              const idx = options.indexOf(it);
              const isSel = it === selected;
              const isActive = idx === active;
              return (
                <li
                  key={it.key}
                  id={`${listId}-${idx}`}
                  data-idx={idx}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={it.disabled || undefined}
                  onPointerMove={() => !it.disabled && active !== idx && setActive(idx)}
                  onClick={() => choose(idx)}
                  className={cx(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-[7px] pr-2 sm:min-h-9",
                    it.grouped ? "pl-4" : "pl-2.5",
                    isActive && "bg-sunken",
                    isSel ? "font-medium text-brand" : "text-ink",
                    it.disabled && "cursor-default opacity-45",
                  )}
                >
                  <span className={cx("min-w-0 flex-1 truncate", it.value === "" && !isSel && "text-muted")}>{it.label}</span>
                  <svg viewBox="0 0 20 20" className={cx("h-4 w-4 shrink-0", !isSel && "invisible")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                  </svg>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}
