import { Denops, fn } from "https://deno.land/x/ddc_vim@v0.5.2/deps.ts#^";
import {
  BaseSource,
  Candidate,
} from "https://deno.land/x/ddc_vim@v0.5.2/types.ts#^";
import {
  GatherCandidatesArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v0.5.2/base/source.ts#^";

interface Params {
  currentWinOnly: boolean;
  executable: string;
}

interface PaneInfo {
  sessionName: string;
  windowIndex: string;
  paneIndex: string;
  id: string;
}

export class Source extends BaseSource {
  private available = false;
  private defaultExecutable = "tmux";

  async onInit({ denops, sourceParams }: OnInitArguments): Promise<void> {
    // old ddc.vim has no sourceParams here
    const executable = sourceParams ?
      sourceParams.executable : this.defaultExecutable;
    if (typeof executable !== "string") {
      await this.print_error(denops, "executable should be a string");
      return;
    }
    if ((await fn.executable(denops, executable)) !== 1) {
      await this.print_error(denops, "executable not found");
      return;
    }
    const env = Deno.env.get("TMUX");
    this.available = typeof env === "string" && env !== "";
  }

  async gatherCandidates({
    sourceParams,
  }: GatherCandidatesArguments): Promise<Candidate[]> {
    if (!this.available) {
      return [];
    }
    const { currentWinOnly, executable } = (sourceParams as unknown) as Params;
    const paneInfos = await this.panes(executable, currentWinOnly);
    const results = await Promise.all(
      paneInfos.map(
        ({ sessionName, windowIndex, paneIndex, id }) =>
          this.capturePane(executable, id)
            .then((result) => ({
              kind: `${sessionName}:${windowIndex}.${paneIndex}`,
              result,
            }))
      )
    );
    return results.reduce<Candidate[]>((a, { kind, result }) => {
      for (const word of this.allWords(result)) {
        a.push({ word, kind });
      }
      return a
    }, [])
  }

  params(): Record<string, unknown> {
    return {
      currentWinOnly: false,
      executable: this.defaultExecutable,
    }
  }

  private async runCmd(cmd: string[]): Promise<string[]> {
    const p = Deno.run({ cmd, stdout: "piped" });
    await p.status();
    return new TextDecoder().decode(await p.output()).split(/\n/);
  }

  private async panes(
    executable: string,
    currentWinOnly?: boolean
  ): Promise<PaneInfo[]> {
    const lines = await this.runCmd([
      executable,
      "list-panes",
      "-F",
      "#S,#I,#P,#D",
      ...(currentWinOnly ? [] : ["-a"]),
    ])
    return lines.reduce<PaneInfo[]>((a, line) => {
      const cells = line.split(/,/);
      if (cells.length === 4) {
        const [sessionName, windowIndex, paneIndex, id] = cells;
        a.push({ sessionName, windowIndex, paneIndex, id });
      }
      return a;
    }, []);
  }

  private capturePane(executable: string, id: string): Promise<string[]> {
    return this.runCmd([executable, "capture-pane", "-p", "-J", "-t", id]);
  }

  private allWords(lines: string[]): string[] {
    const words = lines
      .flatMap((line) => [...line.matchAll(/[-_\p{L}\d]+/gu)])
      .map((match) => match[0]);
    return Array.from(new Set(words)); // remove duplication
  }

  private async print_error(denops: Denops, message: string): Promise<void> {
    await denops.call("ddc#util#print_error", message, "ddc-tmux")
  }
}
