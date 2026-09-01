import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/authorizations", label: "Authorizations", icon: "fact_check" },
  { to: "/attack-simulator", label: "Attack Simulator", icon: "bug_report" },
  { to: "/audit-log", label: "Audit Log", icon: "list_alt" },
  { to: "/human-approvals", label: "Human Approvals", icon: "verified_user" },
  { to: "/evaluation", label: "Evaluation", icon: "analytics" },
];

export default function Sidebar() {
  return (
    <nav className="bg-surface h-screen w-64 fixed left-0 top-0 border-r border-ui-border flex flex-col py-8 z-20">
      <div className="px-6 mb-8">
        <h1 className="text-2xl font-black tracking-tighter text-on-surface mb-1">
          PAYGUARD
        </h1>
        <p className="text-xs text-on-surface-variant uppercase tracking-widest">
          V2.4.0 SECURE
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center px-6 py-3 text-sm transition-colors duration-200 ${
                    isActive
                      ? "text-on-surface bg-surface-container border-l-2 border-active-focus"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
                  }`
                }
              >
                <span className="material-symbols-outlined mr-3 text-[20px]">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
      <div className="px-6 mt-auto pt-4 border-t border-ui-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-surface-container-high border border-ui-border flex items-center justify-center">
          <span className="material-symbols-outlined text-on-surface-variant text-[16px]">
            account_circle
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-on-surface">SYS_ADMIN</span>
          <span className="text-[10px] text-on-surface-variant">
            ACTIVE SESSION
          </span>
        </div>
      </div>
    </nav>
  );
}
