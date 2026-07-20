"use client";

import { useEffect, useState } from "react";

import {
  COWORKER_AVATAR_FRAME_PATHS,
  COWORKER_POINTING_FRAME_PATH,
  COWORKER_WORKING_FRAME_INTERVAL_MS,
  getCoworkerAvatarFramePath,
  getNextWorkingFrame,
  pickNextListeningFrame,
  type CoworkerAvatarFrame,
  type CoworkerAvatarMode
} from "./coworker-avatar-state";

export function useCoworkerAvatarFrame(mode: CoworkerAvatarMode) {
  const reducedMotion = usePrefersReducedMotion();
  const [frame, setFrame] = useState<CoworkerAvatarFrame>(1);

  useEffect(() => {
    [...COWORKER_AVATAR_FRAME_PATHS, COWORKER_POINTING_FRAME_PATH].forEach(
      (source) => {
        const image = new Image();
        image.src = source;
      }
    );
  }, []);

  useEffect(() => {
    if (mode === "working") {
      if (reducedMotion) {
        setFrame(6);
        return;
      }

      setFrame(5);
      const interval = window.setInterval(() => {
        setFrame((current) => getNextWorkingFrame(current));
      }, COWORKER_WORKING_FRAME_INTERVAL_MS);
      return () => {
        window.clearInterval(interval);
      };
    }

    if (mode === "awaiting-approval") {
      setFrame(8);
      return;
    }
    if (mode === "listening") {
      setFrame((current) => pickNextListeningFrame(current));
      return;
    }
    setFrame(mode === "hover" ? 2 : 1);
  }, [mode, reducedMotion]);

  return {
    /** 当前应展示的静态帧地址。 */
    frameSrc:
      mode === "awaiting-approval"
        ? COWORKER_POINTING_FRAME_PATH
        : getCoworkerAvatarFramePath(frame),
    /** 当前用户是否要求减少动态效果。 */
    reducedMotion
  };
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);

  return reducedMotion;
}
