import { execFile } from "node:child_process";

export function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    execFile("open", [url], () => undefined);
    return;
  }
  if (platform === "win32") {
    execFile("cmd", ["/c", "start", "", url], () => undefined);
    return;
  }
  execFile("xdg-open", [url], () => undefined);
}
