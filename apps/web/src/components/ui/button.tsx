import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium",
    "transition-[background-color,box-shadow,color,transform] duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-50 active:translate-y-px",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        /** The main action on a screen. Ink, so green stays meaningful. */
        primary: "bg-ink text-white shadow-card hover:bg-ink-2",
        /** Money moves: fund, approve, release, donate. */
        brand:
          "bg-green-400 text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_1px_2px_rgb(13_128_134/0.3)] hover:bg-green-300",
        secondary: "border border-line bg-surface text-ink shadow-card hover:border-line-strong hover:bg-canvas",
        ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
        danger: "border border-line bg-surface text-disputed hover:border-disputed/40 hover:bg-disputed-bg",
      },
      size: {
        sm: "h-8 rounded-sm px-3 text-[13px]",
        md: "h-9 rounded-sm px-3.5 text-sm",
        lg: "h-11 rounded-md px-5 text-[15px]",
        icon: "size-9 rounded-sm",
        "icon-sm": "size-8 rounded-sm",
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
