import api from "../api";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import BehaviorAnalysis from "./BehaviorAnalysis";

const SOCKET_URL = window.location.origin;
const ICE_SERVERS = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

export default function VideoCall({
  roomCode,
  onLeave,
  userRole,
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [behaviorMetrics, setBehaviorMetrics] = useState(null);
  const [candidateId, setCandidateId] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const [evaluationSaving, setEvaluationSaving] = useState(false);
  const [evaluationSaved, setEvaluationSaved] = useState(false);
  const [evaluationError, setEvaluationError] = useState("");
  const [eyeGazeScore, setEyeGazeScore] = useState("");
  const [headOrientationScore, setHeadOrientationScore] = useState("");
  const [microphoneActivityScore, setMicrophoneActivityScore] = useState("");
  const [manualInterviewScore, setManualInterviewScore] = useState(0);
  const [resumeScore, setResumeScore] = useState(null);
  const [resumeScoreStatus, setResumeScoreStatus] = useState("Waiting for candidate details...");
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);

  const roomRef = useRef("");
  const remoteDescriptionReadyRef = useRef(false);
  const pendingCandidatesRef = useRef([]);

  const [status, setStatus] = useState("Initializing...");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  console.log("VideoCall userRole:", userRole);
    const behaviorStartedAtRef = useRef(null);
const [behaviorElapsedSeconds, setBehaviorElapsedSeconds] = useState(0);

useEffect(() => {
  if (userRole !== "hr" || !behaviorMetrics) return;

  if (behaviorStartedAtRef.current === null) {
    behaviorStartedAtRef.current = Date.now();
  }

  const timer = setInterval(() => {
    setBehaviorElapsedSeconds(
      Math.max(
        1,
        Math.floor(
          (Date.now() - behaviorStartedAtRef.current) / 1000
        )
      )
    );
  }, 1000);

  return () => clearInterval(timer);
}, [userRole, Boolean(behaviorMetrics)]);

const gazeAwaySeconds = Number(
  behaviorMetrics?.totalGazeAwayTimeSeconds
);

const headAwaySeconds = Number(
  behaviorMetrics?.totalTurnAwayTimeSeconds
);

const speakingSeconds = Number(
  behaviorMetrics?.totalSpeakingDurationSeconds
);

const calculatedGazeScore =
  behaviorElapsedSeconds > 0 &&
  Number.isFinite(gazeAwaySeconds) &&
  gazeAwaySeconds >= 0
    ? Math.round(
        10 *
          (1 -
            Math.min(gazeAwaySeconds, behaviorElapsedSeconds) /
              behaviorElapsedSeconds)
      )
    : null;

const calculatedHeadScore =
  behaviorElapsedSeconds > 0 &&
  Number.isFinite(headAwaySeconds) &&
  headAwaySeconds >= 0
    ? Math.round(
        10 *
          (1 -
            Math.min(headAwaySeconds, behaviorElapsedSeconds) /
              behaviorElapsedSeconds)
      )
    : null;

const calculatedMicrophoneScore =
  behaviorElapsedSeconds > 0 &&
  Number.isFinite(speakingSeconds) &&
  speakingSeconds >= 0
    ? Math.round(
        10 *
          Math.min(speakingSeconds, behaviorElapsedSeconds) /
            behaviorElapsedSeconds
      )
    : null;
    useEffect(() => {
  if (calculatedGazeScore !== null) {
    setEyeGazeScore(String(calculatedGazeScore));
  }

  if (calculatedHeadScore !== null) {
    setHeadOrientationScore(String(calculatedHeadScore));
  }

  if (calculatedMicrophoneScore !== null) {
    setMicrophoneActivityScore(String(calculatedMicrophoneScore));
  }
}, [
  calculatedGazeScore,
  calculatedHeadScore,
  calculatedMicrophoneScore,
]);

  useEffect(() => {
    let cancelled = false;

    const room = String(roomCode || "").trim();

    if (!room) {
      setError("A valid interview room code is required.");
      setStatus("Room code missing");
      return undefined;
    }

    roomRef.current = room;

    async function startCall() {
      try {
        setStatus("Validating interview room...");

const response = await api.get(
  `/interview-rooms/${encodeURIComponent(room)}`
);

if (!response.data) {
  throw new Error("Interview room not found.");
}

// The HR room endpoint returns the candidate invited to this room.
if (userRole === "hr") setJobId(Number(response.data.job_id) || null);

if (userRole === "hr" && response.data.candidate_id) {
  const invitedCandidateId = Number(response.data.candidate_id);
  setCandidateId(invitedCandidateId);
  setResumeScoreStatus("Loading candidate resume score...");

  try {
    const resumeResponse = await api.get(
      `/jobs/${response.data.job_id}/applications/${invitedCandidateId}/analyze-resume`
    );
    if (!cancelled) {
      const score = Number(resumeResponse.data?.skill_match_percentage);
      setResumeScore(Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null);
      setResumeScoreStatus(Number.isFinite(score) ? "Resume score loaded" : "Resume score unavailable");
    }
  } catch (resumeError) {
    console.error("Unable to load candidate resume score:", resumeError);
    if (!cancelled) setResumeScoreStatus(resumeError.response?.data?.detail || "Resume score unavailable");
  }
} else if (userRole === "hr") {
  setResumeScoreStatus("No candidate invitation is linked to this room yet.");
}

        setStatus("Requesting camera and microphone permission...");

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        const storedAuth = localStorage.getItem("interview_auth");

let socketAuth = {};

try {
  const parsedAuth = JSON.parse(storedAuth || "{}");
  socketAuth = {
    token: parsedAuth.access_token,
  };
} catch {
  socketAuth = {};
}

const socket = io(SOCKET_URL, {
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  timeout: 20000,
  auth: socketAuth,
});

socket.on("connect", () => {
  console.log("[Socket] Connected:", socket.id);
  console.log("[Socket] Room:", room);
  console.log("[Socket] Role:", userRole);
});

socket.on("connect_error", (err) => {
  console.error("[Socket] Connection failed:", err.message);
  console.error("[Socket] Details:", err.description || err.context);
});

        socketRef.current = socket;
        // Receive candidate behavioral metrics on the HR screen only.
socket.on("behavior_metrics", (data) => {
  if (userRole !== "hr") return;
  if (data?.room !== room || !data.metrics) return;

  setBehaviorMetrics((previous) => ({
    ...(previous || {}),
    ...data.metrics,
  }));
});

        const peer = new RTCPeerConnection(ICE_SERVERS);
        peerRef.current = peer;

        stream.getTracks().forEach((track) => {
          peer.addTrack(track, stream);
        });

        peer.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0];
          }

          setConnected(true);
          setStatus("Connected to the other participant");
        };

        peer.onicecandidate = (event) => {
          if (event.candidate && socket.connected) {
            socket.emit("ice_candidate", {
              room,
              candidate: event.candidate,
            });
          }
        };

        peer.onconnectionstatechange = () => {
          const connectionState = peer.connectionState;

          if (connectionState === "connected") {
            setConnected(true);
            setStatus("Video call connected");
          } else if (connectionState === "connecting") {
            setStatus("Establishing video connection...");
          } else if (connectionState === "disconnected") {
            setConnected(false);
            setStatus("Connection interrupted. Waiting for recovery...");
          } else if (connectionState === "failed") {
            setConnected(false);
            setStatus("Connection failed");
            setError(
              "WebRTC connection failed. Check the network and STUN/TURN configuration."
            );
          } else if (connectionState === "closed") {
            setConnected(false);
            setStatus("Call ended");
          }
        };

        socket.on("connect", () => {
          if (cancelled) return;

          setError("");
          setStatus("Connected to signaling server. Joining room...");

          socket.emit("join_room", {
            room,
          });
        });

        socket.on("connect_error", (err) => {
          console.error("Socket connection error:", err);

          setError(
            "Unable to connect to the signaling server. Check the backend and its HTTPS certificate."
          );
          setStatus("Signaling connection failed");
        });
        socket.on("room_error", (data) => {
  setError(data?.message || "Unable to join the interview room.");
  setStatus("Unable to join room");
});

socket.on("room_full", (data) => {
  setError(data?.message || "This interview room is full.");
  setStatus("Room full");
});

        socket.on("room_joined", (data) => {
          if (data?.room && data.room !== room) return;

          setError("");
          setStatus("Joined interview room. Waiting for the other participant...");
        });
        socket.on("room_error", (data) => {
  setError(
    data?.message || "Unable to join the interview room."
  );
  setStatus("Unable to join room");
});

socket.on("room_full", (data) => {
  setError(
    data?.message || "This interview room is full."
  );
  setStatus("Room full");
});

        socket.on("ready", async (data) => {
          if (data?.room && data.room !== room) return;

          /*
           * Both participants receive "ready".
           * Only the first participant creates the offer.
           */
          const participants = data?.participants || [];

          if (
            participants.length !== 2 ||
            socket.id !== participants[0] ||
            peer.signalingState !== "stable"
          ) {
            return;
          }

          try {
            setStatus("Starting video call...");

            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);

            socket.emit("offer", {
              room,
              sdp: peer.localDescription,
            });
          } catch (err) {
            console.error("Unable to create WebRTC offer:", err);
            setError("Unable to start the video call.");
          }
        });

        socket.on("offer", async (data) => {
          if (data?.room !== room || !data.sdp) return;

          try {
            if (peer.signalingState !== "stable") {
              console.warn("Ignoring offer in state:", peer.signalingState);
              return;
            }

            await peer.setRemoteDescription(
              new RTCSessionDescription(data.sdp)
            );

            remoteDescriptionReadyRef.current = true;

            for (const candidate of pendingCandidatesRef.current) {
              await peer.addIceCandidate(
                new RTCIceCandidate(candidate)
              );
            }

            pendingCandidatesRef.current = [];

            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            socket.emit("answer", {
              room,
              sdp: peer.localDescription,
            });

            setStatus("Answer sent. Connecting video...");
          } catch (err) {
            console.error("Unable to process WebRTC offer:", err);
            setError("Unable to establish the video connection.");
          }
        });

        socket.on("answer", async (data) => {
          if (data?.room !== room || !data.sdp) return;

          try {
            if (peer.signalingState !== "have-local-offer") {
              return;
            }

            await peer.setRemoteDescription(
              new RTCSessionDescription(data.sdp)
            );

            remoteDescriptionReadyRef.current = true;

            for (const candidate of pendingCandidatesRef.current) {
              await peer.addIceCandidate(
                new RTCIceCandidate(candidate)
              );
            }

            pendingCandidatesRef.current = [];

            setStatus("Answer received. Connecting video...");
          } catch (err) {
            console.error("Unable to process WebRTC answer:", err);
            setError("Unable to complete the video connection.");
          }
        });

        socket.on("ice_candidate", async (data) => {
          if (data?.room !== room || !data.candidate) return;

          try {
            if (!remoteDescriptionReadyRef.current) {
              pendingCandidatesRef.current.push(data.candidate);
              return;
            }

            await peer.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
          } catch (err) {
            console.error("Unable to add ICE candidate:", err);
          }
        });

        socket.on("disconnect", () => {
          setConnected(false);
          setStatus("Disconnected from signaling server");
        });
      } catch (err) {
        console.error("Unable to start video call:", err);

        if (err.name === "NotAllowedError") {
          setError(
            "Camera or microphone permission was denied. Allow access in your browser settings."
          );
        } else if (err.name === "NotFoundError") {
          setError("No camera or microphone was found on this device.");
        } else {
          setError(err.message || "Unable to start the video call.");
        }

        setStatus("Unable to start call");
      }
    }

    startCall();

    return () => {
      cancelled = true;

      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      if (peerRef.current) {
        peerRef.current.ontrack = null;
        peerRef.current.onicecandidate = null;
        peerRef.current.close();
        peerRef.current = null;
      }

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });

        localStreamRef.current = null;
      }

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
    };
  }, [roomCode]);

  function toggleMicrophone() {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextEnabled = !micEnabled;

    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });

    setMicEnabled(nextEnabled);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;

    const nextEnabled = !cameraEnabled;

    stream.getVideoTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });

    setCameraEnabled(nextEnabled);
  }

  function stopCallMedia() {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setLocalStream(null);
    setConnected(false);
  }

  function leaveCall() {
    stopCallMedia();
    if (userRole === "hr" && candidateId && jobId) {
      setShowEvaluationForm(true);
      setStatus("Interview ended — complete evaluation");
      return;
    }
    if (onLeave) onLeave();
  }

  async function saveEvaluation(event) {
    event.preventDefault();
    setEvaluationError("");
    if (!candidateId || !jobId) {
      setEvaluationError("No candidate is linked to this room. Check that the candidate was invited before starting the interview.");
      return;
    }
    setEvaluationSaving(true);
    try {
      const response = await api.post(
        `/interview-rooms/${encodeURIComponent(roomCode)}/evaluation/${candidateId}`,
        {
          eye_gaze_score: Number(eyeGazeScore),
          head_orientation_score: Number(headOrientationScore),
          microphone_activity_score: Number(microphoneActivityScore),
          manual_interview_score: Number(manualInterviewScore),
        }
      );
      setEvaluationSaved(true);
      setResumeScore(Number(response.data?.resume_match_percentage ?? resumeScore));
    } catch (saveError) {
      setEvaluationError(saveError.response?.data?.detail || "Could not save the interview evaluation. Please check the backend and database, then try again.");
    } finally {
      setEvaluationSaving(false);
    }
  }

  return (
    <section className="video-call-container">
      <header className="video-call-header">
        <div>
          <h2>Online Interview</h2>
          <p>Room code: {roomCode}</p>
        </div>

        <span className={connected ? "call-status connected" : "call-status"}>
          {status}
        </span>
      </header>

      {error && (
        <div className="video-call-error" role="alert">
          {error}
        </div>
      )}

      <div className="video-grid">
        <div className="video-panel">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
          />
          <span>You</span>
        </div>

        <div className="video-panel">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
          />
          <span>Other participant</span>
        </div>
      </div>
      {/* Run analysis on the candidate's device and send metrics to HR. */}
{userRole === "candidate" && (
  <BehaviorAnalysis
    videoRef={localVideoRef}
    audioStream={localStream}
    enabled={cameraEnabled}
    onMetrics={(metrics) => {
      if (!metrics) return;

      const socket = socketRef.current;

      if (socket?.connected) {
        socket.emit("behavior_metrics", {
          room: roomRef.current,
          metrics,
        });
      }
    }}
  />
)}
{/* Display the candidate's analysis only to HR. */}
{userRole === "hr" && (
  <section
    className="behavior-analysis-panel"
    style={{
      background: "#111c30",
      color: "#ffffff",
      padding: "20px",
      marginTop: "16px",
      borderRadius: "12px",
      border: "1px solid #2d3c55",
    }}
  >
    <h3>Candidate Behavioral Analysis</h3>

    {!behaviorMetrics ? (
      <p>Waiting for candidate analysis data...</p>
    ) : (
      <>
        <p>
          <strong>Status:</strong>{" "}
          {behaviorMetrics.status}
        </p>

        <p>
          <strong>Face detected:</strong>{" "}
          {behaviorMetrics.faceDetected ? "Yes" : "No"}
        </p>

        <p>
          <strong>Head yaw:</strong>{" "}
          {behaviorMetrics.yaw ?? "N/A"}°
        </p>

        <p>
          <strong>Head pitch:</strong>{" "}
          {behaviorMetrics.pitch ?? "N/A"}°
        </p>

        <p>
          <strong>Head roll:</strong>{" "}
          {behaviorMetrics.roll ?? "N/A"}°
        </p>
        <hr style={{ margin: "16px 0", opacity: 0.25 }} />

<h4>Eye-Gaze Analysis</h4>

<p>
  <strong>Estimated gaze direction:</strong>{" "}
  {behaviorMetrics.gazeDirection ?? "Waiting for data"}
</p>

<p>
  <strong>Gaze away from center:</strong>{" "}
  {behaviorMetrics.gazeAway === null ||
  behaviorMetrics.gazeAway === undefined
    ? "Unknown"
    : behaviorMetrics.gazeAway
      ? "Yes"
      : "No"}
</p>

<p>
  <strong>Current gaze-away duration:</strong>{" "}
  {behaviorMetrics.currentGazeAwayDurationSeconds ?? 0} seconds
</p>

<p>
  <strong>Gaze-away events in the last 60 seconds:</strong>{" "}
  {behaviorMetrics.gazeAwayEventsLast60Seconds ?? 0}
</p>

<p>
  <strong>Total recorded gaze-away time:</strong>{" "}
  {behaviorMetrics.totalGazeAwayTimeSeconds ?? 0} seconds
</p>
<hr style={{ margin: "16px 0", opacity: 0.25 }} />

<h4>Speaking Analysis</h4>

<p>
  <strong>Analysis status:</strong>{" "}
  {behaviorMetrics.speakingAnalysisStatus ?? "Waiting for data"}
</p>

<p>
  <strong>Speaking status:</strong>{" "}
  {behaviorMetrics.speakingStatus ?? "Unknown"}
</p>

<p>
  <strong>Current speaking duration:</strong>{" "}
  {behaviorMetrics.currentSpeakingDurationSeconds ?? 0} seconds
</p>

<p>
  <strong>Total speaking duration:</strong>{" "}
  {behaviorMetrics.totalSpeakingDurationSeconds ?? 0} seconds
</p>

<p>
  <strong>Microphone activity level:</strong>{" "}
  {behaviorMetrics.microphoneLevel ?? "N/A"}
</p>

        <p>
          <strong>Currently turned away:</strong>{" "}
          {behaviorMetrics.headTurnedAway === null
            ? "Unknown"
            : behaviorMetrics.headTurnedAway
              ? "Yes"
              : "No"}
        </p>

        <p>
          <strong>Current look-away duration:</strong>{" "}
          {behaviorMetrics.currentTurnAwayDurationSeconds ?? 0} seconds
        </p>

        <p>
          <strong>Look-away events in the last 60 seconds:</strong>{" "}
          {behaviorMetrics.turnAwayEventsLast60Seconds ?? 0}
        </p>

        <p>
          <strong>Total recorded look-away time:</strong>{" "}
          {behaviorMetrics.totalTurnAwayTimeSeconds ?? 0} seconds
        </p>

        <small>
          These measurements describe estimated head orientation,
          not honesty, confidence, personality, or interview suitability.
        </small>
      </>
    )}
  </section>
)}
      {userRole === "hr" && showEvaluationForm && (
        <section className="behavior-analysis-panel" style={{
          background: "#ffffff", color: "#172033", padding: "22px",
          marginTop: "18px", borderRadius: "12px", border: "1px solid #d8e0ec"
        }}>
          <h3>Final Interview Evaluation</h3>
          <p>Enter the HR-assessed points for the completed interview. The resume contribution is calculated by the backend from the candidate's resume match.</p>
          <div style={{ padding: "12px", background: "#f1f5f9", borderRadius: "8px", marginBottom: "16px" }}>
            <strong>Candidate ID:</strong> {candidateId ?? "Not linked"}<br />
            <strong>Job ID:</strong> {jobId ?? "Not linked"}<br />
            <strong>Resume match:</strong> {resumeScore == null ? resumeScoreStatus : `${resumeScore.toFixed(1)}%`}<br />
            <strong>Resume points (maximum 40):</strong> {resumeScore == null ? "Calculated when saved" : `${Math.round(resumeScore * 0.4)} / 40`}
          </div>
          {!evaluationSaved ? (
            <form onSubmit={saveEvaluation} style={{ display: "grid", gap: "14px", maxWidth: "520px" }}>
              <label>Eye-gaze assessment (0–10 points)
                <input type="number" min="0" max="10" step="1" required value={eyeGazeScore} onChange={(e) => setEyeGazeScore(e.target.value)} style={{ display: "block", width: "100%", padding: "10px", marginTop: "5px" }} />
                <small>Observed gaze-away time: {behaviorMetrics?.totalGazeAwayTimeSeconds ?? "Not available"} seconds. Use this only as an observation, not as a measure of honesty.</small>
              </label>
              <label>Head-orientation assessment (0–10 points)
                <input type="number" min="0" max="10" step="1" required value={headOrientationScore} onChange={(e) => setHeadOrientationScore(e.target.value)} style={{ display: "block", width: "100%", padding: "10px", marginTop: "5px" }} />
                <small>Observed head-turn-away time: {behaviorMetrics?.totalTurnAwayTimeSeconds ?? "Not available"} seconds.</small>
              </label>
              <label>Microphone activity (0–10 points)
                <input type="number" min="0" max="10" step="1" required value={microphoneActivityScore} onChange={(e) => setMicrophoneActivityScore(e.target.value)} style={{ display: "block", width: "100%", padding: "10px", marginTop: "5px" }} />
                <small>Speaking status at the end: {behaviorMetrics?.speakingStatus ?? "Not available"}. This signal does not assess speech quality.</small>
              </label>
              <label>HR manual interview score (0–30 points)
                <input type="number" min="0" max="30" step="1" required value={manualInterviewScore} onChange={(e) => setManualInterviewScore(e.target.value)} style={{ display: "block", width: "100%", padding: "10px", marginTop: "5px" }} />
              </label>
              <div style={{ padding: "12px", background: "#e8eef8", borderRadius: "8px" }}>
                <strong>Current known points (excluding resume until server calculation):</strong> {Number(eyeGazeScore || 0) + Number(headOrientationScore || 0) + Number(microphoneActivityScore || 0) + Number(manualInterviewScore || 0)} / 60<br />
                <small>Final total = resume points /40 + gaze /10 + head orientation /10 + microphone /10 + HR manual /30 = /100.</small>
              </div>
              {evaluationError && <p role="alert" style={{ color: "#b91c1c" }}>{evaluationError}</p>}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button type="submit" disabled={evaluationSaving || !candidateId || !jobId}>
                  {evaluationSaving ? "Saving evaluation..." : "Save final evaluation"}
                </button>
                <button type="button" onClick={() => onLeave?.()}>Exit without saving</button>
              </div>
            </form>
          ) : (
            <div role="status" style={{ padding: "14px", background: "#dcfce7", borderRadius: "8px" }}>
              <h4>Evaluation saved successfully</h4>
              <p>The evaluation is stored. Open Candidate Ranking in the HR dashboard to review the total and select or reject the candidate.</p>
              <button type="button" onClick={() => onLeave?.()}>Return to dashboard</button>
            </div>
          )}
          <small style={{ display: "block", marginTop: "14px" }}>Behavioral measurements can be affected by camera angle, disability, lighting, network quality, and individual differences. Treat them as limited observations and make hiring decisions using human review and relevant interview evidence.</small>
        </section>
      )}

      {!showEvaluationForm && <div className="video-controls">
        <button type="button" onClick={toggleMicrophone}>
          {micEnabled ? "Mute microphone" : "Unmute microphone"}
        </button>

        <button type="button" onClick={toggleCamera}>
          {cameraEnabled ? "Turn camera off" : "Turn camera on"}
        </button>

        <button
          type="button"
          className="end-call-button"
          onClick={leaveCall}
        >
          End call
        </button>
      </div>}
    </section>
  );
}