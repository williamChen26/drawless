import { useMemo, useState } from "react";
import type { DrawlessServerCoworkerStartRequest } from "@drawless/shared";

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
  refresh: () => Promise<CoworkerControlView>;
  /** 显式请求 coworker 进入 room。 */
  start: (
    request?: DrawlessServerCoworkerStartRequest
  ) => Promise<CoworkerControlView>;
  /** 显式请求 coworker 离开 room。 */
  stop: () => Promise<CoworkerControlView>;
};

type CoworkerControlAction = "status" | "start" | "stop";

/**
 * 把顶部栏、入场弹窗和后续调试按钮统一接到同一套 coworker 控制面。
 *
 * 这里不直接连接 coworker 服务，而是永远经过 drawless server；
 * server 负责开关、baseUrl、超时和跨端契约校验，web 只保留用户意图。
 */
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

  const runAction = (
    action: CoworkerControlAction,
    startRequest?: DrawlessServerCoworkerStartRequest
  ): Promise<CoworkerControlView> => {
    // 所有动作先进入 loading 态，避免弹窗和顶部栏同时触发时出现两个并发 UI 状态。
    setView((current) => ({
      ...current,
      label: action === "start" ? "Coworker entering" : "Coworker checking",
      state: "loading",
      detail: "Calling drawless server coworker control route.",
      busy: true
    }));

    const request =
      action === "start"
        ? client.start({
            // 默认等待 coworker 完成首次 room hydration；调用方仍可覆盖，例如测试或快速控制按钮。
            waitUntilLoaded: true,
            timeoutMs: 10_000,
            ...startRequest
          })
        : action === "stop"
          ? client.stop()
          : client.status();

    return request
      .then((result) => {
        const nextView = result.ok
          ? createCoworkerSuccessView(result.value, action)
          : createCoworkerErrorView(result.error);
        if (!result.ok) {
          // Result 风格的业务错误已经带有 code/message，统一转成顶部栏可读状态。
          setView(nextView);
          return nextView;
        }

        setView(nextView);
        return nextView;
      })
      .catch((error: unknown) => {
        // fetch 级异常、JSON 解析异常等兜底成 HTTP_ERROR，避免 React 事件链抛出未处理异常。
        const nextView = createCoworkerErrorView({
          code: "HTTP_ERROR",
          message: error instanceof Error ? error.message : String(error),
          raw: error
        });
        setView(nextView);
        return nextView;
      });
  };

  return {
    view,
    refresh: () => runAction("status"),
    start: (request) => runAction("start", request),
    stop: () => runAction("stop")
  };
}

function createCoworkerSuccessView(
  value: unknown,
  action: CoworkerControlAction
): CoworkerControlView {
  // coworker status 是跨服务响应；这里保持宽松读取，再由 UI 映射成少量稳定状态。
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
  // disabled 是部署配置状态，不应展示成普通失败，方便本地开发时判断是否没开 COWORKER_ENABLED。
  const disabled = error.message.toLowerCase().includes("disabled");
  return {
    label: disabled ? "Coworker disabled" : "Coworker error",
    state: disabled ? "disabled" : "error",
    detail: error.message,
    busy: false,
    raw: error
  };
}
