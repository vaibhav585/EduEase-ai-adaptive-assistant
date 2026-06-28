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
  if (status === "error") {
    return (
      <div className="flex flex-col items-center p-4 bg-red-50 rounded-2xl shadow-md">
        <h2 className="text-lg font-semibold mb-2">👁️ Focus Tracker</h2>
        <p className="text-red-500 text-sm text-center">{errorMsg}</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center p-4 bg-[#fdf7f2] rounded-2xl shadow-md">
        <h2 className="text-lg font-semibold mb-2">👁️ Focus Tracker</h2>
        <p className="motion-safe:animate-pulse text-blue-600 text-sm" role="status">Starting webcam…</p>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="flex flex-col items-center p-4 bg-[#fdf7f2] rounded-2xl shadow-md">
        <h2 className="text-lg font-semibold mb-2">👁️ Focus Tracker</h2>
        <p className="text-sm text-gray-600 mb-3 text-center">
          Camera is active. Click below to start calibration.
          <br />
          <span className="text-xs text-gray-400">
            You'll click on 5 dots to train eye tracking.
          </span>
        </p>
        <button
          onClick={startCalibration}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          🎯 Start Calibration
        </button>
      </div>
    );
  }

  if (status === "calibrating") {
    const point = CALIBRATION_POINTS[calPointIndex];
    return (
      <>
        <div className="fixed inset-0 bg-black/70 z-[10000] flex flex-col items-center justify-center">
          <div className="text-white text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Eye Calibration</h2>
            <p className="text-lg">
              Click the{" "}
              <span className="text-yellow-300 font-bold">yellow dot</span>{" "}
              {CLICKS_PER_POINT} times while looking at it
            </p>
            <p className="text-sm text-gray-300 mt-1">
              Point {calPointIndex + 1} / {CALIBRATION_POINTS.length} •{" "}
              Clicks: {clickCount} / {CLICKS_PER_POINT}
            </p>
          </div>

          <div className="w-64 h-2 bg-gray-700 rounded-full mb-8">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{
                width: `${
                  ((calPointIndex * CLICKS_PER_POINT + clickCount) /
                    (CALIBRATION_POINTS.length * CLICKS_PER_POINT)) *
                  100
                }%`,
              }}
            />
          </div>

          <button
            onClick={handleCalibrationClick}
            aria-label={`Calibration point ${calPointIndex + 1} of ${CALIBRATION_POINTS.length}, click ${CLICKS_PER_POINT - clickCount} more times`}
            className="absolute w-12 h-12 rounded-full bg-yellow-400 hover:bg-yellow-300
                       border-4 border-yellow-200 shadow-lg shadow-yellow-400/50
                       motion-safe:animate-pulse cursor-pointer transition-all hover:scale-110
                       flex items-center justify-center"
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="w-3 h-3 rounded-full bg-yellow-800" />
          </button>

          <button
            onClick={() => {
              lastDataTimeRef.current = Date.now();
              focusedRef.current = true;
              setFocused(true);
              setStatus("tracking");
            }}
            className="fixed bottom-6 right-6 text-gray-400 hover:text-white text-sm underline"
          >
            Skip calibration
          </button>
        </div>
      </>
    );
  }

  // status === "tracking"
  return (
    <div className="flex flex-col items-center p-4 bg-[#fdf7f2] rounded-2xl shadow-md relative">
      <h2 className="text-lg font-semibold mb-2">👁️ Focus Tracker</h2>

      <div
        role="alert"
        aria-live="assertive"
        className={`w-full overflow-hidden motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-in-out ${
          showBanner ? "max-h-40 opacity-100 mb-3" : "max-h-0 opacity-0"
        }`}
      >
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-amber-800 text-sm font-medium">{bannerMessage}</p>
          <div className="flex justify-center gap-2 mt-2">
            <button
              onClick={speakBanner}
              className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded-lg"
            >
              Read Aloud
            </button>
            <button
              onClick={() => setShowBanner(false)}
              className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-lg"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {focused ? (
          <div className="text-center">
            <div className="text-4xl mb-2" aria-hidden="true">🌟</div>
            <p className="text-green-600 font-semibold text-lg">Great focus!</p>
            <p className="text-xs text-gray-500 mt-1">Keep looking at the screen</p>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-4xl mb-2 motion-safe:animate-bounce" aria-hidden="true">😅</div>
            <p className="text-red-500 font-bold text-lg motion-safe:animate-pulse">
              Focus drifted!
            </p>
            <p className="text-xs text-gray-500 mt-1">Look back at the screen</p>
          </div>
        )}
      </div>

      <button
        onClick={startCalibration}
        className="mt-3 text-xs text-indigo-500 hover:text-indigo-700 underline"
      >
        Re-calibrate
      </button>
    </div>
  );
};

export default Eye;
