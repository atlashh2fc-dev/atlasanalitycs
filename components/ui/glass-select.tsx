"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type GlassSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type GlassSelectProps = {
  name?: string;
  defaultValue: string;
  options: GlassSelectOption[];
  ariaLabel: string;
  prefix?: string;
  className?: string;
};

/**
 * Selector renderizado por la aplicación. A diferencia de <select>, su menú no
 * depende del tema nativo de Windows/macOS y conserva el vidrio en todas partes.
 */
export function GlassSelect({
  name,
  defaultValue,
  options,
  ariaLabel,
  prefix,
  className = "",
}: GlassSelectProps) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex] ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);

    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open, selectedIndex]);

  function nextEnabled(from: number, direction: 1 | -1) {
    if (!options.length) return 0;
    let next = from;
    for (let i = 0; i < options.length; i += 1) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) return next;
    }
    return from;
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setValue(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(selectedIndex);
      } else {
        setActiveIndex((index) => nextEnabled(index, event.key === "ArrowDown" ? 1 : -1));
      }
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(activeIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className={`glass-select ${open ? "is-open" : ""} ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        ref={buttonRef}
        type="button"
        className="glass-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={onKeyDown}
      >
        {prefix ? <span className="glass-select-prefix">{prefix}</span> : null}
        <span className="glass-select-value">{selected?.label ?? value}</span>
        <ChevronDown className="glass-select-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <div id={listboxId} role="listbox" aria-label={ariaLabel} className="glass-select-menu">
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={`${option.value}-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                className={`glass-select-option ${index === activeIndex ? "is-active" : ""}`}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                <Check className={`glass-select-check ${isSelected ? "is-visible" : ""}`} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
