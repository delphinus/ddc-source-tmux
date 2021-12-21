import { Denops, fn } from "https://deno.land/x/ddc_vim@v0.13.0/deps.ts#^";
import {
  BaseSource,
  Candidate,
} from "https://deno.land/x/ddc_vim@v0.13.0/types.ts#^";
import {
  GatherCandidatesArguments,
  OnInitArguments,
} from "https://deno.land/x/ddc_vim@v0.13.0/base/source.ts#^";

type Params = {
  currentWinOnly: boolean;
  executable: string;
};

interface PaneInfo {
  sessionName: string;
  windowIndex: string;
  paneIndex: string;
  id: string;
}

export class Source extends BaseSource<Params> {
  private available = false;
  private defaultExecutable = "tmux";
  private executable = "";

  async onInit(
    { denops, sourceParams }: OnInitArguments<Params>,
  ): Promise<void> {
    // old ddc.vim has no sourceParams here
    const executable = sourceParams
      ? sourceParams.executable
      : this.defaultExecutable;
    if (typeof executable !== "string") {
      await this.print_error(denops, "executable should be a string");
      return;
    }
    if ((await fn.executable(denops, executable)) !== 1) {
      await this.print_error(denops, "executable not found");
      return;
    }
    this.available = true;
    this.executable = executable;
  }

  async gatherCandidates({
    sourceParams,
  }: GatherCandidatesArguments<Params>): Promise<Candidate[]> {
    if (!this.available) {
      return [];
    }
    const paneInfos = await this.panes(sourceParams);
    const results = await Promise.all(
      paneInfos.map(
        ({ sessionName, windowIndex, paneIndex, id }) =>
          this.capturePane(id)
            .then((result) => ({
              kind: `${sessionName}:${windowIndex}.${paneIndex}`,
              result,
            })),
      ),
    );
    return results.reduce<Candidate[]>((a, { kind, result }) => {
      for (const word of this.allWords(result)) {
        a.push({ word, kind });
      }
      return a;
    }, []);
  }

  params(): Params {
    return {
      currentWinOnly: false,
      executable: this.defaultExecutable,
    };
  }

  private async runCmd(cmd: string[]): Promise<string[]> {
    const p = Deno.run({ cmd, stdout: "piped" });
    const [_, out] = await Promise.all([p.status(), p.output()]);
    p.close();
    return new TextDecoder().decode(out).split(/\n/);
  }

  private async panes(
    { currentWinOnly }: Params,
  ): Promise<PaneInfo[]> {
    const lines = await this.runCmd([
      this.executable,
      "list-panes",
      "-F",
      "#S,#I,#P,#D",
      ...(currentWinOnly ? [] : ["-a"]),
    ]);
    return lines.map((line) => line.split(/,/))
      .filter((cells) => cells.length === 4)
      .map(([sessionName, windowIndex, paneIndex, id]) => ({
        sessionName,
        windowIndex,
        paneIndex,
        id,
      }));
  }

  private capturePane(id: string): Promise<string[]> {
    return this.runCmd([this.executable, "capture-pane", "-p", "-J", "-t", id]);
  }

  private allWords(lines: string[]): string[] {
    const words = lines
      .flatMap((line) => [...line.matchAll(/[-_\p{L}\d]+/gu)])
      .map((match) => match[0]);
    return Array.from(new Set(words)); // remove duplication
  }

  private async print_error(denops: Denops, message: string): Promise<void> {
    await denops.call("ddc#util#print_error", message, "ddc-tmux");
  }
}
