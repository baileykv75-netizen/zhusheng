"use client";

import { useDemo } from "./demo-provider";

export function TelemetryChart() {
  const { state } = useDemo();
  const points = state.telemetry.slice(-10);
  const width = 560;
  const height = 176;
  const xStep = points.length > 1 ? width / (points.length - 1) : width;
  const humidityPath = points
    .map((point, index) => `${index ? "L" : "M"} ${index * xStep} ${height - (point.humidity / 50) * height}`)
    .join(" ");
  const flowPath = points
    .map((point, index) => `${index ? "L" : "M"} ${index * xStep} ${height - (point.flow / 6) * height}`)
    .join(" ");

  return (
    <div className="telemetry-chart">
      <div className="chart-legend">
        <span><i className="humidity" />墙体湿度 %</span>
        <span><i className="flow" />微流量 L/min</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="1602卫生间湿度与流量趋势">
        {[0, 1, 2, 3, 4].map((line) => (
          <line key={line} x1="0" x2={width} y1={(height / 4) * line} y2={(height / 4) * line} className="gridline" />
        ))}
        <path d={humidityPath} className="humidity-line" />
        <path d={flowPath} className="flow-line" />
      </svg>
      <div className="chart-axis">
        <span>{points[0]?.time}</span>
        <span>{points[Math.floor(points.length / 2)]?.time}</span>
        <span>{points.at(-1)?.time}</span>
      </div>
    </div>
  );
}
