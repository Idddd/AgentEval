export const nivoChartTheme = {
  text: {
    fill: "var(--muted-foreground)",
    fontFamily: "var(--font-sans)",
    fontSize: 11,
  },
  axis: {
    domain: {
      line: {
        stroke: "var(--border)",
        strokeWidth: 1,
      },
    },
    ticks: {
      line: {
        stroke: "var(--border)",
        strokeWidth: 1,
      },
      text: {
        fill: "var(--muted-foreground)",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
      },
    },
    legend: {
      text: {
        fill: "var(--muted-foreground)",
        fontFamily: "var(--font-sans)",
        fontSize: 11,
      },
    },
  },
  grid: {
    line: {
      stroke: "var(--border)",
      strokeWidth: 1,
    },
  },
  crosshair: {
    line: {
      stroke: "var(--foreground)",
      strokeDasharray: "3 3",
      strokeOpacity: 0.35,
      strokeWidth: 1,
    },
  },
  legends: {
    text: {
      fill: "var(--muted-foreground)",
      fontFamily: "var(--font-mono)",
      fontSize: 10,
    },
  },
};
