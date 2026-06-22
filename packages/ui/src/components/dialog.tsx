import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "../lib/utils";

// 直接导出 Radix Root/Trigger/Close，业务侧可以保持标准 shadcn/Radix 的组合方式。
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogPortal = DialogPrimitive.Portal;

// Overlay 和 Content 固定挂载 drawless-ui-* 类名，避免各 app 重复绑定 Radix 结构样式。
export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn("drawless-ui-dialog-overlay", className)}
    ref={ref}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ children, className, ...props }, ref) => (
  <DialogPortal>
    {/* Radix 负责无障碍焦点管理；这里仅补齐项目统一的遮罩和内容容器类名。 */}
    <DialogOverlay />
    <DialogPrimitive.Content
      className={cn("drawless-ui-dialog-content", className)}
      ref={ref}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  // Header/Footer 是布局约定，不引入额外语义，语义仍交给 DialogTitle/DialogDescription。
  return <div className={cn("drawless-ui-dialog-header", className)} {...props} />;
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("drawless-ui-dialog-footer", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    className={cn("drawless-ui-dialog-title", className)}
    ref={ref}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    className={cn("drawless-ui-dialog-description", className)}
    ref={ref}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;
