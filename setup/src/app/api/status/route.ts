import { NextResponse } from "next/server";
import { execSync } from "child_process";

interface ContainerStatus {
  name: string;
  status: string;
  health: string;
}

export async function GET() {
  try {
    const output = execSync(
      'docker ps --format "{{.Names}}|{{.Status}}" --filter "name=pd-app" --filter "name=pg" --filter "name=redis"',
      { timeout: 5000 }
    ).toString().trim();

    const containers: ContainerStatus[] = output
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [name, status] = line.split("|");
        const health = status.includes("healthy")
          ? "healthy"
          : status.includes("starting")
            ? "starting"
            : status.includes("Up")
              ? "running"
              : "stopped";
        return { name, status, health };
      });

    return NextResponse.json({ containers });
  } catch {
    return NextResponse.json({ containers: [] });
  }
}
