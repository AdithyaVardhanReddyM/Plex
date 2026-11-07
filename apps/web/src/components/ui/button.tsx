import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-[-0.005em] select-none",
    "transition-[background-color,box-shadow,color,border-color,transform] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-green-200",
    "disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /** The main action on a screen. Ink, so green stays meaningful. */
        primary:
          "bg-ink text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(12_21_18/0.24),0_0_0_1px_var(--color-ink)] hover:bg-ink/88",
        /** Money moves: fund, approve, release, donate. */
        brand:
          "bg-green-300 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_2px_rgb(13_128_134/0.28),0_0_0_1px_rgb(13_150_158/0.28)] hover:bg-green-200",
        secondary:
          "border border-line bg-surface text-ink shadow-card hover:border-line-strong hover:shadow-hover",
        ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
        danger: "border border-line bg-surface text-disputed shadow-card hover:border-disputed/40 hover:bg-disputed-bg",
      },
      size: {
        sm: "h-8 px-3.5 text-[13px] [&_svg]:size-3.5",
        md: "h-9 px-4 text-[13.5px]",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
