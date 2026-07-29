"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../lib/utils";

type RefractionMode = "auto" | "off";

type LiquidGlassContextValue = {
  /** 当前材质域共用的 SVG filter 引用。 */
  filterUrl: string;
  /** 当前浏览器是否启用增强折射。 */
  refractionActive: boolean;
};

const LiquidGlassContext =
  React.createContext<LiquidGlassContextValue | null>(null);

export interface LiquidGlassProviderProps {
  /** 共享同一套折射定义的玻璃表面。 */
  children: React.ReactNode;
  /** `auto` 只在已验证兼容的 Chromium 浏览器启用折射。 */
  refraction?: RefractionMode;
}

/**
 * 为一组玻璃表面提供单份 SVG 折射定义。
 *
 * 组件不会监听指针或持续动画；基础 blur 始终由 CSS 提供，SVG 只做渐进增强。
 */
export function LiquidGlassProvider({
  children,
  refraction = "auto"
}: LiquidGlassProviderProps) {
  const reactId = React.useId();
  const filterId = `drawless-liquid-glass-${reactId.replaceAll(":", "")}`;
  const [refractionActive, setRefractionActive] = React.useState(false);

  React.useEffect(() => {
    setRefractionActive(
      refraction === "auto" && supportsBackdropRefraction(filterId)
    );
  }, [filterId, refraction]);

  const contextValue = React.useMemo(
    () => ({
      filterUrl: `url("#${filterId}")`,
      refractionActive
    }),
    [filterId, refractionActive]
  );

  return (
    <LiquidGlassContext.Provider value={contextValue}>
      <svg
        aria-hidden="true"
        className="drawless-liquid-glass-defs"
        focusable="false"
        height="0"
        width="0"
      >
        <defs>
          <filter
            colorInterpolationFilters="sRGB"
            id={filterId}
            x="-8%"
            y="-8%"
            width="116%"
            height="116%"
          >
            <feTurbulence
              baseFrequency="0.011 0.017"
              numOctaves="2"
              result="noise"
              seed="17"
              stitchTiles="stitch"
              type="fractalNoise"
            />
            <feGaussianBlur in="noise" result="softNoise" stdDeviation="1.35" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="softNoise"
              result="refracted"
              scale="11"
              xChannelSelector="R"
              yChannelSelector="B"
            />
            <feGaussianBlur in="refracted" stdDeviation="0.18" />
          </filter>
        </defs>
      </svg>
      {children}
    </LiquidGlassContext.Provider>
  );
}

const liquidGlassSurfaceVariants = cva("drawless-liquid-glass", {
  variants: {
    variant: {
      panel: "drawless-liquid-glass--panel",
      card: "drawless-liquid-glass--card",
      control: "drawless-liquid-glass--control",
      document: "drawless-liquid-glass--document"
    },
    tone: {
      neutral: "drawless-liquid-glass--neutral",
      accent: "drawless-liquid-glass--accent",
      quiet: "drawless-liquid-glass--quiet",
      success: "drawless-liquid-glass--success",
      warning: "drawless-liquid-glass--warning",
      danger: "drawless-liquid-glass--danger"
    }
  },
  defaultVariants: {
    variant: "card",
    tone: "neutral"
  }
});

export interface LiquidGlassSurfaceProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof liquidGlassSurfaceVariants> {
  /** 把材质类名和属性透传给唯一子元素，保留其原生语义。 */
  asChild?: boolean;
}

/**
 * 只定义材质，不负责业务布局、间距或内容层级。
 */
export function LiquidGlassSurface({
  asChild = false,
  className,
  style,
  tone,
  variant,
  ...props
}: LiquidGlassSurfaceProps) {
  const material = React.useContext(LiquidGlassContext);
  const Comp = asChild ? Slot : "div";
  const materialStyle = material
    ? ({
        ...style,
        "--drawless-liquid-glass-filter": material.filterUrl
      } as React.CSSProperties)
    : style;

  return (
    <Comp
      className={cn(
        liquidGlassSurfaceVariants({ tone, variant }),
        className
      )}
      data-liquid-refraction={
        material?.refractionActive ? "active" : "fallback"
      }
      style={materialStyle}
      {...props}
    />
  );
}

function supportsBackdropRefraction(filterId: string) {
  if (typeof navigator === "undefined" || typeof CSS === "undefined") {
    return false;
  }

  const navigatorWithBrands = navigator as Navigator & {
    userAgentData?: {
      brands?: Array<{ brand: string }>;
    };
  };
  const brands = navigatorWithBrands.userAgentData?.brands ?? [];
  const chromiumBrand = brands.some(({ brand }) =>
    /Chromium|Google Chrome|Microsoft Edge|Opera/i.test(brand)
  );
  const chromiumUserAgent =
    /(?:Chrome|Edg|OPR)\/\d/i.test(navigator.userAgent) &&
    !/(?:CriOS|EdgiOS)\//i.test(navigator.userAgent);
  const filterValue = `url("#${filterId}")`;

  return (
    (chromiumBrand || chromiumUserAgent) &&
    (CSS.supports("backdrop-filter", filterValue) ||
      CSS.supports("-webkit-backdrop-filter", filterValue))
  );
}

export { liquidGlassSurfaceVariants };
