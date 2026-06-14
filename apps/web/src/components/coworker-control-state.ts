import { useMemo, useState } from "react";

import {
  createCoworkerControlClient,
  type CoworkerControlError
} from "@/lib/coworker-control";

export type CoworkerControlView = {
  /** 顶部栏展示的 coworker 状态。 */
  label: string;
  /** 当前 coworker 控制状态类型。 */
  state: "idle" | "loading" | "online" | "offline" | "disabled" | "error";
  /** 状态说明，用于 title。 */
  detail: string;
  /** 当前是否正在请求 server 控制面。 */
  busy: boolean;
  /** 原始响应或错误，开发阶段用于排查。 */
  raw: unknown;
};

export type CoworkerControlState = {
  /** 当前 coworker 控制视图状态。 */
  view: CoworkerControlView;
  /** 显式查询 coworker 状态。 */
  refresh: () => void;
  /** 显式请求 coworker 进入 room。 */
  start: () => void;
  /** 显式请求 coworker 离开 room。 */
  stop: () => void;
};

type CoworkerControlAction = "status" | "start" | "stop";

export function useCoworkerControl(roomId: string): CoworkerControlState {
  const [view, setView] = useState<CoworkerControlView>({
    label: "Coworker idle",
    state: "idle",
    detail: "Coworker control has not been queried.",
    busy: false,
    raw: null
  });
  const client = useMemo(
    () =>
      createCoworkerControlClient({
        roomId,
        serverUrl:
          process.env.NEXT_PUBLIC_DRAWLESS_SERVER_URL ??
          process.env.NEXT_PUBLIC_DRAWLESS_SYNC_SERVER_URL
      }),
    [roomId]
  );

  const runAction = (action: CoworkerControlAction) => {
    setView((current) => ({
      ...current,
      label: action === "start" ? "Coworker entering" : "Coworker checking",
      state: "loading",
      detail: "Calling drawless server coworker control route.",
      busy: true
    }));

    const request =
      action === "start"
        ? client.start({ waitUntilLoaded: true, timeoutMs: 10_000 })
        : action === "stop"
          ? client.stop()
          : client.status();

    request
      .then((result) => {
        console.log('result', result);
        if (!result.ok) {
          setView(createCoworkerErrorView(result.error));
          return;
        }

        setView(createCoworkerSuccessView(result.value, action));
      })
      .catch((error: unknown) => {
        console.log('error', error);
        setView(
          createCoworkerErrorView({
            code: "HTTP_ERROR",
            message: error instanceof Error ? error.message : String(error),
            raw: error
          })
        );
      });
  };

  return {
    view,
    refresh: () => runAction("status"),
    start: () => runAction("start"),
    stop: () => runAction("stop")
  };
}

function createCoworkerSuccessView(
  value: unknown,
  action: CoworkerControlAction
): CoworkerControlView {
  if (
    value &&
    typeof value === "object" &&
    "status" in value &&
    typeof value.status === "string"
  ) {
    const status = value.status;
    return {
      label: status === "online" ? "Coworker online" : `Coworker ${status}`,
      state:
        status === "online"
          ? "online"
          : status === "not_started" || status === "stopped"
            ? "idle"
            : "offline",
      detail:
        action === "start"
          ? "Coworker entered the room through drawless server."
          : "Coworker lifecycle status returned by drawless server.",
      busy: false,
      raw: value
    };
  }

  return {
    label: "Coworker updated",
    state: "offline",
    detail: "Coworker control returned a response.",
    busy: false,
    raw: value
  };
}

function createCoworkerErrorView(
  error: CoworkerControlError
): CoworkerControlView {
  const disabled = error.message.toLowerCase().includes("disabled");
  return {
    label: disabled ? "Coworker disabled" : "Coworker error",
    state: disabled ? "disabled" : "error",
    detail: error.message,
    busy: false,
    raw: error
  };
}
