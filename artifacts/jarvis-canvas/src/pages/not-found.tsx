import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="hud-bg min-h-screen flex items-center justify-center text-[#e8f4f8]">
      <div className="hud-scanline" />
      <div className="relative z-10 text-center">
        <div className="font-mono-data text-8xl font-bold text-[#00B4FF]/20 mb-4">404</div>
        <h1 className="font-orbitron text-xl font-bold tracking-[0.15em] text-[#00E5FF] mb-2">TARGET NOT FOUND</h1>
        <p className="font-rajdhani text-[#5a7a8a] mb-6">This route does not exist in JARVIS systems.</p>
        <Link href="/" className="hud-btn px-6 py-3 inline-flex">RETURN TO BASE</Link>
      </div>
    </div>
  );
}
