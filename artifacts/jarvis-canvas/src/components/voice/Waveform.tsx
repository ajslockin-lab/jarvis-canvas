import { useEffect, useRef } from "react";

interface WaveformProps {
  isActive: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function Waveform({ isActive, canvasRef }: WaveformProps) {
  const animationRef = useRef<number>(0);
  const phaseRef = useRef(0);
  const bars = useRef<number[]>(Array.from({ length: 40 }, (_, i) => 14 + (i % 7) * 2));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      const barCount = bars.current.length;
      const barWidth = width / barCount;
      const center = height / 2;
      const phase = phaseRef.current;

      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < barCount; i++) {
        const distanceFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
        const envelope = 1 - distanceFromCenter * 0.55;
        const wave = Math.sin(phase + i * 0.42) * 0.55 + Math.sin(phase * 0.55 + i * 0.18) * 0.35;
        const idleTarget = 12 + envelope * 16 + wave * 4;
        const activeTarget = 22 + envelope * 58 + wave * 18;
        const target = isActive ? activeTarget : idleTarget;

        bars.current[i] += (target - bars.current[i]) * 0.16;
        const currentHeight = Math.max(8, Math.min(88, bars.current[i]));
        const x = i * barWidth + barWidth * 0.28;
        const y = center - currentHeight / 2;
        const renderedWidth = Math.max(2, barWidth * 0.44);

        const gradient = ctx.createLinearGradient(0, y, 0, y + currentHeight);
        gradient.addColorStop(0, "#8CF4FF");
        gradient.addColorStop(0.55, "#00B4FF");
        gradient.addColorStop(1, "#1D6FA3");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, renderedWidth, currentHeight);

        ctx.fillStyle = "rgba(140, 244, 255, 0.28)";
        ctx.fillRect(x, y, renderedWidth, 2);
      }

      phaseRef.current += isActive ? 0.08 : 0.035;
      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { cancelAnimationFrame(animationRef.current); };
  }, [isActive, canvasRef]);

  return <canvas ref={canvasRef} width={320} height={100} className="opacity-85" />;
}
