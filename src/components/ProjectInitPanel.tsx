/**
 * ProjectInitPanel
 *
 * Shows when project needs initialization (.ilean not found)
 * Displays manual commands for user to run
 */

import { useState } from "react";
import { type ProjectStatus } from "@/lib/api";

interface ProjectInitPanelProps {
  projectPath: string;
  projectStatus: ProjectStatus;
  onInitComplete: () => void;
}

export function ProjectInitPanel({
  projectPath,
  projectStatus,
  onInitComplete,
}: ProjectInitPanelProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);

  const commands = projectStatus.usesMathlib
    ? ["lake exe cache get", "lake build"]
    : ["lake build"];

  const handleRefresh = async () => {
    setIsChecking(true);
    setCheckFailed(false);

    // Call the refresh callback
    await onInitComplete();

    // If we're still on this page after a short delay, the check failed
    setTimeout(() => {
      setIsChecking(false);
      setCheckFailed(true);
    }, 1500);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-black text-white">
      <div className="max-w-2xl w-full">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="text-2xl font-bold mb-4 text-center">Build Required</h2>

        {/* Message */}
        <p className="text-white/60 text-center mb-6">{projectStatus.message}</p>

        {/* Check failed warning */}
        {checkFailed && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-400 text-sm text-center">
              Still no .ilean cache detected. Please make sure you've run the commands successfully.
            </p>
          </div>
        )}

        {/* Status info */}
        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <ul className="text-sm text-white/50 space-y-1">
            <li>• Lean files: {projectStatus.leanFileCount}</li>
            <li>• Uses Mathlib: {projectStatus.usesMathlib ? "Yes" : "No"}</li>
            {projectStatus.usesMathlib && (
              <li className="text-yellow-500">
                • Mathlib cache download may take 1-5 minutes
              </li>
            )}
          </ul>
        </div>

        {/* Commands */}
        <div className="bg-white/5 rounded-lg p-4 mb-6">
          <p className="text-sm text-white/60 mb-3">Please run the following commands in your terminal:</p>
          <div className="bg-black rounded p-3 font-mono text-sm text-green-400">
            <div className="text-white/40 mb-2">$ cd {projectPath}</div>
            {commands.map((cmd, i) => (
              <div key={i}>$ {cmd}</div>
            ))}
          </div>
        </div>

        {/* Refresh button */}
        <div className="text-center">
          <button
            onClick={handleRefresh}
            disabled={isChecking}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              isChecking
                ? 'bg-white/10 text-white/50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isChecking ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                Checking...
              </span>
            ) : (
              "I've run the commands, refresh"
            )}
          </button>
        </div>

        {/* Help text */}
        <p className="text-xs text-white/30 text-center mt-6">
          After running the commands, click the button above to reload the project.
        </p>
      </div>
    </div>
  );
}
