import type { InsightRule } from '../../analytics.types';

export const attendanceRules: InsightRule[] = [
  {
    id: 'attendance-low-rate',
    evaluate: (data) => {
      const rate = data['attendanceRate'] as number | undefined;
      return typeof rate === 'number' && rate < 70;
    },
    generate: (data) => ({
      category: 'critical',
      title: 'Low Attendance Rate',
      description: `Attendance rate is ${(data['attendanceRate'] as number).toFixed(1)}%, below the 70% threshold. Investigate absenteeism patterns.`,
      actionable: true,
      drilldownType: 'attendance-absentees',
    }),
  },
  {
    id: 'attendance-late-arrivals',
    evaluate: (data) => {
      const rate = data['lateArrivalPercent'] as number | undefined;
      return typeof rate === 'number' && rate > 15;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'High Late Arrivals',
      description: `${(data['lateArrivalPercent'] as number).toFixed(1)}% of check-ins are late, exceeding the 15% threshold.`,
      actionable: true,
      drilldownType: 'attendance-late-arrivals',
    }),
  },
  {
    id: 'attendance-low-productivity',
    evaluate: (data) => {
      const index = data['productivityIndex'] as number | undefined;
      return typeof index === 'number' && index < 0.7;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'Low Productivity Index',
      description: `Productivity index is ${(data['productivityIndex'] as number).toFixed(2)}, indicating under-utilization. Review workload distribution.`,
      actionable: true,
      drilldownType: 'attendance-productivity',
    }),
  },
  {
    id: 'attendance-high-overtime',
    evaluate: (data) => {
      const hours = data['avgOvertimeHours'] as number | undefined;
      return typeof hours === 'number' && hours > 100;
    },
    generate: (data) => ({
      category: 'warning',
      title: 'Excessive Overtime',
      description: `Average overtime is ${Math.round(data['avgOvertimeHours'] as number)} hours, exceeding 100-hour limit. Risk of burnout and compliance issues.`,
      actionable: true,
      drilldownType: 'attendance-overtime',
    }),
  },
];
