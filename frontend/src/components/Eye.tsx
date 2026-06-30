import React, { useEffect, useRef, useState, useCallback } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export type Sentiment = {
  frustration_score: number;
  suggested_action: "continue" | "simplify" | "offer_break";
};

type Props = {
  onFocusChange?: (focused: boolean) => void;
  sentiment?: Sentiment | null;
};

// ── Timing ──────────────────────────────────────────────────────────────────
const FOCUS_LOST_MS     = 4000; // away for this long → distracted
const ON_SCREEN_GAP_MS  = 500;  // face absent < 500ms is ignored (prevent jitter)
const SUSTAINED_BLINK_MS = 500; // eyes closed > 500ms = not a blink
const DETECT_MS         = 66;   // ~15 fps detection rate

// ── Head-pose thresholds (normalized ratios, not degrees) ───────────────────
// Yaw:   |noseTip.x - eyeMidX| / eyeSpanX
//        0 = facing camera, 0.25 ≈ turned ~25°
const YAW_LIMIT   = 0.25;
// Pitch: (noseTip.y - eyeMidY) / faceHeight
//        ~0.25 when looking forward; too low = looking up; too high = looking down
const PITCH_MIN   = 0.05;
const PITCH_MAX   = 0.50;

// ── Eye-closure blendshape threshold ────────────────────────────────────────
const BLINK_SCORE = 0.65; // score above this = eye considered closed

// ── MediaPipe landmark indices ───────────────────────────────────────────────
const NOSE_TIP       = 1;
const LEFT_EYE_OUT   = 33;
const RIGHT_EYE_OUT  = 263;
const CHIN           = 152;
const FOREHEAD       = 10;

function isGazingAtScreen(landmarks: any[]): boolean {
  const nose     = landmarks[NOSE_TIP];
  const leftEye  = landmarks[LEFT_EYE_OUT];
  const rightEye = landmarks[RIGHT_EYE_OUT];
  const chin     = landmarks[CHIN];
  const forehead = landmarks[FOREHEAD];

  const eyeMidX  = (leftEye.x + rightEye.x) / 2;
  const eyeSpanX = Math.abs(rightEye.x - leftEye.x);
  if (eyeSpanX < 0.01) return false;

  // Yaw: how far nose deviates sideways from eye center
  const yawRatio = Math.abs(nose.x - eyeMidX) / eyeSpanX;

  // Pitch: how far nose sits vertically within the face
  const eyeMidY   = (leftEye.y + rightEye.y) / 2;
  const faceHeight = Math.abs(chin.y - forehead.y);
  if (faceHeight < 0.01) return false;
  const pitchRatio = (nose.y - eyeMidY) / faceHeight;

  return yawRatio < YAW_LIMIT && pitchRatio > PITCH_MIN && pitchRatio < PITCH_MAX;
}

function eyeCloseScore(blendshapes: any[]): number {
  const cats = blendshapes[0]?.categories ?? [];
  let l = 0, r = 0;
  for (const c of cats) {
    if (c.categoryName === "eyeBlinkLeft")  l = c.score;
    if (c.categoryName === "eyeBlinkRight") r = c.score;
  }
  return (l + r) / 2;
}

// ── Component ────────────────────────────────────────────────────────────────
const Eye: React.FC<Props> = ({ onFocusChange, sentiment }) => {
  const [status, setStatus]         = useState<"loading" | "tracking" | "error">("loading");
  const [errorMsg, setErrorMsg]     = useState("");
  const [focused, setFocused]       = useState(true);
  const focusedRef                  = useRef(true);
  const onFocusChangeRef            = useRef(onFocusChange);
  onFocusChangeRef.current          = onFocusChange;

  // Timestamps
  const lastOnScreenRef    = useRef(Date.now()); // last time gaze was on-screen
  const unfocusedSinceRef  = useRef<number | null>(null);
  const eyesClosedSinceRef = useRef<number | null>(null);
  const detectionCountRef  = useRef(0);

  // Banner
  const [showBanner, setShowBanner]     = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Webcam / model
  const videoRef     = useRef<HTMLVideoElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef       = useRef<number>(0);

  // ── Banner helpers ─────────────────────────────────────────────────────
  const triggerBanner = useCallback((msg: string) => {
    setBannerMessage(msg);
    setShowBanner(true);
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = setTimeout(() => setShowBanner(false), 8000);
  }, []);

  useEffect(() => {
    if (!sentiment) return;
    if (sentiment.frustration_score > 0.7 || sentiment.suggested_action === "offer_break")
      triggerBanner("You seem to be having a tough time. How about a short break? You're doing great!");
    else if (sentiment.suggested_action === "simplify")
      triggerBanner("Would you like me to simplify the text for you?");
  }, [sentiment, triggerBanner]);

  useEffect(() => {
    if (status !== "tracking") return;
    if (!focused) {
      triggerBanner("Looks like you looked away. Take a breath, then come back when you're ready!");
    } else {
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      setShowBanner(false);
    }
  }, [focused, status, triggerBanner]);

  const speakBanner = useCallback(() => {
    if ("speechSynthesis" in window && bannerMessage) {
      const u = new SpeechSynthesisUtterance(bannerMessage);
      u.lang = "en-US"; u.rate = 0.9;
      speechSynthesis.speak(u);
    }
  }, [bannerMessage]);

  // ── Init: webcam + FaceLandmarker ────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
        );

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (!mounted) { landmarker.close(); return; }
        landmarkerRef.current = landmarker;
        lastOnScreenRef.current = Date.now();
        setStatus("tracking");

        // ── Detection loop (~15 fps) ─────────────────────────────────────
        let lastDetect = 0;
        const loop = () => {
          if (!mounted) return;
          rafRef.current = requestAnimationFrame(loop);

          const now = Date.now();
          if (now - lastDetect < DETECT_MS) return;
          lastDetect = now;

          const v = videoRef.current;
          if (!v || v.readyState < 2 || !landmarkerRef.current) return;

          const results = landmarkerRef.current.detectForVideo(v, now);

          // No face visible — reset eye-close timer, don't update on-screen time
          if (!results.faceLandmarks.length) {
            eyesClosedSinceRef.current = null;
            return;
          }

          // Eye closure: distinguish blink from sustained close
          const blink = eyeCloseScore(results.faceBlendshapes);
          if (blink > BLINK_SCORE) {
            if (eyesClosedSinceRef.current === null) eyesClosedSinceRef.current = now;
          } else {
            eyesClosedSinceRef.current = null;
          }
          const sustainedClose =
            eyesClosedSinceRef.current !== null &&
            now - eyesClosedSinceRef.current > SUSTAINED_BLINK_MS;

          // Head direction
          const gazing = isGazingAtScreen(results.faceLandmarks[0]);

          if (gazing && !sustainedClose) {
            lastOnScreenRef.current = now;
            detectionCountRef.current++;
          }
        };
        loop();

      } catch (err: any) {
        if (!mounted) return;
        setErrorMsg(
          err?.name === "NotAllowedError"
            ? "Camera access denied. Allow camera access and reload."
            : "Could not load face model. Check your internet connection."
        );
        setStatus("error");
      }
    };

    init();
    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── Focus / distraction interval (runs every 500 ms) ────────────────────
  useEffect(() => {
    if (status !== "tracking") return;

    const tick = setInterval(() => {
      const now = Date.now();
      // "on screen" if gaze was detected in the last ON_SCREEN_GAP_MS ms
      const onScreen = now - lastOnScreenRef.current < ON_SCREEN_GAP_MS;

      if (onScreen) {
        unfocusedSinceRef.current = null;
        if (!focusedRef.current) {
          focusedRef.current = true;
          setFocused(true);
          onFocusChangeRef.current?.(true);
        }
      } else {
        if (unfocusedSinceRef.current === null) unfocusedSinceRef.current = now;
        const awayFor = now - unfocusedSinceRef.current;
        if (awayFor >= FOCUS_LOST_MS && focusedRef.current) {
          focusedRef.current = false;
          setFocused(false);
          onFocusChangeRef.current?.(false);
        }
      }
    }, 500);

    return () => clearInterval(tick);
  }, [status]);

  // ── Render ───────────────────────────────────────────────────────────────
  const ringColor  = focused ? "#4edea3" : "#ba1a1a";
  const ringOffset = focused ? 100 : 300;

  const hiddenVideo = (
    <video ref={videoRef} className="hidden" playsInline muted aria-hidden="true" />
  );

  if (status === "error") return (
    <>
      {hiddenVideo}
      <div className="glass-card rounded-[2rem] p-8 flex flex-col items-center text-center">
        <span className="font-heading text-xs font-semibold text-error uppercase tracking-widest mb-2">Focus Tracker</span>
        <p className="text-error text-sm">{errorMsg}</p>
      </div>
    </>
  );

  if (status === "loading") return (
    <>
      {hiddenVideo}
      <div className="glass-card rounded-[2rem] p-8 flex flex-col items-center text-center">
        <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest mb-4">Focus Status</span>
        <p className="motion-safe:animate-pulse text-primary text-sm font-body" role="status">
          Loading face model…
        </p>
      </div>
    </>
  );

  return (
    <>
      {hiddenVideo}
      <div className="glass-card rounded-[2rem] p-8 flex flex-col items-center text-center relative overflow-hidden transition-all duration-700">
        <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest mb-4 z-10">
          Focus Status
        </span>

        {/* Focus ring */}
        <div className="relative w-44 h-44 mb-4 z-10 flex items-center justify-center">
          <svg className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="88" cy="88" r="80" fill="transparent" stroke="#dce9ff" strokeWidth="4" />
            <circle cx="88" cy="88" r="80" fill="transparent" stroke={ringColor} strokeWidth="8"
              strokeLinecap="round" strokeDasharray="503" strokeDashoffset={ringOffset}
              className="pulse-ring transition-all duration-1000" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"
            aria-live="polite" aria-atomic="true">
            <span className={`font-heading text-lg font-semibold ${focused ? "text-tertiary-fixed-dim" : "text-error"}`}>
              {focused ? "Locked In" : "Look Away"}
            </span>
          </div>
        </div>

        {/* Alert banner */}
        <div role="alert" aria-live="assertive"
          className={`w-full overflow-hidden motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-in-out z-10
            ${showBanner ? "max-h-40 opacity-100 mb-3" : "max-h-0 opacity-0"}`}>
          <div className={`p-3 rounded-2xl text-center
            ${focused ? "bg-surface-container-low border border-white/40" : "bg-error-container text-on-error-container"}`}>
            <p className="text-sm font-medium font-body">{bannerMessage}</p>
            <div className="flex justify-center gap-2 mt-2">
              <button onClick={speakBanner}
                className="text-xs bg-primary text-on-primary px-3 py-1 rounded-full font-heading font-semibold">
                Read Aloud
              </button>
              <button onClick={() => setShowBanner(false)}
                className="text-xs bg-surface-container text-on-surface-variant px-3 py-1 rounded-full font-heading font-semibold">
                Dismiss
              </button>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3 w-full z-10 mt-2">
          <div className="bg-surface-container-low p-3 rounded-xl border border-white/40">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-heading">Status</p>
            <p className={`font-heading text-lg font-bold ${focused ? "text-tertiary-fixed-dim" : "text-error"}`}>
              {focused ? "Active" : "Away"}
            </p>
          </div>
          <div className="bg-surface-container-low p-3 rounded-xl border border-white/40">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-heading">Detections</p>
            <p className="font-heading text-lg font-bold text-primary">
              {detectionCountRef.current > 999 ? "999+" : detectionCountRef.current}
            </p>
          </div>
        </div>

        {/* Red drift overlay */}
        {!focused && (
          <div className="absolute inset-0 rounded-[2rem] pointer-events-none"
            style={{ background: "radial-gradient(circle, rgba(186,26,26,0) 0%, rgba(186,26,26,0.08) 100%)" }} />
        )}
      </div>
    </>
  );
};

export default Eye;
