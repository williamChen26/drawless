import * as React from "react";

import { cn } from "../lib/utils";

// shadcn 的 Textarea 是轻量 DOM primitive；这里保持同样边界，只统一类名和 ref 透传。
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn("drawless-ui-textarea", className)}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
