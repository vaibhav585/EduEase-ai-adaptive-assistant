import { useEffect, useRef, useState, useCallback } from "react";

declare global {
  interface Window {
    webgazer: any;
  }
}

type Props = {
  targetId?: string;
  onFocusChange?: (focused: boolean) => void;
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

const Eye: React.FC<Props> = ({ targetId, onFocusChange }) => {
  const [status, setStatus] = useState<
    "loading" | "ready" | "calibrating" | "tracking" | "error"
  >("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [calPointIndex, setCalPointIndex] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [focused, setFocused] = useState(true);
  const focusedRef = useRef(true);
  const lastDataTimeRef = useRef(Date.now());
  const gazeCountRef = useRef(0);

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
      try {
        wg.clearData();
        wg.setRegression("ridge")
          .showVideoPreview(false)
          .showFaceOverlay(false)
          .showPredictionPoints(false)
          .setGazeListener((data: any) => {
            if (data && data.x != null && data.y != null) {
              // Every time we get valid gaze data, the user's face is detected
              lastDataTimeRef.current = Date.now();
              gazeCountRef.current++;
            }
          });

        await wg.begin();
        if (mounted) setStatus("ready");
      } catch (err) {
        console.warn("WebGazer .begin() error:", err);
        setTimeout(() => {
          if (!mounted) return;
          // Assume it's working if we got this far
          setStatus("ready");
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

  // ───── Focus detection (face-presence based) ─────
  // If webgazer sends gaze data → face detected → focused
  // If no gaze data for >1.5 seconds → face lost → distracted
  useEffect(() => {
    if (status !== "tracking") return;

    const interval = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTimeRef.current;

      // If no gaze data received for 1.5 seconds → user looked away
      const isFocusedNow = timeSinceLastData < 1500;

      if (isFocusedNow !== focusedRef.current) {
        focusedRef.current = isFocusedNow;
        setFocused(isFocusedNow);
        onFocusChange?.(isFocusedNow);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [status, onFocusChange]);

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
        // Calibration done — reset timing and start tracking
        lastDataTimeRef.current = Date.now();
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
    setCalPointIndex(0);
    setClickCount(0);
    gazeCountRef.current = 0;
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
        <p className="animate-pulse text-blue-600 text-sm">Starting webcam…</p>
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
            className="absolute w-12 h-12 rounded-full bg-yellow-400 hover:bg-yellow-300 
                       border-4 border-yellow-200 shadow-lg shadow-yellow-400/50
                       animate-pulse cursor-pointer transition-all hover:scale-110
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
    <div className="flex flex-col items-center p-4 bg-[#fdf7f2] rounded-2xl shadow-md">
      <h2 className="text-lg font-semibold mb-2">👁️ Focus Tracker</h2>

      {focused ? (
        <div className="text-center">
          <div className="text-4xl mb-2">🌟</div>
          <p className="text-green-600 font-semibold text-lg">Great focus!</p>
          <p className="text-xs text-gray-500 mt-1">Keep looking at the screen</p>
        </div>
      ) : (
        <div className="text-center">
          <div className="text-4xl mb-2 animate-bounce">😅</div>
          <p className="text-red-500 font-bold text-lg animate-pulse">
            Focus drifted!
          </p>
          <p className="text-xs text-gray-500 mt-1">Look back at the screen</p>
        </div>
      )}

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
