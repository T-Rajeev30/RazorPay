import { useEffect, useState } from "react";

export default function TopBar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-surface border-b border-ui-border h-16 ml-64 flex items-center justify-between px-6 w-[calc(100%-16rem)] fixed z-10">
      <div className="flex items-center gap-4 w-1/3">
        <div className="relative w-full max-w-md">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            className="w-full bg-surface-container-low border border-ui-border rounded-lg py-2 pl-10 pr-4 font-mono text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-active-focus"
            placeholder="Search transactions, agents, policies..."
            type="text"
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 bg-surface-container px-3 py-1.5 rounded-lg border border-ui-border">
          <div className="w-2 h-2 rounded-full bg-status-green" />
          <span className="text-xs text-status-green tracking-widest">
            ENGINE: ACTIVE
          </span>
        </div>
        <div className="font-mono text-xs text-on-surface-variant">
          {time.toUTCString().split(" ")[4]} UTC
        </div>
      </div>
    </header>
  );
}
