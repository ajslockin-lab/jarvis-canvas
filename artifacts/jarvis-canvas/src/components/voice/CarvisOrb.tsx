import { useEffect, useRef } from "react";
import { createOrb, type Orb, type OrbState } from "@/lib/carvisOrb";

interface CarvisOrbProps {
  state: OrbState;
  analyser?: AnalyserNode | null;
}

export default function CarvisOrb({ state, analyser = null }: CarvisOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const orbRef = useRef<Orb | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const orb = createOrb(canvas);
    orbRef.current = orb;
    return () => {
      orb.destroy();
      orbRef.current = null;
    };
  }, []);

  useEffect(() => {
    orbRef.current?.setState(state);
  }, [state]);

  useEffect(() => {
    orbRef.current?.setAnalyser(analyser);
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
