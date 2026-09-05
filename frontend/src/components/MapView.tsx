import { useEffect, useRef } from 'react';
import type { RobotState } from '../types';
import { needsAttention, STATUS_COLORS } from '../types';

export default function MapView({
  robots,
  selectedId,
  onSelect,
}: {
  robots: Map<string, RobotState>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // load layout once
  useEffect(() => {
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}layout.png`;
    img.onload = () => {
      imgRef.current = img;
      draw();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(draw, [robots, selectedId]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, W, H);
    else {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, W, H);
    }
    for (const r of robots.values()) {
      const attn = needsAttention(r);
      ctx.beginPath();
      ctx.arc(r.x, r.y, attn ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = STATUS_COLORS[r.status];
      ctx.fill();
      ctx.lineWidth = r.robot_id === selectedId ? 3 : 1.5;
      ctx.strokeStyle = r.robot_id === selectedId ? '#f8fafc' : attn ? '#ef4444' : '#0f172a';
      ctx.stroke();
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(r.robot_id, r.x, r.y - 12);
    }
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    let best: string | null = null;
    let bestD = 18; // click radius in px
    for (const r of robots.values()) {
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < bestD) {
        bestD = d;
        best = r.robot_id;
      }
    }
    onSelect(best);
  }

  return (
    <canvas
      ref={canvasRef}
      width={900}
      height={560}
      onClick={handleClick}
      style={{ width: '100%', height: 'auto', cursor: 'pointer', borderRadius: 8 }}
    />
  );
}
