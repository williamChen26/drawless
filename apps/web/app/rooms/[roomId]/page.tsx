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
          <span
            className="canvas-shell__pill"
            data-testid="sync-status"
            data-state="error"
          >
            Invalid room
          </span>
        </header>
        <section
          className="canvas-shell__workspace canvas-shell__workspace--message"
          aria-label="Invalid room"
        >
          <div className="canvas-shell__message" role="alert">
            <strong>Room link is not valid.</strong>
            <pre>
              {JSON.stringify(
                {
                  code: "INVALID_ROOM_ID",
                  message: decision.reason
                },
                null,
                2
              )}
            </pre>
          </div>
        </section>
      </main>
    );
  }

  return <CanvasShell roomId={decision.roomId} />;
}
