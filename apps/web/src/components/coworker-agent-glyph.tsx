"use client";

import {
  motion,
  useReducedMotion,
  type TargetAndTransition,
  type Transition
} from "motion/react";
import React, { useId, useMemo } from "react";

import type { CoworkerAvatarMode } from "../lib/coworker-avatar-state";

type CoworkerAgentGlyphProps = {
  /** 当前人物表现状态。 */
  mode: CoworkerAvatarMode;
};

type GlyphPose = {
  body: TargetAndTransition;
  shell: TargetAndTransition;
  portal: TargetAndTransition;
  orb: TargetAndTransition;
  inkShadow: TargetAndTransition;
  shadow: TargetAndTransition;
};

const poseTransition: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 24,
  mass: 0.78
};

const poses: Record<CoworkerAvatarMode, GlyphPose> = {
  idle: {
    body: { x: 0, y: 0, rotate: -1, scale: 1 },
    shell: { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 },
    portal: { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1 },
    orb: { x: 0, y: 0, rotate: 0, scale: 1 },
    inkShadow: { x: 1, y: 3, rotate: 0, scale: 1, opacity: 0.22 },
    shadow: { scaleX: 1, opacity: 0.12 }
  },
  hover: {
    body: { x: 0, y: -7, rotate: 1, scale: 1.02 },
    shell: { x: 0, y: -2, rotate: -1, scaleX: 1.01, scaleY: 1.015 },
    portal: { x: 1, y: -2, rotate: 0, scaleX: 1.035, scaleY: 1.08 },
    orb: { x: 5, y: -5, rotate: 22, scale: 1.02 },
    inkShadow: { x: 1, y: 4, rotate: 0, scale: 1.018, opacity: 0.17 },
    shadow: { scaleX: 0.88, opacity: 0.08 }
  },
  listening: {
    body: { x: -3, y: -1, rotate: -6, scale: 1.015 },
    shell: { x: -2, y: 2, rotate: -3, scaleX: 0.98, scaleY: 1.01 },
    portal: { x: -2, y: 4, rotate: -2, scaleX: 0.9, scaleY: 1.06 },
    orb: { x: -36, y: 49, rotate: 68, scale: 1.18 },
    inkShadow: { x: 1, y: 3, rotate: 0, scale: 1.008, opacity: 0.21 },
    shadow: { scaleX: 0.94, opacity: 0.1 }
  },
  working: {
    body: { x: 9, y: 12, rotate: 10, scale: 1.02 },
    shell: { x: 4, y: 3, rotate: 5, scaleX: 1.14, scaleY: 0.76 },
    portal: { x: 8, y: 5, rotate: 4, scaleX: 1.18, scaleY: 0.78 },
    orb: { x: -7, y: -7, rotate: 45, scale: 0.94 },
    inkShadow: {
      x: 2,
      y: 4,
      rotate: 0,
      scaleX: 1.025,
      scaleY: 1,
      opacity: 0.21
    },
    shadow: { scaleX: 1.2, opacity: 0.12 }
  },
  "awaiting-approval": {
    body: { x: 0, y: -3, rotate: 0, scale: 1.01 },
    shell: { x: 0, y: -2, rotate: 0, scaleX: 1, scaleY: 1.015 },
    portal: { x: 0, y: -1, rotate: 0, scaleX: 1, scaleY: 1.02 },
    orb: { x: 0, y: -12, rotate: 0, scale: 1.02 },
    inkShadow: { x: 0, y: 3, rotate: 0, scale: 1, opacity: 0.24 },
    shadow: { scaleX: 0.96, opacity: 0.12 }
  }
};

export function CoworkerAgentGlyph({ mode }: CoworkerAgentGlyphProps) {
  const prefersReducedMotion = useReducedMotion();
  const reactId = useId();
  const id = useMemo(() => reactId.replace(/:/g, ""), [reactId]);
  const pose = poses[mode];
  const working = mode === "working";
  const listening = mode === "listening";
  const awaitingApproval = mode === "awaiting-approval";
  const ambientLoop: TargetAndTransition | false = prefersReducedMotion
    ? false
    : working
      ? {
          x: [0, 2, 0],
          transition: {
            duration: 1.4,
            ease: "easeInOut",
            repeat: Infinity
          }
        }
      : awaitingApproval
        ? false
        : {
            y: [0, -2.2, 0],
            transition: {
              duration: 4.8,
              ease: "easeInOut",
              repeat: Infinity
            }
          };
  const orbLoop: TargetAndTransition | false =
    prefersReducedMotion || mode !== "idle"
      ? false
      : {
          x: [0, 1.5, -1, 0],
          y: [0, -1.5, 1, 0],
          transition: {
            duration: 7.2,
            ease: "easeInOut",
            repeat: Infinity
          }
        };

  return (
    <svg
      aria-hidden="true"
      className="coworker-agent-glyph"
      data-state={mode}
      focusable="false"
      viewBox="48 18 190 188"
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={`${id}-shell-front`}
          x1="68"
          x2="184"
          y1="35"
          y2="188"
        >
          <stop offset="0" stopColor="var(--coworker-agent-shell-light)" />
          <stop offset="0.42" stopColor="var(--coworker-agent-shell)" />
          <stop offset="0.72" stopColor="var(--coworker-agent-shell-deep)" />
          <stop offset="1" stopColor="var(--coworker-agent-shell-shadow)" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={`${id}-inner-surface`}
          x1="123"
          x2="126"
          y1="88"
          y2="176"
        >
          <stop offset="0" stopColor="var(--coworker-agent-cavity)" />
          <stop offset="0.34" stopColor="var(--coworker-agent-inner-mid)" />
          <stop offset="0.7" stopColor="var(--coworker-agent-inner-soft)" />
          <stop offset="1" stopColor="var(--coworker-agent-inner-light)" />
        </linearGradient>
        <radialGradient id={`${id}-cavity`} cx="38%" cy="32%" r="78%">
          <stop
            offset="0"
            stopColor="var(--coworker-agent-cavity)"
            stopOpacity="0.96"
          />
          <stop
            offset="0.5"
            stopColor="var(--coworker-agent-cavity-mid)"
            stopOpacity="0.68"
          />
          <stop
            offset="0.82"
            stopColor="var(--coworker-agent-cavity-soft)"
            stopOpacity="0.26"
          />
          <stop
            offset="1"
            stopColor="var(--coworker-agent-cavity-edge)"
            stopOpacity="0.04"
          />
        </radialGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={`${id}-seam-upper`}
          x1="78"
          x2="184"
          y1="100"
          y2="118"
        >
          <stop
            offset="0"
            stopColor="var(--coworker-agent-accent)"
            stopOpacity="0.12"
          />
          <stop
            offset="0.25"
            stopColor="var(--coworker-agent-accent)"
            stopOpacity="0.68"
          />
          <stop
            offset="0.76"
            stopColor="var(--coworker-agent-accent)"
            stopOpacity="0.56"
          />
          <stop
            offset="1"
            stopColor="var(--coworker-agent-accent)"
            stopOpacity="0.08"
          />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={`${id}-seam-lower`}
          x1="70"
          x2="188"
          y1="168"
          y2="187"
        >
          <stop
            offset="0"
            stopColor="var(--coworker-agent-accent)"
            stopOpacity="0.08"
          />
          <stop
            offset="0.28"
            stopColor="var(--coworker-agent-accent)"
            stopOpacity="0.46"
          />
          <stop
            offset="0.72"
            stopColor="var(--coworker-agent-accent)"
            stopOpacity="0.34"
          />
          <stop
            offset="1"
            stopColor="var(--coworker-agent-accent)"
            stopOpacity="0.04"
          />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={`${id}-bottom-shadow`}
          x1="78"
          x2="122"
          y1="168"
          y2="192"
        >
          <stop
            offset="0"
            stopColor="#20242b"
            stopOpacity="0.55"
          />
          <stop offset="0.58" stopColor="#6b6c6d" stopOpacity="0.32" />
          <stop offset="1" stopColor="#aaa7a2" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-orb`} cx="32%" cy="28%" r="76%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#f1efea" />
          <stop offset="1" stopColor="var(--coworker-agent-shell-shadow)" />
        </radialGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={`${id}-orb-seam`}
          x1="179"
          x2="200"
          y1="45"
          y2="70"
        >
          <stop offset="0" stopColor="var(--coworker-agent-orb-seam-start)" />
          <stop
            offset="1"
            stopColor="var(--coworker-agent-orb-seam-end)"
          />
        </linearGradient>
        <filter
          height="260%"
          id={`${id}-shadow`}
          width="180%"
          x="-40%"
          y="-80%"
        >
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter
          height="190%"
          id={`${id}-ink-shadow`}
          width="190%"
          x="-45%"
          y="-35%"
        >
          <feGaussianBlur stdDeviation="3.8" />
        </filter>
        <filter
          height="240%"
          id={`${id}-seam-soft`}
          width="240%"
          x="-70%"
          y="-70%"
        >
          <feGaussianBlur result="blur" stdDeviation="2.4" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter
          height="160%"
          id={`${id}-cavity-soft`}
          width="140%"
          x="-20%"
          y="-30%"
        >
          <feGaussianBlur stdDeviation="1.35" />
        </filter>
        <mask
          height="110"
          id={`${id}-inner-cutout`}
          maskUnits="userSpaceOnUse"
          width="120"
          x="70"
          y="70"
        >
          <rect fill="#ffffff" height="110" width="120" x="70" y="70" />
          <path
            d="M112 155 C119 146 123 132 132 122 C140 113 149 117 158 125 C165 131 172 128 178 123 C176 138 162 149 148 155 C135 160 121 161 112 155 Z"
            fill="#000000"
          />
        </mask>
      </defs>

      <motion.ellipse
        animate={pose.shadow}
        className="coworker-agent-glyph__shadow"
        cx="122"
        cy="195"
        fill="var(--coworker-ink)"
        filter={`url(#${id}-shadow)`}
        initial={false}
        rx="58"
        ry="7"
        style={{ transformOrigin: "122px 195px" }}
        transition={poseTransition}
      />

      <motion.g
        animate={pose.body}
        style={{ transformOrigin: "122px 124px" }}
        transition={poseTransition}
      >
        <motion.g animate={ambientLoop}>
          <motion.g
            animate={pose.shell}
            style={{ transformOrigin: "124px 122px" }}
            transition={poseTransition}
          >
            <motion.path
              animate={pose.inkShadow}
              className="coworker-agent-glyph__ink-shadow"
              d="M78 181 C61 171 61 147 66 113 C72 80 84 52 105 39 C126 26 149 31 162 51 C174 69 180 95 181 116 C182 126 178 132 171 133 C165 134 159 128 152 120 C146 113 142 107 136 102 C125 93 114 89 105 93 C95 97 91 108 88 121 C85 134 87 145 94 151 C102 159 113 153 125 151 C148 147 168 160 191 177 C199 183 197 189 188 189 C164 188 143 179 122 175 C108 172 99 177 91 182 C86 185 82 184 78 181 Z"
              fill="var(--coworker-agent-ink-shadow)"
              filter={`url(#${id}-ink-shadow)`}
              initial={false}
              style={{ transformOrigin: "124px 122px" }}
              transition={poseTransition}
            />
            <path
              d="M81 105 C88 82 107 70 127 75 C148 79 166 95 180 113 C182 121 176 134 164 143 C151 153 136 157 123 158 C109 160 100 165 91 174 C84 180 77 171 78 159 C79 140 79 119 81 105 Z"
              fill={`url(#${id}-inner-surface)`}
              mask={`url(#${id}-inner-cutout)`}
            />
            <path
              className="coworker-agent-glyph__shell"
              d="M78 181 C61 171 61 147 66 113 C72 80 84 52 105 39 C126 26 149 31 162 51 C174 69 180 95 181 116 C182 126 178 132 171 133 C165 134 159 128 152 120 C146 113 142 107 136 102 C125 93 114 89 105 93 C95 97 91 108 88 121 C85 134 87 145 94 151 C102 159 113 153 125 151 C148 147 168 160 191 177 C199 183 197 189 188 189 C164 188 143 179 122 175 C108 172 99 177 91 182 C86 185 82 184 78 181 Z"
              fill={`url(#${id}-shell-front)`}
              stroke="#ffffff"
              strokeOpacity="0.48"
              strokeWidth="1.2"
            />
            <path
              d="M78 181 C84 185 88 184 93 181 C100 177 107 174 115 174 C108 177 102 181 96 184 C89 188 82 187 78 183 Z"
              fill={`url(#${id}-bottom-shadow)`}
            />
            <path
              d="M78 181 C83 184 87 184 91 182 C99 177 108 172 122 175 C143 179 164 188 188 189"
              fill="none"
              filter={`url(#${id}-seam-soft)`}
              stroke={`url(#${id}-seam-lower)`}
              strokeLinecap="round"
              strokeOpacity="0.72"
              strokeWidth="0.95"
            />
            <path
              d="M95 154 C107 157 115 152 126 151 C145 149 162 157 178 168"
              fill="none"
              stroke="var(--coworker-agent-shell-light)"
              strokeLinecap="round"
              strokeOpacity="0.52"
              strokeWidth="1.1"
            />
            {working && !prefersReducedMotion ? (
              <>
                <motion.path
                  animate={{ strokeDashoffset: [0, -1] }}
                  d="M84 103 C91 84 108 74 127 78 C146 82 162 95 177 112"
                  fill="none"
                  pathLength="1"
                  stroke="var(--coworker-agent-accent)"
                  strokeDasharray="0.16 0.84"
                  strokeLinecap="round"
                  strokeWidth="1.25"
                  transition={{
                    duration: 1.4,
                    ease: "linear",
                    repeat: Infinity
                  }}
                />
                <motion.path
                  animate={{ strokeDashoffset: [0, -1] }}
                  d="M78 181 C83 184 87 184 91 182 C99 177 108 172 122 175 C143 179 164 188 188 189"
                  fill="none"
                  pathLength="1"
                  stroke="var(--coworker-agent-accent)"
                  strokeDasharray="0.13 0.87"
                  strokeLinecap="round"
                  strokeWidth="1.15"
                  transition={{
                    delay: 0.22,
                    duration: 1.4,
                    ease: "linear",
                    repeat: Infinity
                  }}
                />
              </>
            ) : null}
          </motion.g>

          <motion.g
            animate={pose.portal}
            style={{ transformOrigin: "128px 113px" }}
            transition={poseTransition}
          >
            <path
              className="coworker-agent-glyph__cavity"
              d="M84 104 C90 84 107 73 126 77 C146 81 164 96 178 113 C182 118 181 123 177 124 C164 122 152 113 140 103 C127 93 116 91 107 96 C99 101 98 113 95 123 C92 133 86 139 81 136 C75 132 79 118 84 104 Z"
              fill={`url(#${id}-cavity)`}
              filter={`url(#${id}-cavity-soft)`}
            />
            <path
              d="M84 103 C91 84 108 74 127 78 C146 82 162 95 177 112"
              fill="none"
              filter={`url(#${id}-seam-soft)`}
              stroke={`url(#${id}-seam-upper)`}
              strokeLinecap="round"
              strokeOpacity="0.84"
              strokeWidth="1.05"
            />
          </motion.g>

          <motion.g
            animate={pose.orb}
            style={{ transformOrigin: "188px 58px" }}
            transition={poseTransition}
          >
            <motion.g animate={orbLoop}>
              <circle
                className="coworker-agent-glyph__orb-shadow"
                cx="189.5"
                cy="61"
                fill="var(--coworker-agent-ink-shadow)"
                filter={`url(#${id}-ink-shadow)`}
                opacity="0.2"
                r="13"
              />
              <circle
                className="coworker-agent-glyph__orb"
                cx="188"
                cy="58"
                fill={`url(#${id}-orb)`}
                r="13"
                stroke="#ffffff"
                strokeOpacity="0.7"
                strokeWidth="1"
              />
              <path
                d="M180 68 C183 61 188 54 196 48"
                fill="none"
                stroke={`url(#${id}-orb-seam)`}
                strokeLinecap="round"
                strokeWidth="1.7"
              />
              <ellipse
                cx="183"
                cy="53"
                fill="var(--coworker-agent-shell-light)"
                opacity="0.64"
                rx="3.6"
                ry="2.2"
              />
            </motion.g>
          </motion.g>

          {listening ? (
            <g
              fill="none"
              stroke="var(--coworker-agent-accent)"
              strokeLinecap="round"
            >
              {[0, 1, 2].map((wave) => (
                <motion.path
                  animate={
                    prefersReducedMotion
                      ? {
                          opacity: 0.56 - wave * 0.14,
                          x: 7 + wave * 10,
                          scaleY: 0.92 + wave * 0.2
                        }
                      : {
                          opacity: [0, 0.66, 0.3, 0],
                          scaleY: [0.82, 0.96, 1.2, 1.46],
                          x: [0, 5, 15, 29]
                        }
                  }
                  d="M182 89 C204 98 204 123 182 132"
                  initial={false}
                  key={wave}
                  strokeWidth="1.15"
                  style={{ transformOrigin: "182px 110.5px" }}
                  transition={{
                    delay: wave * 0.62,
                    duration: 1.9,
                    ease: "easeOut",
                    repeat: prefersReducedMotion ? 0 : Infinity,
                    times: [0, 0.15, 0.58, 1]
                  }}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ) : null}

          {awaitingApproval ? (
            <g
              fill="none"
              stroke="var(--coworker-agent-accent)"
              strokeLinecap="round"
            >
              {[0, 1, 2].map((wave) => (
                <motion.path
                  animate={
                    prefersReducedMotion
                      ? {
                          opacity: 0.66 - wave * 0.16,
                          scaleX: 1 + wave * 0.24,
                          y: -wave * 10
                        }
                      : {
                          opacity: [0, 0.72, 0.3, 0],
                          scaleX: [0.9, 1, 1.22, 1.5],
                          y: [0, -4, -13, -25]
                        }
                  }
                  d="M170 29 C176 12 200 12 206 29"
                  initial={false}
                  key={wave}
                  strokeWidth="1.15"
                  style={{ transformOrigin: "188px 30px" }}
                  transition={{
                    delay: wave * 0.72,
                    duration: 2.2,
                    ease: "easeOut",
                    repeat: prefersReducedMotion ? 0 : Infinity,
                    times: [0, 0.15, 0.58, 1]
                  }}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ) : null}
        </motion.g>
      </motion.g>
    </svg>
  );
}
