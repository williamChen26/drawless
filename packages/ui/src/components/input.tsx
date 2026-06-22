import * as React from "react";

import { cn } from "../lib/utils";

// 当前 Input 只统一基础类名和 ref 透传；业务校验、label、错误文案由具体表单负责。
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      className={cn("drawless-ui-input", className)}
      ref={ref}
      type={type}
      {...props}
    />
  )
);
Input.displayName = "Input";
