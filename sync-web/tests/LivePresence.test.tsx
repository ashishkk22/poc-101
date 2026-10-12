import { render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { CallRoomPage } from "@/pages/CallRoomPage";
import {
  CallSessionProvider,
  useCallSession,
  type ActiveCallSession,
} from "@/features/join";
import { RealtimeProvider } from "@/lib/realtime";
import type { RemotePeer } from "@/features/call-media";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { createTestQueryClient } from "./testUtils";

const leave = vi.fn();
const endCall = vi.fn();
const participants = vi.fn();
const listInvitations = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    callsApi: {
      ...actual.callsApi,
      leave: (...a: unknown[]) => leave(...a),
      end: (...a: unknown[]) => endCall(...a),
      participants: (...a: unknown[]) => participants(...a),
      heartbeat: () => new Promise(() => undefined),
    },
    invitationsApi: {
      ...actual.invitationsApi,
      listForCall: (...a: unknown[]) => listInvitations(...a),
    },
    authApi: {
      ...actual.authApi,
      getSession: () =>
        Promise.resolve({ id: "u1", name: "Olivia", email: "o@example.com" }),
    },
  };
});

const CALL = {
  id: "call_1",
  title: "Security review",
  scheduledStart: new Date(Date.now() - 60_000).toISOString(),
  scheduledEnd: new Date(Date.now() + 3_600_000).toISOString(),
  timezone: "UTC",
  status: "LIVE" as const,
};

function session(role: "ORGANIZER" | "PARTICIPANT"): ActiveCallSession {
  return {
    via: "CALL_ID",
    token: null,
    callId: "call_1",
    deviceId: "web-1",
    role,
    call: CALL,
    attendanceSession: {
      id: "sess_1",
      deviceId: "web-1",
      joinedAt: new Date().toISOString(),
      leftAt: null,
      leftReason: null,
      status: "CONNECTED",
    },
    providerSession: { id: "prov_1", expiresAt: CALL.scheduledEnd },
    micOn: true,
    cameraOn: true,
  };
}

/**
 * Seeds an in-memory call session, as the lobby would have done.
 *
 * The room is mounted only once the session exists — otherwise it correctly
 * bounces to the lobby, which is what it does after a refresh.
 */
function Seed({
  role,
  children,
}: {
  role: "ORGANIZER" | "PARTICIPANT";
  children: ReactNode;
}) {
  const { start } = useCallSession();
  const [ready, setReady] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    // Seeded once only. The room must then stay mounted even after the session
    // clears, or it never gets the chance to redirect.
    if (seeded.current) return;
    seeded.current = true;
    start(session(role));
    setReady(true);
  }, [start, role]);

  return ready ? <>{children}</> : null;
}

function renderRoom(role: "ORGANIZER" | "PARTICIPANT" = "PARTICIPANT") {
  const client = createTestQueryClient();

  return {
    ...render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <RealtimeProvider enabled={false}>
            <CallSessionProvider>
              <MemoryRouter initialEntries={["/call/call_1"]}>
                <Routes>
                  <Route
                    path="/call/:callId"
                    element={
                      <Seed role={role}>
                        <CallRoomPage />
                      </Seed>
                    }
                  />
                  <Route
                    path="/calls/:callId"
                    element={<div>Call details page</div>}
                  />
                  <Route
                    path="/call/:callId/lobby"
                    element={<div>Lobby</div>}
                  />
                  <Route path="*" element={<div>Elsewhere</div>} />
                </Routes>
              </MemoryRouter>
            </CallSessionProvider>
          </RealtimeProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    ),
  };
}

/**
 * The room as the realtime layer sees it. Joined, with whichever peers are
 * actually live — no socket or RTCPeerConnection needed.
 */
let livePeers: RemotePeer[] = [];

vi.mock("@/lib/realtime", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/realtime")>("@/lib/realtime");
  return {
    ...actual,
    useCallRoom: () => ({ joined: true, peers: [] }),
  };
});

vi.mock("@/features/call-media", async () => {
  const actual = await vi.importActual<typeof import("@/features/call-media")>(
    "@/features/call-media",
  );
  return {
    ...actual,
    useWebRtcMesh: () => ({ peers: livePeers, overCapacity: false }),
  };
});

const HOST = {
  id: "host_1",
  name: "Henry Host",
  isOrganizer: true,
  joinedAt: new Date(Date.now() - 120_000).toISOString(),
  connections: 1,
};
const ME = {
  id: "u1",
  name: "Olivia",
  isOrganizer: false,
  joinedAt: new Date().toISOString(),
  connections: 1,
};

function hostPeer(): RemotePeer {
  return {
    peerId: "sock_host",
    userId: HOST.id,
    name: HOST.name,
    isOrganizer: false,
    stream: null,
    state: "CONNECTED",
    micOn: true,
    cameraOn: false,
  };
}

/**
 * Attendance sessions outlive the tab that opened them until a heartbeat
 * lapses. The people shown as "in the call" must be who is in the room now,
 * not whoever still has a session open on record.
 */
describe("who is shown as in the call", () => {
  beforeEach(() => {
    livePeers = [];
    participants.mockReset();
    participants.mockResolvedValue([HOST, ME]);
    listInvitations.mockReset();
    listInvitations.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("leaves out a host whose session is open but who is not in the room", async () => {
    renderRoom("PARTICIPANT");

    // Signed in, and the record — which still lists the host — has landed.
    expect(await screen.findByText("Olivia (you)")).toBeInTheDocument();
    await waitFor(() => expect(participants).toHaveBeenCalled());
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText("Just you so far")).toBeInTheDocument();
    expect(screen.queryByText("Henry Host")).not.toBeInTheDocument();
  });

  it("shows the host once they are actually in the room", async () => {
    livePeers = [hostPeer()];
    renderRoom("PARTICIPANT");

    expect(await screen.findByText("Olivia (you)")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Just you so far")).not.toBeInTheDocument(),
    );
    // On their tile and in the People list.
    expect(screen.getAllByText("Henry Host").length).toBeGreaterThan(1);
  });
});
