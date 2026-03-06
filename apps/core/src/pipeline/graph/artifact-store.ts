import * as fs from "fs/promises";
import * as path from "path";
import { GraphArtifact } from "./graph-transformer";

/**
 * In-memory artifact store with filesystem persistence
 * Maintains version history (no overwrite)
 */
export class ArtifactStore {
  private baseDir: string;
  private artifacts: Map<string, GraphArtifact[]> = new Map();

  constructor(baseDir: string = "./artifacts") {
    this.baseDir = baseDir;
    this.ensureDir();
  }

  private async ensureDir() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      // Directory already exists or permission issue
      console.warn("Could not create artifact directory:", error);
    }
  }

  /**
   * Save artifact with versioning (no overwrite)
   */
  async save(artifact: GraphArtifact, jobId: string): Promise<void> {
    // Store in memory
    if (!this.artifacts.has(jobId)) {
      this.artifacts.set(jobId, []);
    }
    this.artifacts.get(jobId)!.push(artifact);

    // Persist to filesystem
    const jobDir = path.join(this.baseDir, jobId);
    await fs.mkdir(jobDir, { recursive: true });

    const fileName = `${artifact.id}_${artifact.version}.json`;
    const filePath = path.join(jobDir, fileName);

    await fs.writeFile(filePath, JSON.stringify(artifact, null, 2), "utf-8");
  }

  /**
   * Retrieve artifact history for a job
   */
  async retrieve(jobId: string): Promise<GraphArtifact[]> {
    return this.artifacts.get(jobId) || [];
  }

  /**
   * Get latest version of artifact
   */
  async getLatest(jobId: string): Promise<GraphArtifact | undefined> {
    const history = await this.retrieve(jobId);
    return history[history.length - 1];
  }
}
