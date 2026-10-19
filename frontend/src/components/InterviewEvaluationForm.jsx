import { useMemo, useState } from "react";
import api from "../api";

export default function InterviewEvaluationForm({
  candidateId,
  jobId,
  roomCode,
  resumeScore,
  behaviorMetrics,
  interviewDurationSeconds,
  onSaved,
  onCancel,
}) {
  const [manualScore, setManualScore] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const scores = useMemo(() => {
    const duration = Number(interviewDurationSeconds);

    const validDuration =
      Number.isFinite(duration) && duration > 0;

    const gazeAwaySeconds = Number(
      behaviorMetrics?.totalGazeAwayTimeSeconds
    );

    const headAwaySeconds = Number(
      behaviorMetrics?.totalTurnAwayTimeSeconds
    );

    const speakingSeconds = Number(
      behaviorMetrics?.totalSpeakingDurationSeconds
    );

    const hasGazeData =
      Number.isFinite(gazeAwaySeconds) &&
      gazeAwaySeconds >= 0;

    const hasHeadData =
      Number.isFinite(headAwaySeconds) &&
      headAwaySeconds >= 0;

    const hasSpeakingData =
      Number.isFinite(speakingSeconds) &&
      speakingSeconds >= 0;

    // Score = 10 points minus the proportion of interview
    // time spent looking away from the camera.
    const eyeGazeScore =
      validDuration && hasGazeData
        ? Math.round(
            10 *
              (1 -
                Math.min(gazeAwaySeconds, duration) /
                  duration)
          )
        : null;

    // Score = 10 points minus the proportion of interview
    // time spent with the head turned away.
    const headOrientationScore =
      validDuration && hasHeadData
        ? Math.round(
            10 *
              (1 -
                Math.min(headAwaySeconds, duration) /
                  duration)
          )
        : null;

    // Microphone indicator: proportion of the interview
    // during which speaking activity was detected.
    const microphoneActivityScore =
      validDuration && hasSpeakingData
        ? Math.round(
            10 *
              Math.min(speakingSeconds, duration) /
              duration
          )
        : null;

    const resumePoints =
      Number.isFinite(Number(resumeScore)) &&
      resumeScore !== null &&
      resumeScore !== ""
        ? Math.round(
            Math.max(0, Math.min(100, Number(resumeScore))) *
              0.4
          )
        : null;

    const manual = manualScore === ""
      ? null
      : Number(manualScore);

    const behavioralScoresAvailable =
      eyeGazeScore !== null &&
      headOrientationScore !== null &&
      microphoneActivityScore !== null;

    const total =
      resumePoints !== null &&
      behavioralScoresAvailable &&
      manual !== null &&
      Number.isFinite(manual)
        ? resumePoints +
          eyeGazeScore +
          headOrientationScore +
          microphoneActivityScore +
          manual
        : null;

    return {
      resumePoints,
      eyeGazeScore,
      headOrientationScore,
      microphoneActivityScore,
      behavioralScoresAvailable,
      total,
    };
  }, [
    resumeScore,
    behaviorMetrics,
    interviewDurationSeconds,
    manualScore,
  ]);

  async function submitEvaluation(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!candidateId || !jobId || !roomCode) {
      setError(
        "Candidate ID, job ID, and room code are required."
      );
      return;
    }

    if (scores.resumePoints === null) {
      setError("The candidate's resume score is unavailable.");
      return;
    }

    if (!scores.behavioralScoresAvailable) {
      setError(
        "Behavioral measurements are incomplete. Check the interview data."
      );
      return;
    }

    if (
      manualScore === "" ||
      !Number.isInteger(Number(manualScore)) ||
      Number(manualScore) < 0 ||
      Number(manualScore) > 30
    ) {
      setError(
        "Enter a whole-number manual score between 0 and 30."
      );
      return;
    }

    setSaving(true);

    try {
      const response = await api.post(
        `/interview-rooms/${encodeURIComponent(
          roomCode
        )}/evaluation/${candidateId}`,
        {
          eye_gaze_score: scores.eyeGazeScore,
          head_orientation_score:
            scores.headOrientationScore,
          microphone_activity_score:
            scores.microphoneActivityScore,
          manual_interview_score: Number(manualScore),
        }
      );

      setSuccess(
        `Evaluation saved successfully. Overall score: ${response.data.overall_score}/100`
      );

      if (onSaved) {
        onSaved(response.data);
      }
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to save the interview evaluation."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="data-card">
      <h2>Final Interview Evaluation</h2>

      <p>
        <strong>Candidate ID:</strong>{" "}
        {candidateId ?? "Not available"}
      </p>

      <p>
        <strong>Job ID:</strong>{" "}
        {jobId ?? "Not available"}
      </p>

      <p>
        <strong>Room Code:</strong>{" "}
        {roomCode || "Not available"}
      </p>

      <hr />

      <h3>Automatic Score Calculation</h3>

      <p>
        <strong>Resume match (40 points):</strong>{" "}
        {scores.resumePoints === null
          ? "Unavailable"
          : `${scores.resumePoints}/40`}
      </p>

      <p>
        <strong>Eye-gaze score (10 points):</strong>{" "}
        {scores.eyeGazeScore === null
          ? "Waiting for valid measurements"
          : `${scores.eyeGazeScore}/10`}
      </p>

      <p>
        <strong>Head-orientation score (10 points):</strong>{" "}
        {scores.headOrientationScore === null
          ? "Waiting for valid measurements"
          : `${scores.headOrientationScore}/10`}
      </p>

      <p>
        <strong>Microphone activity (10 points):</strong>{" "}
        {scores.microphoneActivityScore === null
          ? "Waiting for valid measurements"
          : `${scores.microphoneActivityScore}/10`}
      </p>

      <hr />

      <form onSubmit={submitEvaluation}>
        <label htmlFor="manual-interview-score">
          HR Manual Interview Score (0–30)
        </label>

        <input
          id="manual-interview-score"
          type="number"
          min="0"
          max="30"
          step="1"
          value={manualScore}
          onChange={(event) =>
            setManualScore(event.target.value)
          }
          placeholder="Enter score out of 30"
          required
        />

        <div
          style={{
            marginTop: "16px",
            padding: "16px",
            borderRadius: "8px",
            background: "#e8eef8",
          }}
        >
          <h3>
            Overall Score:{" "}
            {scores.total === null
              ? "Waiting for complete scores"
              : `${scores.total}/100`}
          </h3>

          <small>
            Resume: 40 points + eye gaze: 10 points +
            head orientation: 10 points + microphone
            activity: 10 points + HR assessment: 30 points.
          </small>
        </div>

        {error && (
          <p role="alert" style={{ color: "red" }}>
            {error}
          </p>
        )}

        {success && (
          <p style={{ color: "green" }}>
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || scores.total === null}
        >
          {saving ? "Saving Evaluation..." : "Save Evaluation"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            Back to Dashboard
          </button>
        )}
      </form>

      <p style={{ fontSize: "12px", marginTop: "12px" }}>
        Eye-gaze and head-orientation scores are based on
        recorded durations. Microphone activity measures
        detected speaking time, not speech quality. These
        indicators should not be interpreted as proof of
        honesty, confidence, or job suitability.
      </p>
    </section>
  );
}