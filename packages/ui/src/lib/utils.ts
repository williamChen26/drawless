import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  // 兼容 shadcn 生态常用写法：先合并条件类名，再让 tailwind-merge 处理冲突类。
  return twMerge(clsx(inputs));
}
