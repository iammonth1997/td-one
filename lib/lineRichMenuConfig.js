/**
 * Rich Menu Configuration for LINE LIFF
 * Employee essential menus
 */

export const EMPLOYEE_RICH_MENU = {
  size: {
    width: 2500,
    height: 1686, // 2 rows x 3 columns
  },
  selected: true,
  name: "TD One Employee Menu",
  chatBarText: "TD One ERP",
  areas: [
    // Row 1 - Top row (3 items)
    {
      bounds: {
        x: 0,
        y: 0,
        width: 833,
        height: 843,
      },
      action: {
        type: "uri",
        label: "Dashboard",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/dashboard`,
      },
    },
    {
      bounds: {
        x: 833,
        y: 0,
        width: 833,
        height: 843,
      },
      action: {
        type: "uri",
        label: "Check-in/out",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/scan`,
      },
    },
    {
      bounds: {
        x: 1666,
        y: 0,
        width: 834,
        height: 843,
      },
      action: {
        type: "uri",
        label: "My Slip",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/slip`,
      },
    },
    // Row 2 - Bottom row (3 items)
    {
      bounds: {
        x: 0,
        y: 843,
        width: 833,
        height: 843,
      },
      action: {
        type: "uri",
        label: "Leave Request",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/request/leave`,
      },
    },
    {
      bounds: {
        x: 833,
        y: 843,
        width: 833,
        height: 843,
      },
      action: {
        type: "uri",
        label: "OT Request",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/request/ot`,
      },
    },
    {
      bounds: {
        x: 1666,
        y: 843,
        width: 834,
        height: 843,
      },
      action: {
        type: "uri",
        label: "Time Correction",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/request/time-correction`,
      },
    },
  ],
};

export const ADMIN_RICH_MENU = {
  size: {
    width: 2500,
    height: 843,
  },
  selected: true,
  name: "TD One Admin Menu",
  chatBarText: "TD One Admin",
  areas: [
    {
      bounds: {
        x: 0,
        y: 0,
        width: 625,
        height: 843,
      },
      action: {
        type: "uri",
        label: "Dashboard",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/dashboard`,
      },
    },
    {
      bounds: {
        x: 625,
        y: 0,
        width: 625,
        height: 843,
      },
      action: {
        type: "uri",
        label: "Attendance",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/attendance`,
      },
    },
    {
      bounds: {
        x: 1250,
        y: 0,
        width: 625,
        height: 843,
      },
      action: {
        type: "uri",
        label: "Payroll",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/payroll`,
      },
    },
    {
      bounds: {
        x: 1875,
        y: 0,
        width: 625,
        height: 843,
      },
      action: {
        type: "uri",
        label: "Admin",
        uri: `${process.env.NEXT_PUBLIC_APP_BASE_URL}/admin/pin-reset-audit`,
      },
    },
  ],
};
