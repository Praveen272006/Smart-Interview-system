import { useEffect, useRef } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

const DETECTION_INTERVAL_MS = 200;

const TURN_AWAY_THRESHOLD = 20;
const RETURN_TO_CENTER_THRESHOLD = 15;
const MIN_TURN_AWAY_DURATION_MS = 1500;
const ROLLING_WINDOW_MS = 60_000;

// Eye-gaze thresholds are prototype estimates.
const GAZE_LEFT_THRESHOLD = 0.38;
const GAZE_RIGHT_THRESHOLD = 0.62;
const GAZE_CENTER_THRESHOLD = 0.43;
const GAZE_CENTER_MAX_THRESHOLD = 0.57;
const MIN_GAZE_AWAY_DURATION_MS = 1000;

// MediaPipe Face Mesh landmark indexes.
const LEFT_EYE_OUTER = 33;
const LEFT_EYE_INNER = 133;
const RIGHT_EYE_INNER = 362;
const RIGHT_EYE_OUTER = 263;

const LEFT_IRIS = [468, 469, 470, 471, 472];
const RIGHT_IRIS = [473, 474, 475, 476, 477];

function radiansToDegrees(value) {
  return (value * 180) / Math.PI;
}

function calculateHeadAngles(transformation) {
  if (!transformation?.data || transformation.data.length < 16) {
    return null;
  }

  const matrix = transformation.data;

  const m00 = matrix[0];
  const m10 = matrix[1];
  const m20 = matrix[2];
  const m21 = matrix[6];
  const m22 = matrix[10];

  const yaw = Math.atan2(
    -m20,
    Math.sqrt(m00 * m00 + m10 * m10)
  );

  const pitch = Math.atan2(m21, m22);
  const roll = Math.atan2(m10, m00);

  return {
    yaw: Number(radiansToDegrees(yaw).toFixed(1)),
    pitch: Number(radiansToDegrees(pitch).toFixed(1)),
    roll: Number(radiansToDegrees(roll).toFixed(1)),
  };
}

function getIrisCenter(landmarks, irisIndexes) {
  const points = irisIndexes.map((index) => landmarks[index]);

  if (points.some((point) => !point)) {
    return null;
  }

  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function getHorizontalEyePosition(
  landmarks,
  outerIndex,
  innerIndex,
  irisIndexes
) {
  const outer = landmarks[outerIndex];
  const inner = landmarks[innerIndex];
  const iris = getIrisCenter(landmarks, irisIndexes);

  if (!outer || !inner || !iris) {
    return null;
  }

  const eyeWidth = inner.x - outer.x;

  if (Math.abs(eyeWidth) < 0.0001) {
    return null;
  }

  return (iris.x - outer.x) / eyeWidth;
}

function calculateEyeGaze(landmarks) {
  const leftEyePosition = getHorizontalEyePosition(
    landmarks,
    LEFT_EYE_OUTER,
    LEFT_EYE_INNER,
    LEFT_IRIS
  );

  const rightEyePosition = getHorizontalEyePosition(
    landmarks,
    RIGHT_EYE_INNER,
    RIGHT_EYE_OUTER,
    RIGHT_IRIS
  );

  if (leftEyePosition === null || rightEyePosition === null) {
    return {
      gazeDirection: "Unknown",
      gazeAway: null,
      gazePosition: null,
    };
  }

  const gazePosition = Number(
    ((leftEyePosition + rightEyePosition) / 2).toFixed(3)
  );

  let gazeDirection = "Center";

  if (gazePosition < GAZE_LEFT_THRESHOLD) {
    gazeDirection = "Left";
  } else if (gazePosition > GAZE_RIGHT_THRESHOLD) {
    gazeDirection = "Right";
  }

  return {
    gazeDirection,
    gazeAway:
      gazePosition < GAZE_CENTER_THRESHOLD ||
      gazePosition > GAZE_CENTER_MAX_THRESHOLD,
    gazePosition,
  };
}

export default function BehaviorAnalysis({
  videoRef,
  audioStream,
  enabled = true,
  onMetrics,
}) {
  const landmarkerRef = useRef(null);
  const animationRef = useRef(null);
  const lastDetectionRef = useRef(0);
  const callbackRef = useRef(onMetrics);
  const audioContextRef = useRef(null);
const audioAnimationRef = useRef(null);
const speakingTrackingRef = useRef({
  speaking: false,
  startedAt: null,
  totalSpeakingMs: 0,
  lastUpdateAt: 0,
});

  const trackingRef = useRef({
    awayStartedAt: null,
    currentAwayDurationMs: 0,
    totalAwayDurationMs: 0,
    events: [],

    gazeAwayStartedAt: null,
    currentGazeAwayDurationMs: 0,
    totalGazeAwayDurationMs: 0,
    gazeEvents: [],

    lastFrameAt: null,
  });

  useEffect(() => {
    callbackRef.current = onMetrics;
  }, [onMetrics]);
  useEffect(() => {
  if (!enabled || !audioStream) return undefined;

  let cancelled = false;
  let source;
  let analyser;
  let dataArray;

  const tracking = speakingTrackingRef.current;

  async function startAudioAnalysis() {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error("Web Audio API is unavailable.");
      }

      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      if (cancelled) {
        await audioContext.close();
        return;
      }

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;

      // Analyze only the candidate's microphone.
      source = audioContext.createMediaStreamSource(audioStream);
      source.connect(analyser);

      dataArray = new Uint8Array(analyser.fftSize);

      // Initial prototype threshold. Tune using real recordings.
      const SPEAKING_THRESHOLD = 0.035;
      const MIN_SPEAKING_DURATION_MS = 300;

      function analyzeAudio() {
        if (cancelled) return;

        const now = performance.now();

        analyser.getByteTimeDomainData(dataArray);

        let sumSquares = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / dataArray.length);
        const isSpeaking = rms >= SPEAKING_THRESHOLD;

        if (isSpeaking && !tracking.speaking) {
          tracking.speaking = true;
          tracking.startedAt = now;
        } else if (!isSpeaking && tracking.speaking) {
          const duration = now - tracking.startedAt;

          if (duration >= MIN_SPEAKING_DURATION_MS) {
            tracking.totalSpeakingMs += duration;
          }

          tracking.speaking = false;
          tracking.startedAt = null;
        }

        const currentSpeakingMs = tracking.speaking
          ? now - tracking.startedAt
          : 0;

        if (now - tracking.lastUpdateAt >= 500) {
          tracking.lastUpdateAt = now;

          callbackRef.current?.({
            speakingStatus: tracking.speaking
              ? "Speaking"
              : "Not speaking",

            currentSpeakingDurationSeconds: Number(
              (currentSpeakingMs / 1000).toFixed(1)
            ),

            totalSpeakingDurationSeconds: Number(
              (
                (tracking.totalSpeakingMs + currentSpeakingMs) /
                1000
              ).toFixed(1)
            ),

            microphoneLevel: Number(rms.toFixed(3)),
            speakingAnalysisStatus: "Running",
            speakingTimestamp: Date.now(),
          });
        }

        audioAnimationRef.current =
          requestAnimationFrame(analyzeAudio);
      }

      analyzeAudio();
    } catch (error) {
      console.error("Speaking analysis failed:", error);

      callbackRef.current?.({
        speakingAnalysisStatus: "Unavailable",
      });
    }
  }

  startAudioAnalysis();

  return () => {
    cancelled = true;

    if (audioAnimationRef.current) {
      cancelAnimationFrame(audioAnimationRef.current);
    }

    if (source) {
      source.disconnect();
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
  };
}, [audioStream, enabled]);
  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        const landmarker = await FaceLandmarker.createFromOptions(
          vision,
          {
            baseOptions: {
              modelAssetPath:
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: true,
          }
        );
        console.log("[Behavior] MediaPipe initialized successfully");
console.log("[Behavior] Video element:", videoRef.current);

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        detectFrame();
      } catch (error) {
  const errorMessage =
    error instanceof Error
      ? error.message
      : String(error);

  console.error(
    "Behavior analysis initialization failed:",
    error
  );

  callbackRef.current?.({
    status: "unavailable",
    faceDetected: false,
    error: errorMessage,
    message: `MediaPipe initialization failed: ${errorMessage}`,
    timestamp: Date.now(),
  });
}
    }

    function finishGazeAway(now) {
      const tracking = trackingRef.current;

      if (tracking.gazeAwayStartedAt === null) {
        return;
      }

      const duration = Math.max(
        0,
        now - tracking.gazeAwayStartedAt
      );

      if (duration >= MIN_GAZE_AWAY_DURATION_MS) {
        tracking.gazeEvents.push({
          startedAt: tracking.gazeAwayStartedAt,
          endedAt: now,
          durationMs: duration,
        });

        tracking.totalGazeAwayDurationMs += duration;
      }

      tracking.gazeAwayStartedAt = null;
      tracking.currentGazeAwayDurationMs = 0;
    }

    function finishHeadTurnAway(now) {
      const tracking = trackingRef.current;

      if (tracking.awayStartedAt === null) {
        return;
      }

      const duration = Math.max(
        0,
        now - tracking.awayStartedAt
      );

      if (duration >= MIN_TURN_AWAY_DURATION_MS) {
        tracking.events.push({
          startedAt: tracking.awayStartedAt,
          endedAt: now,
          durationMs: duration,
        });

        tracking.totalAwayDurationMs += duration;
      }

      tracking.awayStartedAt = null;
      tracking.currentAwayDurationMs = 0;
    }

    function publishNoFace(now) {
      const tracking = trackingRef.current;

      finishHeadTurnAway(now);
      finishGazeAway(now);

      tracking.lastFrameAt = now;

      tracking.events = tracking.events.filter(
        (event) => now - event.endedAt <= ROLLING_WINDOW_MS
      );

      tracking.gazeEvents = tracking.gazeEvents.filter(
        (event) => now - event.endedAt <= ROLLING_WINDOW_MS
      );

      callbackRef.current?.({
        status: "running",
        faceDetected: false,

        yaw: null,
        pitch: null,
        roll: null,
        headTurnedAway: null,

        currentTurnAwayDurationSeconds: 0,
        turnAwayEventsLast60Seconds: tracking.events.length,
        totalTurnAwayTimeSeconds: Number(
          (tracking.totalAwayDurationMs / 1000).toFixed(1)
        ),

        gazeDirection: "Unknown",
        gazeAway: null,
        gazePosition: null,
        currentGazeAwayDurationSeconds: 0,
        gazeAwayEventsLast60Seconds: tracking.gazeEvents.length,
        totalGazeAwayTimeSeconds: Number(
          (tracking.totalGazeAwayDurationMs / 1000).toFixed(1)
        ),

        message: "Face not detected; orientation unavailable.",
        timestamp: Date.now(),
      });
    }

    function detectFrame() {
      if (cancelled) return;

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (
        !enabled ||
        !video ||
        !landmarker ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth === 0
      ) {
        animationRef.current =
          requestAnimationFrame(detectFrame);

        return;
      }

      const now = performance.now();

      if (
        now - lastDetectionRef.current <
        DETECTION_INTERVAL_MS
      ) {
        animationRef.current =
          requestAnimationFrame(detectFrame);

        return;
      }

      lastDetectionRef.current = now;

      try {
        const result = landmarker.detectForVideo(video, now);
        console.log(
  "[Behavior] Video dimensions:",
  video.videoWidth,
  "x",
  video.videoHeight
);

console.log(
  "[Behavior] Faces detected:",
  result.faceLandmarks?.length ?? 0
);

        const landmarks = result.faceLandmarks?.[0];
        const transformation =
          result.facialTransformationMatrixes?.[0];

        if (!landmarks || !transformation) {
          publishNoFace(now);

          animationRef.current =
            requestAnimationFrame(detectFrame);

          return;
        }

        const angles = calculateHeadAngles(transformation);

        if (!angles) {
          publishNoFace(now);

          animationRef.current =
            requestAnimationFrame(detectFrame);

          return;
        }

        const tracking = trackingRef.current;

        // ------------------------------------------
        // HEAD ORIENTATION
        // ------------------------------------------

        const absoluteYaw = Math.abs(angles.yaw);

        const isTurnedAway =
          tracking.awayStartedAt !== null
            ? absoluteYaw > RETURN_TO_CENTER_THRESHOLD
            : absoluteYaw > TURN_AWAY_THRESHOLD;

        if (isTurnedAway) {
          if (tracking.awayStartedAt === null) {
            tracking.awayStartedAt = now;
          }

          tracking.currentAwayDurationMs =
            now - tracking.awayStartedAt;
        } else {
          finishHeadTurnAway(now);
        }

        // ------------------------------------------
        // EYE-GAZE ESTIMATION
        // ------------------------------------------

        const gaze = calculateEyeGaze(landmarks);

        if (gaze.gazeAway === true) {
          if (tracking.gazeAwayStartedAt === null) {
            tracking.gazeAwayStartedAt = now;
          }

          tracking.currentGazeAwayDurationMs =
            now - tracking.gazeAwayStartedAt;
        } else if (gaze.gazeAway === false) {
          finishGazeAway(now);
        } else {
          // Unknown gaze should not be counted as looking away.
          finishGazeAway(now);
        }

        tracking.lastFrameAt = now;

        tracking.events = tracking.events.filter(
          (event) => now - event.endedAt <= ROLLING_WINDOW_MS
        );

        tracking.gazeEvents = tracking.gazeEvents.filter(
          (event) => now - event.endedAt <= ROLLING_WINDOW_MS
        );

        // ------------------------------------------
        // PUBLISH METRICS
        // ------------------------------------------

        callbackRef.current?.({
          status: "running",
          faceDetected: true,

          yaw: angles.yaw,
          pitch: angles.pitch,
          roll: angles.roll,
          headTurnedAway: isTurnedAway,

          currentTurnAwayDurationSeconds: Number(
            (tracking.currentAwayDurationMs / 1000).toFixed(1)
          ),

          turnAwayEventsLast60Seconds: tracking.events.length,

          totalTurnAwayTimeSeconds: Number(
            (tracking.totalAwayDurationMs / 1000).toFixed(1)
          ),

          gazeDirection: gaze.gazeDirection,
          gazeAway: gaze.gazeAway,
          gazePosition: gaze.gazePosition,

          currentGazeAwayDurationSeconds: Number(
            (tracking.currentGazeAwayDurationMs / 1000).toFixed(1)
          ),

          gazeAwayEventsLast60Seconds:
            tracking.gazeEvents.length,

          totalGazeAwayTimeSeconds: Number(
            (tracking.totalGazeAwayDurationMs / 1000).toFixed(1)
          ),

          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Frame analysis failed:", error);
      }

      animationRef.current =
        requestAnimationFrame(detectFrame);
    }

    if (enabled) {
      initialize();
    }

    return () => {
      cancelled = true;

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [videoRef, enabled]);

  return null;
}