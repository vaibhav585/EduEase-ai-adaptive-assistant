import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    webgazer: any;
  }
}

export type Sentiment = {
  frustration_score: number;
  suggested_action: "continue" | "simplify" | "offer_break";
};

type Props = {
  targetId?: string;
  onFocusChange?: (focused: boolean) => void;
  sentiment?: Sentiment | null;
};

// 5 calibration points
const CALIBRATION_POINTS = [
  { x: 50, y: 50, label: "Center" },
  { x: 15, y: 20, label: "Top-Left" },
  { x: 85, y: 20, label: "Top-Right" },
  { x: 15, y: 80, label: "Bottom-Left" },
  { x: 85, y: 80, label: "Bottom-Right" },
];

const CLICKS_PER_POINT = 5;
const FOCUS_LOST_MS = 4000;
const CALIBRATION_KEY = "eduease_calibrated_matrix";

const Eye: React.FC<Props> = ({ targetId, onFocusChange, sentiment }) => {
  const [status, setStatus] = useState<
    "loading" | "ready" | "calibrating" | "tracking" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [calPointIndex, setCalPointIndex] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [focused, setFocused] = useState(true);
  const focusedRef = useRef(true);
  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;
  const lastDataTimeRef = useRef(Date.now());
  const unfocusedSinceRef = useRef<number | null>(null);
  const gazeCountRef = useRef(0);
  const [showBanner, setShowBanner] = useState(false);
  const [bannerMessage, setBannerMessage] = useState("");
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerBanner = useCallback((message: string) => {
    setBannerMessage(message);
    setShowBanner(true);
    if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
    bannerTimeoutRef.current = setTimeout(() => setShowBanner(false), 8000);
  }, []);

  useEffect(() => {
    if (!sentiment) return;
    if (sentiment.frustration_score > 0.7 || sentiment.suggested_action === "offer_break") {
      triggerBanner("You seem to be having a tough time. How about a short break? You're doing great!");
    } else if (sentiment.suggested_action === "simplify") {
      triggerBanner("Would you like me to simplify the text for you?");
    }
  }, [sentiment, triggerBanner]);

  useEffect(() => {
    if (status !== "tracking") return;
    if (!focused) {
      triggerBanner("Looks like you looked away. Take a breath, then come back when you're ready!");
    }
  }, [focused, status, triggerBanner]);

  const speakBanner = useCallback(() => {
    if ("speechSynthesis" in window && bannerMessage) {
      const utterance = new SpeechSynthesisUtterance(bannerMessage);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    }
  }, [bannerMessage]);

  // ───── Initialize WebGazer ─────
  useEffect(() => {
    const wg = window.webgazer;
    if (!wg) {
      setStatus("error");
      setErrorMsg("WebGazer not loaded. Check internet connection.");
      return;
    }

    let mounted = true;

    const init = async () => {
      const hasCachedCalibration = !!localStorage.getItem(CALIBRATION_KEY);

      try {
        if (wg.params) {
          wg.params.facemeshWasmBasePath = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/";
        }
        try {
          const FaceMesh = await import("@mediapipe/tasks-vision");
          if (FaceMesh && wg.params) {
            wg.params.facemeshWasmBasePath = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/";
          }
        } catch {
          // @mediapipe/tasks-vision not bundled — CDN path already set above
        }

        if (!hasCachedCalibration) wg.clearData();
        wg.setRegression("ridge")
          .showVideoPreview(false)
          .showFaceOverlay(false)
          .showPredictionPoints(false)
          .setGazeListener((data: any) => {
            const isInsideViewport = (
              data &&
              data.x != null && data.y != null &&
              data.x >= -150 &&
              data.x <= window.innerWidth + 150 &&
              data.y >= -150 &&
              data.y <= window.innerHeight + 150
            );
            if (isInsideViewport) {
              lastDataTimeRef.current = Date.now();
              gazeCountRef.current++;
              unfocusedSinceRef.current = null;
              focusedRef.current = true;
              requestAnimationFrame(() => {
                setFocused(true);
                if (onFocusChangeRef.current) onFocusChangeRef.current(true);
              });
            }
          });

        await wg.begin();
        if (mounted) {
          if (hasCachedCalibration) {
            lastDataTimeRef.current = Date.now();
            focusedRef.current = true;
            setFocused(true);
            setStatus("tracking");
          } else {
            setStatus("ready");
          }
        }
      } catch (err) {
        console.warn("WebGazer .begin() error:", err);
        setTimeout(() => {
          if (!mounted) return;
          if (hasCachedCalibration) {
            lastDataTimeRef.current = Date.now();
            setStatus("tracking");
          } else {
            setStatus("ready");
          }
        }, 2000);
      }

      // Hide all webgazer DOM elements
      setTimeout(() => {
        ["webgazerVideoFeed", "webgazerFaceFeedbackBox", "webgazerFaceOverlay",
         "webgazerVideoContainer", "webgazerGazeDot"].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.display = "none";
        });
      }, 1000);
    };

    init();

    return () => {
      mounted = false;
      try { wg.end(); } catch (e) { /* ignore */ }
      ["webgazerVideoFeed", "webgazerFaceFeedbackBox", "webgazerFaceOverlay",
       "webgazerVideoContainer", "webgazerGazeDot"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
      });
    };
  }, []);

  useEffect(() => {
    if (status !== "tracking") return;

    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastData = now - lastDataTimeRef.current;
      const gazePresent = timeSinceLastData < 2000;

      if (gazePresent) {
        unfocusedSinceRef.current = null;
        if (!focusedRef.current) {
          focusedRef.current = true;
          setFocused(true);
          onFocusChangeRef.current?.(true);
        }
      } else {
        if (unfocusedSinceRef.current === null) {
          unfocusedSinceRef.current = now;
        }
        const driftDuration = now - unfocusedSinceRef.current;
        if (driftDuration >= FOCUS_LOST_MS && focusedRef.current) {
          focusedRef.current = false;
          setFocused(false);
          onFocusChangeRef.current?.(false);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [status]);

  // ───── Handle calibration dot click ─────
  const handleCalibrationClick = useCallback(() => {
    const wg = window.webgazer;
    if (!wg) return;

    const newCount = clickCount + 1;
    setClickCount(newCount);

    const point = CALIBRATION_POINTS[calPointIndex];
    const screenX = (point.x / 100) * window.innerWidth;
    const screenY = (point.y / 100) * window.innerHeight;
    try {
      wg.recordScreenPosition(screenX, screenY, "click");
    } catch (e) { /* some versions don't have this */ }

    if (newCount >= CLICKS_PER_POINT) {
      const nextIndex = calPointIndex + 1;
      if (nextIndex >= CALIBRATION_POINTS.length) {
        localStorage.setItem(CALIBRATION_KEY, JSON.stringify({ ts: Date.now() }));
        lastDataTimeRef.current = Date.now();
        unfocusedSinceRef.current = null;
        focusedRef.current = true;
        setFocused(true);
        setStatus("tracking");
      } else {
        setCalPointIndex(nextIndex);
        setClickCount(0);
      }
    }
  }, [calPointIndex, clickCount]);

  const startCalibration = () => {
    localStorage.removeItem(CALIBRATION_KEY);
    const wg = window.webgazer;
    if (wg) try { wg.clearData(); } catch {}
    setCalPointIndex(0);
    setClickCount(0);
    gazeCountRef.current = 0;
    unfocusedSinceRef.current = null;
    setStatus("calibrating");
  };

  // ───── Render ─────
  const ringColor = focused ? "#4edea3" : "#ba1a1a";
  const ringOffset = focused ? 100 : 300;

  if (status === "error") {
    return (
      <div className="glass-card rounded-[2rem] p-8 flex flex-col items-center text-center">
        <span className="font-heading text-xs font-semibold text-error uppercase tracking-widest mb-2">Focus Tracker</span>
        <p className="text-error text-sm">{errorMsg}</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="glass-card rounded-[2rem] p-8 flex flex-col items-center text-center">
        <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest mb-4">Focus Status</span>
        <p className="motion-safe:animate-pulse text-primary text-sm font-body" role="status">Starting webcam...</p>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="glass-card rounded-[2rem] p-8 flex flex-col items-center text-center">
        <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest mb-4">Focus Status</span>
        <p className="text-sm text-on-surface-variant mb-4 font-body">
          Camera is active. Click below to calibrate eye tracking.
        </p>
        <button onClick={startCalibration}
          className="px-6 py-2.5 rounded-full border-2 border-primary text-primary font-heading text-sm font-semibold hover:bg-primary hover:text-on-primary transition-all active:scale-95">
          Start Calibration
        </button>
      </div>
    );
  }

  if (status === "calibrating") {
    const point = CALIBRATION_POINTS[calPointIndex];
    const calProgress = ((calPointIndex * CLICKS_PER_POINT + clickCount) / (CALIBRATION_POINTS.length * CLICKS_PER_POINT)) * 100;
    return (
      <>
        <div className="fixed inset-0 bg-inverse-surface/80 backdrop-blur-sm z-[10000] flex flex-col items-center justify-center">
          <div className="text-white text-center mb-8">
            <h2 className="font-heading text-2xl font-bold mb-2">Eye Calibration</h2>
            <p className="font-body text-lg opacity-90">
              Click the <span className="text-tertiary-fixed font-bold">green dot</span> {CLICKS_PER_POINT} times
            </p>
            <p className="text-sm opacity-60 mt-1 font-body">
              Point {calPointIndex + 1} / {CALIBRATION_POINTS.length} · Clicks: {clickCount} / {CLICKS_PER_POINT}
            </p>
          </div>

          <div className="w-64 h-2 bg-white/10 rounded-full mb-8 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${calProgress}%` }} />
          </div>

          <button
            onClick={handleCalibrationClick}
            aria-label={`Calibration point ${calPointIndex + 1} of ${CALIBRATION_POINTS.length}, click ${CLICKS_PER_POINT - clickCount} more times`}
            className="absolute w-14 h-14 rounded-full bg-tertiary-fixed hover:bg-tertiary-fixed-dim border-4 border-white/30 shadow-lg shadow-tertiary-fixed/50 motion-safe:animate-pulse cursor-pointer transition-all hover:scale-110 flex items-center justify-center"
            style={{ left: `${point.x}%`, top: `${point.y}%`, transform: "translate(-50%, -50%)" }}>
            <div className="w-4 h-4 rounded-full bg-white/80" />
          </button>

          <button onClick={() => { lastDataTimeRef.current = Date.now(); focusedRef.current = true; setFocused(true); setStatus("tracking"); }}
            className="fixed bottom-6 right-6 text-white/40 hover:text-white text-sm underline font-body">
            Skip calibration
          </button>
        </div>
      </>
    );
  }

  // status === "tracking"
  return (
    <div className={`glass-card rounded-[2rem] p-8 flex flex-col items-center text-center relative overflow-hidden transition-all duration-700`}>
      <span className="font-heading text-xs font-semibold text-primary uppercase tracking-widest mb-4 z-10">Focus Status</span>

      {/* SVG Focus Ring */}
      <div className="relative w-44 h-44 mb-4 z-10 flex items-center justify-center">
        <svg className="w-full h-full" style={{transform: "rotate(-90deg)"}}>
          <circle cx="88" cy="88" r="80" fill="transparent" stroke="#dce9ff" strokeWidth="4" />
          <circle cx="88" cy="88" r="80" fill="transparent" stroke={ringColor} strokeWidth="8"
            strokeLinecap="round" strokeDasharray="503" strokeDashoffset={ringOffset}
            className="pulse-ring transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" aria-live="polite" aria-atomic="true">
          <span className={`font-heading text-lg font-semibold ${focused ? "text-tertiary-fixed-dim" : "text-error"}`}>
            {focused ? "Locked In" : "Drift Detected"}
          </span>
        </div>
      </div>

      {/* Banner */}
      <div role="alert" aria-live="assertive"
        className={`w-full overflow-hidden motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-in-out z-10 ${showBanner ? "max-h-40 opacity-100 mb-3" : "max-h-0 opacity-0"}`}>
        <div className={`p-3 rounded-2xl text-center ${focused ? "bg-surface-container-low border border-white/40" : "bg-error-container text-on-error-container"}`}>
          <p className="text-sm font-medium font-body">{bannerMessage}</p>
          <div className="flex justify-center gap-2 mt-2">
            <button onClick={speakBanner} className="text-xs bg-primary text-on-primary px-3 py-1 rounded-full font-heading font-semibold">Read Aloud</button>
            <button onClick={() => setShowBanner(false)} className="text-xs bg-surface-container text-on-surface-variant px-3 py-1 rounded-full font-heading font-semibold">Dismiss</button>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 w-full z-10 mt-2">
        <div className="bg-surface-container-low p-3 rounded-xl border border-white/40">
          <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-heading">Status</p>
          <p className={`font-heading text-lg font-bold ${focused ? "text-tertiary-fixed-dim" : "text-error"}`}>
            {focused ? "Active" : "Drifted"}
          </p>
        </div>
        <div className="bg-surface-container-low p-3 rounded-xl border border-white/40">
          <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-heading">Gaze Count</p>
          <p className="font-heading text-lg font-bold text-primary">{gazeCountRef.current > 999 ? "999+" : gazeCountRef.current}</p>
        </div>
      </div>

      <button onClick={startCalibration}
        className="mt-4 z-10 px-4 py-2 rounded-full border-2 border-primary text-primary font-heading text-xs font-semibold hover:bg-primary hover:text-on-primary transition-all active:scale-95">
        Re-calibrate
      </button>

      {/* Drift overlay */}
      {!focused && (
        <div className="absolute inset-0 rounded-[2rem] pointer-events-none" style={{background: "radial-gradient(circle, rgba(186,26,26,0) 0%, rgba(186,26,26,0.08) 100%)"}} />
      )}
    </div>
  );
};

export default Eye;
