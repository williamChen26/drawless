import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

// 这个 package 只提供 shadcn-style primitive；具体视觉 token 仍由 apps/web/app/globals.css 控制。
const buttonVariants = cva("drawless-ui-button", {
  variants: {
    variant: {
      default: "drawless-ui-button--default",
      secondary: "drawless-ui-button--secondary",
      ghost: "drawless-ui-button--ghost"
    },
    size: {
      default: "drawless-ui-button--default-size",
      sm: "drawless-ui-button--sm",
      icon: "drawless-ui-button--icon"
    }
  },
  defaultVariants: {
    variant: "default",
    size: "default"
  }
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** 使用 Radix Slot 把按钮样式透传给子元素，例如把链接渲染成按钮外观。 */
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    // asChild 保留 shadcn 组合模式，避免为了 link/button 两种语义复制组件。
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ size, variant }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { buttonVariants };
