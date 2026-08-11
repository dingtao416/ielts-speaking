"use client";

import { useMemo, useRef, useState } from "react";

import { useT } from "@/lib/i18n";

export interface TrendPoint {
  x: number; // epoch ms
  y: number; // band 0-9
  label: string; // date label
}

/**
 * 综合水平趋势折线图（单序列）。
 * 遵循全站设计系统：2px 线、≥8px 端点（带表面色描边）、面积淡色 10%、
 * 十字准线 + 悬浮提示。颜色用经过校验的蓝（浅色 #256abf / 深色 #3987e5）。
 */
export function BandTrendChart({
  points,
  width = 640,
  height = 240,
}: {
  points: TrendPoint[];
  width?: number;
  height?: number;
}) {
  const { t } = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ px: number; py: number; point: TrendPoint } | null>(null);

  const geom = useMemo(() => {
    const padL = 34;
    const padR = 16;
    const padT = 16;
    const padB = 30;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const yMin = Math.max(0, Math.floor(Math.min(...points.map((p) => p.y)) - 0.5));
    const yMax = Math.min(9, Math.ceil(Math.max(...points.map((p) => p.y)) + 0.5));
    const xMin = points[0]?.x ?? 0;
    const xMax = points[points.length - 1]?.x ?? xMin;

    const xScale = (x: number) =>
      innerW === 0 ? padL : padL + ((x - xMin) / Math.max(1, xMax - xMin)) * innerW;
    const yScale = (y: number) =>
      innerH === 0 ? padT : padT + (1 - (y - yMin) / Math.max(1, yMax - yMin)) * innerH;

    const ticks: number[] = [];
    for (let b = Math.ceil(yMin); b <= Math.floor(yMax); b += 1) ticks.push(b);

    return { padL, padR, padT, padB, innerW, innerH, yMin, yMax, xMin, xMax, xScale, yScale, ticks };
  }, [points, width, height]);

  const path = useMemo(() => {
    if (points.length < 2) return "";
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${geom.xScale(p.x).toFixed(1)} ${geom.yScale(p.y).toFixed(1)}`)
      .join(" ");
  }, [points, geom]);

  const area = useMemo(() => {
    if (points.length < 2) return "";
    const first = points[0];
    const last = points[points.length - 1];
    return `${path} L ${geom.xScale(last.x).toFixed(1)} ${geom.padT + geom.innerH} L ${geom.xScale(first.x).toFixed(1)} ${geom.padT + geom.innerH} Z`;
  }, [path, points, geom]);

  const seriesColor =
    "var(--band-trend-color, #256abf)";
  const seriesColorDark = "#3987e5";

  if (points.length < 2) return null;

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = e.clientX - rect.left;
    // 找最近的点（按 x）
    let nearest = points[0];
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(geom.xScale(p.x) - px);
      if (d < bestDist) {
        bestDist = d;
        nearest = p;
      }
    }
    setHover({ px: geom.xScale(nearest.x), py: geom.yScale(nearest.y), point: nearest });
  }

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={t("progress.trend")}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height: "auto" }}
      onPointerMove={handleMove}
      onPointerLeave={() => setHover(null)}
      onPointerDown={handleMove}
    >
      <style>{`
        .btc-line { stroke: ${seriesColor}; stroke-width: 2; fill: none; stroke-linejoin: round; stroke-linecap: round; }
        .btc-area { fill: ${seriesColor}; opacity: 0.1; }
        .btc-dot { fill: ${seriesColor}; }
        .btc-dot-ring { fill: var(--background); }
        .btc-grid { stroke: var(--border); stroke-width: 1; }
        .btc-tick { fill: var(--tertiary-text); font-size: 10px; font-variant-numeric: tabular-nums; }
        .btc-axis { stroke: var(--border); stroke-width: 1; }
        .btc-crosshair { stroke: var(--tertiary-text); stroke-width: 1; stroke-dasharray: 3 3; }
        @media (prefers-color-scheme: dark) {
          .btc-line { stroke: ${seriesColorDark}; }
          .btc-area { fill: ${seriesColorDark}; }
          .btc-dot { fill: ${seriesColorDark}; }
        }
      `}</style>

      {/* 网格线 + Y 刻度 */}
      {geom.ticks.map((b) => {
        const y = geom.yScale(b);
        return (
          <g key={b}>
            <line
              x1={geom.padL}
              y1={y}
              x2={width - geom.padR}
              y2={y}
              className="btc-grid"
            />
            <text x={geom.padL - 6} y={y + 3} textAnchor="end" className="btc-tick">
              {b.toFixed(0)}
            </text>
          </g>
        );
      })}
      {/* 基线 */}
      <line x1={geom.padL} y1={geom.padT + geom.innerH} x2={width - geom.padR} y2={geom.padT + geom.innerH} className="btc-axis" />

      {/* 面积 + 线 + 端点 */}
      <path d={area} className="btc-area" />
      <path d={path} className="btc-line" />
      {points.map((p, i) => (
        <g key={i}>
          <circle
            cx={geom.xScale(p.x)}
            cy={geom.yScale(p.y)}
            r={4.5}
            className="btc-dot-ring"
            strokeWidth={2}
          />
          <circle cx={geom.xScale(p.x)} cy={geom.yScale(p.y)} r={3.5} className="btc-dot" />
        </g>
      ))}

      {/* 十字准线 + 悬浮提示 */}
      {hover ? (
        <g>
          <line
            x1={hover.px}
            y1={geom.padT}
            x2={hover.px}
            y2={geom.padT + geom.innerH}
            className="btc-crosshair"
          />
          <g transform={`translate(${Math.min(hover.px + 10, width - 150)}, ${Math.max(geom.padT, hover.py - 44)})`}>
            <rect
              rx={6}
              width={140}
              height={36}
              fill="var(--background)"
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text x={10} y={15} fontSize={10} fill="var(--tertiary-text)">
              {hover.point.label}
            </text>
            <text x={10} y={30} fontSize={12} fontWeight={600} fill="var(--foreground)">
              Band {hover.point.y.toFixed(1)}
            </text>
          </g>
        </g>
      ) : null}
    </svg>
  );
}
