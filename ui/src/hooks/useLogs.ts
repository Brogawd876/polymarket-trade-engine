import { useEffect, useState } from "react";
import { parseLog } from "../utils/analytics/parse";
import { useAnalyticsStore } from "../store/analytics";
import type { ParsedRun } from "../types/analytics";
import { OPERATOR_API } from "../api";


async function readBackendLogs(signal?: AbortSignal): Promise<ParsedRun[]> {
  const runs: ParsedRun[] = [];
  const listResponse = await fetch(`${OPERATOR_API}/logs`, { signal });
  if (!listResponse.ok) throw new Error("Failed to fetch log list");

  const data = await listResponse.json() as { files?: string[] };
  for (const filename of data.files ?? []) {
    if (!filename.endsWith(".log")) continue;
    try {
      const response = await fetch(`${OPERATOR_API}/logs/${encodeURIComponent(filename)}`, { signal });
      if (!response.ok) continue;
      const parsed = parseLog(filename, await response.text());
      if (parsed) runs.push(parsed);
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  runs.sort((a, b) => a.startTime - b.startTime);
  return runs;
}

// Read every .log file in the user-picked folder and parse them.
// Subdirectories are skipped (matching the default source which only globs
// `logs/*.log`). The browser's `<input webkitdirectory>` exposes nested files
// via `webkitRelativePath` like "logs/sub/x.log" — we keep only the top-level.
interface WebkitFile extends File {
  readonly webkitRelativePath: string;
}
async function readCustom(files: File[]): Promise<ParsedRun[]> {
  const runs: ParsedRun[] = [];
  for (const file of files) {
    if (!file.name.endsWith(".log")) continue;
    const rel = (file as WebkitFile).webkitRelativePath;
    // Skip files inside subfolders (relative path has more than one separator).
    if (rel && rel.split("/").length > 2) continue;
    try {
      const text = await file.text();
      const parsed = parseLog(file.name, text);
      if (parsed) runs.push(parsed);
    } catch {
      // Skip unreadable files silently.
    }
  }
  runs.sort((a, b) => a.startTime - b.startTime);
  return runs;
}

export function useLogs(): ParsedRun[] {
  const dataSource = useAnalyticsStore((s) => s.dataSource);

  const [defaultRuns, setDefaultRuns] = useState<ParsedRun[]>([]);
  const [customRuns, setCustomRuns] = useState<ParsedRun[]>([]);

  useEffect(() => {
    if (dataSource.kind === "custom") return;

    const controller = new AbortController();
    readBackendLogs(controller.signal)
      .then(setDefaultRuns)
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error("Failed to load backend logs", error);
          setDefaultRuns([]);
        }
      });

    return () => controller.abort();
  }, [dataSource.kind]);

  useEffect(() => {
    if (dataSource.kind !== "custom") {
      // Clearing customRuns asynchronously avoids synchronous setState-in-effect
      Promise.resolve().then(() => setCustomRuns([]));
      return;
    }
    let cancelled = false;
    readCustom(dataSource.files).then((runs) => {
      if (!cancelled) setCustomRuns(runs);
    });
    return () => { cancelled = true; };
  }, [dataSource]);

  return dataSource.kind === "custom" ? customRuns : defaultRuns;
}
