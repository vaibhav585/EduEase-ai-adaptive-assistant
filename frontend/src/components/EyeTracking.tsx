
import React from 'react';

declare const webgazer: any;

interface EyeTrackingProps {
  onGaze: (x: number, y: number) => void;
}

const EyeTracking: React.FC<EyeTrackingProps> = ({ onGaze }) => {
  React.useEffect(() => {
    webgazer.setGazeListener((data: any, elapsedTime: any) => {
      if (data == null) {
        return;
      }
      onGaze(data.x, data.y);
    }).begin();

    return () => {
      webgazer.end();
    };
  }, [onGaze]);

  return null;
};

export default EyeTracking;
