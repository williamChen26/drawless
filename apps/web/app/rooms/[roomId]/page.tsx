import { CanvasShell } from "@/components/canvas-shell";
import { decideRoomRoute } from "@/lib/room-route";

type RoomPageProps = {
  params: Promise<{
    roomId?: string;
  }>;
};

export default async function RoomPage({ params }: RoomPageProps) {
  const { roomId } = await params;
  const decision = decideRoomRoute({ roomId });

  if (decision.kind === "invalid") {
    return (
      <main className="canvas-shell" data-testid="canvas-shell">
        <header className="canvas-shell__bar" aria-label="Canvas workspace">
          <div className="canvas-shell__brand">
            <strong>drawless</strong>
          </div>
        </header>
        <section
          className="canvas-shell__workspace canvas-shell__workspace--message"
          aria-label="房间链接无效"
        >
          <div className="canvas-shell__message" role="alert">
            <strong>这个房间链接无效</strong>
            <p>请检查链接是否完整，或创建一个新房间。</p>
            <a className="canvas-shell__message-action" href="/">
              创建新房间
            </a>
          </div>
        </section>
      </main>
    );
  }

  return <CanvasShell roomId={decision.roomId} />;
}
