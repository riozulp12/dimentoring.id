"use client";

export default function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-[#081EEA]" : "bg-[#CAC9C9]",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block size-[18px] rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );
}
